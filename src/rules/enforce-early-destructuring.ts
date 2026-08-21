import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'hoistDestructuring';

type DestructuringProperty = {
  key: string;
  text: string;
  node: TSESTree.Property | TSESTree.RestElement;
  order: number;
  bindingNames: Set<string>;
  referenceNames: Set<string>;
};

type DestructuringGroup = {
  objectText: string;
  properties: Map<string, DestructuringProperty>;
  names: Set<string>;
  orderedNames: string[];
  declarations: TSESTree.VariableDeclaration[];
  inits: TSESTree.Expression[];
  baseName: string | null;
  hasTypeAnnotation: boolean;
};

/**
 * Source forms that already bind tighter than `??`, so wrapping them in the
 * hoisted `(obj) ?? {}` initializer adds parentheses a formatter then strips.
 *
 * The set is deliberately limited to what this rule can actually emit: only an
 * identifier-rooted source is ever hoisted, so a call, conditional or logical
 * source never reaches here. Anything absent keeps its parentheses, which is the
 * safe direction — a stray pair is cosmetic, a missing pair changes what the
 * initializer evaluates. `as` and `satisfies` are excluded on purpose: TypeScript
 * rejects them beside `??` unparenthesized.
 */
const TIGHTER_THAN_NULLISH = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

const nullishSourceText = (
  objectText: string,
  init: TSESTree.Expression | undefined,
): string =>
  init && TIGHTER_THAN_NULLISH.has(init.type) ? objectText : `(${objectText})`;

const HOOK_NAMES = new Set([
  'useEffect',
  'useMemo',
  'useCallback',
  'useLayoutEffect',
]);

type ParenthesizedExpressionLike = TSESTree.Expression & {
  type: 'ParenthesizedExpression';
  expression: TSESTree.Expression;
};

function isParenthesizedExpression(
  expression: TSESTree.Expression,
): expression is ParenthesizedExpressionLike {
  return (expression as { type: string }).type === 'ParenthesizedExpression';
}

function unwrapTsExpression(
  expression: TSESTree.Expression,
): TSESTree.Expression {
  let current: TSESTree.Expression = expression;
  // Loop to peel off TS/paren wrappers that do not change the underlying value.
  // The explicit loop keeps TypeScript aware that `current` always has an
  // `.expression` property inside the branch.
  // eslint-disable-next-line no-constant-condition -- Loop intentionally runs until wrapper nodes are fully unwrapped.
  while (true) {
    if (
      current.type === AST_NODE_TYPES.TSNonNullExpression ||
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      isParenthesizedExpression(current)
    ) {
      const nodeWithExpression = current as
        | TSESTree.TSNonNullExpression
        | TSESTree.TSAsExpression
        | TSESTree.TSTypeAssertion
        | TSESTree.TSSatisfiesExpression
        | ParenthesizedExpressionLike;
      current = nodeWithExpression.expression as TSESTree.Expression;
      continue;
    }
    break;
  }
  return current;
}

function isFunctionNode(
  node: TSESTree.Node,
): node is TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isHookCall(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.Identifier) return null;
  return HOOK_NAMES.has(callee.name) ? callee.name : null;
}

function isAllowedInit(init: TSESTree.Expression): boolean {
  const unwrapped = unwrapTsExpression(init);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) return true;
  if (unwrapped.type === AST_NODE_TYPES.MemberExpression) return true;
  if (unwrapped.type === AST_NODE_TYPES.ChainExpression) {
    const inner = unwrapTsExpression(
      unwrapped.expression as TSESTree.Expression,
    );
    return inner.type === AST_NODE_TYPES.MemberExpression;
  }
  return false;
}

function getBaseIdentifier(init: TSESTree.Expression): string | null {
  const unwrapped = unwrapTsExpression(init);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped.name;
  }

  if (unwrapped.type === AST_NODE_TYPES.MemberExpression) {
    let current: TSESTree.Expression = unwrapTsExpression(
      unwrapped.object as TSESTree.Expression,
    );
    while (current.type === AST_NODE_TYPES.MemberExpression) {
      current = unwrapTsExpression(current.object as TSESTree.Expression);
    }
    if (current.type === AST_NODE_TYPES.Identifier) {
      return current.name;
    }
    if (current.type === AST_NODE_TYPES.ChainExpression) {
      return getBaseIdentifier(current.expression);
    }
  }

  if (unwrapped.type === AST_NODE_TYPES.ChainExpression) {
    return getBaseIdentifier(unwrapped.expression);
  }

  return null;
}

function addNameIfAbsent(
  name: string,
  names: Set<string>,
  orderedNames: string[],
): void {
  if (names.has(name)) return;
  names.add(name);
  orderedNames.push(name);
}

function handleAssignmentPatternNames(
  node: TSESTree.AssignmentPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  const left = node.left;
  if (left.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(left.name, names, orderedNames);
    return;
  }

  if (left.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(left, names, orderedNames);
    return;
  }

  if (left.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(left, names, orderedNames);
  }
}

