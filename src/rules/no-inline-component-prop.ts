import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type Options = [
  {
    props?: string[];
    allowRenderProps?: boolean;
    allowModuleScopeFactories?: boolean;
  },
];

type MessageIds = 'inlineComponentProp';

const DEFAULT_PROP_PATTERNS = ['CatalogWrapper', '*Wrapper', '*Component'];

const DEFAULT_OPTIONS: Required<Options[number]> = {
  props: DEFAULT_PROP_PATTERNS,
  allowRenderProps: true,
  allowModuleScopeFactories: true,
};

const INLINE_COMPONENT_NAME = 'inline component';

/**
 * Names followed through wrapper calls before declining. The shapes a fixer
 * emits need two (`const X = memo(XUnmemoized)`, plus one wrapper above it);
 * the bound is what keeps a cycle or a long chain from walking the scope graph.
 */
const MAX_ALIAS_HOPS = 3;

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function matchesPattern(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.includes('*')) {
    const wildcardCount = (pattern.match(/\*/g) || []).length;
    if (wildcardCount > 2) {
      return false;
    }
    const escaped = pattern
      .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(name);
  }
  return name === pattern;
}

function isRenderPropName(name: string): boolean {
  if (name === 'children' || name === 'child' || name === 'render') {
    return true;
  }
  if (name.startsWith('render')) {
    return true;
  }
  return (
    name === 'rowRenderer' ||
    name === 'cellRenderer' ||
    name === 'itemRenderer' ||
    name === 'renderItem' ||
    name === 'renderRow'
  );
}

function unwrapExpression(
  expr: TSESTree.Expression | null | undefined,
): TSESTree.Expression | null {
  let current = expr;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression
    ) {
      current = current.expression;
      continue;
    }
    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current ?? null;
}

function isReactCreateElementCall(expr: TSESTree.Expression): boolean {
  if (expr.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = expr.callee;
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === 'createElement'
  ) {
    return true;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'createElement'
  ) {
    if (
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'React'
    ) {
      return true;
    }
  }
  return false;
}

function returnsCreateElement(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isReactCreateElementCall(node)
  ) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.BlockStatement) {
    for (const statement of node.body) {
      if (
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        statement.argument &&
        statement.argument.type === AST_NODE_TYPES.CallExpression &&
        isReactCreateElementCall(statement.argument)
      ) {
        return true;
      }
    }
  }

  return false;
}

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

/**
 * Resolves an identifier standing in a wrapper call's argument position to the
 * function it names, or `undefined` when the reference is not decidable here.
 */
type IdentifierResolver = (
  identifier: TSESTree.Identifier,
) => FunctionNode | undefined;

function isFunctionNode(
  node: TSESTree.Node | null | undefined,
): node is FunctionNode {
  if (!node) return false;
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function getCalleeName(callee: TSESTree.LeftHandSideExpression): string | null {
  const unwrapped = unwrapExpression(callee as TSESTree.Expression);
  if (!unwrapped) return null;
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped.name;
  }
  if (
    unwrapped.type === AST_NODE_TYPES.MemberExpression &&
    !unwrapped.computed &&
    unwrapped.property.type === AST_NODE_TYPES.Identifier
  ) {
    const prop = unwrapped.property.name;
    if (
      unwrapped.object.type === AST_NODE_TYPES.Identifier &&
      unwrapped.object.name
    ) {
      return `${unwrapped.object.name}.${prop}`;
    }
    return prop;
  }
  return null;
}

const WRAPPER_CALLEE_NAMES = new Set([
  'useCallback',
  'React.useCallback',
  'useMemo',
  'React.useMemo',
  'memo',
  'React.memo',
  'forwardRef',
  'React.forwardRef',
]);

/**
 * `resolveIdentifier` is what lets `memo(Inner)` be judged at all. `require-memo`
 * rewrites a nested component into `function InnerUnmemoized() {...}` plus
 * `const Inner = memo(InnerUnmemoized)`, so reading only an inline literal here
 * made that rewrite silence this rule while the hazard survived: the renamed
 * declaration is still recreated per render, and `memo` re-invoked on a fresh
 * argument yields a fresh component type. Callers that cannot decide where the
 * name is declared pass no resolver and keep the literal-only reading.
 */
function getFunctionFromCall(
  call: TSESTree.CallExpression,
  resolveIdentifier?: IdentifierResolver,
): FunctionNode | undefined {
  const calleeName = getCalleeName(call.callee);
  if (!calleeName || !WRAPPER_CALLEE_NAMES.has(calleeName)) {
    return undefined;
  }
  const firstArg = unwrapExpression(
    (call.arguments[0] as TSESTree.Expression | null | undefined) ?? null,
  );
  if (!firstArg) return undefined;
  if (isFunctionNode(firstArg)) {
    return firstArg;
  }
  if (firstArg.type === AST_NODE_TYPES.Identifier && resolveIdentifier) {
    return resolveIdentifier(firstArg);
  }
  return undefined;
}

