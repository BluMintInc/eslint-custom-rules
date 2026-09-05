import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignorePatterns?: string[];
  },
];

type MessageIds = 'memoizeNestedComponent';

type ComponentDetectionResult = {
  found: true;
  componentIsCallback: boolean;
};

/**
 * Memoization hooks whose first argument this rule inspects for a nested
 * component.
 *
 * `useLatestCallback` belongs here because the sibling `use-latest-callback`
 * rule rewrites `useCallback(fn, [])` into `useLatestCallback(fn)` under
 * `--fix`. That rewrite changes only which hook wraps the callback; the
 * component is still constructed inline inside render scope, which is the
 * identity churn this rule reports. Omitting the name let the sibling's fix
 * silently disarm this rule on the very code it had just flagged (#2313).
 */
const CALLBACK_HOOKS = new Set([
  'useCallback',
  'useDeepCompareCallback',
  'useLatestCallback',
  'useMemo',
  'useDeepCompareMemo',
]);

type ReactImports = {
  namespace: string | null;
  named: Partial<Record<'createElement' | 'memo' | 'forwardRef', string>>;
};

const collectReactImports = (
  sourceCode: Readonly<TSESLint.SourceCode>,
): ReactImports => {
  const reactImports: ReactImports = { namespace: null, named: {} };

  for (const statement of sourceCode.ast.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue;

    if (statement.source.value !== 'react') continue;

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.imported.type === AST_NODE_TYPES.Identifier
      ) {
        const importedName = specifier.imported.name;
        if (
          importedName === 'createElement' ||
          importedName === 'memo' ||
          importedName === 'forwardRef'
        ) {
          reactImports.named[importedName] = specifier.local.name;
        }
      }

      if (
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
      ) {
        reactImports.namespace = specifier.local.name;
      }
    }
  }

  return reactImports;
};

/**
 * Strips wrappers that leave a value's identity untouched, so a respelling
 * reaches the same matcher as the plain form.
 *
 * ESTree wraps a whole optional chain in a ChainExpression, so `memo?.(Row)`
 * arrives as `ChainExpression { expression: CallExpression }` and
 * `(React?.memo)(Row)` puts one in callee position. Every carve-out below asks
 * "is this a memo()/forwardRef() call?" by matching CallExpression directly, so
 * without this arm the nullish spelling of an already-memoized hand-back reads
 * as an un-memoized nested declaration (#1911).
 */
const unwrapNode = (node: TSESTree.Node): TSESTree.Node => {
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.ChainExpression:
      return unwrapNode(node.expression);
    default:
      break;
  }

  /**
   * ParenthesizedExpression appears in the parsed AST even though the type
   * is missing from AST_NODE_TYPES. This assertion safely unwraps to keep
   * traversal consistent.
   */
  if ((node.type as unknown as string) === 'ParenthesizedExpression') {
    return unwrapNode(
      (node as unknown as { expression: TSESTree.Node }).expression,
    );
  }

  return node;
};

/**
 * The ancestor a node reaches once optional-chain wrappers are skipped. A
 * ChainExpression sits between a call and its declarator in
 * `const X = useCallback?.(...)`, and between a runner call and its statement in
 * `it?.('name', () => {})`, so a parent read that expects one of those directly
 * misses the shape it was written to recognize.
 */
const parentBeyondChain = (node: TSESTree.Node): TSESTree.Node | undefined => {
  let parent = node.parent;
  while (parent && parent.type === AST_NODE_TYPES.ChainExpression) {
    parent = parent.parent;
  }
  return parent;
};

const calleeMatchesReactMember = (
  calleeNode: TSESTree.Node,
  reactImports: ReactImports,
  member: keyof ReactImports['named'],
): boolean => {
  const callee = unwrapNode(calleeNode);

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return reactImports.named[member] === callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === member &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    reactImports.namespace === callee.object.name
  ) {
    return true;
  }

  return false;
};

const isFunctionExpression = (
  node: TSESTree.Node,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression => {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
};

const unwrapExpression = (
  expression: TSESTree.Expression,
): TSESTree.Expression => {
  return unwrapNode(expression) as TSESTree.Expression;
};

const isReactCreateElementCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return calleeMatchesReactMember(node.callee, reactImports, 'createElement');
};