function handlePropertyNodeNames(
  property: TSESTree.Property,
  names: Set<string>,
  orderedNames: string[],
): void {
  const value = property.value;
  if (value.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(value.name, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.AssignmentPattern) {
    handleAssignmentPatternNames(value, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(value, names, orderedNames);
    return;
  }

  if (value.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(value, names, orderedNames);
  }
}

function handleRestElementNodeNames(
  rest: TSESTree.RestElement,
  names: Set<string>,
  orderedNames: string[],
): void {
  const argument = rest.argument;
  if (argument.type === AST_NODE_TYPES.Identifier) {
    addNameIfAbsent(argument.name, names, orderedNames);
    return;
  }

  if (argument.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(argument, names, orderedNames);
    return;
  }

  if (argument.type === AST_NODE_TYPES.ArrayPattern) {
    collectNamesFromArrayPattern(argument, names, orderedNames);
  }
}

function collectNamesFromPattern(
  pattern: TSESTree.ObjectPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  for (const property of pattern.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      handlePropertyNodeNames(property, names, orderedNames);
    } else if (property.type === AST_NODE_TYPES.RestElement) {
      handleRestElementNodeNames(property, names, orderedNames);
    }
  }
}

function collectNamesFromArrayPattern(
  pattern: TSESTree.ArrayPattern,
  names: Set<string>,
  orderedNames: string[],
): void {
  for (const element of pattern.elements) {
    if (!element) continue;
    if (element.type === AST_NODE_TYPES.Identifier) {
      addNameIfAbsent(element.name, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      handleAssignmentPatternNames(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.ObjectPattern) {
      collectNamesFromPattern(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.ArrayPattern) {
      collectNamesFromArrayPattern(element, names, orderedNames);
    } else if (element.type === AST_NODE_TYPES.RestElement) {
      handleRestElementNodeNames(element, names, orderedNames);
    }
  }
}

function collectBindingNamesFromBindingName(
  binding: TSESTree.BindingName,
  names: Set<string>,
): void {
  if (binding.type === AST_NODE_TYPES.Identifier) {
    names.add(binding.name);
    return;
  }
  if (binding.type === AST_NODE_TYPES.ObjectPattern) {
    collectNamesFromPattern(binding, names, []);
    return;
  }
  collectNamesFromArrayPattern(binding, names, []);
}

function collectBindingNamesFromParamLike(
  node:
    | TSESTree.BindingName
    | TSESTree.AssignmentPattern
    | TSESTree.RestElement,
  names: Set<string>,
): void {
  if (node.type === AST_NODE_TYPES.AssignmentPattern) {
    collectBindingNamesFromParamLike(
      node.left as
        | TSESTree.BindingName
        | TSESTree.AssignmentPattern
        | TSESTree.RestElement,
      names,
    );
    return;
  }
  if (node.type === AST_NODE_TYPES.RestElement) {
    collectBindingNamesFromParamLike(
      node.argument as TSESTree.BindingName | TSESTree.AssignmentPattern,
      names,
    );
    return;
  }
  collectBindingNamesFromBindingName(node, names);
}

function collectExistingBindings(
  callback: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  declarationsToRemove: Set<TSESTree.Node>,
): Set<string> {
  const names = new Set<string>();

  for (const param of callback.params) {
    if (param) {
      collectBindingNamesFromParamLike(
        param as
          | TSESTree.BindingName
          | TSESTree.AssignmentPattern
          | TSESTree.RestElement,
        names,
      );
    }
  }

  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
    return names;
  }

  for (const statement of callback.body.body) {
    if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id) {
      names.add(statement.id.name);
    }

    if (
      statement.type === AST_NODE_TYPES.VariableDeclaration &&
      !declarationsToRemove.has(statement)
    ) {
      for (const declarator of statement.declarations) {
        collectBindingNamesFromParamLike(
          declarator.id as
            | TSESTree.BindingName
            | TSESTree.AssignmentPattern
            | TSESTree.RestElement,
          names,
        );
      }
    }
  }

  return names;
}

function collectCallbackLocalBindings(
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  declarationsToRemove: Set<TSESTree.Node>,
  visitorKeys: Record<string, string[]>,
): Set<string> {
  const names = new Set<string>();
  const stack: TSESTree.Node[] = [callback.body];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (declarationsToRemove.has(current)) {
      continue;
    }

    if (current.type === AST_NODE_TYPES.FunctionDeclaration) {
      if (current.id) {
        names.add(current.id.name);
      }
      continue;
    }

    if (current.type === AST_NODE_TYPES.ClassDeclaration) {
      if (current.id) {
        names.add(current.id.name);
      }
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      continue;
    }

    if (current.type === AST_NODE_TYPES.VariableDeclarator) {
      collectBindingNamesFromBindingName(
        current.id as TSESTree.BindingName,
        names,
      );
    }

    if (current.type === AST_NODE_TYPES.CatchClause && current.param) {
      collectBindingNamesFromBindingName(
        current.param as TSESTree.BindingName,
        names,
      );
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return names;
}

function collectBindingsInScope(scope: TSESLint.Scope.Scope): Set<string> {
  const names = new Set<string>();
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    for (const variable of current.variables) {
      if (variable.identifiers.length === 0) {
        continue;
      }
      names.add(variable.name);
    }
    current = current.upper ?? null;
  }
  return names;
}

function findInsertionStatement(
  node: TSESTree.Node,
): TSESTree.Statement | null {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    const parent = current.parent as TSESTree.Node | undefined;
    if (!parent) return null;
    if (
      parent.type === AST_NODE_TYPES.BlockStatement &&
      parent.body.includes(current as TSESTree.Statement)
    ) {
      return current as TSESTree.Statement;
    }
    current = parent;
  }
  return null;
}

function bindingNamesOfDestructuringProperty(
  property: TSESTree.Property | TSESTree.RestElement,
): Set<string> {
  const names = new Set<string>();
  if (property.type === AST_NODE_TYPES.Property) {
    collectBindingNamesFromParamLike(
      property.value as
        | TSESTree.BindingName
        | TSESTree.AssignmentPattern
        | TSESTree.RestElement,
      names,
    );
    return names;
  }

  collectBindingNamesFromParamLike(property, names);
  return names;
}

function collectRuntimeIdentifierReferences(
  root: TSESTree.Node,
  visitorKeys: Record<string, string[]>,
  names: Set<string>,
): void {
  const stack: TSESTree.Node[] = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (
      current.type === AST_NODE_TYPES.Identifier &&
      isIdentifierReference(current)
    ) {
      names.add(current.name);
    }

    if (
      current.type === AST_NODE_TYPES.TSNonNullExpression ||
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSTypeAssertion ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      isParenthesizedExpression(current as unknown as TSESTree.Expression)
    ) {
      const nodeWithExpression = current as
        | TSESTree.TSNonNullExpression
        | TSESTree.TSAsExpression
        | TSESTree.TSTypeAssertion
        | TSESTree.TSSatisfiesExpression
        | ParenthesizedExpressionLike;
      stack.push(nodeWithExpression.expression as unknown as TSESTree.Node);
      continue;
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }
}

function collectPatternReferenceNames(
  node: TSESTree.Node,
  visitorKeys: Record<string, string[]>,
  names: Set<string>,
): void {
  if (node.type === AST_NODE_TYPES.AssignmentPattern) {
    collectRuntimeIdentifierReferences(
      node.right as unknown as TSESTree.Node,
      visitorKeys,
      names,
    );
    collectPatternReferenceNames(node.left, visitorKeys, names);
    return;
  }

  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of node.properties) {
      if (property.type === AST_NODE_TYPES.Property) {
        if (property.computed) {
          collectRuntimeIdentifierReferences(
            property.key as unknown as TSESTree.Node,
            visitorKeys,
            names,
          );
        }
        collectPatternReferenceNames(
          property.value as unknown as TSESTree.Node,
          visitorKeys,
          names,
        );
      } else if (property.type === AST_NODE_TYPES.RestElement) {
        collectPatternReferenceNames(property.argument, visitorKeys, names);
      }
    }
    return;
  }

  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    for (const element of node.elements) {
      if (!element) continue;
      collectPatternReferenceNames(element, visitorKeys, names);
    }
    return;
  }

  if (node.type === AST_NODE_TYPES.RestElement) {
    collectPatternReferenceNames(node.argument, visitorKeys, names);
  }
}

