import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSpread';

type Options = [{ minFields?: number }];

const DEFAULT_MIN_FIELDS = 2;

/**
 * Collects all identifier references (not declarations) used anywhere in a
 * subtree. Used to detect when a destructured binding is consumed for purposes
 * other than being forwarded directly.
 */
function collectIdentifierUses(node: TSESTree.Node, names: Set<string>): void {
  if (node.type === AST_NODE_TYPES.Identifier) {
    names.add(node.name);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          collectIdentifierUses(child as TSESTree.Node, names);
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      collectIdentifierUses(value as TSESTree.Node, names);
    }
  }
}

/**
 * Returns the names of the simple (non-renamed, no default, top-level)
 * destructured properties in an ObjectPattern, or null if the pattern has any
 * feature that makes spread replacement unsafe (rest elements, default values,
 * renamed bindings, nested patterns, computed keys).
 */
function getSimpleDestructuredNames(
  pattern: TSESTree.ObjectPattern,
): string[] | null {
  const names: string[] = [];
  for (const prop of pattern.properties) {
    // Rest element — the developer explicitly chose to separate props.
    if (prop.type === AST_NODE_TYPES.RestElement) {
      return null;
    }
    if (prop.type !== AST_NODE_TYPES.Property) {
      return null;
    }
    // Computed key — cannot determine the name statically.
    if (prop.computed) {
      return null;
    }
    // Renamed binding: { a: b } — would change semantics.
    if (!prop.shorthand) {
      return null;
    }
    // Default value: { a = 1 } — spread would bypass the default.
    if (prop.value.type === AST_NODE_TYPES.AssignmentPattern) {
      return null;
    }
    // Nested destructuring: { a: { b } } — not top-level.
    if (
      prop.value.type === AST_NODE_TYPES.ObjectPattern ||
      prop.value.type === AST_NODE_TYPES.ArrayPattern
    ) {
      return null;
    }
    if (prop.value.type !== AST_NODE_TYPES.Identifier) {
      return null;
    }
    names.push(prop.value.name);
  }
  return names;
}

type ForwardedField = {
  name: string;
  // The attribute/property node that forwards this field.
  node: TSESTree.JSXAttribute | TSESTree.Property;
};

/**
 * For a JSX element, returns the set of destructured names that are forwarded
 * with identical key names (e.g. `hits={hits}`, `isLoading={isLoading}`).
 * Returns null if:
 * - Any destructured name is forwarded to more than one place (multiple targets).
 * - Any destructured name is found in a conditional/computed spread expression.
 */
function collectJsxForwardedFields(
  openingElement: TSESTree.JSXOpeningElement,
  destructuredNames: Set<string>,
): ForwardedField[] | null {
  const forwarded: ForwardedField[] = [];

  for (const attr of openingElement.attributes) {
    // Spread attribute — check if any destructured name is used inside it.
    if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      const usedInSpread = new Set<string>();
      collectIdentifierUses(attr.argument, usedInSpread);
      for (const name of destructuredNames) {
        if (usedInSpread.has(name)) {
          // The field is used in a conditional/computed spread — not safe.
          return null;
        }
      }
      continue;
    }

    if (attr.type !== AST_NODE_TYPES.JSXAttribute) continue;

    const attrName =
      attr.name.type === AST_NODE_TYPES.JSXIdentifier ? attr.name.name : null;
    if (!attrName) continue;

    if (!destructuredNames.has(attrName)) continue;

    // The attribute name matches a destructured name — check it is forwarded identically.
    if (attr.value === null) {
      // Boolean shorthand `isLoading` — not an identical forward (no value node).
      continue;
    }

    if (attr.value.type !== AST_NODE_TYPES.JSXExpressionContainer) continue;

    const expr = attr.value.expression;
    if (expr.type !== AST_NODE_TYPES.Identifier || expr.name !== attrName) {
      // Transformed or renamed forward — not eligible for spread.
      continue;
    }

    forwarded.push({ name: attrName, node: attr });
  }

  return forwarded;
}

/**
 * For an object expression, returns the set of destructured names that are
 * forwarded with identical (shorthand) key names.
 */
function collectObjectForwardedFields(
  objectExpression: TSESTree.ObjectExpression,
  destructuredNames: Set<string>,
): ForwardedField[] | null {
  const forwarded: ForwardedField[] = [];

  for (const prop of objectExpression.properties) {
    // Spread element in object — check if any destructured name is used.
    if (prop.type === AST_NODE_TYPES.SpreadElement) {
      const usedInSpread = new Set<string>();
      collectIdentifierUses(prop.argument, usedInSpread);
      for (const name of destructuredNames) {
        if (usedInSpread.has(name)) {
          return null;
        }
      }
      continue;
    }

    if (prop.type !== AST_NODE_TYPES.Property) continue;

    // Only shorthand properties qualify as identical forwards: { a, b, c }.
    if (!prop.shorthand) continue;
    if (prop.computed) continue;

    const key =
      prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : null;
    if (!key || !destructuredNames.has(key)) continue;

    forwarded.push({ name: key, node: prop });
  }

  return forwarded;
}