const isHookCall = (calleeNode: TSESTree.Node): { name: string } | null => {
  const callee = unwrapNode(calleeNode);

  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (CALLBACK_HOOKS.has(callee.name)) {
      return { name: callee.name };
    }
    return null;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CALLBACK_HOOKS.has(callee.property.name)
  ) {
    return { name: callee.property.name };
  }

  return null;
};

/**
 * Recognizes a callee named exactly `name`, whether a bare identifier (`memo`)
 * or a non-computed member access (`X.memo`), regardless of import source.
 *
 * memo/forwardRef are commonly re-exported from project-local wrapper modules
 * (e.g. `import { memo } from 'src/util/memo'`, which the sibling
 * `use-custom-memo` rule actively enforces). Resolving these purely against
 * react's import table would miss the wrapper form and misclassify an HOC
 * factory as a render body. By-name recognition is safe here because callers
 * are already gated by PascalCase naming and the surrounding factory analysis.
 *
 * Note: this deliberately does NOT apply to `createElement`, which must stay
 * bound to a react import so unrelated factories (e.g. `Factory.createElement`)
 * are not misread as element creation.
 */
const calleeMatchesName = (
  calleeNode: TSESTree.Node,
  name: string,
): boolean => {
  const callee = unwrapNode(calleeNode);

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === name;
  }

  return false;
};

const isForwardRefCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return (
    calleeMatchesReactMember(node.callee, reactImports, 'forwardRef') ||
    calleeMatchesName(node.callee, 'forwardRef')
  );
};

const isMemoCall = (
  node: TSESTree.CallExpression,
  reactImports: ReactImports,
): boolean => {
  return (
    calleeMatchesReactMember(node.callee, reactImports, 'memo') ||
    calleeMatchesName(node.callee, 'memo')
  );
};

const filterPresentResults = (
  results: Array<ComponentDetectionResult | null>,
): ComponentDetectionResult[] => {
  return results.filter((result): result is ComponentDetectionResult =>
    Boolean(result),
  );
};

const areAllComponentsCallbacks = (
  components: ComponentDetectionResult[],
): boolean => {
  return components.every((result) => result.componentIsCallback);
};

const createMergedResult = (
  components: ComponentDetectionResult[],
): ComponentDetectionResult => {
  return {
    found: true,
    // Auto-fix wraps the callback in memo() and swaps the hook. That is only valid when
    // every branch is itself a component callback (returns JSX/createElement directly).
    // If any branch yields a component factory, the transformation changes behavior.
    componentIsCallback: areAllComponentsCallbacks(components),
  };
};

const mergeComponentResults = (
  ...results: Array<ComponentDetectionResult | null>
): ComponentDetectionResult | null => {
  const present = filterPresentResults(results);

  if (!present.length) {
    return null;
  }

  return createMergedResult(present);
};

