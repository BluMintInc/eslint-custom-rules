import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds =
  | 'componentLiteral'
  | 'nestedHookLiteral'
  | 'hookReturnLiteral'
  | 'memoizeLiteralSuggestion';

type LiteralDescriptor = {
  literalType: 'object literal' | 'array literal' | 'inline function';
  memoHook: 'useMemo' | 'useCallback';
};

const LITERAL_DESCRIPTOR_BY_TYPE: Partial<
  Record<AST_NODE_TYPES, LiteralDescriptor>
> = {
  [AST_NODE_TYPES.ObjectExpression]: {
    literalType: 'object literal',
    memoHook: 'useMemo',
  },
  [AST_NODE_TYPES.ArrayExpression]: {
    literalType: 'array literal',
    memoHook: 'useMemo',
  },
  [AST_NODE_TYPES.ArrowFunctionExpression]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
  [AST_NODE_TYPES.FunctionExpression]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
  [AST_NODE_TYPES.FunctionDeclaration]: {
    literalType: 'inline function',
    memoHook: 'useCallback',
  },
};

const SAFE_HOOK_ARGUMENTS = new Set([
  'useMemo',
  'useCallback',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useImperativeHandle',
  'useState',
  'useReducer',
  'useRef',
  'useSyncExternalStore',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useLatestCallback',
  'useDeepCompareMemo',
  'useDeepCompareCallback',
  'useDeepCompareEffect',
  'useProgressionCallback',
]);

/**
 * Hooks where any literal defined inside their arguments is safe because
 * the hook either doesn't use the identity for comparison or provides its
 * own stability.
 */
const HOOKS_ALLOWING_NESTED_LITERALS = new Set([
  'useState',
  'useReducer',
  'useRef',
]);

/**
 * JSX attribute names whose values are style descriptors consumed by the
 * library (not via referential equality), so inline object literals are safe.
 * MUI's `sx` and the standard `style` prop both fall into this category.
 */
const STYLE_JSX_ATTRIBUTE_NAMES = new Set(['sx', 'style']);

/**
 * Array iteration higher-order methods that invoke their callback argument
 * synchronously and then discard it. A function literal passed directly as such
 * a callback is never observed by any hook dependency, prop, effect, or memoized
 * child, so re-creating it each render costs nothing and memoizing it buys
 * nothing — the same "identity is never observably compared" rationale that
 * exempts throw-argument literals. Matched by (non-computed) method name only;
 * the rule is not type-aware, mirroring how the hook-argument sets work.
 */
const ITERATION_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'sort',
]);

/**
 * Comparison operators whose result is a boolean primitive. A value produced by
 * one of these can never carry a referential identity, so a call whose result
 * feeds such a comparison never lets its argument's identity escape.
 */
const COMPARISON_OPERATORS = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
]);

const MEMOIZATION_DEPS_TODO_PLACEHOLDER = '__TODO_MEMOIZATION_DEPENDENCIES__';
const TODO_DEPS_COMMENT = `/* ${MEMOIZATION_DEPS_TODO_PLACEHOLDER} */`;
const PARENTHESIZED_EXPRESSION_TYPE =
  (AST_NODE_TYPES as Record<string, string>).ParenthesizedExpression ??
  'ParenthesizedExpression';

/**
 * Detects React hook-style identifiers prefixed with "use".
 * @param name Candidate identifier name.
 * @returns True when the name follows the hook naming convention.
 */
function isHookName(name: string | null | undefined): name is string {
  return !!name && /^use[A-Z]/.test(name);
}

/**
 * Detects PascalCase identifiers commonly used for React components.
 *
 * SCREAMING_SNAKE_CASE names (`CHANNEL_OPTIONS`, `MAX_COUNT`, `SPACING`) are
 * constants by convention, not components, so they are excluded even though
 * they begin with an uppercase letter. Treating them as components would
 * misclassify a module-scope constant's `.map`/`.filter` callback body as a
 * render body and flag literals that are only ever built once at import.
 * @param name Candidate identifier name.
 * @returns True when the name is PascalCase (starts uppercase and contains a
 * lowercase letter), false for all-caps constants.
 */
function isComponentName(name: string | null | undefined): name is string {
  return !!name && /^[A-Z]/.test(name) && !/^[A-Z][A-Z0-9_]*$/.test(name);
}

/**
 * True when `node` is a function literal passed directly as an argument to an
 * Array iteration method call (`items.map((x) => ...)`,
 * `list.filter(fn)`, `xs.reduce(fn, init)`, ...). Such a callback is invoked
 * synchronously during render and then discarded, so its referential identity
 * is never observed. Matched by (non-computed) method name only, since the rule
 * is not type-aware.
 */
function isIterationMethodCallback(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }

  const parent = node.parent;
  if (
    !parent ||
    parent.type !== AST_NODE_TYPES.CallExpression ||
    !parent.arguments.includes(node)
  ) {
    return false;
  }

  const callee = parent.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    ITERATION_METHODS.has(callee.property.name)
  );
}

/**
 * True when the NEAREST enclosing function of `node` is itself an Array
 * iteration-method callback (`arr.map((x) => ({ … }))`, `.filter`, `.reduce`,
 * `.forEach`, `.sort`, ...). This extends the `isIterationMethodCallback`
 * exemption (issue #1290) from the callback function itself down to the
 * object/array literals created directly inside its body (issue #1319): such a
 * literal is a per-iteration value discarded along with the mapped result, so
 * its identity is never observed. The rule's own remediation is unfollowable at
 * the literal — `useMemo` cannot run per-iteration inside a `.map` loop, and a
 * literal closing over the callback parameter cannot be hoisted to module
 * scope. The memoizable unit is the whole `.map()` call:
 * `const tabs = useMemo(() => arr.map((x) => ({ … })), [arr])`.
 *
 * The walk starts at `node` and stops at the FIRST function encountered
 * (including `node` itself when `node` is a function). Keying on the nearest
 * function — not any ancestor — is what preserves the #1290 scope guard: a
 * nested, non-iteration callback inside the map body (e.g. an `onClick` handler
 * that persists as a JSX prop) is the nearest function for any literal in its
 * body, so those literals stay flagged, and the handler itself (its own nearest
 * function is itself) stays flagged too.
 */
function isInsideIterationMethodCallback(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (isFunctionNode(current)) {
      return isIterationMethodCallback(current);
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

/**
 * Type guard for parenthesized expressions to unwrap safely.
 * @param node Node to evaluate.
 * @returns True when the node is a parenthesized expression wrapper.
 */
function isParenthesizedExpression(
  node: TSESTree.Node,
): node is TSESTree.Node & { expression: TSESTree.Node } {
  return node.type === PARENTHESIZED_EXPRESSION_TYPE;
}

/**
 * Extracts an identifier name from variable, assignment, or property nodes.
 * @param node AST node that may carry an identifier.
 * @returns Identifier name when present, otherwise null.
 */
function getNameFromNode(node: TSESTree.Node | null): string | null {
  if (!node) return null;

  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.Identifier
  ) {
    return node.left.name;
  }

  if (
    node.type === AST_NODE_TYPES.Property &&
    node.key.type === AST_NODE_TYPES.Identifier
  ) {
    return node.key.name;
  }

  return null;
}

/**
 * Determines whether a node should be traversed through when resolving names.
 * @param node Node to evaluate for transparency.
 * @returns True when the node does not introduce a binding boundary.
 */
function isTransparentNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.MemberExpression ||
    isExpressionWrapper(node)
  );
}