function referenceNamesOfDestructuringProperty(
  property: TSESTree.Property | TSESTree.RestElement,
  visitorKeys: Record<string, string[]>,
): Set<string> {
  const names = new Set<string>();
  if (property.type === AST_NODE_TYPES.Property) {
    if (property.computed) {
      collectRuntimeIdentifierReferences(
        property.key as unknown as TSESTree.Node,
        visitorKeys,
        names,
      );
    }
    collectPatternReferenceNames(
      property.value as unknown as TSESTree.Node,
      visitorKeys,
      names,
    );
    return names;
  }

  collectPatternReferenceNames(property, visitorKeys, names);
  return names;
}

function collectProperties(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
  visitorKeys: Record<string, string[]>,
  acc: Map<string, DestructuringProperty>,
): void {
  for (const property of pattern.properties) {
    const text = getSafePropertyText(property, sourceCode);

    if (acc.has(text)) continue;

    const keyText =
      property.type === AST_NODE_TYPES.Property
        ? property.key.type === AST_NODE_TYPES.Literal
          ? String(property.key.value)
          : property.key.type === AST_NODE_TYPES.Identifier
          ? property.key.name
          : sourceCode.getText(property.key)
        : `...${sourceCode.getText(property.argument)}`;

    acc.set(text, {
      key: keyText,
      text,
      // The node is carried through because the emitted layout depends on the
      // indentation of the insertion site, which is not known until every
      // group's properties have been collected and deduplicated.
      node: property,
      order: property.range ? property.range[0] : acc.size,
      bindingNames: bindingNamesOfDestructuringProperty(property),
      referenceNames: referenceNamesOfDestructuringProperty(
        property,
        visitorKeys,
      ),
    });
  }
}

/**
 * Prettier's own indentation step for the emitted pattern. Two spaces matches
 * the repo's `tabWidth`, which agora shares.
 */
const INDENT_UNIT = '  ';

/**
 * Whether the emitted text for a pattern's value carries a forced break outward.
 * Prettier propagates a forced break through every enclosing group, so an object
 * pattern buried inside an array still expands the pattern holding that array.
 */
function patternValueForcesBreak(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    return propertiesForceBreak(node.properties, false);
  }

  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    return arrayPatternForcesBreak(node);
  }

  if (node.type === AST_NODE_TYPES.AssignmentPattern) {
    // Prettier exempts a pattern that is the left of a default from its own
    // nesting rule, so `{ a: { b } = {} }` prints flat. A break arriving from
    // deeper still travels through it.
    const left = node.left;
    if (left.type === AST_NODE_TYPES.ObjectPattern) {
      return propertiesForceBreak(left.properties, true);
    }
    if (left.type === AST_NODE_TYPES.ArrayPattern) {
      return arrayPatternForcesBreak(left);
    }
    return false;
  }

  if (node.type === AST_NODE_TYPES.RestElement) {
    return patternValueForcesBreak(node.argument);
  }

  return false;
}

/** An array pattern has no nesting rule of its own; it only inherits a break. */
function arrayPatternForcesBreak(pattern: TSESTree.ArrayPattern): boolean {
  // A hole is `null` in the element list and prints as a bare separator, so it
  // can never carry a break of its own.
  return pattern.elements.some((element) =>
    element ? patternValueForcesBreak(element) : false,
  );
}

/**
 * Whether prettier prints an object pattern built from these properties
 * EXPANDED — one property per line with a trailing comma.
 *
 * Prettier breaks such a pattern as soon as any property's value is itself an
 * object or array pattern, whatever the width (`printObject`'s `shouldBreak`).
 * A width budget cannot see that rule, so emitting the flat spelling hands agora
 * source that `eslint --fix` produces and the very next formatter run rewrites
 * (#2081). `isDefaultLeft` carries prettier's single exception, described in
 * patternValueForcesBreak.
 *
 * Only an object-pattern VALUE triggers the rule here: an array-pattern value
 * leaves formatPropertyText as `key: [...] = []`, an assignment pattern, which
 * prettier keeps flat.
 */
function propertiesForceBreak(
  properties: readonly (TSESTree.Property | TSESTree.RestElement)[],
  isDefaultLeft: boolean,
): boolean {
  const breaksOnOwnNesting =
    !isDefaultLeft &&
    properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        property.value.type === AST_NODE_TYPES.ObjectPattern,
    );

  return (
    breaksOnOwnNesting ||
    properties.some((property) =>
      patternValueForcesBreak(
        property.type === AST_NODE_TYPES.Property
          ? property.value
          : property.argument,
      ),
    )
  );
}

/**
 * Lays parts out the way prettier does: flat with inner spaces for an object and
 * none for an array, or one part per line indented a step in. A rest element
 * takes no trailing comma — that spelling is a syntax error, not a style choice.
 */
function joinPatternParts(
  parts: string[],
  delimiters: '{}' | '[]',
  broken: boolean,
  indent: string,
): string {
  const [open, close] = delimiters;

  if (!broken) {
    if (delimiters === '[]') {
      return `[${parts.join(', ')}]`;
    }
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }

  const childIndent = `${indent}${INDENT_UNIT}`;
  const lastIndex = parts.length - 1;
  const body = parts
    .map((part, index) => {
      const comma = index === lastIndex && part.startsWith('...') ? '' : ',';
      return `${childIndent}${part}${comma}`;
    })
    .join('\n');

  return `${open}\n${body}\n${indent}${close}`;
}