const expressionCreatesComponent = (
  expression: TSESTree.Expression | null,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (!expression) {
    return null;
  }

  const unwrapped = unwrapExpression(expression);

  if (
    unwrapped.type === AST_NODE_TYPES.JSXElement ||
    unwrapped.type === AST_NODE_TYPES.JSXFragment
  ) {
    return { found: true, componentIsCallback: true };
  }

  if (
    unwrapped.type === AST_NODE_TYPES.CallExpression &&
    isReactCreateElementCall(unwrapped, reactImports)
  ) {
    return { found: true, componentIsCallback: true };
  }

  switch (unwrapped.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression: {
      const inner = functionCreatesComponent(unwrapped, reactImports);
      return inner ? { found: true, componentIsCallback: false } : null;
    }
    case AST_NODE_TYPES.CallExpression: {
      if (
        isForwardRefCall(unwrapped, reactImports) ||
        isMemoCall(unwrapped, reactImports)
      ) {
        const firstArg = unwrapped.arguments[0];
        if (firstArg && isFunctionExpression(firstArg)) {
          const inner = functionCreatesComponent(firstArg, reactImports);
          if (inner) {
            return { found: true, componentIsCallback: false };
          }
        }
      }

      return null;
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      const cons = expressionCreatesComponent(
        unwrapped.consequent,
        reactImports,
      );
      const alt = expressionCreatesComponent(unwrapped.alternate, reactImports);
      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.LogicalExpression: {
      const left = expressionCreatesComponent(unwrapped.left, reactImports);
      const right = expressionCreatesComponent(unwrapped.right, reactImports);
      return mergeComponentResults(left, right);
    }
    case AST_NODE_TYPES.SequenceExpression: {
      const last = unwrapped.expressions[unwrapped.expressions.length - 1];
      return expressionCreatesComponent(last || null, reactImports);
    }
    case AST_NODE_TYPES.ArrayExpression: {
      const matches = unwrapped.elements
        .map((element) =>
          element && element.type !== AST_NODE_TYPES.SpreadElement
            ? expressionCreatesComponent(element, reactImports)
            : null,
        )
        .filter(Boolean) as ComponentDetectionResult[];
      return mergeComponentResults(...matches);
    }
    default:
      return null;
  }
};

const statementCreatesComponent = (
  node: TSESTree.Statement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  switch (node.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionCreatesComponent(node.argument, reactImports);
    case AST_NODE_TYPES.IfStatement: {
      const cons =
        node.consequent.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.consequent, reactImports)
          : statementCreatesComponent(node.consequent, reactImports);

      const alt = node.alternate
        ? node.alternate.type === AST_NODE_TYPES.BlockStatement
          ? blockCreatesComponent(node.alternate, reactImports)
          : statementCreatesComponent(node.alternate, reactImports)
        : null;

      return mergeComponentResults(cons, alt);
    }
    case AST_NODE_TYPES.SwitchStatement: {
      const matches: Array<ComponentDetectionResult | null> = [];
      for (const switchCase of node.cases) {
        for (const consequent of switchCase.consequent) {
          matches.push(statementCreatesComponent(consequent, reactImports));
        }
      }
      return mergeComponentResults(...matches);
    }
    case AST_NODE_TYPES.BlockStatement:
      return blockCreatesComponent(node, reactImports);
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement: {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        return blockCreatesComponent(node.body, reactImports);
      }
      return statementCreatesComponent(node.body, reactImports);
    }
    case AST_NODE_TYPES.TryStatement: {
      const blockMatch = blockCreatesComponent(node.block, reactImports);
      const handlerMatch = node.handler?.body
        ? blockCreatesComponent(node.handler.body, reactImports)
        : null;
      const finalizerMatch = node.finalizer
        ? blockCreatesComponent(node.finalizer, reactImports)
        : null;

      return mergeComponentResults(blockMatch, handlerMatch, finalizerMatch);
    }
    default:
      return null;
  }
};

const blockCreatesComponent = (
  block: TSESTree.BlockStatement,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  const matches: Array<ComponentDetectionResult | null> = [];

  for (const statement of block.body) {
    matches.push(statementCreatesComponent(statement, reactImports));
  }

  return mergeComponentResults(...matches);
};

const functionCreatesComponent = (
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration,
  reactImports: ReactImports,
): ComponentDetectionResult | null => {
  if (node.body.type === AST_NODE_TYPES.BlockStatement) {
    return blockCreatesComponent(node.body, reactImports);
  }

  return expressionCreatesComponent(node.body, reactImports);
};

const shouldIgnoreFile = (filename: string, patterns: string[]): boolean => {
  return patterns.some((pattern) => minimatch(filename, pattern));
};

const getVariableName = (node: TSESTree.CallExpression): string | null => {
  const parent = parentBeyondChain(node);

  if (
    parent &&
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return parent.id.name;
  }

  return null;
};

type EnclosingFunction =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

const isEnclosingFunction = (
  node: TSESTree.Node,
): node is EnclosingFunction => {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
};

/**
 * Nearest ancestor function whose body directly contains `node`. Climbs from
 * the node's parent so a function node itself is not treated as its own
 * enclosing function.
 */
const findEnclosingFunction = (
  node: TSESTree.Node,
): EnclosingFunction | null => {
  let parent = node.parent;
  while (parent) {
    if (isEnclosingFunction(parent)) {
      return parent;
    }
    parent = parent.parent;
  }
  return null;
};

const isInsideFunction = (node: TSESTree.Node): boolean => {
  return findEnclosingFunction(node) !== null;
};

const isPascalCaseName = (name: string): boolean => /^[A-Z]/.test(name);

/**
 * Prop names whose value a parent MOUNTS rather than calls. Kept identical to
 * the `JSXAttribute` visitor's own test so the two paths cannot disagree about
 * what a component-type prop is — the disagreement between them is #2334.
 */
const COMPONENT_PROP_SUFFIX = /(Wrapper|Component|Template|Header|Footer)$/;

