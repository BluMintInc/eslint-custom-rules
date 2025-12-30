import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'hoistDestructuring';

type DestructuringProperty = {
  key: string;
  text: string;
  order: number;
  bindingNames: Set<string>;
};

type DestructuringGroup = {
  objectText: string;
  properties: Map<string, DestructuringProperty>;
  names: Set<string>;
  orderedNames: string[];
  declarations: TSESTree.VariableDeclaration[];
  inits: TSESTree.Expression[];
  baseName: string | null;
};

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

function collectProperties(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
  acc: Map<string, DestructuringProperty>,
): void {
  for (const property of pattern.properties) {
    const text = getSafePropertyText(property, sourceCode);
    const keyText =
      property.type === AST_NODE_TYPES.Property
        ? property.key.type === AST_NODE_TYPES.Literal
          ? String(property.key.value)
          : property.key.type === AST_NODE_TYPES.Identifier
          ? property.key.name
          : sourceCode.getText(property.key)
        : `...${sourceCode.getText(property.argument)}`;

    if (acc.has(keyText)) continue;

    acc.set(keyText, {
      key: keyText,
      text,
      order: property.range ? property.range[0] : acc.size,
      bindingNames: bindingNamesOfDestructuringProperty(property),
    });
  }
}

function renderArrayPatternWithDefaults(
  pattern: TSESTree.ArrayPattern,
  sourceCode: TSESLint.SourceCode,
): string {
  const elements = pattern.elements.map((element) => {
    if (!element) return '';
    if (element.type === AST_NODE_TYPES.Identifier) {
      return sourceCode.getText(element);
    }
    if (element.type === AST_NODE_TYPES.AssignmentPattern) {
      const left = element.left;
      const leftText =
        left.type === AST_NODE_TYPES.ObjectPattern
          ? renderObjectPatternWithDefaults(left, sourceCode)
          : left.type === AST_NODE_TYPES.ArrayPattern
          ? renderArrayPatternWithDefaults(left, sourceCode)
          : sourceCode.getText(left);
      return `${leftText} = ${sourceCode.getText(element.right)}`;
    }
    if (element.type === AST_NODE_TYPES.ObjectPattern) {
      const nested = renderObjectPatternWithDefaults(element, sourceCode);
      return `${nested} = {}`;
    }
    if (element.type === AST_NODE_TYPES.ArrayPattern) {
      const nested = renderArrayPatternWithDefaults(element, sourceCode);
      return `${nested} = []`;
    }
    if (element.type === AST_NODE_TYPES.RestElement) {
      const argument = element.argument;
      if (argument.type === AST_NODE_TYPES.ObjectPattern) {
        return `...${renderObjectPatternWithDefaults(argument, sourceCode)}`;
      }
      if (argument.type === AST_NODE_TYPES.ArrayPattern) {
        return `...${renderArrayPatternWithDefaults(argument, sourceCode)}`;
      }
      return `...${sourceCode.getText(argument)}`;
    }
    return sourceCode.getText(element);
  });

  return `[${elements.join(', ')}]`;
}

function formatPropertyText(
  property: TSESTree.Property | TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
): string {
  if (property.type === AST_NODE_TYPES.RestElement) {
    return renderRestElementProperty(property, sourceCode);
  }

  if (property.shorthand) {
    return sourceCode.getText(property);
  }

  const keyText = renderPropertyKey(property, sourceCode);
  const value = property.value;

  if (value.type === AST_NODE_TYPES.AssignmentPattern) {
    return renderPropertyWithAssignment(property, value, keyText, sourceCode);
  }

  if (value.type === AST_NODE_TYPES.ObjectPattern) {
    const nested = renderObjectPatternWithDefaults(value, sourceCode);
    return `${keyText}: ${nested} = {}`;
  }

  if (value.type === AST_NODE_TYPES.ArrayPattern) {
    const nested = renderArrayPatternWithDefaults(value, sourceCode);
    return `${keyText}: ${nested} = []`;
  }

  return `${keyText}: ${sourceCode.getText(value)}`;
}

function renderObjectProperty(
  property: TSESTree.Property,
  sourceCode: TSESLint.SourceCode,
): string {
  return formatPropertyText(property, sourceCode);
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

  const leftText = renderPatternLeft(left, sourceCode);
  return `${keyText}: ${leftText} = ${sourceCode.getText(value.right)}`;
}

function renderPatternLeft(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): string {
  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    return renderObjectPatternWithDefaults(node, sourceCode);
  }

  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    return renderArrayPatternWithDefaults(node, sourceCode);
  }

  return sourceCode.getText(node);
}