function renderArrayPatternWithDefaults(
  pattern: TSESTree.ArrayPattern,
  sourceCode: TSESLint.SourceCode,
  indent: string,
): string {
  const broken = arrayPatternForcesBreak(pattern);
  const childIndent = broken ? `${indent}${INDENT_UNIT}` : indent;

  const elements = pattern.elements.map((element) => {
    if (!element) return '';
    if (element.type === AST_NODE_TYPES.Identifier) {
      return sourceCode.getText(element);
    }
    if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      const leftText = renderPatternLeft(element.left, sourceCode, childIndent);
      return `${leftText} = ${sourceCode.getText(element.right)}`;
    }
    if (element.type === AST_NODE_TYPES.ObjectPattern) {
      // No synthesized `= {}` here either, for the reason spelled out in
      // formatPropertyText: the default is checked against the bindings under it.
      return renderObjectPatternWithDefaults(
        element,
        sourceCode,
        childIndent,
        false,
      );
    }
    if (element.type === AST_NODE_TYPES.ArrayPattern) {
      const nested = renderArrayPatternWithDefaults(
        element,
        sourceCode,
        childIndent,
      );
      return `${nested} = []`;
    }
    if (element.type === AST_NODE_TYPES.RestElement) {
      return renderRestElementProperty(element, sourceCode, childIndent);
    }
    return sourceCode.getText(element);
  });

  return joinPatternParts(elements, '[]', broken, indent);
}

function formatPropertyText(
  property: TSESTree.Property | TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
  indent: string,
): string {
  if (property.type === AST_NODE_TYPES.RestElement) {
    return renderRestElementProperty(property, sourceCode, indent);
  }

  if (property.shorthand) {
    return sourceCode.getText(property);
  }

  const keyText = renderPropertyKey(property, sourceCode);
  const value = property.value;

  if (value.type === AST_NODE_TYPES.AssignmentPattern) {
    return renderPropertyWithAssignment(
      property,
      value,
      keyText,
      sourceCode,
      indent,
    );
  }

  if (value.type === AST_NODE_TYPES.ObjectPattern) {
    // A nested object pattern is re-emitted as authored, without a synthesized
    // `= {}`. TypeScript checks such a default against every binding element
    // beneath it, so `{ profile: { name, age } = {} }` reports TS2525 once per
    // name: `{}` supplies no value and the names carry no defaults of their own.
    // The default also only ever guarded a nullish parent (an explicitly `null`
    // one still throws), so dropping it costs a partial runtime guard and buys
    // back the invariant that compiling input yields compiling output.
    const nested = renderObjectPatternWithDefaults(
      value,
      sourceCode,
      indent,
      false,
    );
    return `${keyText}: ${nested}`;
  }

  if (value.type === AST_NODE_TYPES.ArrayPattern) {
    // An array pattern's `= []` default is safe to synthesize: TypeScript does
    // not push it down onto the element bindings the way it does for objects.
    const nested = renderArrayPatternWithDefaults(value, sourceCode, indent);
    return `${keyText}: ${nested} = []`;
  }

  return `${keyText}: ${sourceCode.getText(value)}`;
}

function renderPropertyKey(
  property: TSESTree.Property,
  sourceCode: TSESLint.SourceCode,
): string {
  return property.computed
    ? `[${sourceCode.getText(property.key)}]`
    : sourceCode.getText(property.key);
}

function renderPropertyWithAssignment(
  property: TSESTree.Property,
  value: TSESTree.AssignmentPattern,
  keyText: string,
  sourceCode: TSESLint.SourceCode,
  indent: string,
): string {
  const left = value.left;
  if (
    !property.computed &&
    property.key.type === AST_NODE_TYPES.Identifier &&
    left.type === AST_NODE_TYPES.Identifier &&
    property.key.name === left.name
  ) {
    return `${sourceCode.getText(property.key)} = ${sourceCode.getText(
      value.right,
    )}`;
  }

  const leftText = renderPatternLeft(left, sourceCode, indent);
  return `${keyText}: ${leftText} = ${sourceCode.getText(value.right)}`;
}

function renderPatternLeft(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
  indent: string,
): string {
  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    return renderObjectPatternWithDefaults(node, sourceCode, indent, true);
  }

  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    return renderArrayPatternWithDefaults(node, sourceCode, indent);
  }

  return sourceCode.getText(node);
}

function renderRestElementProperty(
  property: TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
  indent: string,
): string {
  const argument = property.argument;
  if (argument.type === AST_NODE_TYPES.ObjectPattern) {
    return `...${renderObjectPatternWithDefaults(
      argument,
      sourceCode,
      indent,
      false,
    )}`;
  }
  if (argument.type === AST_NODE_TYPES.ArrayPattern) {
    return `...${renderArrayPatternWithDefaults(argument, sourceCode, indent)}`;
  }
  return `...${sourceCode.getText(argument)}`;
}

function renderObjectPatternWithDefaults(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
  indent: string,
  isDefaultLeft: boolean,
): string {
  return renderPatternFromProperties(
    pattern.properties,
    sourceCode,
    indent,
    isDefaultLeft,
  );
}

/**
 * The hoisted pattern is assembled from properties that may come from several
 * source declarations, so the layout decision is taken over a property LIST
 * rather than over any single authored pattern.
 */
function renderPatternFromProperties(
  properties: readonly (TSESTree.Property | TSESTree.RestElement)[],
  sourceCode: TSESLint.SourceCode,
  indent: string,
  isDefaultLeft: boolean,
): string {
  const broken = propertiesForceBreak(properties, isDefaultLeft);
  const childIndent = broken ? `${indent}${INDENT_UNIT}` : indent;
  const parts = properties.map((property) =>
    formatPropertyText(property, sourceCode, childIndent),
  );

  return joinPatternParts(parts, '{}', broken, indent);
}