const isComponentPropName = (name: string): boolean =>
  isPascalCaseName(name) && COMPONENT_PROP_SUFFIX.test(name);

/**
 * How one reference to a binding CONSUMES it.
 *
 * `component` — something MOUNTS it, so React gives it an identity that a
 * render-scope definition churns. `callback` — something CALLS it, or hands it
 * to a prop that is not component-typed, so it is a render callback the parent
 * invokes and no identity exists to churn. `unknown` — a reference that settles
 * neither, such as being returned or stored.
 *
 * This is the question the rule's message has always claimed to answer
 * ("Render-prop callbacks are fine; this rule targets component-type props
 * only"). The binding's NAME cannot answer it: casing is a convention, and a
 * render callback a parent invokes is written `PopoverChildren` as readily as
 * `renderHit` (#2334).
 */
type Consumption = 'component' | 'callback' | 'unknown';

const consumptionOfReference = (
  identifier: TSESTree.Node,
  reactImports: ReactImports,
): Consumption => {
  // `<Binding />`. The scope manager reports the tag name as a reference whose
  // identifier is a `JSXIdentifier`, which no other position produces.
  if (identifier.type === AST_NODE_TYPES.JSXIdentifier) {
    return 'component';
  }

  let current: TSESTree.Node = identifier;
  for (;;) {
    const parent = parentBeyondChain(current);
    if (!parent) {
      return 'unknown';
    }

    // `Binding as Something` / `Binding!` keep the value on its way to a use.
    if (
      (parent.type === AST_NODE_TYPES.TSAsExpression ||
        parent.type === AST_NODE_TYPES.TSNonNullExpression ||
        parent.type === AST_NODE_TYPES.TSSatisfiesExpression) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }

    if (parent.type === AST_NODE_TYPES.CallExpression) {
      // `createElement(Binding, ...)` mounts it exactly as a tag name does.
      if (
        parent.arguments[0] === current &&
        isReactCreateElementCall(parent, reactImports)
      ) {
        return 'component';
      }
      // `Binding(onClose)` — the parent INVOKES it, which is what a render
      // callback is for. A component is never called directly.
      if (parent.callee === current) {
        return 'callback';
      }
      return 'unknown';
    }

    // `<Host ContentComponent={Binding} />` mounts it; `<Host render={Binding} />`
    // calls it. The prop name is the parent's contract, and it is read on the
    // same terms the `JSXAttribute` visitor uses so the two cannot disagree.
    if (
      parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
      parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
      parent.parent.name.type === AST_NODE_TYPES.JSXIdentifier
    ) {
      return isComponentPropName(parent.parent.name.name)
        ? 'component'
        : 'callback';
    }

    return 'unknown';
  }
};

/**
 * Whether the binding a memo-hook call initializes is MOUNTED, CALLED, or
 * neither, read from the scope manager's reference list rather than a textual
 * search so a same-named binding in a sibling scope cannot answer for this one.
 *
 * `unknown` is the honest answer for a binding with no informative reference —
 * an exported component has none in its own file, and so does a fixture
 * fragment. Falling back to the name there keeps the rule's reach while letting
 * evidence override the guess wherever evidence exists.
 */
const consumptionOfBinding = (
  node: TSESTree.CallExpression,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  reactImports: ReactImports,
): Consumption => {
  const declarator = parentBeyondChain(node);
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator) {
    return 'unknown';
  }

  let sawCallback = false;
  for (const variable of context.getDeclaredVariables(declarator)) {
    for (const reference of variable.references) {
      const consumption = consumptionOfReference(
        reference.identifier,
        reactImports,
      );
      // A single mounting use settles it: the identity churn happens there
      // regardless of how many other places merely call it.
      if (consumption === 'component') {
        return 'component';
      }
      if (consumption === 'callback') {
        sawCallback = true;
      }
    }
  }

  return sawCallback ? 'callback' : 'unknown';
};

/**
 * The values a container hands to its caller: object property values and array
 * elements. Mirrors `containedValues` in the paired `require-memo` rule (#1919),
 * so the two rules agree on what a container-carried hand-back is.
 *
 * A property KEY is not a carried value, and a spread is excluded in both
 * directions — `{ ...Row }` copies a component's own properties rather than
 * handing the component back, so it keeps the verdict it has.
 */