function renderRestElementProperty(
  property: TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
): string {
  const argument = property.argument;
  if (argument.type === AST_NODE_TYPES.ObjectPattern) {
    return `...${renderObjectPatternWithDefaults(argument, sourceCode)}`;
  }
  if (argument.type === AST_NODE_TYPES.ArrayPattern) {
    return `...${renderArrayPatternWithDefaults(argument, sourceCode)}`;
  }
  return `...${sourceCode.getText(argument)}`;
}

function renderObjectPatternWithDefaults(
  pattern: TSESTree.ObjectPattern,
  sourceCode: TSESLint.SourceCode,
): string {
  const properties = pattern.properties.map((property) => {
    if (property.type === AST_NODE_TYPES.Property) {
      return renderObjectProperty(property, sourceCode);
    }

    if (property.type === AST_NODE_TYPES.RestElement) {
      return renderRestElementProperty(property, sourceCode);
    }

    return sourceCode.getText(property);
  });

  return `{ ${properties.join(', ')} }`;
}

function getSafePropertyText(
  property: TSESTree.Property | TSESTree.RestElement,
  sourceCode: TSESLint.SourceCode,
): string {
  return formatPropertyText(property, sourceCode);
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
      current.name === baseName
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
      current.name === objectName
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
        const hookName = isHookCall(node);
        if (!hookName) return;

        const callback = node.arguments[0];
        if (
          !callback ||
          !isFunctionNode(callback) ||
          callback.body.type !== AST_NODE_TYPES.BlockStatement
        ) {
          return;
        }

        const scope = context.getScope();

        if (callback.async) return;

        const depsArray =
          node.arguments.length > 1 &&
          node.arguments[1] &&
          node.arguments[1].type === AST_NODE_TYPES.ArrayExpression
            ? (node.arguments[1] as TSESTree.ArrayExpression)
            : null;

        if (!depsArray) return;

        const depTexts = dependencyElements(depsArray, sourceCode);
        const depTextSet = new Set(depTexts);

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
                  isTypeNarrowingContext(current, baseName, visitorKeys)
                ) {
                  continue;
                }

                const existingGroup = groups.get(depKey);
                const properties = existingGroup?.properties ?? new Map();
                collectProperties(declarator.id, sourceCode, properties);

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
            if (hasCrossGroupNameCollision(groups)) {
              return null;
            }

            const insertionStatement = findInsertionStatement(node);
            if (!insertionStatement) {
              return null;
            }

            const indent = getIndentation(insertionStatement, sourceCode);

            const hoistedLines: string[] = [];
            const declarationsToRemove = new Set<TSESTree.Node>();
            const initsToIgnore = new Set<TSESTree.Node>();
            const baseUsageByObject = new Map<string, boolean>();

            for (const group of groups.values()) {
              group.declarations.forEach((decl) =>
                declarationsToRemove.add(decl),
              );
              group.inits.forEach((init) => initsToIgnore.add(init));
            }

            const existingBindings = collectExistingBindings(
              callback,
              declarationsToRemove,
            );
            const scopeDeclaredNames = collectBindingsInScope(scope);
            const reservedNames =
              reservedNamesByScope.get(scope) ?? new Set<string>();
            const scopeNameCollisions = new Set<string>([
              ...scopeDeclaredNames,
              ...reservedNames,
            ]);

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
              const pattern = `{ ${sortedProps
                .map((p) => p.text)
                .join(', ')} }`;
              hoistedLines.push(
                `${indent}const ${pattern} = (${group.objectText}) ?? {};`,
              );
              group.declarations.forEach((decl) =>
                declarationsToRemove.add(decl),
              );
            }

            reservedNamesByScope.set(scope, updatedReservedNames);

            const newDepSet = new Set(newDepTexts);
            for (const name of orderedDependencies) {
              if (!newDepSet.has(name)) {
                newDepTexts.push(name);
                newDepSet.add(name);
              }
            }

            const insertAt =
              sourceCode
                .getText()
                .lastIndexOf('\n', insertionStatement.range![0]) + 1;
            const fixes = [
              fixer.insertTextBeforeRange(
                [insertAt, insertAt],
                `${hoistedLines.join('\n')}\n`,
              ),
              fixer.replaceText(depsArray, `[${newDepTexts.join(', ')}]`),
            ];

            for (const decl of declarationsToRemove) {
              fixes.push(fixer.removeRange(removalRange(decl, sourceCode)));
            }

            return fixes;
          },
        });
      },
    };
  },
});