/**
 * Walks the function body and finds the single JSX element or object literal
 * that acts as the target for forwarded props. Returns null if there is no
 * single unambiguous target, or if the body is too complex (multiple returns,
 * non-trivial logic, etc.).
 *
 * For the JSX variant we require:
 *   - The body is either a JSXElement directly (concise arrow) or a block
 *     statement with a single return statement returning a JSXElement.
 *
 * For the object-literal variant we require:
 *   - The body is a block statement with a single return statement returning
 *     an ObjectExpression (or the concise arrow body is an ObjectExpression).
 */
type Target =
  | {
      kind: 'jsx';
      openingElement: TSESTree.JSXOpeningElement;
      jsxElement: TSESTree.JSXElement;
    }
  | { kind: 'object'; expression: TSESTree.ObjectExpression };

function getSingleTarget(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): Target | null {
  const body = fn.body;

  // Concise arrow: `(props) => <X />`
  if (body.type === AST_NODE_TYPES.JSXElement) {
    return {
      kind: 'jsx',
      openingElement: body.openingElement,
      jsxElement: body,
    };
  }

  // Concise arrow returning object literal: `({ x, y }) => ({ x, y, extra: 1 })`
  // The parser represents the parenthesized object as an ObjectExpression body.
  if (body.type === AST_NODE_TYPES.ObjectExpression) {
    return { kind: 'object', expression: body };
  }

  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return null;
  }

  // Require exactly one statement in the block, which must be a return.
  if (body.body.length !== 1) {
    return null;
  }

  const stmt = body.body[0];
  if (stmt.type !== AST_NODE_TYPES.ReturnStatement || !stmt.argument) {
    return null;
  }

  const arg = stmt.argument;

  if (arg.type === AST_NODE_TYPES.JSXElement) {
    return {
      kind: 'jsx',
      openingElement: arg.openingElement,
      jsxElement: arg,
    };
  }

  // Parenthesized JSX in arrow: `(props) => (<X />)` — arg may wrap with
  // TSAsExpression or similar. We unwrap one level of TSAsExpression / TSSatisfiesExpression.
  if (
    (arg.type === AST_NODE_TYPES.TSAsExpression ||
      arg.type === AST_NODE_TYPES.TSSatisfiesExpression) &&
    arg.expression.type === AST_NODE_TYPES.JSXElement
  ) {
    const jsx = arg.expression as TSESTree.JSXElement;
    return {
      kind: 'jsx',
      openingElement: jsx.openingElement,
      jsxElement: jsx,
    };
  }

  if (arg.type === AST_NODE_TYPES.ObjectExpression) {
    return { kind: 'object', expression: arg };
  }

  return null;
}

/**
 * Checks whether any of the destructured names is used anywhere in the
 * function body OUTSIDE of the forwarded attributes we already identified.
 * If a name is used elsewhere (conditional logic, side effects, other
 * expressions), we must not flag.
 */
function isNameUsedOutsideForwarding(
  fnBody: TSESTree.Node,
  name: string,
  forwardedNodes: Set<TSESTree.Node>,
): boolean {
  // Walk the entire function body AST, skip the forwarded nodes.
  const stack: TSESTree.Node[] = [fnBody];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (forwardedNodes.has(current)) {
      // Skip the subtree of a forwarded attribute/property — usage there is
      // accounted for by the forwarding.
      continue;
    }

    if (current.type === AST_NODE_TYPES.Identifier && current.name === name) {
      // Identifier found outside forwarded nodes — the field is used
      // elsewhere.
      //
      // However, JSX opening element attribute names are not references to the
      // destructured bindings, so we must exclude them. The parent check:
      // - If inside JSXAttribute.name => not a reference.
      const parent = current.parent as TSESTree.Node | undefined;
      const isJsxAttrName =
        parent !== undefined &&
        parent.type === AST_NODE_TYPES.JSXAttribute &&
        (parent as TSESTree.JSXAttribute).name === (current as unknown);
      if (isJsxAttrName) {
        // This is an attribute name, not a value reference — skip.
      } else {
        return true;
      }
    }

    for (const key of Object.keys(current)) {
      if (key === 'parent') continue;
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        stack.push(value as TSESTree.Node);
      }
    }
  }
  return false;
}

/**
 * Finds a non-colliding name for the props parameter given the set of names
 * already in scope (inferred from the forwarded field names themselves and the
 * identifier `props`).
 */
function freshPropsName(existingNames: Set<string>): string {
  if (!existingNames.has('props')) return 'props';
  let i = 0;
  while (existingNames.has(`props${i}`)) i++;
  return `props${i}`;
}