const containerCarriedValues = (
  container: TSESTree.ObjectExpression | TSESTree.ArrayExpression,
): TSESTree.Expression[] => {
  if (container.type === AST_NODE_TYPES.ObjectExpression) {
    return container.properties
      .filter(
        (property): property is TSESTree.Property =>
          property.type === AST_NODE_TYPES.Property,
      )
      .map((property) => property.value as TSESTree.Expression);
  }

  return container.elements.filter(
    (element): element is TSESTree.Expression =>
      !!element && element.type !== AST_NODE_TYPES.SpreadElement,
  );
};

/**
 * A return value is a *component* (vs. rendered output) when it is a
 * memo()/forwardRef() call, a PascalCase identifier (returned component
 * reference), or an inline function that itself creates a component. Such a
 * value identifies the surrounding function as an HOC factory rather than a
 * render body.
 *
 * `creditsBareReference` governs the identifier arm alone; see the container
 * recursion below for why an array element does not carry it.
 */
const returnExpressionIsComponent = (
  expression: TSESTree.Expression | null,
  reactImports: ReactImports,
  creditsBareReference = true,
): boolean => {
  if (!expression) {
    return false;
  }

  const unwrapped = unwrapExpression(expression);

  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    if (
      isMemoCall(unwrapped, reactImports) ||
      isForwardRefCall(unwrapped, reactImports)
    ) {
      return true;
    }
    return false;
  }

  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return creditsBareReference && isPascalCaseName(unwrapped.name);
  }

  if (isFunctionExpression(unwrapped)) {
    return Boolean(functionCreatesComponent(unwrapped, reactImports));
  }

  // A factory that hands its component back inside a container is still an HOC
  // factory, not a render body — the ES-module interop shape
  // `{ __esModule: true, default: Component }` that every `jest.mock()` factory
  // uses puts the component one property deep, and an array carries it out just
  // the same. Reading only objects here made the array spelling of an
  // already-memoized hand-back read as a nested un-memoized declaration, while
  // the sibling walker `expressionCreatesComponent` and `require-memo`'s
  // `containedValues` both read either container (#1925). Recursing covers
  // nesting and the mixed spellings; render bodies return JSX rather than
  // container literals, so this does not blur the two.
  //
  // An array element does NOT carry the bare-reference credit: `return [Row]`
  // hands a component out un-memoized, which is exactly what `require-memo`
  // reports there and repairs with the `memo(...)` wrapper. Crediting it would
  // exempt the shape the paired rule is still complaining about, so the array
  // arm credits only a hand-back already wrapped or defined inline.
  if (
    unwrapped.type === AST_NODE_TYPES.ObjectExpression ||
    unwrapped.type === AST_NODE_TYPES.ArrayExpression
  ) {
    const creditsBareReferenceWithin =
      creditsBareReference &&
      unwrapped.type === AST_NODE_TYPES.ObjectExpression;

    return containerCarriedValues(unwrapped).some((carried) =>
      returnExpressionIsComponent(
        carried,
        reactImports,
        creditsBareReferenceWithin,
      ),
    );
  }

  return false;
};

const returnExpressionIsJsx = (
  expression: TSESTree.Expression | null,
): boolean => {
  if (!expression) {
    return false;
  }

  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.JSXElement ||
    unwrapped.type === AST_NODE_TYPES.JSXFragment
  );
};

/**
 * True when the expression is a `memo(...)` / `forwardRef(...)` call. Returned
 * from a useMemo/useDeepCompareMemo callback, this is the complete, sanctioned
 * stabilization pattern: the memo hook stabilizes the component *identity*
 * across re-renders (a new identity only on a deps change), so the inner
 * component never remounts on an ordinary re-render—the exact harm this rule
 * exists to prevent does not occur.
 */
const returnExpressionIsMemoOrForwardRefCall = (
  expression: TSESTree.Expression | null,
  reactImports: ReactImports,
): boolean => {
  if (!expression) {
    return false;
  }

  const unwrapped = unwrapExpression(expression);
  return (
    unwrapped.type === AST_NODE_TYPES.CallExpression &&
    (isMemoCall(unwrapped, reactImports) ||
      isForwardRefCall(unwrapped, reactImports))
  );
};

/**
 * True when a useMemo/useDeepCompareMemo callback directly returns a
 * memo()/forwardRef()-wrapped component. The memo hook stabilizes the returned
 * component's identity, so such a binding does not remount on re-render and
 * must not be flagged.
 */