function getFunctionFromInit(
  init: TSESTree.Expression | null | undefined,
  resolveIdentifier?: IdentifierResolver,
): FunctionNode | undefined {
  const unwrapped = unwrapExpression(init);
  if (!unwrapped) return undefined;
  if (isFunctionNode(unwrapped)) {
    return unwrapped;
  }
  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    return getFunctionFromCall(unwrapped, resolveIdentifier);
  }
  return undefined;
}

/**
 * Nearest enclosing function of a node, or `null` when the node sits at module
 * scope. Class and object methods are reached through their `FunctionExpression`
 * value, so no separate `MethodDefinition` case is needed.
 */
function getEnclosingFunction(
  node: TSESTree.Node,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration
  | null {
  let current: TSESTree.Node | undefined | null = node.parent;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    if (current.type === AST_NODE_TYPES.Program) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

/**
 * The hazard is identity churn measured against the CONSUMER, not absolute
 * scope depth: a wrapper remounts its subtree only when it is recreated by the
 * very scope whose JSX passes it along. That holds exactly when the definition
 * and the consuming JSX attribute share a nearest enclosing function.
 *
 * When the definition sits in a strictly outer function — an HOC factory, a
 * `describe` callback consumed from a nested `it`, a class- or object-method
 * factory — the binding is created once per outer call and every run of the
 * consumer sees the identical reference, so there is nothing to remount and the
 * message's remedy ("move it to module scope") would fix nothing. Module scope
 * is the degenerate case: the definition has no enclosing function at all.
 *
 * A custom hook is deliberately NOT special-cased. A hook body does re-run per
 * render, and when it also holds the consuming JSX the two functions coincide,
 * so the same predicate reports it.
 */
function isStableForConsumer(
  defNode: TSESTree.Node,
  consumerFunction: TSESTree.Node | null,
): boolean {
  const definitionFunction = getEnclosingFunction(defNode);
  return definitionFunction === null || definitionFunction !== consumerFunction;
}

function isComponentLikeFunction(
  fn:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  displayName?: string,
): boolean {
  const body = fn.body;
  const hasJSX =
    !!body && ASTHelpers.returnsJSX(body as unknown as TSESTree.Node, context);

  const expressionBody =
    fn.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    fn.body.type !== AST_NODE_TYPES.BlockStatement
      ? fn.body
      : null;

  const hasCreateElement =
    (expressionBody && isReactCreateElementCall(expressionBody)) ||
    (body ? returnsCreateElement(body as unknown as TSESTree.Node) : false);

  const looksLikeComponent = displayName ? isPascalCase(displayName) : false;
  return hasJSX || hasCreateElement || looksLikeComponent;
}

function findVariableInScopes(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  identifier: TSESTree.Identifier,
): TSESLint.Scope.Variable | undefined {
  const sourceCode = context.getSourceCode() as TSESLint.SourceCode & {
    getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope | null;
  };
  let scope: TSESLint.Scope.Scope | null = null;
  try {
    // Tolerate ESLint API variations across versions/configurations.
    // Some contexts may not provide getScope or may throw unexpectedly.
    scope = sourceCode.getScope?.(identifier) ?? context.getScope();
  } catch {
    scope = null;
  }
  while (scope) {
    const variable = scope.variables.find((v) => v.name === identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function findObjectPropertyFunction(
  objExpr: TSESTree.ObjectExpression,
  propertyName: string,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined {
  for (const prop of objExpr.properties) {
    if (prop.type !== AST_NODE_TYPES.Property) continue;
    if (prop.computed) continue;
    if (prop.key.type === AST_NODE_TYPES.Identifier) {
      if (prop.key.name !== propertyName) continue;
    } else if (
      prop.key.type === AST_NODE_TYPES.Literal &&
      prop.key.value === propertyName
    ) {
      // match
    } else {
      continue;
    }
    const value = unwrapExpression(
      prop.value as TSESTree.Expression | null | undefined,
    );
    if (value && isFunctionNode(value)) {
      return value;
    }
  }
  return undefined;
}

export const noInlineComponentProp = createRule<Options, MessageIds>({
  name: 'no-inline-component-prop',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent inline function components defined in render from being passed to component-type props like CatalogWrapper to avoid remounts and UI flashes.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          props: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_PROP_PATTERNS,
          },
          allowRenderProps: {
            type: 'boolean',
            default: true,
          },
          allowModuleScopeFactories: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      inlineComponentProp:
        'Inline component "{{componentName}}" is created inside a render scope and passed to component-type prop "{{propName}}". React treats it as a new component whenever the scope re-runs, remounting its subtree and causing UI flashes. Move the wrapper to module scope (optionally memoize with React.memo) and pass changing data via props or context instead.',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(context, [options]) {
    const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    const propPatterns = resolvedOptions.props ?? DEFAULT_PROP_PATTERNS;
    const parserServices = context.parserServices;
    const checker = parserServices?.program?.getTypeChecker();
    const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;

    function isComponentTypeByTypeInfo(
      attribute: TSESTree.JSXAttribute,
    ): boolean {
      if (!checker || !esTreeNodeToTSNodeMap) return false;
      const tsNode = esTreeNodeToTSNodeMap.get(attribute);
      if (!tsNode) return false;
      let type: ts.Type | undefined;
      if (ts.isExpression(tsNode)) {
        type =
          checker.getContextualType(tsNode as ts.Expression) ??
          checker.getTypeAtLocation(tsNode as ts.Expression);
      } else {
        type = checker.getTypeAtLocation(tsNode as ts.Node);
      }
      if (!type) return false;
      const typeText = checker.typeToString(type);
      return (
        typeText.includes('ComponentType') ||
        typeText.includes('FunctionComponent') ||
        typeText.includes('ReactElement') ||
        typeText.includes('FC')
      );
    }

    function isTargetProp(
      attribute: TSESTree.JSXAttribute,
      name: string,
    ): boolean {
      if (resolvedOptions.allowRenderProps && isRenderPropName(name)) {
        return false;
      }
      const patternMatch = propPatterns.some((pattern) =>
        matchesPattern(name, pattern),
      );
      const looksComponent =
        isPascalCase(name) ||
        name.endsWith('Wrapper') ||
        name.endsWith('Component');
      if (patternMatch) {
        return true;
      }
      if (looksComponent) {
        return isComponentTypeByTypeInfo(attribute);
      }
      return false;
    }

    /**
     * Follows an identifier in a wrapper call's argument position to the
     * function it names, declining wherever the reference does not prove
     * per-render churn.
     *
     * Every decline below is a name whose binding is NOT recreated by the
     * consuming render, or one this rule cannot see the definition of at all:
     * an unresolved name (import, global, ambient), a parameter, a catch or
     * class binding, a name declared more than once, a binding assigned more
     * than once (its identity is not fixed by any single declaration), and a
     * declaration outside the consuming scope. Only a single-write `Variable`
     * or `FunctionName` declared by the very function whose JSX passes it along
     * churns per render.
     */
    function resolveLocalFunction(
      identifier: TSESTree.Identifier,
      consumerFunction: TSESTree.Node | null,
      seen: Set<TSESLint.Scope.Variable>,
    ): FunctionNode | undefined {
      // An alias chain is bounded so a cycle (`const A = memo(A)`) and a long
      // re-export chain both terminate rather than recursing on the scope graph.
      if (seen.size >= MAX_ALIAS_HOPS) return undefined;

      const variable = findVariableInScopes(context, identifier);
      if (!variable || seen.has(variable)) return undefined;
      seen.add(variable);

      if (variable.defs.length !== 1) return undefined;
      const definition = variable.defs[0];
      if (
        definition.type !== 'Variable' &&
        definition.type !== 'FunctionName'
      ) {
        return undefined;
      }

      const writeCount = variable.references.filter((reference) =>
        reference.isWrite(),
      ).length;
      if (writeCount > 1) return undefined;

      const defNode = definition.node;
      if (
        resolvedOptions.allowModuleScopeFactories &&
        isStableForConsumer(defNode, consumerFunction)
      ) {
        return undefined;
      }

      if (defNode.type === AST_NODE_TYPES.FunctionDeclaration) {
        return defNode;
      }
      if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
        return getFunctionFromInit(defNode.init, (next) =>
          resolveLocalFunction(next, consumerFunction, seen),
        );
      }
      return undefined;
    }

    function shouldReportDefinition(
      definition: TSESLint.Scope.Definition,
      displayName: string | undefined,
      consumerFunction: TSESTree.Node | null,
    ): boolean {
      if (
        definition.type === 'ImportBinding' ||
        definition.type === 'Parameter' ||
        definition.type === 'Type'
      ) {
        return false;
      }

      const defNode = definition.node;
      if (
        resolvedOptions.allowModuleScopeFactories &&
        isStableForConsumer(defNode, consumerFunction)
      ) {
        return false;
      }

      let fnNode: FunctionNode | undefined;

      if (defNode.type === AST_NODE_TYPES.FunctionDeclaration) {
        fnNode = defNode;
      } else if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
        fnNode = getFunctionFromInit(defNode.init, (identifier) =>
          resolveLocalFunction(identifier, consumerFunction, new Set()),
        );
      } else {
        return false;
      }

      if (!fnNode) return false;
      return isComponentLikeFunction(fnNode, context, displayName);
    }

    function report(
      node: TSESTree.Node,
      propName: string,
      componentName: string,
    ): void {
      context.report({
        node,
        messageId: 'inlineComponentProp',
        data: { propName, componentName },
      });
    }

    function handleIdentifierExpression(
      identifier: TSESTree.Identifier,
      propName: string,
      consumerFunction: TSESTree.Node | null,
    ): void {
      const variable = findVariableInScopes(context, identifier);
      if (!variable) return;
      const definition = variable.defs.find(
        (def) =>
          (def.node.type === AST_NODE_TYPES.FunctionDeclaration ||
            def.node.type === AST_NODE_TYPES.VariableDeclarator) &&
          def.type !== 'Parameter' &&
          def.type !== 'ImportBinding',
      );
      if (!definition) return;
      if (
        shouldReportDefinition(definition, identifier.name, consumerFunction)
      ) {
        report(identifier, propName, identifier.name);
      }
    }

    function handleMemberExpression(
      member: TSESTree.MemberExpression,
      propName: string,
      consumerFunction: TSESTree.Node | null,
    ): void {
      if (member.computed) return;
      if (member.property.type !== AST_NODE_TYPES.Identifier) return;
      const objectId = member.object;
      if (objectId.type !== AST_NODE_TYPES.Identifier) return;

      const variable = findVariableInScopes(context, objectId);
      if (!variable) return;
      const definition = variable.defs.find(
        (def) =>
          def.node.type === AST_NODE_TYPES.VariableDeclarator &&
          def.node.id.type === AST_NODE_TYPES.Identifier &&
          def.node.id.name === objectId.name &&
          def.type !== 'ImportBinding' &&
          def.type !== 'Parameter' &&
          def.type !== 'Type',
      );
      if (!definition) return;
      const defNode = definition.node;
      if (!defNode || defNode.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }
      // `global-const-style` autofixes a module-scope object literal to
      // `as const`, so reading `init` raw lets one fixer silence this rule.
      const holder = unwrapExpression(defNode.init);
      if (!holder || holder.type !== AST_NODE_TYPES.ObjectExpression) {
        return;
      }

      if (
        resolvedOptions.allowModuleScopeFactories &&
        isStableForConsumer(defNode, consumerFunction)
      ) {
        return;
      }

      const fnNode = findObjectPropertyFunction(holder, member.property.name);
      if (
        fnNode &&
        isComponentLikeFunction(fnNode, context, member.property.name)
      ) {
        report(member, propName, member.property.name);
      }
    }

    function handleInlineFunctionExpression(
      fn:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
      propName: string,
    ): void {
      const explicitName =
        fn.type === AST_NODE_TYPES.FunctionExpression ? fn.id?.name : undefined;
      if (!isComponentLikeFunction(fn, context, explicitName)) {
        return;
      }
      const displayName =
        (fn.type === AST_NODE_TYPES.FunctionExpression && fn.id?.name) ||
        INLINE_COMPONENT_NAME;
      report(fn, propName, displayName);
    }

    function handleCallExpression(
      call: TSESTree.CallExpression,
      propName: string,
    ): void {
      const fnNode = getFunctionFromCall(call);
      if (!fnNode) return;
      if (isComponentLikeFunction(fnNode, context)) {
        report(call, propName, INLINE_COMPONENT_NAME);
      }
    }

    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (!node.name || node.name.type !== AST_NODE_TYPES.JSXIdentifier) {
          return;
        }
        const propName = node.name.name;
        if (!isTargetProp(node, propName)) return;

        if (
          !node.value ||
          node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
        ) {
          return;
        }

        if (node.value.expression.type === AST_NODE_TYPES.JSXEmptyExpression) {
          return;
        }

        const expression = unwrapExpression(
          node.value.expression as TSESTree.Expression,
        );
        if (!expression) return;

        if (
          expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          expression.type === AST_NODE_TYPES.FunctionExpression
        ) {
          handleInlineFunctionExpression(expression, propName);
          return;
        }

        if (expression.type === AST_NODE_TYPES.CallExpression) {
          handleCallExpression(expression, propName);
          return;
        }

        // Anchored on the attribute rather than on the referencing expression so
        // both branches measure churn against the same consuming scope.
        const consumerFunction = getEnclosingFunction(node);

        if (expression.type === AST_NODE_TYPES.Identifier) {
          handleIdentifierExpression(expression, propName, consumerFunction);
          return;
        }

        if (expression.type === AST_NODE_TYPES.MemberExpression) {
          handleMemberExpression(expression, propName, consumerFunction);
        }
      },
    };
  },
});