export const preferSpreadOverReassembly = createRule<Options, MessageIds>({
  name: 'prefer-spread-over-reassembly',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer spread syntax over destructure-then-reassemble when all destructured fields are forwarded identically to a single target',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          minFields: {
            type: 'number',
            default: DEFAULT_MIN_FIELDS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferSpread:
        'Prefer spread over destructure-then-reassemble: replace the destructured parameter with a single identifier and use spread syntax on the target. ' +
        'This avoids silent bugs when new fields are added to the type.',
    },
  },
  defaultOptions: [{ minFields: DEFAULT_MIN_FIELDS }],
  create(context, [options]) {
    const minFields = options?.minFields ?? DEFAULT_MIN_FIELDS;
    const sourceCode = context.getSourceCode();

    function checkFunction(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): void {
      // Must have exactly one parameter that is an ObjectPattern.
      if (fn.params.length !== 1) return;
      const param = fn.params[0];
      if (param.type !== AST_NODE_TYPES.ObjectPattern) return;

      const destructuredNames = getSimpleDestructuredNames(param);
      if (!destructuredNames || destructuredNames.length < minFields) return;

      const namesSet = new Set(destructuredNames);

      // Find the single target element/object in the function body.
      const target = getSingleTarget(fn);
      if (!target) return;

      // Collect which destructured fields are forwarded identically.
      let forwarded: ForwardedField[] | null;
      if (target.kind === 'jsx') {
        forwarded = collectJsxForwardedFields(target.openingElement, namesSet);
      } else {
        forwarded = collectObjectForwardedFields(target.expression, namesSet);
      }

      if (!forwarded) return;

      // We need at least minFields to be forwarded identically.
      if (forwarded.length < minFields) return;

      // Build a set of the forwarded nodes so we can exclude them from the
      // "used elsewhere" check.
      const forwardedNodeSet = new Set<TSESTree.Node>(
        forwarded.map((f) => f.node),
      );

      // Ensure none of the forwarded names is used anywhere else in the body.
      for (const { name } of forwarded) {
        if (isNameUsedOutsideForwarding(fn.body, name, forwardedNodeSet)) {
          return;
        }
      }

      // All forwarded names must represent ALL destructured names (per issue
      // spec: "only flag when ALL destructured fields [...] are passed to a
      // single target"). If some destructured fields are not forwarded at all,
      // they must be used somewhere — the check above would have caught that.
      // But we also want to be conservative: only flag if ALL destructured
      // names are accounted for (either forwarded or... but the spec says they
      // should all go to the same target).
      const forwardedNamesSet = new Set(forwarded.map((f) => f.name));
      for (const name of destructuredNames) {
        if (!forwardedNamesSet.has(name)) {
          // This destructured name is not forwarded to the target — it might
          // be used elsewhere (which would have been caught above) or it is
          // truly unused. Either way, don't flag.
          return;
        }
      }

      context.report({
        node: param,
        messageId: 'preferSpread',
        fix(fixer) {
          const fixes: ReturnType<typeof fixer.replaceText>[] = [];

          // Choose a fresh name for the props parameter that does not collide
          // with any binding currently in scope.
          const propsName = freshPropsName(namesSet);

          // 1. Replace the destructured parameter with `props` (or fresh name).
          fixes.push(fixer.replaceText(param, propsName));

          if (target.kind === 'jsx') {
            // 2a. Build the new JSX opening element text.
            const attrs = target.openingElement.attributes;
            const nonForwardedAttrs = attrs.filter(
              (a) => !forwardedNodeSet.has(a),
            );

            // Determine if the JSX element is self-closing.
            const isSelfClosing = target.openingElement.selfClosing;
            const tagName = sourceCode.getText(target.openingElement.name);

            // Build new attribute list: spread first, then remaining attrs.
            const spreadAttr = `{...${propsName}}`;
            const remainingAttrTexts = nonForwardedAttrs.map((a) =>
              sourceCode.getText(a),
            );

            const allAttrTexts = [spreadAttr, ...remainingAttrTexts];
            const attrsText =
              allAttrTexts.length > 0 ? ' ' + allAttrTexts.join(' ') : '';

            const newOpeningText = isSelfClosing
              ? `<${tagName}${attrsText} />`
              : `<${tagName}${attrsText}>`;

            fixes.push(
              fixer.replaceText(target.openingElement, newOpeningText),
            );
          } else {
            // 2b. Build the new object expression text.
            const props = target.expression.properties;
            const nonForwardedProps = props.filter(
              (p) => !forwardedNodeSet.has(p),
            );

            const nonForwardedTexts = nonForwardedProps.map((p) =>
              sourceCode.getText(p),
            );

            const allPropTexts = [`...${propsName}`, ...nonForwardedTexts];
            const newObjText = `{ ${allPropTexts.join(', ')} }`;

            fixes.push(fixer.replaceText(target.expression, newObjText));
          }

          return fixes;
        },
      });
    }

    return {
      ArrowFunctionExpression(node) {
        checkFunction(node);
      },
      FunctionExpression(node) {
        checkFunction(node);
      },
    };
  },
});