/**
 * Walks ancestors through transparent nodes to find the nearest identifier name.
 * @param startNode Node where the search begins.
 * @returns Resolved identifier name or null if none is located.
 */
function findNameInAncestors(startNode: TSESTree.Node | null): string | null {
  let current: TSESTree.Node | null = startNode;

  while (current) {
    const name = getNameFromNode(current);
    if (name) {
      return name;
    }

    if (!isTransparentNode(current)) {
      break;
    }

    current = current.parent as TSESTree.Node | null;
  }

  return null;
}

/**
 * Resolves a function's display name from its declaration or surrounding
 * assignment/property wrappers so HOC-wrapped and asserted components still map
 * to their intended identifiers.
 */
function getFunctionName(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string | null {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id?.name ?? null;
  }

  if (fn.type === AST_NODE_TYPES.FunctionExpression && fn.id?.name) {
    return fn.id.name;
  }

  const parent = fn.parent;
  if (!parent) {
    return null;
  }

  const immediateName = getNameFromNode(parent);
  if (immediateName) {
    return immediateName;
  }

  return findNameInAncestors(parent);
}

/**
 * Locates the ancestor that supplies a function's name, mirroring the walk
 * `getFunctionName` performs through `findNameInAncestors` but yielding the
 * NODE instead of the string, so callers can tell an object-property key apart
 * from a variable or assignment binding.
 */