const memoCallbackReturnsMemoizedComponent = (
  callback: TSESTree.Node,
  reactImports: ReactImports,
): boolean => {
  if (!isFunctionExpression(callback)) {
    return false;
  }

  return collectDirectReturnExpressions(callback).some((expression) =>
    returnExpressionIsMemoOrForwardRefCall(expression, reactImports),
  );
};

/**
 * Direct return-statement arguments of a function, traversing control flow
 * (if/switch/try/loops) but NOT descending into nested function definitions—
 * returns inside nested functions belong to those functions, not this one.
 */
const collectDirectReturnExpressions = (
  fn: EnclosingFunction,
): Array<TSESTree.Expression | null> => {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }

  const returns: Array<TSESTree.Expression | null> = [];

  const visitStatement = (statement: TSESTree.Statement): void => {
    switch (statement.type) {
      case AST_NODE_TYPES.ReturnStatement:
        returns.push(statement.argument);
        break;
      case AST_NODE_TYPES.BlockStatement:
        statement.body.forEach(visitStatement);
        break;
      case AST_NODE_TYPES.IfStatement:
        visitStatement(statement.consequent);
        if (statement.alternate) {
          visitStatement(statement.alternate);
        }
        break;
      case AST_NODE_TYPES.SwitchStatement:
        for (const switchCase of statement.cases) {
          switchCase.consequent.forEach(visitStatement);
        }
        break;
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
        visitStatement(statement.body);
        break;
      case AST_NODE_TYPES.TryStatement:
        visitStatement(statement.block);
        if (statement.handler) {
          visitStatement(statement.handler.body);
        }
        if (statement.finalizer) {
          visitStatement(statement.finalizer);
        }
        break;
      default:
        break;
    }
  };

  fn.body.body.forEach(visitStatement);

  return returns;
};

/** Module-mock registrars whose factory argument runs at registration time. */
const MODULE_MOCK_REGISTRARS = new Set(['mock', 'doMock']);

/**
 * Test-runner callbacks. A `describe` body runs once at collection time and an
 * `it`/hook body once per test — neither re-renders, so a component defined
 * directly in one has an identity as stable as a module-scope export.
 */
const TEST_RUNNER_NAMES = new Set([
  'describe',
  'it',
  'test',
  'beforeEach',
  'beforeAll',
  'afterEach',
  'afterAll',
]);

/**
 * The identifier a callee is rooted at, so `it`, `it.only`, `it.each(...)` and
 * `describe.each`...`` all resolve to the runner's own name.
 */
const calleeRootName = (calleeNode: TSESTree.Node): string | undefined => {
  const callee = unwrapNode(calleeNode);

  switch (callee.type) {
    case AST_NODE_TYPES.Identifier:
      return callee.name;
    case AST_NODE_TYPES.MemberExpression:
      return calleeRootName(callee.object);
    case AST_NODE_TYPES.CallExpression:
      return calleeRootName(callee.callee);
    case AST_NODE_TYPES.TaggedTemplateExpression:
      return calleeRootName(callee.tag);
    default:
      return undefined;
  }
};

/**
 * True when `fn` is a callback handed to a test-runner call.
 *
 * Requiring the call to stand alone as a statement keeps an ordinary helper that
 * merely shares a name — a `test(...)` used for its return value, say — from
 * collecting the exemption, since runner calls are always statements.
 */