/**
 * The dedup key for a collected property. Rendered at column zero so the key is
 * a property of the property alone: the indentation the emission finally uses is
 * decided later, once every group's properties are known.
 */
function getSafePropertyText(
  property: TSESTree.Property | TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
): string {
  return formatPropertyText(property, sourceCode, '');
}

function dependencyElements(
  depsArray: TSESTree.ArrayExpression,
  sourceCode: TSESLint.SourceCode,
): string[] {
  return depsArray.elements
    .filter(
      (element): element is TSESTree.Expression | TSESTree.SpreadElement =>
        Boolean(element),
    )
    .map((element) => sourceCode.getText(element));
}

function callbackUsesBaseIdentifier(
  callback: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  baseName: string,
  excludedDeclarations: Set<TSESTree.Node>,
  excludedInits: Set<TSESTree.Node>,
  visitorKeys: Record<string, string[]>,
): boolean {
  const stack: TSESTree.Node[] = [callback.body];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (excludedDeclarations.has(current)) {
      continue;
    }

    if (excludedInits.has(current)) {
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.Identifier &&
      current.name === baseName &&
      isIdentifierReference(current)
    ) {
      return true;
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function testContainsObjectMember(
  testNode: TSESTree.Node,
  objectName: string,
  visitorKeys: Record<string, string[]>,
): boolean {
  let found = false;
  const stack: TSESTree.Node[] = [testNode];

  while (stack.length && !found) {
    const current = stack.pop();
    if (!current) continue;

    if (
      current.type === AST_NODE_TYPES.MemberExpression &&
      current.object &&
      (() => {
        let base: TSESTree.Node = current.object;
        while (base.type === AST_NODE_TYPES.MemberExpression) {
          base = base.object;
        }
        return (
          base.type === AST_NODE_TYPES.Identifier && base.name === objectName
        );
      })()
    ) {
      found = true;
      break;
    }

    if (
      current.type === AST_NODE_TYPES.Identifier &&
      current.name === objectName &&
      isIdentifierReference(current)
    ) {
      found = true;
      break;
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return found;
}

function isTypeNarrowingContext(
  node: TSESTree.Node,
  baseName: string | null,
  visitorKeys: Record<string, string[]>,
): boolean {
  if (!baseName) return false;
  let current: TSESTree.Node | undefined = node.parent as
    | TSESTree.Node
    | undefined;

  while (current && current.type !== AST_NODE_TYPES.Program) {
    if (current.type === AST_NODE_TYPES.IfStatement && current.test) {
      if (testContainsObjectMember(current.test, baseName, visitorKeys)) {
        return true;
      }
    }
    current = current.parent as TSESTree.Node | undefined;
  }

  return false;
}

function getIndentation(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', node.range![0]) + 1;
  const prefix = text.slice(lineStart, node.range![0]);
  const match = prefix.match(/^[\t ]*/);
  return match ? match[0] : '';
}

function removalRange(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): [number, number] {
  const text = sourceCode.getText();
  const range = node.range!;
  const lineStart = text.lastIndexOf('\n', range[0] - 1) + 1;
  const lineEnd = text.indexOf('\n', range[1]);
  const endOfLine = lineEnd === -1 ? text.length : lineEnd;
  const leading = text.slice(lineStart, range[0]);
  const trailing = text.slice(range[1], endOfLine);
  if (/^[\t ]*$/.test(leading) && /^[\t ;]*$/.test(trailing)) {
    return [lineStart, lineEnd === -1 ? text.length : lineEnd + 1];
  }
  if (/^[\t ;]*$/.test(trailing)) {
    return [range[0], lineEnd === -1 ? text.length : lineEnd + 1];
  }
  if (text[range[1]] === ' ') {
    return [range[0], range[1] + 1];
  }
  return [range[0], range[1]];
}

/**
 * The comments removing `declarations` would delete outright.
 *
 * `removalRange` takes the whole statement — every line of it once the pattern
 * is written expanded — so a comment authored inside the destructure goes with
 * it. That comment belongs to the statement being MOVED, not to the callback the
 * statement is leaving, so the hoist carries it rather than dropping it (#2081).
 * A comment on the line above the declaration is untouched here: the removal
 * starts at the declaration's own line, so it stays where its neighbour is.
 */
function carriedCommentsOf(
  declarations: TSESTree.VariableDeclaration[],
  sourceCode: TSESLint.SourceCode,
): string[] {
  const spans = declarations.map((declaration) =>
    removalRange(declaration, sourceCode),
  );
  const text = sourceCode.getText();

  const carried: string[] = [];
  for (const comment of sourceCode.getAllComments()) {
    const range = comment.range;
    if (!range) continue;
    const [start, end] = range;
    const swallowed = spans.some(
      ([spanStart, spanEnd]) => start >= spanStart && end <= spanEnd,
    );
    if (swallowed) {
      carried.push(text.slice(start, end));
    }
  }

  return carried;
}

function isAnyFunctionLikeNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.TSDeclareFunction
  );
}

function shouldSkipNestedFunction(
  candidateNode: TSESTree.Node,
  callback: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
): boolean {
  return isAnyFunctionLikeNode(candidateNode) && candidateNode !== callback;
}

function hasCrossGroupNameCollision(
  groups: Map<string, DestructuringGroup>,
): boolean {
  const nameToObjects = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    for (const name of group.names) {
      const seen = nameToObjects.get(name) ?? new Set<string>();
      seen.add(group.objectText);
      nameToObjects.set(name, seen);
      if (seen.size > 1) {
        return true;
      }
    }
  }
  return false;
}

function hasPriorConditionalGuard(
  node: TSESTree.Node,
  baseName: string | null,
  visitorKeys: Record<string, string[]>,
): boolean {
  if (!baseName) return false;
  const parent = node.parent;
  if (!parent || parent.type !== AST_NODE_TYPES.BlockStatement) return false;

  const index = parent.body.indexOf(node as TSESTree.Statement);
  if (index <= 0) return false;

  return parent.body
    .slice(0, index)
    .some(
      (statement) =>
        statement.type === AST_NODE_TYPES.IfStatement &&
        Boolean(statement.test) &&
        testContainsObjectMember(statement.test, baseName, visitorKeys),
    );
}

/**
 * Statement forms that can skip the declaration nested beneath them, so a
 * declaration inside one is not reached on every pass through the callback.
 * `finally` is folded in with the rest of `try`: the distinction costs a branch
 * and buys back a shape nobody writes.
 */
const CONDITIONAL_CONTAINERS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.TryStatement,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

/**
 * Whether the pattern binds anything below its own root. Only the root gets the
 * synthesized `?? {}` rescue; a nested pattern is re-emitted verbatim because a
 * synthesized `= {}` under it would be checked against every binding beneath it
 * (see formatPropertyText). So a nested pattern dereferences an intermediate
 * that nothing in the hoisted text guards.
 */
function patternBindsBeneathRoot(pattern: TSESTree.ObjectPattern): boolean {
  const stack: TSESTree.Node[] = [...pattern.properties];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (
      current.type === AST_NODE_TYPES.ObjectPattern ||
      current.type === AST_NODE_TYPES.ArrayPattern
    ) {
      return true;
    }

    if (current.type === AST_NODE_TYPES.Property) {
      stack.push(current.value);
      continue;
    }

    if (current.type === AST_NODE_TYPES.RestElement) {
      stack.push(current.argument);
      continue;
    }

    // A default's right-hand side is an expression, never a binding site, so
    // only the left of an assignment pattern can hide a further pattern.
    if (current.type === AST_NODE_TYPES.AssignmentPattern) {
      stack.push(current.left);
    }
  }

  return false;
}