function findNamingNode(fn: TSESTree.Node): TSESTree.Node | null {
  let current: TSESTree.Node | null = fn.parent as TSESTree.Node | null;
  while (current) {
    if (getNameFromNode(current)) {
      return current;
    }
    if (!isTransparentNode(current)) {
      return null;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

/**
 * True when a function expression is passed directly as an argument to a call
 * (after unwrapping assertion/parenthesis wrappers). Function declarations are
 * excluded because a declaration is a statement, never an argument.
 */
function isCallbackArgument(fn: TSESTree.Node): boolean {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return false;
  }

  let parent: TSESTree.Node | null = fn.parent as TSESTree.Node | null;
  while (parent && isExpressionWrapper(parent)) {
    parent = parent.parent as TSESTree.Node | null;
  }

  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some(
      (arg) => unwrapNestedExpressions(arg as TSESTree.Node) === fn,
    )
  );
}

/**
 * True when a function's only claim to component/hook status is an object
 * property key, and that object is assembled inside an anonymous callback which
 * is itself neither a component nor a hook — the shape of a module factory
 * (`jest.mock('m', () => ({ useThing: … }))`,
 * `registerModule('m', () => ({ useThing: … }))`). Such a factory builds a
 * value; React never renders it, so a `use*`/PascalCase key inside it names a
 * member of that value rather than a render body. This is the same reasoning
 * that makes `isComponentName` reject SCREAMING_SNAKE_CASE and that makes
 * `isIterationMethodCallback` exempt discarded callbacks: a name match in a
 * non-render context is not a render body.
 *
 * Requiring the enclosing function to be an anonymous CALL ARGUMENT is the
 * deliberate narrowing that preserves genuine hook factories
 * (`export function createApi(client) { return { useUser: … }; }`), whose
 * returned hook really is consumed by React and really does need referential
 * stability.
 */
function isFactoryObjectMember(fn: TSESTree.Node): boolean {
  const namingNode = findNamingNode(fn);
  if (!namingNode || namingNode.type !== AST_NODE_TYPES.Property) {
    return false;
  }

  const objectLiteral = namingNode.parent as TSESTree.Node | null;
  if (
    !objectLiteral ||
    objectLiteral.type !== AST_NODE_TYPES.ObjectExpression
  ) {
    return false;
  }

  let current: TSESTree.Node | null =
    objectLiteral.parent as TSESTree.Node | null;
  while (current) {
    if (isFunctionNode(current)) {
      return isCallbackArgument(current) && !isComponentOrHookFunction(current);
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

/**
 * Checks whether a function should be treated as a React component or hook
 * based on naming conventions. Enables the rule to limit reports to user-facing
 * components and hooks rather than arbitrary functions.
 *
 * The name match is disqualified for members of a factory-built object (see
 * `isFactoryObjectMember`). Disqualifying at the classifier — rather than
 * skipping the report — keeps `findEnclosingComponentOrHook` walking outward,
 * so a literal inside a factory nested in a real component is still attributed
 * to that component.
 */
function isComponentOrHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  const name = getFunctionName(fn);
  if (!isComponentName(name) && !isHookName(name)) {
    return false;
  }
  return !isFactoryObjectMember(fn);
}

/**
 * Checks whether a function node represents a hook by name.
 * @param fn Function node to inspect.
 * @returns True when the function follows hook naming.
 */
function isHookFunction(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  return isHookName(getFunctionName(fn));
}

/**
 * Narrows nodes to the supported function-like shapes.
 * @param node Node to test.
 * @returns True when the node is any function declaration or expression.
 */
function isFunctionNode(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

/**
 * Extracts a hook name from simple identifier or member-expression callees.
 * @param callee Callee expression from a call.
 * @returns Hook name when available, otherwise null.
 */
function getHookNameFromCallee(
  callee: TSESTree.LeftHandSideExpression,
): string | null {
  const resolvedCallee = unwrapNestedExpressions(
    callee as unknown as TSESTree.Node,
  ) as TSESTree.Node;

  if (resolvedCallee.type === AST_NODE_TYPES.Identifier) {
    return resolvedCallee.name;
  }

  if (
    resolvedCallee.type === AST_NODE_TYPES.MemberExpression &&
    !resolvedCallee.computed &&
    (resolvedCallee.property as TSESTree.Node).type ===
      AST_NODE_TYPES.Identifier
  ) {
    const property = resolvedCallee.property as TSESTree.Identifier;
    return property.name;
  }

  return null;
}

/**
 * Detects hook call expressions and returns their hook name.
 * @param node Call expression to inspect.
 * @returns Hook name when the call targets a hook, otherwise null.
 */
function isHookCall(node: TSESTree.CallExpression): string | null {
  const hookName = getHookNameFromCallee(node.callee);
  return hookName && isHookName(hookName) ? hookName : null;
}

/**
 * Maps literal node types to memoization metadata used for reporting.
 * @param node Candidate literal node.
 * @returns Descriptor with literal type and memo hook, or null.
 */
function getLiteralDescriptor(node: TSESTree.Node): LiteralDescriptor | null {
  const descriptor =
    LITERAL_DESCRIPTOR_BY_TYPE[node.type as AST_NODE_TYPES] ?? null;
  return descriptor;
}

/**
 * Jest APIs whose second argument is a module factory: a function executed to
 * BUILD a replacement module, hoisted above imports by `babel-plugin-jest-hoist`.
 */
const JEST_MOCK_FACTORY_METHODS = new Set(['mock', 'doMock', 'setMock']);

/**
 * True when `node` sits anywhere inside a jest module factory
 * (`jest.mock('m', () => ({ … }))`). A factory is executed to build a
 * replacement module, never rendered by React, so the rule's "on each render"
 * premise does not hold for the test doubles it defines.
 *
 * Beyond the premise, neither remediation the rule advises is legal here:
 * `babel-plugin-jest-hoist` rejects every out-of-scope reference inside a
 * factory except `mock`-prefixed names, so `useMemo` cannot be imported or
 * called, and hoisting to a module constant changes behaviour because the
 * double must rebuild per call for tests to vary its result. This mirrors
 * `isInsideIterationMethodCallback`, which exempts literals whose remediation
 * is unfollowable at the literal.
 *
 * The walk is lexical, so a hook declared outside the factory in the same file
 * stays analyzed.
 */
function isInsideJestMockFactory(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (
      isFunctionNode(current) &&
      current.type !== AST_NODE_TYPES.FunctionDeclaration
    ) {
      let parent: TSESTree.Node | null = current.parent as TSESTree.Node | null;
      while (parent && isExpressionWrapper(parent)) {
        parent = parent.parent as TSESTree.Node | null;
      }
      if (
        parent?.type === AST_NODE_TYPES.CallExpression &&
        parent.arguments.some(
          (arg) => unwrapNestedExpressions(arg as TSESTree.Node) === current,
        )
      ) {
        const { callee } = parent;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === 'jest' &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          JEST_MOCK_FACTORY_METHODS.has(callee.property.name)
        ) {
          return true;
        }
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

/**
 * Finds the nearest ancestor function considered a React component or hook.
 * @param node Starting node for the search.
 * @returns Owning component/hook function or null.
 */
function findEnclosingComponentOrHook(node: TSESTree.Node) {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (isFunctionNode(current) && isComponentOrHookFunction(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

/**
 * Checks whether a node is inside an allowed hook callback that should be skipped.
 * @param node Starting node for traversal.
 * @returns True when enclosed by a callback to an allowed hook.
 */
function isInsideAllowedHookCallback(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (isFunctionNode(current)) {
      if (current.async && current !== node) {
        return true;
      }

      if (
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        let parent: TSESTree.Node | null =
          current.parent as TSESTree.Node | null;

        // Skip through TypeScript type assertions and parentheses to find
        // the actual CallExpression that invokes the hook.
        while (parent && isExpressionWrapper(parent)) {
          parent = parent.parent as TSESTree.Node | null;
        }

        if (parent?.type === AST_NODE_TYPES.CallExpression) {
          const hookName = getHookNameFromCallee(parent.callee);
          const matchesCallback = parent.arguments.some(
            (arg) => unwrapNestedExpressions(arg as TSESTree.Node) === current,
          );

          if (
            hookName &&
            SAFE_HOOK_ARGUMENTS.has(hookName) &&
            matchesCallback
          ) {
            return true;
          }
        }
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return false;
}

/**
 * Type guard for nodes that wrap an underlying expression (e.g. assertions,
 * parentheses, optional chaining wrappers).
 */
function isExpressionWrapper(
  node: TSESTree.Node,
): node is
  | TSESTree.TSAsExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.ChainExpression
  | (TSESTree.Node & { expression: TSESTree.Node }) {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    isParenthesizedExpression(node)
  );
}

/**
 * Unwraps TypeScript assertions, optional chaining, and parentheses to reach
 * the underlying expression node for stable identity comparisons.
 */
function unwrapNestedExpressions(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  while (isExpressionWrapper(current)) {
    current = current.expression;
  }
  return current;
}

/**
 * Finds the nearest enclosing hook call for a literal and whether the literal
 * is passed directly as an argument (versus nested inside another expression).
 */
function findEnclosingHookCall(
  node: TSESTree.Node,
): { hookName: string; isDirectArgument: boolean } | null {
  const unwrappedTarget = unwrapNestedExpressions(node);
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      const hookName = isHookCall(current);
      if (hookName) {
        const isDirectArgument = current.arguments.some((arg) => {
          const unwrappedArg = unwrapNestedExpressions(arg as TSESTree.Node);
          return unwrappedArg === unwrappedTarget;
        });
        return { hookName, isDirectArgument };
      }
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

/**
 * Finds the nearest owning function for the provided node.
 * @param node Node to start from.
 * @returns Enclosing function declaration/expression or null.
 */
function findOwningFunction(
  node: TSESTree.Node,
):
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

/**
 * Locates the closest return statement ancestor, skipping assertion wrappers.
 * @param node Node to start from.
 * @returns Enclosing return statement or null.
 */
function findEnclosingReturnStatement(
  node: TSESTree.Node,
): TSESTree.ReturnStatement | null {
  let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
  while (current) {
    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      return current;
    }

    if (isExpressionWrapper(current)) {
      current = current.parent as TSESTree.Node | null;
      continue;
    }

    break;
  }
  return null;
}

/**
 * Determines whether a node is returned from the provided hook function.
 * @param node Expression candidate for return.
 * @param owner Hook function candidate.
 * @returns True when the expression is the hook's return value.
 */
function isReturnValueFromHook(
  node: TSESTree.Node,
  owner:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  if (!isHookFunction(owner)) return false;

  if (
    owner.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    owner.body.type !== AST_NODE_TYPES.BlockStatement &&
    unwrapNestedExpressions(owner.body) === unwrapNestedExpressions(node)
  ) {
    return true;
  }

  if (
    node.parent?.type !== AST_NODE_TYPES.ReturnStatement ||
    node.parent.argument !== node
  ) {
    const returnStatement = findEnclosingReturnStatement(node);
    if (!returnStatement?.argument) {
      return false;
    }

    if (
      unwrapNestedExpressions(returnStatement.argument) !==
      unwrapNestedExpressions(node)
    ) {
      return false;
    }

    const owningFunction = findOwningFunction(returnStatement);
    return owningFunction === owner;
  }

  const owningFunction = findOwningFunction(node.parent);
  return owningFunction === owner;
}

/**
 * Builds memoization suggestions with dependency placeholders for developers.
 * @param node Literal node to wrap.
 * @param descriptor Literal metadata including memo hook.
 * @param sourceCode Source code utility for text extraction.
 * @returns Suggestion array encouraging memoization with explicit deps TODO.
 */
function buildMemoSuggestions(
  node: TSESTree.Node,
  descriptor: LiteralDescriptor,
  sourceCode: TSESLint.SourceCode,
): TSESLint.ReportSuggestionArray<MessageIds> {
  const initializerText = sourceCode.getText(node);
  const wrappedInitializer =
    descriptor.literalType === 'object literal'
      ? `(${initializerText})`
      : initializerText;

  if (descriptor.literalType === 'inline function') {
    return [
      {
        messageId: 'memoizeLiteralSuggestion',
        data: {
          literalType: descriptor.literalType,
          memoHook: descriptor.memoHook,
        },
        fix(fixer) {
          return fixer.replaceText(
            node,
            `${descriptor.memoHook}(${initializerText}, [${TODO_DEPS_COMMENT}])`,
          );
        },
      },
    ];
  }

  return [
    {
      messageId: 'memoizeLiteralSuggestion',
      data: {
        literalType: descriptor.literalType,
        memoHook: descriptor.memoHook,
      },
      fix(fixer) {
        return fixer.replaceText(
          node,
          `${descriptor.memoHook}(() => ${wrappedInitializer}, [${TODO_DEPS_COMMENT}])`,
        );
      },
    },
  ];
}

/**
 * Returns true when the node's value resolves to a JSX attribute that carries
 * style data consumed by a library rather than compared by reference (MUI `sx`
 * or the standard `style` prop).
 *
 * Walks up from the literal only through positions where it remains part of the
 * attribute's style value: conditional branches (`sx={c ? {…} : {…}}`), logical
 * fallbacks (`sx={c && {…}}`), array entries (MUI accepts `sx` arrays), nested
 * object property values (`sx={{ display: { xs: 'none', md: 'inline' } }}` —
 * MUI's responsive breakpoint syntax), and expression wrappers (`{…} as const`,
 * parentheses). MUI reprocesses the entire `sx`/`style` object subtree on every
 * render, so nested values benefit no more from referential stability than the
 * top-level object does. Any other parent — a function call, a spread — means
 * the reference is observed or transformed before reaching the attribute, so the
 * walk stops and the literal stays reported. This keeps the exemption tied to
 * genuine style values without silencing unrelated literals that merely appear
 * deeper in the tree.
 */
function isStyleJSXAttributeValue(node: TSESTree.Node): boolean {
  let current: TSESTree.Node = node;
  let parent = current.parent;
  while (parent) {
    switch (parent.type) {
      case AST_NODE_TYPES.JSXExpressionContainer: {
        if (parent.expression !== current) {
          return false;
        }
        const attribute = parent.parent;
        if (!attribute || attribute.type !== AST_NODE_TYPES.JSXAttribute) {
          return false;
        }
        const { name } = attribute;
        return (
          name.type === AST_NODE_TYPES.JSXIdentifier &&
          STYLE_JSX_ATTRIBUTE_NAMES.has(name.name)
        );
      }
      case AST_NODE_TYPES.ConditionalExpression: {
        if (parent.consequent !== current && parent.alternate !== current) {
          return false;
        }
        break;
      }
      case AST_NODE_TYPES.LogicalExpression: {
        if (parent.left !== current && parent.right !== current) {
          return false;
        }
        break;
      }
      case AST_NODE_TYPES.ArrayExpression: {
        if (!parent.elements.some((element) => element === current)) {
          return false;
        }
        break;
      }
      case AST_NODE_TYPES.Property: {
        if (parent.value !== current) {
          return false;
        }
        break;
      }
      case AST_NODE_TYPES.ObjectExpression: {
        if (!parent.properties.some((property) => property === current)) {
          return false;
        }
        break;
      }
      default: {
        if (!isExpressionWrapper(parent) || parent.expression !== current) {
          return false;
        }
      }
    }
    current = parent;
    parent = current.parent;
  }
  return false;
}

/**
 * Returns true when the node is a JSX element or fragment. JSX nodes are
 * always fresh references each render — wrapping a containing literal in
 * useMemo provides no referential-stability benefit because the JSX member
 * changes on every call regardless of the wrapper.
 */
function isJSXNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
}

/**
 * Collects the names of variables declared in the owning function's top-level
 * block body whose initializers resolve to JSX elements or fragments. Used to
 * detect shorthand object properties like `{ Portal }` where
 * `const Portal = <div />` precedes the return statement.
 *
 * Only top-level declarations are scanned; inner function scopes have their
 * own render lifecycles and are not candidates for this exemption.
 */
function collectLocalJSXBindings(
  owner:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): Set<string> {
  const bindings = new Set<string>();
  const body = owner.body;
  if (body.type !== AST_NODE_TYPES.BlockStatement) return bindings;

  for (const stmt of body.body) {
    if (stmt.type !== AST_NODE_TYPES.VariableDeclaration) continue;
    for (const declarator of stmt.declarations) {
      if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
      if (!declarator.init) continue;
      const unwrapped = unwrapNestedExpressions(declarator.init);
      if (isJSXNode(unwrapped)) {
        bindings.add(declarator.id.name);
      }
    }
  }

  return bindings;
}

/**
 * Returns true when an ObjectExpression returned from a hook contains at
 * least one property whose value is a JSX element or fragment — either
 * directly inline (`{ Portal: <div /> }`) or via a shorthand identifier
 * (`{ Portal }`) that resolves to a JSX initializer in the same function
 * scope. Such objects cannot be stabilised by wrapping them in useMemo
 * because the JSX member is a fresh reference on every render regardless of
 * the wrapper. This is the same "no stability benefit" rationale applied to
 * sx/style JSX attribute values.
 */
function objectLiteralContainsJSXValue(
  node: TSESTree.ObjectExpression,
  owner:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): boolean {
  // Resolve shorthand bindings lazily — only when at least one shorthand
  // property is present, to avoid the body scan for the common inline case.
  let localJSXBindings: Set<string> | null = null;

  for (const prop of node.properties) {
    if (prop.type === AST_NODE_TYPES.SpreadElement) continue;

    const value = unwrapNestedExpressions(prop.value as TSESTree.Node);

    // Direct inline JSX: { Portal: <div /> } or { el: <></> }
    if (isJSXNode(value)) {
      return true;
    }

    // Shorthand identifier: { Portal } — resolve to a local JSX binding.
    if (prop.shorthand && value.type === AST_NODE_TYPES.Identifier) {
      if (!localJSXBindings) {
        localJSXBindings = collectLocalJSXBindings(owner);
      }
      if (localJSXBindings.has(value.name)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true when an ArrayExpression returned from a hook contains at least
 * one element that is a JSX element or fragment (after unwrapping expression
 * wrappers). The same "no stability benefit" rationale applies: a JSX element
 * is a fresh reference each render, so wrapping the array in useMemo would
 * recompute on every call without improving referential stability.
 */
function arrayLiteralContainsJSXValue(node: TSESTree.ArrayExpression): boolean {
  for (const element of node.elements) {
    if (!element) continue;
    const unwrapped = unwrapNestedExpressions(element as TSESTree.Node);
    if (isJSXNode(unwrapped)) {
      return true;
    }
  }
  return false;
}

/**
 * Formats a readable label for diagnostics based on the owning function.
 * @param fn Owning component or hook function.
 * @returns Human-friendly label for error messages.
 */
function formatContextLabel(
  fn:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string {
  const name = getFunctionName(fn);
  if (!name) return 'this component or hook';
  if (isHookName(name)) return `hook "${name}"`;
  return `component "${name}"`;
}

export const reactMemoizeLiterals = createRule<[], MessageIds>({
  name: 'react-memoize-literals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability.',
      recommended: 'error',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      componentLiteral:
        'New {{literalType}} inside {{context}} is created on every render → Breaks referential stability for hooks/props and can re-run effects or re-render children → Hoist it to a module-level constant or wrap it in {{memoHook}} with the right dependencies.',
      nestedHookLiteral:
        'Nested {{literalType}} inside {{hookName}} arguments is recreated on every render → Dependency/reference comparisons change each time and defeat memoization/caching → Extract it into a memoized value (useMemo/useCallback) or hoist it to a module constant before passing it to {{hookName}}.',
      hookReturnLiteral:
        '{{hookName}} returns an {{literalType}} on each render → Callers receive a fresh reference and may re-render or re-run effects → Memoize the returned value with useMemo/useCallback or return pre-memoized pieces so callers see stable references.',
      memoizeLiteralSuggestion:
        'This {{literalType}} is created inline → It produces a new reference each render → Wrap it in {{memoHook}} and include every closed-over value in the dependency array.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Checks whether a VariableDeclarator's sole usage is being thrown
     * in the same function scope.
     */
    function isVariableAlwaysThrown(
      declarator: TSESTree.VariableDeclarator,
    ): boolean {
      const variables = ASTHelpers.getDeclaredVariables(
        context as unknown as TSESLint.RuleContext<string, readonly unknown[]>,
        declarator,
      );
      if (variables.length === 0) {
        return false;
      }

      const variable = variables[0];
      const usages = variable.references.filter((ref) => !ref.init);

      // Variables with no usages (dead code) don't bypass memoization checks
      // because we can't prove the literal is thrown.
      if (usages.length === 0) {
        return false;
      }

      const owningFunction = findOwningFunction(declarator);

      return usages.every((ref) => {
        let refParent: TSESTree.Node | null = ref.identifier
          .parent as TSESTree.Node | null;

        while (refParent) {
          if (isFunctionNode(refParent)) {
            // Stop at function boundaries: throws inside nested functions don't
            // abort the outer render cycle, so they don't make the literal terminal
            // from the perspective of the declaring function.
            return false;
          }

          if (refParent.type === AST_NODE_TYPES.ThrowStatement) {
            // Found a throw in the same lexical scope as the usage.
            // Verify the throw is in the same function where the variable was declared
            // to ensure the throw terminates the render before memoization matters.
            let throwCheckParent: TSESTree.Node | null =
              refParent.parent as TSESTree.Node | null;
            while (throwCheckParent) {
              if (isFunctionNode(throwCheckParent)) {
                return throwCheckParent === owningFunction;
              }
              throwCheckParent =
                throwCheckParent.parent as TSESTree.Node | null;
            }
            return owningFunction === null;
          }

          if (refParent === declarator) {
            break;
          }

          refParent = refParent.parent as TSESTree.Node | null;
        }
        return false;
      });
    }

    /**
     * Checks whether a literal is destined to be thrown, making referential
     * stability irrelevant.
     */
    function isTerminalUsage(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | null = node.parent as TSESTree.Node | null;
      // Tracks whether the literal passed through a node that represents non-container usage.
      // Once true, any throw we encounter won't count as "terminal" because the literal
      // is already used in an expression that might need memoization.
      let hasPassedForbiddenNode = false;

      while (current) {
        if (current.type === AST_NODE_TYPES.ThrowStatement) {
          return !hasPassedForbiddenNode;
        }

        if (
          current.type === AST_NODE_TYPES.VariableDeclarator &&
          current.id.type === AST_NODE_TYPES.Identifier &&
          current.init
        ) {
          if (!hasPassedForbiddenNode && isVariableAlwaysThrown(current)) {
            return true;
          }
        }

        // Stop at function boundaries as throws across functions are not "terminal"
        // in the same render cycle sense for the current component/hook.
        if (isFunctionNode(current)) {
          break;
        }

        // We distinguish between "containers" (nodes that build up an error value
        // or wrap an expression) and "usages" (nodes where the value is consumed
        // in a way that might benefit from memoization).
        //
        // Containers (NewExpression for errors, wrappers, or object/array builders)
        // are allowed because they are part of the path to a 'throw'.
        // Other nodes (like function calls or being a prop) mark the literal as
        // having a non-terminal usage.
        //
        // Note: AST_NODE_TYPES.CallExpression is intentionally excluded from allowed
        // containers. Passing a literal into a CallExpression allows the callee to
        // observe or store the reference, making its identity relevant even if
        // the result is eventually thrown (e.g., const err = fn({ ... }); throw err;).
        if (
          current.type !== AST_NODE_TYPES.ObjectExpression &&
          current.type !== AST_NODE_TYPES.Property &&
          current.type !== AST_NODE_TYPES.ArrayExpression &&
          current.type !== AST_NODE_TYPES.NewExpression &&
          current.type !== AST_NODE_TYPES.ConditionalExpression &&
          current.type !== AST_NODE_TYPES.LogicalExpression &&
          !isExpressionWrapper(current)
        ) {
          hasPassedForbiddenNode = true;
        }

        current = current.parent as TSESTree.Node | null;
      }
      return false;
    }

    /**
     * True when the literal is a variable initializer whose every usage resolves
     * to a style JSX attribute value (sx/style). This extends the inline
     * `isStyleJSXAttributeValue` exemption across a variable: extracting an
     * `sx`/`style` object to a local for readability is common, and the library
     * consumes it by merging/normalizing on each render, not by reference — so
     * memoization adds no stability benefit whether the object is inline or
     * lifted one line above the JSX.
     *
     * The exemption holds only if *every* reference is a style value. If any
     * usage flows through a call, spread, or non-style prop, that consumer can
     * observe the reference, so the literal stays reported — the
     * variable-mediated analogue of the inline `sx={makeSx({ … })}` guard.
     */
    function isStyleVariableInitializer(node: TSESTree.Node): boolean {
      const parent = node.parent;
      if (
        !parent ||
        parent.type !== AST_NODE_TYPES.VariableDeclarator ||
        parent.init !== node
      ) {
        return false;
      }

      const variables = ASTHelpers.getDeclaredVariables(
        context as unknown as TSESLint.RuleContext<string, readonly unknown[]>,
        parent,
      );
      if (variables.length === 0) {
        return false;
      }

      const usages = variables[0].references.filter((ref) => !ref.init);
      // No usages (dead code): can't prove the literal only feeds a style
      // attribute, so leave it reported (mirrors isVariableAlwaysThrown).
      if (usages.length === 0) {
        return false;
      }

      return usages.every((ref) => isStyleJSXAttributeValue(ref.identifier));
    }

    type ReturnEvaluation = 'primitive' | 'nonPrimitive' | 'indeterminate';

    const PRIMITIVE_TYPE_KEYWORDS = new Set<string>([
      AST_NODE_TYPES.TSBooleanKeyword,
      AST_NODE_TYPES.TSStringKeyword,
      AST_NODE_TYPES.TSNumberKeyword,
      AST_NODE_TYPES.TSBigIntKeyword,
      AST_NODE_TYPES.TSSymbolKeyword,
      AST_NODE_TYPES.TSVoidKeyword,
      AST_NODE_TYPES.TSNullKeyword,
      AST_NODE_TYPES.TSUndefinedKeyword,
      AST_NODE_TYPES.TSNeverKeyword,
      AST_NODE_TYPES.TSTypePredicate,
      AST_NODE_TYPES.TSTemplateLiteralType,
    ]);

    const NON_PRIMITIVE_EXPRESSION_TYPES = new Set<string>([
      AST_NODE_TYPES.ObjectExpression,
      AST_NODE_TYPES.ArrayExpression,
      AST_NODE_TYPES.ArrowFunctionExpression,
      AST_NODE_TYPES.FunctionExpression,
      AST_NODE_TYPES.ClassExpression,
      AST_NODE_TYPES.NewExpression,
      AST_NODE_TYPES.JSXElement,
      AST_NODE_TYPES.JSXFragment,
    ]);

    const COMPARISONISH_BINARY_OPERATORS = new Set<string>([
      '===',
      '!==',
      '==',
      '!=',
      '<',
      '>',
      '<=',
      '>=',
      'in',
      'instanceof',
    ]);

    /**
     * Innermost scope containing `node`. Resolved from the source code rather
     * than `context.getScope()` because the latter is deprecated in ESLint 9
     * and reports the traversal position instead of the node's own scope.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope | null {
      const sourceCode = context.getSourceCode() as unknown as {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return sourceCode.getScope ? sourceCode.getScope(node) : null;
    }

    function findVariableInScopes(
      name: string,
      startScope: TSESLint.Scope.Scope | null,
    ): TSESLint.Scope.Variable | undefined {
      let currentScope = startScope;
      while (currentScope) {
        const variable = currentScope.variables.find((v) => v.name === name);
        if (variable) return variable;
        currentScope = currentScope.upper;
      }
      return undefined;
    }

    function isConstAssertion(typeNode: TSESTree.Node): boolean {
      return (
        typeNode.type === AST_NODE_TYPES.TSTypeReference &&
        typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
        typeNode.typeName.name === 'const'
      );
    }

    function classifyTypeAnnotation(typeNode: TSESTree.Node): ReturnEvaluation {
      if (PRIMITIVE_TYPE_KEYWORDS.has(typeNode.type)) {
        return 'primitive';
      }
      if (typeNode.type === AST_NODE_TYPES.TSLiteralType) {
        return 'primitive';
      }
      if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
        const members = typeNode.types.map(classifyTypeAnnotation);
        if (members.every((m) => m === 'primitive')) return 'primitive';
        return members.some((m) => m === 'nonPrimitive')
          ? 'nonPrimitive'
          : 'indeterminate';
      }
      if (
        typeNode.type === AST_NODE_TYPES.TSTypeLiteral ||
        typeNode.type === AST_NODE_TYPES.TSArrayType ||
        typeNode.type === AST_NODE_TYPES.TSTupleType ||
        typeNode.type === AST_NODE_TYPES.TSFunctionType ||
        typeNode.type === AST_NODE_TYPES.TSConstructorType ||
        typeNode.type === AST_NODE_TYPES.TSObjectKeyword ||
        typeNode.type === AST_NODE_TYPES.TSIntersectionType ||
        typeNode.type === AST_NODE_TYPES.TSMappedType ||
        typeNode.type === AST_NODE_TYPES.TSTypeReference
      ) {
        return 'nonPrimitive';
      }
      return 'indeterminate';
    }

    function combineReturnEvaluations(
      entries: ReturnEvaluation[],
    ): ReturnEvaluation {
      if (entries.length === 0) return 'indeterminate';
      if (entries.every((e) => e === 'primitive')) return 'primitive';
      return entries.some((e) => e === 'nonPrimitive')
        ? 'nonPrimitive'
        : 'indeterminate';
    }

    function classifyReturnExpression(
      expression: TSESTree.Expression | null | undefined,
    ): ReturnEvaluation {
      if (!expression) return 'primitive';

      if (
        expression.type === AST_NODE_TYPES.TSAsExpression ||
        expression.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        expression.type === AST_NODE_TYPES.TSTypeAssertion
      ) {
        const annotation = expression.typeAnnotation;
        if (annotation && !isConstAssertion(annotation)) {
          const classified = classifyTypeAnnotation(annotation);
          if (classified !== 'indeterminate') return classified;
        }
        return classifyReturnExpression(
          expression.expression as TSESTree.Expression,
        );
      }

      if (
        expression.type === AST_NODE_TYPES.ChainExpression ||
        expression.type === AST_NODE_TYPES.TSNonNullExpression
      ) {
        return classifyReturnExpression(
          expression.expression as TSESTree.Expression,
        );
      }

      if (
        (expression as { type: string }).type === PARENTHESIZED_EXPRESSION_TYPE
      ) {
        return classifyReturnExpression(
          (expression as unknown as { expression: TSESTree.Expression })
            .expression,
        );
      }

      if (expression.type === AST_NODE_TYPES.SequenceExpression) {
        return classifyReturnExpression(
          expression.expressions[expression.expressions.length - 1],
        );
      }

      if (NON_PRIMITIVE_EXPRESSION_TYPES.has(expression.type)) {
        return 'nonPrimitive';
      }

      // Literals, template literals and update expressions are primitives by
      // construction.
      if (
        expression.type === AST_NODE_TYPES.Literal ||
        expression.type === AST_NODE_TYPES.TemplateLiteral ||
        expression.type === AST_NODE_TYPES.UpdateExpression
      ) {
        return 'primitive';
      }

      if (
        expression.type === AST_NODE_TYPES.Identifier &&
        expression.name === 'undefined'
      ) {
        return 'primitive';
      }

      if (expression.type === AST_NODE_TYPES.UnaryExpression) {
        // `!`, `typeof`, `void`, `-`, `+`, `~`, `delete` all yield primitives.
        return 'primitive';
      }

      if (expression.type === AST_NODE_TYPES.BinaryExpression) {
        return COMPARISONISH_BINARY_OPERATORS.has(expression.operator)
          ? 'primitive'
          : 'indeterminate';
      }

      if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
        return combineReturnEvaluations([
          classifyReturnExpression(expression.consequent),
          classifyReturnExpression(expression.alternate),
        ]);
      }

      if (expression.type === AST_NODE_TYPES.LogicalExpression) {
        return combineReturnEvaluations([
          classifyReturnExpression(expression.left),
          classifyReturnExpression(expression.right),
        ]);
      }

      return 'indeterminate';
    }

    function collectReturnArgumentsOf(
      body: TSESTree.BlockStatement,
    ): (TSESTree.Expression | null)[] {
      const found: (TSESTree.Expression | null)[] = [];
      const walk = (node: TSESTree.Node) => {
        if (
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return;
        }
        if (node.type === AST_NODE_TYPES.ReturnStatement) {
          found.push(node.argument ?? null);
          return;
        }
        for (const key of Object.keys(node)) {
          if (key === 'parent') continue;
          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const entry of value) {
              if (ASTHelpers.isNode(entry)) walk(entry);
            }
          } else if (ASTHelpers.isNode(value)) {
            walk(value);
          }
        }
      };
      for (const statement of body.body) {
        walk(statement);
      }
      return found;
    }

    function classifyFunctionReturn(
      functionLike: TSESTree.FunctionLike,
    ): ReturnEvaluation {
      const annotation = functionLike.returnType?.typeAnnotation;
      if (annotation) {
        const classified = classifyTypeAnnotation(annotation);
        if (classified !== 'indeterminate') return classified;
      }

      // Async/generator calls hand back a promise or an iterator object.
      if (functionLike.async || functionLike.generator) {
        return 'nonPrimitive';
      }

      if (
        functionLike.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        functionLike.expression
      ) {
        return classifyReturnExpression(
          functionLike.body as TSESTree.Expression,
        );
      }

      if (functionLike.body?.type !== AST_NODE_TYPES.BlockStatement) {
        return 'indeterminate';
      }

      const returnArguments = collectReturnArgumentsOf(functionLike.body);
      if (returnArguments.length === 0) {
        // Falls off the end: yields undefined.
        return 'primitive';
      }
      const combined = combineReturnEvaluations(
        returnArguments.map((arg) => classifyReturnExpression(arg)),
      );
      // An unclassifiable return is still safe when no return expression can
      // syntactically reach a whole-parameter binding: the argument's reference
      // then has no path out through the result.
      if (
        combined === 'indeterminate' &&
        !returnArguments.some((arg) =>
          expressionReachesParameters(arg, functionLike),
        )
      ) {
        return 'primitive';
      }
      return combined;
    }

    function parameterNamesOf(
      functionLike: TSESTree.FunctionLike,
    ): Set<string> {
      // Only a whole-parameter binding can carry the argument object's identity
      // out. A destructured binding holds a PROPERTY of the argument, so
      // returning it never exposes the literal's own identity.
      const names = new Set<string>();
      const unwrap = (node: TSESTree.Node): TSESTree.Node => {
        if (node.type === AST_NODE_TYPES.AssignmentPattern) {
          return unwrap(node.left as TSESTree.Node);
        }
        if (node.type === AST_NODE_TYPES.RestElement) {
          return unwrap(node.argument as TSESTree.Node);
        }
        if (node.type === AST_NODE_TYPES.TSParameterProperty) {
          return unwrap(node.parameter as TSESTree.Node);
        }
        return node;
      };
      for (const param of functionLike.params) {
        const bare = unwrap(param as TSESTree.Node);
        if (bare.type === AST_NODE_TYPES.Identifier) {
          names.add(bare.name);
        }
      }
      return names;
    }

    function expressionReachesParameters(
      expression: TSESTree.Node | null,
      functionLike: TSESTree.FunctionLike,
    ): boolean {
      if (!expression) return false;
      const names = parameterNamesOf(functionLike);
      let reaches = false;
      const walk = (node: TSESTree.Node) => {
        if (reaches) return;
        if (
          node.type === AST_NODE_TYPES.Identifier &&
          // `arguments` exposes the raw argument list, so it can carry the
          // literal's identity out even when every parameter is destructured.
          (names.has(node.name) || node.name === 'arguments')
        ) {
          reaches = true;
          return;
        }
        for (const key of Object.keys(node)) {
          if (key === 'parent') continue;
          const value = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const entry of value) {
              if (ASTHelpers.isNode(entry)) walk(entry);
            }
          } else if (ASTHelpers.isNode(value)) {
            walk(value);
          }
        }
      };
      walk(expression);
      return reaches;
    }

    function functionOfDefinition(
      definition: TSESLint.Scope.Definition,
    ): TSESTree.FunctionLike | undefined {
      if (definition.type === 'FunctionName') {
        return definition.node as unknown as TSESTree.FunctionLike;
      }
      if (definition.type === 'Variable') {
        const init = (definition.node as unknown as TSESTree.VariableDeclarator)
          .init;
        if (
          init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init?.type === AST_NODE_TYPES.FunctionExpression
        ) {
          return init;
        }
      }
      return undefined;
    }

    /**
     * True when every declaration bound to `calleeName` provably returns a
     * primitive, so invoking it cannot hand an argument's reference back.
     *
     * The analysis never follows a call inside the callee's body — a returned
     * CallExpression classifies as indeterminate — so it terminates on
     * self-recursive and mutually recursive callees without a re-entrancy guard.
     */
    function calleeReturnIsPrimitive(
      calleeName: string,
      startScope: TSESLint.Scope.Scope | null,
    ): boolean {
      const variable = findVariableInScopes(calleeName, startScope);
      if (!variable || variable.defs.length === 0) return false;

      // A binding written again after initialization may hold a different
      // function by the time the call runs, so the declaration on record no
      // longer proves anything about the value actually invoked.
      if (variable.references.some((ref) => ref.isWrite() && !ref.init)) {
        return false;
      }

      const classifications: ReturnEvaluation[] = [];
      for (const definition of variable.defs) {
        const functionLike = functionOfDefinition(definition);
        // Imports, parameters and aliases hide the implementation.
        if (!functionLike) return false;
        classifications.push(classifyFunctionReturn(functionLike));
      }
      return combineReturnEvaluations(classifications) === 'primitive';
    }

    /**
     * True when `expr` — a plain function call's result, or a reference to the
     * variable holding that result — is consumed only for its primitive value,
     * never by reference.
     *
     * Referential stability of a call's ARGUMENT matters only if the call's
     * RESULT reaches a memoization boundary (a hook dependency, a memoized
     * child's prop, an effect capture) where identities are reference-compared.
     * A result that lands in a boolean-test position — a ternary/if/while/for
     * test, a `!`, a comparison, or a logical chain that itself ends in such a
     * position — is coerced to (or already is) a primitive, so the argument's
     * identity provably never crosses such a boundary regardless of what the
     * callee returns. Reasoning from how the CALLER consumes the result (not the
     * callee's body) keeps the analysis purely syntactic and type-free.
     *
     * The whitelist is deliberately tight: any position not proven primitive
     * (JSX attribute value, hook dependency element, argument to another call,
     * spread, return, object/array member) yields false, so the exemption never
     * silences a literal whose identity could still escape.
     */
    function isPrimitivelyConsumed(expr: TSESTree.Node): boolean {
      const parent = expr.parent as TSESTree.Node | null;
      if (!parent) {
        return false;
      }

      // TS-assertion/parenthesized wrappers are transparent to consumption:
      // analyze how the wrapped value is ultimately used.
      if (isExpressionWrapper(parent)) {
        const wrapper = parent as TSESTree.Node & {
          expression?: TSESTree.Node;
        };
        return wrapper.expression === expr && isPrimitivelyConsumed(parent);
      }

      switch (parent.type) {
        case AST_NODE_TYPES.ConditionalExpression:
          return parent.test === expr;
        case AST_NODE_TYPES.IfStatement:
        case AST_NODE_TYPES.WhileStatement:
        case AST_NODE_TYPES.DoWhileStatement:
        case AST_NODE_TYPES.ForStatement:
          return parent.test === expr;
        case AST_NODE_TYPES.UnaryExpression:
          return parent.operator === '!';
        case AST_NODE_TYPES.BinaryExpression:
          return COMPARISON_OPERATORS.has(parent.operator);
        case AST_NODE_TYPES.LogicalExpression:
          // A logical operand inherits the consumption of the whole expression:
          // safe only if that ultimately lands in a primitive position too.
          return isPrimitivelyConsumed(parent);
        case AST_NODE_TYPES.VariableDeclarator: {
          if (
            parent.init !== expr ||
            parent.id.type !== AST_NODE_TYPES.Identifier
          ) {
            return false;
          }
          const variables = ASTHelpers.getDeclaredVariables(
            context as unknown as TSESLint.RuleContext<
              string,
              readonly unknown[]
            >,
            parent,
          );
          if (variables.length === 0) {
            return false;
          }
          const usages = variables[0].references.filter((ref) => !ref.init);
          // No usages (dead code): can't prove the result stays primitive, so
          // keep the literal reported (mirrors isStyleVariableInitializer).
          if (usages.length === 0) {
            return false;
          }
          return usages.every((ref) => isPrimitivelyConsumed(ref.identifier));
        }
        default:
          return false;
      }
    }

    /**
     * True when the literal is a direct argument of a plain function call and
     * its identity provably cannot reach a memoization boundary — it is then
     * neither a JSX prop, nor a hook dependency, nor captured by an effect, so
     * re-creating it each render costs nothing and memoizing it buys nothing.
     *
     * Two independent conditions each suffice. The result is only ever consumed
     * primitively (see isPrimitivelyConsumed), which reasons from the CALL SITE.
     * Or the callee is locally declared and cannot hand the reference back (see
     * calleeReturnIsPrimitive), which reasons from the CALLEE. The call-site
     * condition covers callees that are imported or otherwise opaque; the callee
     * condition covers results consumed in positions no whitelist can prove
     * primitive, such as an object member or a hook dependency array.
     *
     * The callee must be a plain Identifier: member calls (`obj.method({...})`)
     * are excluded because the receiver could retain the reference, and this
     * keeps the guard to plain, non-hook synchronous calls.
     */
    function isPrimitiveConsumedCallArgument(node: TSESTree.Node): boolean {
      // Walk up through transparent wrappers to the position the literal
      // effectively occupies as a call argument.
      let effective: TSESTree.Node = node;
      let parent = effective.parent as TSESTree.Node | null;
      while (
        parent &&
        isExpressionWrapper(parent) &&
        (parent as TSESTree.Node & { expression?: TSESTree.Node })
          .expression === effective
      ) {
        effective = parent;
        parent = effective.parent as TSESTree.Node | null;
      }

      if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const isDirectArgument = parent.arguments.some(
        (arg) => (arg as TSESTree.Node) === effective,
      );
      if (!isDirectArgument) {
        return false;
      }

      if (parent.callee.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      // Either sufficient condition exempts: a provably primitive consumption
      // site, or a callee that cannot hand the reference back.
      if (isPrimitivelyConsumed(parent)) {
        return true;
      }
      return calleeReturnIsPrimitive(parent.callee.name, scopeOf(node));
    }

    function reportLiteral(node: TSESTree.Node) {
      const descriptor = getLiteralDescriptor(node);
      if (!descriptor) return;

      const owner = findEnclosingComponentOrHook(node);
      if (!owner) return;

      if (isInsideAllowedHookCallback(node)) {
        return;
      }

      if (isTerminalUsage(node)) {
        return;
      }

      // A jest module factory builds a replacement module; React never renders
      // it, and jest's out-of-scope-variable restriction makes the rule's own
      // remediations illegal inside it.
      if (isInsideJestMockFactory(node)) {
        return;
      }

      // A function literal passed directly as the callback to an Array
      // iteration method (.map/.filter/.reduce/.forEach/...) is invoked
      // synchronously during render and then discarded, so its identity is
      // never observed by a hook dependency, prop, effect, or memoized child —
      // memoizing it buys nothing. The rule's own advice is also unfollowable
      // here: the callback closes over loop/render scope so it can't be hoisted
      // to module level, and useCallback can't run inside a .map loop. Inline
      // functions passed as JSX-attribute props *inside* the callback body are
      // separate nodes and remain flagged.
      //
      // The same rationale exempts object/array literals created directly
      // inside such a callback (issue #1319): they are per-iteration values
      // discarded with the mapped result, `useMemo` cannot run inside the loop,
      // and the memoizable unit is the enclosing `.map()` call. The guard keys
      // on the NEAREST enclosing function, so a literal inside a nested,
      // non-iteration callback (e.g. an `onClick` handler) is NOT exempted.
      if (
        isIterationMethodCallback(node) ||
        isInsideIterationMethodCallback(node)
      ) {
        return;
      }

      // Inline literals that resolve to a style JSX attribute (sx, style),
      // whether directly or via conditional/logical/array wrappers, are
      // consumed by the library without reference equality checks, so
      // memoization adds no stability benefit.
      if (isStyleJSXAttributeValue(node)) {
        return;
      }

      // Same rationale, followed across a variable: a literal assigned to a
      // local whose every usage is a style JSX attribute value gains nothing
      // from memoization.
      if (isStyleVariableInitializer(node)) {
        return;
      }

      const hookCall = findEnclosingHookCall(node);
      if (hookCall) {
        if (
          hookCall.isDirectArgument ||
          HOOKS_ALLOWING_NESTED_LITERALS.has(hookCall.hookName)
        ) {
          // Top-level literal passed directly to a hook argument is allowed.
          // Also allow nested literals for hooks that don't rely on argument
          // reference stability for memoization (e.g. useState, useReducer).
          return;
        }

        context.report({
          node,
          messageId: 'nestedHookLiteral',
          data: {
            literalType: descriptor.literalType,
            hookName: hookCall.hookName,
          },
        });
        return;
      }

      if (isReturnValueFromHook(node, owner)) {
        // A returned literal whose members include a JSX element or fragment
        // cannot be stabilised by useMemo: JSX nodes are inherently fresh
        // references each render, so the wrapper recomputes every call
        // regardless. This mirrors the "no stability benefit" carve-out for
        // sx/style JSX attribute values (see isStyleJSXAttributeValue).
        if (
          node.type === AST_NODE_TYPES.ObjectExpression &&
          objectLiteralContainsJSXValue(
            node as TSESTree.ObjectExpression,
            owner,
          )
        ) {
          return;
        }
        if (
          node.type === AST_NODE_TYPES.ArrayExpression &&
          arrayLiteralContainsJSXValue(node as TSESTree.ArrayExpression)
        ) {
          return;
        }

        const hookName = getFunctionName(owner) ?? 'this hook';
        context.report({
          node,
          messageId: 'hookReturnLiteral',
          data: {
            literalType: descriptor.literalType,
            hookName,
          },
        });
        return;
      }

      // A literal passed only as an argument to a plain synchronous call whose
      // result is consumed primitively never carries its identity to a
      // memoization boundary, so memoizing it is pointless (issue #1329). Placed
      // last so hook-argument and hook-return handling run first and are
      // unaffected.
      if (isPrimitiveConsumedCallArgument(node)) {
        return;
      }

      const contextLabel = formatContextLabel(owner);
      // Only emit auto-fix suggestions for simple variable initializers; other
      // contexts (returns, JSX props, nested expressions) risk unsafe rewrites.
      const suggestions =
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init === node
          ? buildMemoSuggestions(node, descriptor, sourceCode)
          : undefined;

      context.report({
        node,
        messageId: 'componentLiteral',
        data: {
          literalType: descriptor.literalType,
          context: contextLabel,
          memoHook: descriptor.memoHook,
        },
        suggest: suggestions,
      });
    }

    return {
      ObjectExpression: reportLiteral,
      ArrayExpression: reportLiteral,
      ArrowFunctionExpression: reportLiteral,
      FunctionExpression: reportLiteral,
      FunctionDeclaration: reportLiteral,
    };
  },
});