const isTestRunnerCallback = (fn: TSESTree.Node): boolean => {
  const call = fn.parent;
  if (!call || call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (!call.arguments.includes(fn as TSESTree.CallExpressionArgument)) {
    return false;
  }
  if (parentBeyondChain(call)?.type !== AST_NODE_TYPES.ExpressionStatement) {
    return false;
  }
  const root = calleeRootName(call.callee);
  return root !== undefined && TEST_RUNNER_NAMES.has(root);
};

/**
 * True when `fn` is the factory argument of a `jest.mock()` / `jest.doMock()`
 * call.
 *
 * Such a factory runs once when the module registry resolves the mock, never
 * per render, so a component defined inside it is as identity-stable as a
 * module-scope export and the remount harm this rule describes cannot occur.
 * Keyed on the call rather than on what the factory returns because the
 * component is often unreachable from the return expression — the common
 * registry shape hands it back through
 * `Object.fromEntries(ids.map((id) => [id, Stub]))`, where no amount of
 * unwrapping the returned object literal finds it.
 */
const isModuleMockFactory = (fn: TSESTree.Node): boolean => {
  const call = fn.parent;
  if (!call || call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (!call.arguments.includes(fn as TSESTree.CallExpressionArgument)) {
    return false;
  }
  const callee = unwrapNode(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'jest' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    MODULE_MOCK_REGISTRARS.has(callee.property.name)
  );
};

/**
 * Whether `fn` sits lexically inside a test-runner callback, at any depth.
 *
 * Unlike {@link isTestRunnerCallback}, which asks whether the function *is* the
 * callback, this reaches helpers declared within one. Safe to widen this far
 * only because the caller pairs it with "does not return JSX".
 */
const isWithinTestRunnerCallback = (fn: TSESTree.Node): boolean => {
  let current: TSESTree.Node | undefined = fn;
  while (current) {
    if (isTestRunnerCallback(current)) {
      return true;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return false;
};

/**
 * True when the nearest enclosing function is an HOC factory—it returns a
 * component (memo/forwardRef/component reference) and never returns JSX. Such
 * a function runs once per call, so components defined inside it have stable
 * identities and must NOT be flagged. A function that returns JSX is a render
 * body, where nested components DO remount and remain flagged.
 */
const isInsideHocFactory = (
  node: TSESTree.Node,
  reactImports: ReactImports,
): boolean => {
  const enclosing = findEnclosingFunction(node);
  if (!enclosing) {
    return false;
  }

  // Both checks look only at the NEAREST enclosing function, so a component
  // nested inside another component that itself sits in an it() body is still
  // reported — the exemption does not leak down the tree.
  if (isModuleMockFactory(enclosing) || isTestRunnerCallback(enclosing)) {
    return true;
  }

  // A helper *declared* in a test body — `renderUpdater` and friends, which
  // build a tree and hand it to `render()` — runs once per test rather than per
  // render. It is only scaffolding if it is not itself a component, which the
  // `returnsJsx` check below establishes; a real component in the same describe
  // body still returns JSX and is still reported.
  const withinTest = isWithinTestRunnerCallback(enclosing);

  const returns = collectDirectReturnExpressions(enclosing);

  const returnsComponent = returns.some((expression) =>
    returnExpressionIsComponent(expression, reactImports),
  );
  const returnsJsx = returns.some((expression) =>
    returnExpressionIsJsx(expression),
  );

  if (returnsJsx) {
    return false;
  }

  return returnsComponent || withinTest;
};

export const memoNestedReactComponents = createRule<Options, MessageIds>({
  name: 'memo-nested-react-components',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow React components defined in render bodies, hooks, or passed as props',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      memoizeNestedComponent: `What's wrong: React component "{{componentName}}" is created inline inside {{locationDescription}}.

Why it matters: Inline components get new identities when their containing scope re-renders, causing React to unmount and remount them—dropping state, replaying animations, and causing UI flashes. Wrapping with memo() does NOT fix this—memo() only prevents re-renders when props change, not when the component identity itself changes.

How to fix:
  1. Define the component at MODULE SCOPE in its own file, wrapped with memo()
  2. Use React Context and/or directly provide props to supply any dynamic data the component needs
  3. Pass the stable, imported component reference to props like CatalogWrapper

Don't pass inline function components to component-type props (*Wrapper, *Component).
Render-prop callbacks (e.g., render={...}) are fine; this rule targets component-type props only.

See: https://react.dev/learn/your-first-component#nesting-and-organizing-components`,
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const ignorePatterns = options?.ignorePatterns ?? [];
    const filename =
      (context as { filename?: string }).filename ?? context.getFilename();

    if (ignorePatterns.length && shouldIgnoreFile(filename, ignorePatterns)) {
      return {};
    }

    const sourceCode = context.getSourceCode();
    const reactImports = collectReactImports(sourceCode);

    const reportNestedComponentViolation = (
      node: TSESTree.Node,
      componentName: string,
      locationDescription: string,
    ) => {
      context.report({
        node,
        messageId: 'memoizeNestedComponent',
        data: {
          componentName,
          locationDescription,
        },
      });
    };

    return {
      CallExpression(node) {
        const hook = isHookCall(node.callee);
        if (!hook) return;

        const callback = node.arguments[0];

        if (!callback || callback.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const componentMatch = isFunctionExpression(callback)
          ? functionCreatesComponent(callback, reactImports)
          : expressionCreatesComponent(callback, reactImports);
        if (!componentMatch) {
          return;
        }

        // For useMemo, it only counts as a component if it returns a function
        if (
          hook.name.includes('useMemo') ||
          hook.name.includes('useDeepCompareMemo')
        ) {
          if (componentMatch.componentIsCallback) {
            // Returns JSX directly, so it's an element, not a component
            return;
          }
          // A memo()/forwardRef()-wrapped return is identity-stabilized by the
          // memo hook, so it does not remount on re-render and must not be
          // flagged (see #1336). Bare inner components stay flagged.
          if (memoCallbackReturnsMemoizedComponent(callback, reactImports)) {
            return;
          }
        }

        const variableName = getVariableName(node);

        // The NAME was the whole discriminator here, which reported every
        // PascalCase render callback the message explicitly exempts and missed
        // every lowercase binding handed to a component-type prop. Evidence
        // from the use site overrides it in both directions; the name still
        // decides where there is no evidence, which is where an exported
        // component lives (#2334).
        if (variableName) {
          const consumption = consumptionOfBinding(node, context, reactImports);
          if (consumption === 'callback') {
            return;
          }
          if (consumption === 'unknown' && !isPascalCaseName(variableName)) {
            return;
          }
        }

        // Inside an HOC factory the binding has a stable identity, so it does
        // not remount on re-render and must not be flagged.
        if (isInsideHocFactory(node, reactImports)) {
          return;
        }

        const componentName =
          variableName ??
          (isFunctionExpression(callback) &&
          callback.id?.type === AST_NODE_TYPES.Identifier
            ? callback.id.name
            : 'component');

        reportNestedComponentViolation(node, componentName, `${hook.name}()`);
      },

      VariableDeclarator(node) {
        if (!node.init) return;
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;

        // Only check if name starts with uppercase (convention for components)
        if (!isPascalCaseName(node.id.name)) return;

        if (!isInsideFunction(node)) return;

        // Inside an HOC factory the component has a stable identity (the factory
        // runs once per call), so it does not remount and must not be flagged.
        if (isInsideHocFactory(node, reactImports)) return;

        // Skip if it's already a hook call (handled by CallExpression visitor)
        const init = unwrapExpression(node.init);
        if (init.type === AST_NODE_TYPES.CallExpression) {
          const hook = isHookCall(init.callee);
          if (hook) return;
        }

        const componentMatch = expressionCreatesComponent(
          node.init,
          reactImports,
        );
        if (!componentMatch) return;

        // JSX elements assigned to variables are fine, only report function definitions
        if (componentMatch.componentIsCallback) return;

        reportNestedComponentViolation(node, node.id.name, 'a render body');
      },

      FunctionDeclaration(node) {
        if (!node.id || !isPascalCaseName(node.id.name)) return;
        if (!isInsideFunction(node)) return;

        // Inside an HOC factory the component has a stable identity (the factory
        // runs once per call), so it does not remount and must not be flagged.
        if (isInsideHocFactory(node, reactImports)) return;

        const componentMatch = functionCreatesComponent(node, reactImports);
        if (!componentMatch) return;

        reportNestedComponentViolation(node.id, node.id.name, 'a render body');
      },

      JSXAttribute(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        const attrName = node.name.name;

        // Check if it's a component-type prop. A non-PascalCase prop (e.g.
        // renderHeader) is a render callback used with a render={...} prop, not
        // a component—skip it, mirroring the binding-side carve-out above. The
        // suffix alone is not enough: it matches the tail of renderHeader.
        if (
          !isPascalCaseName(attrName) ||
          !/(Wrapper|Component|Template|Header|Footer)$/.test(attrName)
        ) {
          return;
        }

        if (
          !node.value ||
          node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
        ) {
          return;
        }

        const expression = node.value.expression;
        if (expression.type === AST_NODE_TYPES.JSXEmptyExpression) return;

        const componentMatch = expressionCreatesComponent(
          expression,
          reactImports,
        );
        if (!componentMatch) return;

        // For props, we only report if it's a function (component definition)
        if (componentMatch.componentIsCallback) {
          // It's a JSX element passed directly, which is usually fine
          return;
        }

        reportNestedComponentViolation(
          node,
          attrName,
          `the "${attrName}" prop`,
        );
      },
    };
  },
});