function containsTerminatingStatement(
  node: TSESTree.Node,
  visitorKeys: Record<string, string[]>,
): boolean {
  const stack: TSESTree.Node[] = [node];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    // A `return` belonging to a nested function exits that function, not the
    // block the declaration sits in, so it guards nothing here.
    if (current !== node && isAnyFunctionLikeNode(current)) {
      continue;
    }

    if (
      current.type === AST_NODE_TYPES.ReturnStatement ||
      current.type === AST_NODE_TYPES.ThrowStatement ||
      current.type === AST_NODE_TYPES.BreakStatement ||
      current.type === AST_NODE_TYPES.ContinueStatement
    ) {
      return true;
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return false;
}

function isEarlyExitGuard(
  statement: TSESTree.Statement,
  visitorKeys: Record<string, string[]>,
): boolean {
  return (
    statement.type === AST_NODE_TYPES.IfStatement &&
    containsTerminatingStatement(statement, visitorKeys)
  );
}

/**
 * Whether some conditional between the declaration and the callback body decides
 * that the declaration runs at all — either a container that can skip it, or an
 * earlier sibling that can leave the block before reaching it.
 *
 * Only the span up to the callback matters: the hoist lands immediately before
 * the statement holding the hook call, so it keeps every conditional wrapping
 * the hook itself and escapes exactly the ones inside the callback.
 */
function isConditionallyReached(
  node: TSESTree.Node,
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  visitorKeys: Record<string, string[]>,
): boolean {
  let current: TSESTree.Node = node;

  while (current !== callback.body) {
    const parent = current.parent as TSESTree.Node | undefined;
    if (!parent) return false;

    if (CONDITIONAL_CONTAINERS.has(parent.type)) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.BlockStatement) {
      const index = parent.body.indexOf(current as TSESTree.Statement);
      if (
        index > 0 &&
        parent.body
          .slice(0, index)
          .some((statement) => isEarlyExitGuard(statement, visitorKeys))
      ) {
        return true;
      }
    }

    current = parent;
  }

  return false;
}

/**
 * A nested destructure whose execution a guard controls stays put, whatever the
 * guard tests. `hasPriorConditionalGuard` and `isTypeNarrowingContext` recognise
 * only a guard naming the destructured object, which misses the ubiquitous
 * `if (ready)` / `if (!isLoaded) return;` / `try` spellings that license the
 * dereference without mentioning it. Hoisting past one of those evaluates the
 * nested pattern on every render, where `?? {}` covers the root and leaves the
 * intermediate to throw.
 *
 * The flat case keeps hoisting: there the `?? {}` rescue is the whole pattern.
 */
function isGuardedNestedDestructure(
  declaration: TSESTree.VariableDeclaration,
  pattern: TSESTree.ObjectPattern,
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  visitorKeys: Record<string, string[]>,
): boolean {
  return (
    patternBindsBeneathRoot(pattern) &&
    isConditionallyReached(declaration, callback, visitorKeys)
  );
}

function isIdentifierReference(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === node &&
    !parent.computed &&
    !parent.shorthand
  ) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === node &&
    !parent.computed
  ) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.MethodDefinition &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.TSPropertySignature &&
    parent.key === node &&
    !parent.computed
  ) {
    return false;
  }
  return true;
}

function buildDestructuringGroups(
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  depTextSet: Set<string>,
  visitorKeys: Record<string, string[]>,
  sourceCode: TSESLint.SourceCode,
): Map<string, DestructuringGroup> {
  const groups = new Map<string, DestructuringGroup>();
  const stack: TSESTree.Node[] = [...callback.body.body].reverse();

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (shouldSkipNestedFunction(current, callback)) {
      continue;
    }

    if (current.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of current.declarations) {
        if (
          declarator.id.type === AST_NODE_TYPES.ObjectPattern &&
          declarator.init &&
          isAllowedInit(declarator.init) &&
          current.declarations.length === 1 &&
          !declarator.id.properties.some(
            (prop) => prop.type === AST_NODE_TYPES.RestElement,
          )
        ) {
          const initText = sourceCode.getText(declarator.init);
          const normalizedInit = unwrapTsExpression(declarator.init);
          const normalizedText = sourceCode.getText(normalizedInit);
          const depKey = depTextSet.has(initText)
            ? initText
            : depTextSet.has(normalizedText)
            ? normalizedText
            : null;
          if (!depKey) continue;

          const baseName = getBaseIdentifier(declarator.init);
          if (
            hasPriorConditionalGuard(current, baseName, visitorKeys) ||
            isTypeNarrowingContext(current, baseName, visitorKeys) ||
            isGuardedNestedDestructure(
              current,
              declarator.id,
              callback,
              visitorKeys,
            )
          ) {
            continue;
          }

          const existingGroup = groups.get(depKey);
          const properties = existingGroup?.properties ?? new Map();
          collectProperties(declarator.id, sourceCode, visitorKeys, properties);

          const names = existingGroup?.names ?? new Set<string>();
          const orderedNames = existingGroup?.orderedNames ?? [];
          collectNamesFromPattern(declarator.id, names, orderedNames);

          const declarations = existingGroup?.declarations ?? [];
          declarations.push(current);

          const inits = existingGroup?.inits ?? [];
          inits.push(declarator.init);

          groups.set(depKey, {
            objectText: initText,
            properties,
            names,
            orderedNames,
            declarations,
            inits,
            baseName: existingGroup?.baseName ?? baseName ?? null,
            hasTypeAnnotation:
              Boolean(existingGroup?.hasTypeAnnotation) ||
              Boolean(declarator.id.typeAnnotation),
          });
        }
      }
    }

    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object') {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object') {
        stack.push(value as TSESTree.Node);
      }
    }
  }

  return groups;
}

type ValidationResult = {
  declarationsToRemove: Set<TSESTree.Node>;
  initsToIgnore: Set<TSESTree.Node>;
  existingBindings: Set<string>;
  scopeNameCollisions: Set<string>;
  callbackLocalBindings: Set<string>;
  reservedNames: Set<string>;
};

function validateGroupsForHoisting(
  groups: Map<string, DestructuringGroup>,
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  scope: TSESLint.Scope.Scope,
  visitorKeys: Record<string, string[]>,
  reservedNamesByScope: WeakMap<TSESLint.Scope.Scope, Set<string>>,
): ValidationResult | null {
  if (hasCrossGroupNameCollision(groups)) {
    return null;
  }

  // The hoisted declaration re-emits the pattern from property texts against a
  // `(obj) ?? {}` initializer. A declarator annotation cannot survive that: the
  // `{}` fallback almost never satisfies the annotation, and widening it to one
  // that does requires the type checker. Reporting without a fix is preferable
  // to silently dropping the annotation or manufacturing a type error, and a
  // single annotated declarator withholds the whole fix because a partial hoist
  // would still rewrite the dependency array around the statement left behind.
  for (const group of groups.values()) {
    if (group.hasTypeAnnotation) {
      return null;
    }
  }

  const declarationsToRemove = new Set<TSESTree.Node>();
  const initsToIgnore = new Set<TSESTree.Node>();

  for (const group of groups.values()) {
    group.declarations.forEach((decl) => declarationsToRemove.add(decl));
    group.inits.forEach((init) => initsToIgnore.add(init));
  }

  const existingBindings = collectExistingBindings(
    callback,
    declarationsToRemove,
  );
  const scopeDeclaredNames = collectBindingsInScope(scope);
  const reservedNames = reservedNamesByScope.get(scope) ?? new Set<string>();
  const scopeNameCollisions = new Set<string>([
    ...scopeDeclaredNames,
    ...reservedNames,
  ]);

  const callbackLocalBindings = collectCallbackLocalBindings(
    callback,
    declarationsToRemove,
    visitorKeys,
  );

  for (const group of groups.values()) {
    for (const property of group.properties.values()) {
      for (const name of property.referenceNames) {
        if (callbackLocalBindings.has(name)) {
          return null;
        }
      }
    }
  }

  for (const group of groups.values()) {
    for (const name of group.names) {
      if (existingBindings.has(name)) {
        return null;
      }
      if (scopeNameCollisions.has(name)) {
        return null;
      }
    }
  }

  for (const group of groups.values()) {
    const sortedProps = Array.from(group.properties.values()).sort(
      (a, b) => a.order - b.order,
    );
    const bindingNamesInHoistedPattern = new Set<string>();
    for (const property of sortedProps) {
      for (const name of property.bindingNames) {
        if (bindingNamesInHoistedPattern.has(name)) {
          return null;
        }
        bindingNamesInHoistedPattern.add(name);
      }
    }
    for (const name of group.names) {
      if (!bindingNamesInHoistedPattern.has(name)) {
        return null;
      }
    }
  }

  return {
    declarationsToRemove,
    initsToIgnore,
    existingBindings,
    scopeNameCollisions,
    callbackLocalBindings,
    reservedNames,
  };
}

function generateHoistingFixes(
  groups: Map<string, DestructuringGroup>,
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  },
  depsArray: TSESTree.ArrayExpression,
  depTexts: string[],
  insertionStatement: TSESTree.Statement,
  sourceCode: TSESLint.SourceCode,
  fixer: TSESLint.RuleFixer,
  visitorKeys: Record<string, string[]>,
  validation: ValidationResult,
  orderedDependencies: string[],
  reservedNamesByScope: WeakMap<TSESLint.Scope.Scope, Set<string>>,
  scope: TSESLint.Scope.Scope,
): TSESLint.RuleFix[] {
  const { declarationsToRemove, initsToIgnore, reservedNames } = validation;
  const indent = getIndentation(insertionStatement, sourceCode);
  const hoistedEntries: { comments: string[]; declaration: string }[] = [];
  const baseUsageByObject = new Map<string, boolean>();

  for (const [depKey, group] of groups.entries()) {
    if (!group.baseName) {
      baseUsageByObject.set(depKey, true);
      continue;
    }

    const usesBase = callbackUsesBaseIdentifier(
      callback,
      group.baseName,
      declarationsToRemove,
      initsToIgnore,
      visitorKeys,
    );
    baseUsageByObject.set(depKey, usesBase);
  }

  const newDepTexts = depTexts.filter((text) => {
    const group = groups.get(text);
    if (!group) return true;
    return baseUsageByObject.get(text) ?? true;
  });

  const updatedReservedNames = new Set(reservedNames);
  for (const group of groups.values()) {
    for (const name of group.names) {
      updatedReservedNames.add(name);
    }
  }

  for (const group of groups.values()) {
    const sortedProps = Array.from(group.properties.values()).sort(
      (a, b) => a.order - b.order,
    );
    const pattern = renderPatternFromProperties(
      sortedProps.map((property) => property.node),
      sourceCode,
      indent,
      false,
    );
    hoistedEntries.push({
      comments: carriedCommentsOf(group.declarations, sourceCode),
      declaration: `const ${pattern} = ${nullishSourceText(
        group.objectText,
        group.inits[0],
      )} ?? {};`,
    });
  }

  reservedNamesByScope.set(scope, updatedReservedNames);

  const newDepSet = new Set(newDepTexts);
  for (const name of orderedDependencies) {
    if (!newDepSet.has(name)) {
      newDepTexts.push(name);
      newDepSet.add(name);
    }
  }

  // Anchoring to the start of the statement's LINE is the same offset as the
  // statement itself only while the statement opens that line. When it does not
  // — a body collapsed onto one line, or a sibling declared ahead of it — that
  // offset sits outside the enclosing function, so a declaration reading the
  // function's own parameters would be hoisted out of the scope that binds them.
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', insertionStatement.range![0]) + 1;
  const ownsItsLine = /^[\t ]*$/.test(
    text.slice(lineStart, insertionStatement.range![0]),
  );
  // A carried comment always ends its own line. On the own-line branch that is
  // just the surrounding layout; on the inline branch it is load-bearing, since
  // a `//` comment joined onto one line would comment out the declaration and
  // the hook call after it.
  const ownLineText = hoistedEntries
    .flatMap((entry) => [...entry.comments, entry.declaration])
    .map((line) => `${indent}${line}`)
    .join('\n');
  const inlineComments = hoistedEntries.flatMap((entry) => entry.comments);
  const inlineDeclarations = hoistedEntries
    .map((entry) => entry.declaration)
    .join(' ');
  const inlineText = inlineComments.length
    ? `${inlineComments.join('\n')}\n${inlineDeclarations} `
    : `${inlineDeclarations} `;

  const fixes = [
    ownsItsLine
      ? fixer.insertTextBeforeRange([lineStart, lineStart], `${ownLineText}\n`)
      : fixer.insertTextBefore(insertionStatement, inlineText),
    fixer.replaceText(depsArray, `[${newDepTexts.join(', ')}]`),
  ];

  for (const decl of declarationsToRemove) {
    fixes.push(fixer.removeRange(removalRange(decl, sourceCode)));
  }

  return fixes;
}

function validateHookForTransform(
  node: TSESTree.CallExpression,
  context: TSESLint.RuleContext<MessageIds, []>,
): {
  hookName: string;
  callback: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
    body: TSESTree.BlockStatement;
  };
  depsArray: TSESTree.ArrayExpression;
  depTextSet: Set<string>;
  depTexts: string[];
  scope: TSESLint.Scope.Scope;
} | null {
  const hookName = isHookCall(node);
  if (!hookName) return null;

  const callback = node.arguments[0];
  if (
    !callback ||
    !isFunctionNode(callback) ||
    callback.body.type !== AST_NODE_TYPES.BlockStatement
  ) {
    return null;
  }

  if (callback.async) return null;

  const depsArray =
    node.arguments.length > 1 &&
    node.arguments[1] &&
    node.arguments[1].type === AST_NODE_TYPES.ArrayExpression
      ? (node.arguments[1] as TSESTree.ArrayExpression)
      : null;

  if (!depsArray) return null;

  const sourceCode =
    (context as unknown as { sourceCode?: TSESLint.SourceCode }).sourceCode ??
    context.getSourceCode();
  const depTexts = dependencyElements(depsArray, sourceCode);
  const depTextSet = new Set(depTexts);
  const scope = context.getScope();

  return {
    hookName,
    callback: callback as (
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
    ) & { body: TSESTree.BlockStatement },
    depsArray,
    depTextSet,
    depTexts,
    scope,
  };
}

export const enforceEarlyDestructuring = createRule<[], MessageIds>({
  name: 'enforce-early-destructuring',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Hoist object destructuring out of React hooks so dependency arrays track the fields in use instead of the entire object.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      hoistDestructuring:
        'What\'s wrong: "{{objectName}}" is destructured inside the {{hookName}} callback -> ' +
        'Why it matters: the deps array then tracks the whole object, so the hook can re-run for unrelated field changes and can hide stale closures -> ' +
        'How to fix: hoist the destructuring before {{hookName}} (or memoize/guard the object) and depend on the specific fields: {{dependencies}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode =
      (context as unknown as { sourceCode?: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode();
    const visitorKeys =
      (sourceCode as unknown as { visitorKeys?: Record<string, string[]> })
        .visitorKeys ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context as any).visitorKeys ??
      {};
    const reservedNamesByScope = new WeakMap<
      TSESLint.Scope.Scope,
      Set<string>
    >();

    return {
      CallExpression(node) {
        const validation = validateHookForTransform(node, context);
        if (!validation) return;

        const { hookName, callback, depsArray, depTextSet, depTexts, scope } =
          validation;

        const groups = buildDestructuringGroups(
          callback,
          depTextSet,
          visitorKeys,
          sourceCode,
        );

        if (!groups.size) return;

        const allNames = new Set<string>();
        const orderedDependencies: string[] = [];
        for (const group of groups.values()) {
          for (const name of group.orderedNames) {
            if (!allNames.has(name)) {
              allNames.add(name);
              orderedDependencies.push(name);
            }
          }
        }

        const dependencyList =
          orderedDependencies.length > 0
            ? orderedDependencies.join(', ')
            : 'the fields you use';

        const firstGroup = Array.from(groups.values())[0];
        context.report({
          node: firstGroup.declarations[0],
          messageId: 'hoistDestructuring',
          data: {
            objectName: firstGroup.objectText,
            hookName,
            dependencies: dependencyList,
          },
          fix(fixer) {
            const insertionStatement = findInsertionStatement(node);
            if (!insertionStatement) {
              return null;
            }

            const validationResult = validateGroupsForHoisting(
              groups,
              callback,
              scope,
              visitorKeys,
              reservedNamesByScope,
            );

            if (!validationResult) {
              return null;
            }

            return generateHoistingFixes(
              groups,
              callback,
              depsArray,
              depTexts,
              insertionStatement,
              sourceCode,
              fixer,
              visitorKeys,
              validationResult,
              orderedDependencies,
              reservedNamesByScope,
              scope,
            );
          },
        });
      },
    };
  },
});
