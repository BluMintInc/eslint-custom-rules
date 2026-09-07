import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

const isUpperSnakeCase = (str: string): boolean =>
  /^[A-Z][A-Z0-9_]*$/.test(str);

/**
 * Converts an identifier to UPPER_SNAKE_CASE by splitting on case *boundaries*.
 *
 * Idempotence is a correctness requirement, not a nicety: `--fix` re-lints its
 * own output up to ten times per file, and a sibling rule can rewrite the same
 * identifier in between (`enforce-react-type-naming` lowercases it), so a
 * converter that re-separates what it already separated compounds every pass
 * and writes an ever-growing, corrupted identifier into source (Issue #1605).
 * Splitting on boundaries also keeps acronym runs intact, so `HTTPServer` reads
 * as `HTTP_SERVER` rather than `H_T_T_P_SERVER`.
 *
 * The leading underscore is dropped because `_PRIVATE_THING` fails
 * `isUpperSnakeCase`, which would leave the rule demanding a rename it can
 * never satisfy.
 */
const toUpperSnakeCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
    .replace(/^_/, '');

// `x as T`, `<T>x`, `x satisfies T` and `x!` annotate or assert an expression
// without contributing a value of their own, so a check that classifies the
// *shape* of an initializer must look through all four alike. Recognizing only
// some of them makes the rule's carve-outs depend on which type syntax an
// author happened to reach for: a React component written
// `memo(Foo) satisfies ComponentType` or `memo(Foo)!` read as opaque
// expressions and were renamed to UPPER_SNAKE_CASE while `memo(Foo) as FC` was
// exempt (Issue #1681).
const VALUE_WRAPPER_TYPES = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

type ValueWrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSNonNullExpression;

const isValueWrapper = (node: TSESTree.Node): node is ValueWrapper =>
  VALUE_WRAPPER_TYPES.has(node.type);

const unwrapValueWrappers = (node: TSESTree.Node): TSESTree.Node => {
  let target: TSESTree.Node = node;
  while (isValueWrapper(target)) {
    target = target.expression;
  }
  return target;
};

// Jest mock handles produced by an `as` cast to a `jest.Mock*` type are
// stateful test doubles that are reassigned/mutated through
// `.mockImplementation()`, `.mockReturnValue()`, etc. They are not immutable
// module configuration, and the `mockedX` camelCase spelling is the established
// idiom, so they are exempt from the UPPER_SNAKE_CASE rename requirement.
const JEST_MOCK_TYPE_NAMES = new Set([
  'Mock',
  'MockedFunction',
  'Mocked',
  'MockedClass',
]);

// Match `expr as jest.Mock<...>` / `jest.MockedFunction<...>` /
// `jest.Mocked<...>` / `jest.MockedClass<...>`. The match is kept deliberately
// narrow — a qualified `jest.<MockType>` type reference — so unrelated `as`
// casts keep triggering the rename check.
const isJestMockTypeReference = (
  typeAnnotation: TSESTree.TypeNode,
): boolean => {
  if (typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference) {
    return false;
  }
  const { typeName } = typeAnnotation;
  return (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.left.type === AST_NODE_TYPES.Identifier &&
    typeName.left.name === 'jest' &&
    typeName.right.type === AST_NODE_TYPES.Identifier &&
    JEST_MOCK_TYPE_NAMES.has(typeName.right.name)
  );
};

// The cast can sit anywhere in a wrapper chain (`(foo as jest.Mock)!`,
// `foo as jest.Mock satisfies unknown`), so the whole chain is scanned rather
// than the outermost node alone — a mock handle stays a mock handle whatever is
// wrapped around the cast.
const isJestMockCast = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node = node;
  while (isValueWrapper(current)) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression &&
      isJestMockTypeReference(current.typeAnnotation)
    ) {
      return true;
    }
    current = current.expression;
  }
  return false;
};

// React's component factories, called bare (`memo(Foo)`) or through a namespace
// import (`React.memo(Foo)`).
const COMPONENT_FACTORY_NAMES = new Set(['forwardRef', 'memo']);

const isComponentFactoryCall = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return COMPONENT_FACTORY_NAMES.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    COMPONENT_FACTORY_NAMES.has(callee.property.name)
  );
};

// A function value is a component, hook or helper, never the module-level
// configuration value this rule governs. The two spellings are interchangeable
// at a declaration site, so `const Row = function (props) {...}` is exempt on
// the same terms as `const Row = (props) => {...}` (Issue #1681).
const isFunctionValue = (
  node: TSESTree.Node,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression =>
  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
  node.type === AST_NODE_TYPES.FunctionExpression;

/**
 * A component-shaped identifier: an initial capital followed by at least one
 * lowercase letter. React resolves a JSX name by its spelling — `<Provider/>`
 * reads the binding while `<provider/>` is the intrinsic string `'provider'` —
 * so the capital carries meaning an UPPER_SNAKE rename destroys. A name that is
 * already UPPER_SNAKE is not component-shaped, which costs nothing: the rule
 * never reports one.
 */
const isComponentShapedName = (name: string): boolean =>
  /^[A-Z]/.test(name) && /[a-z]/.test(name);

/**
 * Whether the binding is spelled as a JSX element name (`<Provider …>`)
 * anywhere in the file. Such a binding holds a React component whatever its
 * initializer looks like: the reported shape reads one off a class getter
 * (`const Provider = provider.Provider`), a MemberExpression that #1681's
 * function-value/factory carve-out never reached (Issue #2055).
 *
 * The answer comes from the scope manager's reference list rather than a
 * textual search for the name, so a same-named component bound inside a
 * callback never exempts an unrelated module constant. Only a whole-name use
 * counts: in `<Ns.Thing/>` the component is `Thing`, and `Ns` is an ordinary
 * object whose UPPER_SNAKE spelling (`<NS.Thing/>`) resolves the same value.
 */
const isUsedAsJsxElementName = (variable: TSESLint.Scope.Variable): boolean =>
  variable.references.some((reference) => {
    const parent = reference.identifier.parent;
    return (
      parent?.type === AST_NODE_TYPES.JSXOpeningElement &&
      parent.name === reference.identifier
    );
  });

/**
 * Whether the initializer reads a component off another value —
 * `const Provider = provider.Provider`, the class-getter shape from the report.
 * Both the property read and the binding carry the component spelling, which
 * leaves an ordinary configuration read (`const themeColor = Theme.color`)
 * subject to the rename (Issue #1418). Type information would settle the
 * question exactly; the spelling is what a single-file rule can decide, and a
 * missed rename is a cheaper error than a renamed component (Issue #2055).
 */
const isComponentPropertyRead = (
  init: TSESTree.Node,
  bindingName: string,
): boolean => {
  const target = unwrapValueWrappers(init);
  return (
    isComponentShapedName(bindingName) &&
    target.type === AST_NODE_TYPES.MemberExpression &&
    !target.computed &&
    target.property.type === AST_NODE_TYPES.Identifier &&
    isComponentShapedName(target.property.name)
  );
};

/**
 * The `JSXElement` whose tag name `refId` spells, or null when the reference
 * sits anywhere else. A member-expression name (`<Ns.Thing/>`) references its
 * ROOT object, so the climb walks out of the member chain first.
 */
const jsxElementOfTagName = (
  refId: TSESTree.Node,
): TSESTree.JSXElement | null => {
  let current: TSESTree.Node = refId;
  let owner: TSESTree.Node | undefined = current.parent;
  while (
    owner?.type === AST_NODE_TYPES.JSXMemberExpression &&
    owner.object === current
  ) {
    current = owner;
    owner = current.parent;
  }

  if (
    owner?.type !== AST_NODE_TYPES.JSXOpeningElement &&
    owner?.type !== AST_NODE_TYPES.JSXClosingElement
  ) {
    return null;
  }
  if (owner.name !== current) {
    return null;
  }

  const element = owner.parent;
  return element?.type === AST_NODE_TYPES.JSXElement ? element : null;
};

/** The root identifier of a tag name: `Ns` in `<Ns.Thing.Deep/>`. */
const jsxTagNameRoot = (
  name: TSESTree.JSXTagNameExpression,
): TSESTree.JSXTagNameExpression => {
  let current: TSESTree.JSXTagNameExpression = name;
  while (current.type === AST_NODE_TYPES.JSXMemberExpression) {
    current = current.object;
  }
  return current;
};

// `as const` does more than pin literal types: it makes the value deeply
// `readonly`. A binding that is written through after its declaration therefore
// cannot carry the assertion at all — appending it turns compiling code into
// `TS2339: Property 'push' does not exist on type 'readonly []'` for an array
// and `TS2540: Cannot assign to 'a' because it is a read-only property` for an
// object (Issue #2013). These are the built-in methods that mutate their
// receiver rather than returning a fresh value, so a call to one of them is a
// write even though no assignment target names the binding.
const MUTATING_METHOD_NAMES = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

/**
 * Climbs out of the wrappers that denote the same value as `node` — type
 * wrappers (`(X as any).push()`, `X!.push()`) and the `ChainExpression` an
 * optional access hangs on the outside of the whole chain (`delete X?.a`). The
 * role a node plays in its statement is decided by the outermost such wrapper,
 * so a classifier that reads `node.parent` directly answers for the wrapper
 * instead of the access.
 */
const outermostValueOf = (node: TSESTree.Node): TSESTree.Node => {
  let current = node;
  for (;;) {
    const parent: TSESTree.Node | undefined = current.parent;
    if (
      parent &&
      ((isValueWrapper(parent) && parent.expression === current) ||
        (parent.type === AST_NODE_TYPES.ChainExpression &&
          parent.expression === current))
    ) {
      current = parent;
      continue;
    }
    return current;
  }
};

/**
 * The outermost property-access path rooted at `identifier`: `X` in `X.a.b`
 * yields the `X.a.b` member expression. Returns `null` when the identifier is
 * not the base of any access, which is every reference that merely reads the
 * binding as a value — `other.push(X)` passes it as an ARGUMENT, so the
 * mutation happens to `other`, not to `X`.
 *
 * The climb stops at the first parent that is not a member access on the
 * current node, so `X.map(f).push(1)` yields `X.map`: the mutated receiver
 * there is the array `map` returned, not `X`.
 */
const accessPathOf = (
  identifier: TSESTree.Node,
): TSESTree.MemberExpression | null => {
  let current: TSESTree.Node = outermostValueOf(identifier);
  let path: TSESTree.MemberExpression | null = null;

  for (;;) {
    const parent: TSESTree.Node | undefined = current.parent;
    if (
      !parent ||
      parent.type !== AST_NODE_TYPES.MemberExpression ||
      parent.object !== current
    ) {
      return path;
    }
    path = parent;
    current = outermostValueOf(parent);
  }
};

/** The property name an access reads, for `X.push` and `X['push']` alike. */
const accessedPropertyName = (
  path: TSESTree.MemberExpression,
): string | null => {
  if (!path.computed && path.property.type === AST_NODE_TYPES.Identifier) {
    return path.property.name;
  }
  if (
    path.computed &&
    path.property.type === AST_NODE_TYPES.Literal &&
    typeof path.property.value === 'string'
  ) {
    return path.property.value;
  }
  return null;
};

const isMutatingMethodCall = (path: TSESTree.MemberExpression): boolean => {
  const propertyName = accessedPropertyName(path);
  if (propertyName === null || !MUTATING_METHOD_NAMES.has(propertyName)) {
    return false;
  }
  const callee = outermostValueOf(path);
  return (
    callee.parent?.type === AST_NODE_TYPES.CallExpression &&
    callee.parent.callee === callee
  );
};

/**
 * The mutating methods that INSERT a value into the receiver, mapped to the
 * argument positions that value can occupy.
 *
 * The positions are carried per method rather than taken as "every argument",
 * because two of these spend leading or trailing arguments on INDICES:
 * `splice(start, deleteCount, ...items)` inserts from the third argument on,
 * and `fill(value, start, end)` inserts at the first alone.
 *
 * `sort`, `reverse`, `pop`, `shift` and `copyWithin` are absent because they
 * insert nothing — they reorder, remove or copy elements the receiver already
 * holds, so no element type can reject what they write. (`sort`'s argument is a
 * comparator function, `copyWithin`'s three are indices.)
 */
const INSERTED_VALUE_POSITIONS_BY_METHOD = new Map<
  string,
  { first: number; last?: number }
>([
  ['push', { first: 0 }],
  ['unshift', { first: 0 }],
  ['splice', { first: 2 }],
  ['fill', { first: 0, last: 0 }],
]);

/**
 * Whether a mutating call INTRODUCES a value the receiver's element type would
 * have to accept from outside the constant.
 *
 * This is the question that decides a mutating call through a receiver-array
 * parameter the lib declares MUTABLE, where no readonly violation is possible
 * and the only way the assertion can break the call is by narrowing what the
 * array accepts — see `MUTABLE_ARRAY_PARAMETER_METHODS`. Three answers, and the
 * boundary sits between the second and the third:
 *
 * - a method that inserts nothing (`arr.sort()`) cannot narrow-break, because
 *   it writes back only elements the receiver already holds;
 * - an inserted value that is a REFERENCE to a binding already enrolled for
 *   this constant (`arr.push(item)`, where `item` is the element the callback
 *   was handed) is typed from the constant itself, so the assertion narrows the
 *   argument and the parameter together and the call keeps compiling;
 * - an inserted value from anywhere else (`arr.push({ n: 3 })`) is typed
 *   independently of the constant, so narrowing the element type can reject it:
 *   TS2322 for an input that compiled (Issue #2340).
 *
 * A SPREAD argument is treated as introducing a foreign value even when it
 * spreads the constant. Its elements do satisfy the narrowed type, so this
 * withholds the assertion from a call that would have compiled — the cheap
 * error of the two, and the one this predicate exists to prefer.
 */
const introducesForeignElement = (
  path: TSESTree.MemberExpression,
  isEnrolledReference: (node: TSESTree.Node) => boolean,
): boolean => {
  const method = accessedPropertyName(path);
  const positions =
    method === null
      ? undefined
      : INSERTED_VALUE_POSITIONS_BY_METHOD.get(method);
  if (!positions) {
    return false;
  }

  const call = outermostValueOf(path).parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  const last = positions.last ?? call.arguments.length - 1;
  return call.arguments
    .slice(positions.first, last + 1)
    .some((argument) => !isEnrolledReference(argument));
};

/**
 * Whether `node` sits in a position that writes to it: the left of an
 * assignment (plain or compound), the operand of `++`/`--` or `delete`, the
 * loop variable of `for…in`/`for…of`, or a slot in a destructuring assignment
 * target (`[X.a] = […]`, `({ p: X.a } = …)`).
 */
const isWriteTarget = (node: TSESTree.Node): boolean => {
  const value = outermostValueOf(node);
  const parent = value.parent;

  if (!parent) {
    return false;
  }

  switch (parent.type) {
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.left === value;
    case AST_NODE_TYPES.UpdateExpression:
      return parent.argument === value;
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator === 'delete' && parent.argument === value;
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
      return parent.left === value;
    // Destructuring targets nest, so the answer belongs to the pattern's own
    // position. The same node types appear in ObjectExpression/ArrayExpression
    // VALUES, where the recursion reaches a non-assignment parent and stops.
    case AST_NODE_TYPES.ArrayPattern:
    case AST_NODE_TYPES.ObjectPattern:
    case AST_NODE_TYPES.Property:
    case AST_NODE_TYPES.RestElement:
    case AST_NODE_TYPES.AssignmentPattern:
      return isWriteTarget(parent);
    default:
      return false;
  }
};

/**
 * The composite literal a reference is STORED INTO — the object in
 * `{ items: ITEMS }`, the array in `[ITEMS]` — or null for every other
 * position.
 *
 * Storing a reference does not copy it: the same array stays reachable through
 * the container, so `holder.items.push(3)` writes through to the binding
 * exactly as a direct alias does, and freezing it raises the same TS2339. A
 * `SpreadElement` is excluded because it builds a fresh VALUE
 * (`const COPY = [...ITEMS]`) — it is not excluded from the walk entirely,
 * because the copy still carries the constant's frozen TYPE, which
 * `copyExpressionOf` handles. A computed key is excluded because it coerces
 * the reference to a property name rather than retaining it.
 */
const storageContainerOf = (node: TSESTree.Node): TSESTree.Node | null => {
  const parent = node.parent;
  if (!parent) {
    return null;
  }

  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.value === node &&
    parent.parent?.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return parent.parent;
  }

  if (
    parent.type === AST_NODE_TYPES.ArrayExpression &&
    parent.elements.some((element) => element === node)
  ) {
    return parent;
  }

  return null;
};

/**
 * The declarator a reference initializes IN WHOLE — `OTHER` in
 * `const OTHER = ITEMS` — or null for every other position. Such a declaration
 * introduces a second name for one value, so whatever is done to that name is
 * done to this binding.
 *
 * Type wrappers are climbed because they annotate a value without replacing it:
 * `const OTHER = ITEMS!` and `const OTHER = ITEMS satisfies T` denote the same
 * array as the bare form, and each breaks the same way once it is frozen. A
 * cast that erases the element type (`ITEMS as any`) is climbed on the same
 * terms, which withholds the assertion from a mutation the compiler would have
 * tolerated — staying silent is the cheap error here, emitting a fix that stops
 * the file compiling is not.
 *
 * A reference STORED INTO a composite literal is followed through that
 * container, since storing does not copy — see `storageContainerOf`.
 *
 * A destructuring id is accepted in BOTH spellings. It does not name the whole
 * value, but every binding it introduces is typed from that value, and a rest
 * element is itself a fresh container the assertion narrows: `const [, ...rest]
 * = ITEMS` gives `rest` the frozen element type, so `rest.push(4)` is TS2345
 * for an input that compiled. Admitting only the object spelling gave the same
 * construct opposite verdicts (#2336).
 */
const aliasDeclaratorOf = (
  identifier: TSESTree.Node,
): TSESTree.VariableDeclarator | null => {
  // Ascends strictly, so reaching a node with no parent terminates the walk.
  let value = outermostValueOf(identifier);

  for (;;) {
    const declarator = value.parent;

    if (
      declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
      declarator.init === value &&
      (declarator.id.type === AST_NODE_TYPES.Identifier ||
        declarator.id.type === AST_NODE_TYPES.ObjectPattern ||
        declarator.id.type === AST_NODE_TYPES.ArrayPattern)
    ) {
      return declarator;
    }

    const container = storageContainerOf(value);
    if (!container) {
      return null;
    }

    value = outermostValueOf(container);
  }
};

/**
 * Whether a callee spells `Object.assign`, in either the dotted or the
 * bracketed form — read through `accessedPropertyName` so the two spellings
 * cannot diverge from how the mutation walk already reads a method name.
 */
const isNamespacedCallee = (
  callee: TSESTree.Node,
  namespace: string,
  method: string,
): boolean => {
  const value = outermostValueOf(callee);
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    value.object.type === AST_NODE_TYPES.Identifier &&
    value.object.name === namespace &&
    accessedPropertyName(value) === method
  );
};

const isObjectAssignCallee = (callee: TSESTree.Node): boolean =>
  isNamespacedCallee(callee, 'Object', 'assign');

/** Whether a callee is the bare global `structuredClone`. */
const isStructuredCloneCallee = (callee: TSESTree.Node): boolean => {
  const value = outermostValueOf(callee);
  return (
    value.type === AST_NODE_TYPES.Identifier && value.name === 'structuredClone'
  );
};

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.TSDeclareFunction,
]);

/**
 * The identifier an ACCESS PATH is rooted at — `x` for `x`, `x.n`, `x.a[0]`,
 * `x?.n` and `x!.n` alike — or the expression itself when it is not an access
 * path at all. Descends through the wrappers `outermostValueOf` climbs out of,
 * so the root cannot depend on which type syntax annotates a step of the path.
 */
const accessPathRootOf = (node: TSESTree.Node): TSESTree.Node => {
  let current = unwrapValueWrappers(node);
  for (;;) {
    if (current.type === AST_NODE_TYPES.ChainExpression) {
      current = unwrapValueWrappers(current.expression);
      continue;
    }
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = unwrapValueWrappers(current.object);
      continue;
    }
    return current;
  }
};

/**
 * Every name a binding PATTERN introduces — `x`, `{ n }`, `{ n: value }`,
 * `[head]`, `{ n, ...rest }` and every nesting of them.
 *
 * Destructuring and member access are two spellings of ONE extraction, so a
 * name a pattern binds carries the constant's frozen type exactly as an access
 * path rooted at the parameter does. `as const` freezes in depth, so
 * `({ n }) => n` over a frozen `[{ n: 1 }, { n: 2 }]` yields `(1 | 2)[]` and a
 * later `push(3)` is TS2345 for an input that compiled (Issue #2349). The two
 * spellings were already reconciled for the constant's own bindings by
 * `collectUnfrozenPatternNames` (Issue #2341); a callback's parameter is that
 * same question asked one level in.
 *
 * A name carrying a DEFAULT is collected on the same terms even though the
 * default widens what the name is typed as — `({ n = 5 }) => n` over a frozen
 * `[{ n: 1 }, { n: 2 }]` compiles a later `push(3)`, measured — because the
 * widening depends on the default's own type rather than on the pattern.
 * Reading the default would trade an over-decline, which costs one report, for
 * a `--fix` that stops the file compiling.
 */
const patternBoundNames = (
  pattern: TSESTree.Node,
  names: Set<string> = new Set(),
): Set<string> => {
  switch (pattern.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(pattern.name);
      break;
    case AST_NODE_TYPES.ObjectPattern:
      for (const property of pattern.properties) {
        patternBoundNames(
          property.type === AST_NODE_TYPES.Property
            ? property.value
            : property.argument,
          names,
        );
      }
      break;
    case AST_NODE_TYPES.ArrayPattern:
      for (const element of pattern.elements) {
        // An array pattern holds a HOLE for each skipped position
        // (`([, second]) => second`), which binds no name.
        if (element) {
          patternBoundNames(element, names);
        }
      }
      break;
    case AST_NODE_TYPES.AssignmentPattern:
      patternBoundNames(pattern.left, names);
      break;
    case AST_NODE_TYPES.RestElement:
      patternBoundNames(pattern.argument, names);
      break;
    default:
      break;
  }
  return names;
};

/**
 * Every value a function hands back: its expression body, or the argument of
 * each `return` in its block.
 *
 * Descent stops at a nested function, whose `return` answers for THAT function
 * rather than this one — the same boundary `ASTHelpers.hasReturnStatement`
 * keeps, for the same reason.
 */
const returnedValuesOf = (
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): TSESTree.Node[] => {
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [callback.body];
  }

  const returned: TSESTree.Node[] = [];
  const visit = (node: TSESTree.Node): void => {
    if (FUNCTION_TYPES.has(node.type)) {
      return;
    }
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      if (node.argument) {
        returned.push(node.argument);
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') {
        continue;
      }
      for (const child of Array.isArray(value) ? value : [value]) {
        if (ASTHelpers.isNode(child)) {
          visit(child);
        }
      }
    }
  };
  visit(callback.body);
  return returned;
};

/**
 * Whether a returned expression carries the type of the element bound by
 * `elementNames` into what the callback hands back.
 *
 * An access path rooted at one of those names is the base case. Beyond it the
 * descent follows the positions whose types COMPOSE the result's, each measured
 * to break a build under `--fix` when it is refused:
 *
 * - the branches of a conditional or a logical operator, and a sequence's LAST
 *   expression, which are the alternatives the result's union is taken over, so
 *   `(x) => (x.n > 0 ? x.n : x.m)` is TS2345 on a later `push`. A whole
 *   `ConditionalExpression` is one atomic returned value, so without this arm
 *   neither branch is ever tested against the element even though both are
 *   access paths rooted at it;
 * - the elements of an array literal and the values and spreads of an object
 *   literal, which the container's element and property types are read from, so
 *   `(x) => [x]` and `(x) => ({ ...x })` are both TS2322 on a later `push`;
 * - the operand of an `await`, which unwraps rather than widens, so
 *   `async (x) => await x.n` hands back `Promise<1 | 2>` and pushing
 *   `Promise.resolve(3)` is TS2345.
 *
 * The TEST of a conditional is excluded: its type decides which branch runs,
 * not what the expression is typed as. A function LITERAL is not descended into
 * either, keeping the boundary `returnedValuesOf` draws. Neither is a template
 * literal, an arithmetic operand or a call: those COMPUTE, widening to
 * `string`/`number`/the callee's own return type whatever the receiver holds,
 * so the assertion reaches nothing through them and the report stands.
 */
const carriesElementType = (
  value: TSESTree.Node,
  elementNames: ReadonlySet<string>,
): boolean => {
  // The root is taken first so the answer is decided on the value ITSELF rather
  // than on the type syntax or member steps wrapped around it: `({ ...x }).n`
  // and `[x][0]` carry the element as surely as `x.n` does.
  const root = accessPathRootOf(value);

  if (root.type === AST_NODE_TYPES.Identifier) {
    return elementNames.has(root.name);
  }

  const carries = (node: TSESTree.Node | null | undefined): boolean =>
    !!node && carriesElementType(node, elementNames);

  switch (root.type) {
    case AST_NODE_TYPES.ConditionalExpression:
      return carries(root.consequent) || carries(root.alternate);
    case AST_NODE_TYPES.LogicalExpression:
      return carries(root.left) || carries(root.right);
    case AST_NODE_TYPES.SequenceExpression:
      return carries(root.expressions[root.expressions.length - 1]);
    case AST_NODE_TYPES.ArrayExpression:
      return root.elements.some((element) => carries(element));
    case AST_NODE_TYPES.ObjectExpression:
      return root.properties.some((property) =>
        carries(
          property.type === AST_NODE_TYPES.Property
            ? property.value
            : property.argument,
        ),
      );
    case AST_NODE_TYPES.SpreadElement:
      return carries(root.argument);
    case AST_NODE_TYPES.AwaitExpression:
      return carries(root.argument);
    default:
      return false;
  }
};

/**
 * Whether a callback hands back the value it is given at `elementIndex`, or a
 * value the element's type reaches — see `carriesElementType`.
 *
 * This is what decides whether a `map`-shaped call keeps the receiver's element
 * type. `(x) => x.n` over a frozen `[{ n: 1 }]` yields `1[]` rather than
 * `number[]`, so `ns.push(3)` is TS2345 for an input that compiled — and that
 * mapper is the commonest one written, not the no-op spelling the exclusion was
 * justified against (Issue #2342). A callback that COMPUTES (`(x) => x * 2`,
 * `() => Math.random()`) widens, carries nothing of the constant into its
 * result, and keeps its report.
 *
 * The element is matched by the NAMES its parameter BINDS — every spelling of
 * the pattern, not the Identifier spelling alone, which read `({ n }) => n` as
 * a callback that computes and froze the constant under it (Issue #2349). The
 * match is by name within the callback's own body, the single span this
 * question is asked over, because a derivation resolver is handed a node and no
 * scope. A name a nested function rebinds is unreachable — descent stops at
 * every function boundary — so the worst a shadow can do is withhold the
 * assertion from a call that would have kept it, the cheap error of the two.
 *
 * ANY returned value carrying the element is enough. Branches returning
 * different things widen their union, so the assertion may then reach nothing
 * and the withhold costs a report; demanding EVERY branch would instead ship a
 * `--fix` that stops the file compiling.
 */
const returnsHandedElement = (
  callback: TSESTree.Node | undefined,
  elementIndex: number,
): boolean => {
  if (!callback || !isFunctionValue(callback)) {
    return false;
  }
  const parameter = callback.params[elementIndex];
  if (!parameter) {
    return false;
  }
  const elementNames = patternBoundNames(parameter);
  if (elementNames.size === 0) {
    return false;
  }
  return returnedValuesOf(callback).some((value) =>
    carriesElementType(value, elementNames),
  );
};

/**
 * The position the receiver's element arrives in for `Array.from`'s mapper.
 *
 * Named because the mapper is the SECOND argument while its element is the
 * first parameter, so two different zeroes and ones sit beside each other here.
 */
const ARRAY_FROM_MAPPER_ELEMENT_INDEX = 0;

/**
 * Whether a call COPIES the argument at `index` while keeping its type.
 *
 * `Array.from(X)` and `structuredClone(X)` both hand back a fresh, mutable
 * value whose element or property types are the argument's — so freezing the
 * argument narrows the copy exactly as a spread does.
 *
 * `Array.from(X, fn)` is decided per CALL for the reason `map` is: a mapper
 * that hands back the element or a property of it keeps the frozen type, so
 * `Array.from(ITEMS, (x) => x.n)` is TS2345 on a later `push` for an input that
 * compiled, while a mapper that COMPUTES widens and carries nothing.
 */
const isCopyingCall = (
  call: TSESTree.CallExpression,
  index: number,
): boolean => {
  if (isObjectAssignCallee(call.callee)) {
    return true;
  }
  if (index !== 0) {
    return false;
  }
  if (isStructuredCloneCallee(call.callee)) {
    return true;
  }
  if (isNamespacedCallee(call.callee, 'Array', 'from')) {
    return (
      call.arguments.length === 1 ||
      returnsHandedElement(call.arguments[1], ARRAY_FROM_MAPPER_ELEMENT_INDEX)
    );
  }
  return false;
};

/**
 * The copying array methods whose result is typed from a CALLBACK, mapped to
 * the position the receiver's element arrives in.
 *
 * They are carried apart from `TYPE_PRESERVING_COPY_METHODS` because the
 * question they raise is answered per CALL rather than per method — see
 * `returnsHandedElement`.
 *
 * `flatMap` sits beside `map` because flattening one level changes the SHAPE of
 * the result, not the types it is composed from: a mapper handing back an array
 * literal of the element contributes that element's type to the result exactly
 * as a bare return does, so `ITEMS.flatMap((x) => [x.n])` is TS2345 on a later
 * `push` and `(x) => [x]` is TS2322, both for inputs that compiled (Issue
 * #2350). `carriesElementType` already reads through the returned literal, so
 * the array-wrapped and bare spellings are decided on the same terms.
 */
const CALLBACK_TYPED_COPY_METHODS = new Map<string, number>([
  ['map', 0],
  ['flatMap', 0],
]);

/**
 * Array methods whose result keeps the receiver's ELEMENT type WHATEVER the
 * call spells: nothing they are passed can retype what they hand back.
 *
 * `map` is carried separately rather than absent — see
 * `CALLBACK_TYPED_COPY_METHODS`.
 */
const TYPE_PRESERVING_COPY_METHODS = new Set([
  'concat',
  'slice',
  'filter',
  'flat',
  // The ES2023 copying methods. Listed even though this repo's TypeScript
  // predates them, because they are the same category and admitting them costs
  // nothing: a name that does not resolve produces no reports to lose.
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
]);

/**
 * The expression that builds a COPY carrying this value's type — the literal
 * around a spread of it, the call of a copying array method on it, or an
 * `Object.assign` it feeds.
 *
 * A copy is a fresh, mutable value, which is why `storageContainerOf` refuses
 * it: writing to the copy cannot write through to the constant. But `as const`
 * changes the constant's TYPE as well as its mutability, and a copy inherits
 * that type — `[...ITEMS]` of a frozen `readonly [1, 2]` is `(1 | 2)[]`, so
 * `COPY.push(3)` is TS2345 for an input that compiled. The copy is therefore
 * followed for exactly the same question the alias walk asks: is the derived
 * binding written?
 */
const copyExpressionOf = (node: TSESTree.Node): TSESTree.Node | null => {
  const parent = node.parent;
  if (!parent) {
    return null;
  }

  if (
    parent.type === AST_NODE_TYPES.SpreadElement &&
    parent.argument === node &&
    (parent.parent?.type === AST_NODE_TYPES.ObjectExpression ||
      parent.parent?.type === AST_NODE_TYPES.ArrayExpression)
  ) {
    return parent.parent;
  }

  if (parent.type === AST_NODE_TYPES.CallExpression) {
    const index = parent.arguments.indexOf(
      node as TSESTree.CallExpressionArgument,
    );
    if (index !== -1 && isCopyingCall(parent, index)) {
      return parent;
    }
  }

  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === node
  ) {
    const method = accessedPropertyName(parent);
    const callee = outermostValueOf(parent);
    // A method REFERENCE (`const take = ITEMS.concat;`) builds nothing, so the
    // copy only exists once the method is actually called.
    if (
      method === null ||
      callee.parent?.type !== AST_NODE_TYPES.CallExpression ||
      callee.parent.callee !== callee
    ) {
      return null;
    }
    if (TYPE_PRESERVING_COPY_METHODS.has(method)) {
      return callee.parent;
    }
    const elementIndex = CALLBACK_TYPED_COPY_METHODS.get(method);
    return elementIndex !== undefined &&
      returnsHandedElement(callee.parent.arguments[0], elementIndex)
      ? callee.parent
      : null;
  }

  return null;
};

/**
 * Array methods whose result is an ELEMENT of the receiver rather than a fresh
 * array over it.
 *
 * `as const` freezes in depth, so the element they hand back carries the
 * assertion exactly as one reached by index does: `const first = ITEMS.at(0)!;
 * first.n = 2;` is TS2540 once `ITEMS` is frozen, for an input that compiled
 * (Issue #2341). They belong with the element family rather than with
 * `TYPE_PRESERVING_COPY_METHODS`, whose members hand back a container.
 */
const ELEMENT_RETURNING_METHODS = new Set(['at', 'find', 'findLast']);

/**
 * The folds whose result is an element of the receiver, in the SEEDLESS
 * spelling alone.
 *
 * `ITEMS.reduce((a, b) => b)` is typed `T` because the overload without an
 * initial value takes the first element as the seed. Given a seed the result is
 * typed from THAT value, which the constant need not have given —
 * `NUMS.reduce((sum, n) => sum + n, 0)` is `number` however `NUMS` is frozen —
 * so enrolling the seeded spelling would withhold the assertion for a break
 * that cannot happen.
 */
const ELEMENT_FOLD_METHODS = new Set(['reduce', 'reduceRight']);

/** The call that hands back an ELEMENT of this value — see the two sets above. */
const elementExpressionOf = (
  node: TSESTree.Node,
): TSESTree.CallExpression | null => {
  const parent = node.parent;
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== node
  ) {
    return null;
  }

  const method = accessedPropertyName(parent);
  if (method === null) {
    return null;
  }

  const callee = outermostValueOf(parent);
  const call = callee.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.callee !== callee) {
    return null;
  }

  return ELEMENT_RETURNING_METHODS.has(method) ||
    (ELEMENT_FOLD_METHODS.has(method) && call.arguments.length === 1)
    ? call
    : null;
};

/** Pattern nodes a parameter's binding can be nested inside. */
const PATTERN_CONTAINERS = new Set<string>([
  AST_NODE_TYPES.AssignmentPattern,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.ObjectPattern,
  AST_NODE_TYPES.ArrayPattern,
  AST_NODE_TYPES.RestElement,
  // A parameter property is a parameter AND declares a class property, so it
  // infers twice over. Without it the walk stops before reaching the
  // constructor's params and `constructor(public stage = DEFAULT)` narrows.
  AST_NODE_TYPES.TSParameterProperty,
]);

/**
 * Whether a default value is what a PARAMETER's type is inferred FROM.
 *
 * Answered false in the two cases where freezing the default cannot change a
 * signature: the parameter carries a type annotation, so its type is declared
 * rather than inferred — looked for up the whole pattern, since a destructured
 * parameter carries it on the pattern (`({ distance = DEFAULT }: Props)`) and
 * a plain one on its binding (`(model: ModelName = DEFAULT)`) — or the default
 * belongs to a destructuring declaration rather than a parameter list, which
 * declares no signature at all.
 */
const isInferredParameterDefault = (pattern: TSESTree.Node): boolean => {
  let current: TSESTree.Node = pattern;
  for (;;) {
    if ((current as { typeAnnotation?: unknown }).typeAnnotation) {
      return false;
    }
    const parent: TSESTree.Node | undefined = current.parent;
    if (!parent) {
      return false;
    }
    if (FUNCTION_TYPES.has(parent.type)) {
      return (parent as TSESTree.FunctionLike).params.includes(
        current as TSESTree.Parameter,
      );
    }
    if (!PATTERN_CONTAINERS.has(parent.type)) {
      return false;
    }
    current = parent;
  }
};

/**
 * Whether a reference sits where TypeScript INFERS a type from it — a default
 * parameter or a class property initializer — reached directly or through a
 * composite literal it is stored into.
 *
 * `as const` does not only freeze: it makes the literal type NON-WIDENING, and
 * an inference site that widened `'ready'` to `string` then keeps the literal.
 * A parameter defaulted from the constant therefore narrows to that one value,
 * and every call passing a different one stops compiling (TS2345) for an input
 * that compiled. The mutation walk cannot see this: nothing is written, the
 * declaration is simply inferred from a value the assertion changes.
 *
 * Both sites are answered on the same terms, because an annotation is what
 * settles the question in each: a type written by hand is DECLARED, so nothing
 * infers from the value and freezing it cannot move the declaration. Only the
 * unannotated spelling narrows.
 *
 * A RETURN position infers in exactly the same way and is deliberately absent.
 * Declining there costs 59 of 778 consumer reports (7.6%) — the constant need
 * only be held in a literal that is returned — to prevent breaks that the
 * consumer does not contain, so it is documented as a limitation instead. The
 * comparable trade in #2330 was rejected at 5%.
 */
const isInferenceSite = (identifier: TSESTree.Node): boolean => {
  let value = outermostValueOf(identifier);
  for (;;) {
    const parent = value.parent;
    if (
      parent?.type === AST_NODE_TYPES.AssignmentPattern &&
      parent.right === value
    ) {
      return isInferredParameterDefault(parent.left);
    }

    // A class property's type is inferred from its initializer exactly as a
    // parameter's is from its default, so `session.stage = 'live'` becomes
    // TS2322 once the constant behind `stage = DEFAULT_STAGE` is frozen.
    if (
      (parent?.type === AST_NODE_TYPES.PropertyDefinition ||
        parent?.type === AST_NODE_TYPES.AccessorProperty) &&
      parent.value === value
    ) {
      return !parent.typeAnnotation;
    }

    const container = storageContainerOf(value);
    if (!container) {
      return false;
    }
    value = outermostValueOf(container);
  }
};

/**
 * Array methods that hand an ELEMENT of the receiver to a callback, mapped to
 * the parameter position that element arrives in.
 *
 * The position is carried per method rather than assumed to be the first,
 * because `reduce`/`reduceRight` pass the accumulator first and the element
 * second: a walk keyed on the first parameter would enrol a binding typed from
 * the seed value and miss the one typed from the constant (Issue #2338).
 *
 * The INDEX parameter is absent from every map here, and from nothing else:
 * it is a `number` whatever the receiver holds, so nothing the assertion
 * changes reaches it. The parameter AFTER the index is a different matter —
 * see `ARRAY_PARAMETER_INDEX_BY_METHOD`.
 */
const ELEMENT_PARAMETER_INDEX_BY_METHOD = new Map<string, number>([
  ['forEach', 0],
  ['map', 0],
  ['filter', 0],
  ['find', 0],
  ['findIndex', 0],
  ['findLast', 0],
  ['findLastIndex', 0],
  ['some', 0],
  ['every', 0],
  ['flatMap', 0],
  ['reduce', 1],
  ['reduceRight', 1],
]);

/**
 * The same methods, mapped to the position the RECEIVER ARRAY arrives in.
 *
 * That parameter is a second name for the iterated value itself, so a mutating
 * call through it writes to the constant:
 * `ITEMS.forEach((item, index, arr) => { arr.push(2); })` is TS2339 once
 * `ITEMS` is frozen, for an input that compiled — the identical call written
 * directly as `ITEMS.push(2)` is one the rule already declines for, so only the
 * handed-node spelling escapes it (Issue #2339).
 *
 * The position is carried apart from the element's because the two are enrolled
 * on different terms rather than because they differ by one: an element keeps
 * the constant's type through every derivation the iteration walk follows,
 * while the receiver is the constant only when the iteration reads the
 * constant's own value or member path — see `iterationBindingsOf`.
 * `reduce`/`reduceRight` push it to fourth, having spent the first position on
 * the accumulator.
 *
 * `flatMap` is listed for its ELEMENTS alone. Its lib signature declares the
 * parameter `T[]` where every sibling declares it `readonly T[]` — measured
 * against `lib.es2020` — so `arr[0].n = 2` inside a `flatMap` callback is
 * TS2540 for an input that compiled, while a mutating method called through the
 * parameter compiles unchanged. `MUTABLE_ARRAY_PARAMETER_METHODS` carries that
 * second half, which enrolment alone cannot express (Issue #2340).
 */
const ARRAY_PARAMETER_INDEX_BY_METHOD = new Map<string, number>([
  ['forEach', 2],
  ['map', 2],
  ['filter', 2],
  ['find', 2],
  ['findIndex', 2],
  ['findLast', 2],
  ['findLastIndex', 2],
  ['some', 2],
  ['every', 2],
  ['flatMap', 2],
  ['reduce', 3],
  ['reduceRight', 3],
]);

/**
 * The methods above whose receiver-array parameter is declared MUTABLE `T[]`.
 *
 * Enrolling that parameter answers two questions at once, and each needs its own
 * answer. Its ELEMENTS are frozen with the constant, so an element write through
 * it is TS2540 and the assertion is withheld. A mutating METHOD through it is no
 * readonly violation at all — the declared type is mutable, so there is no
 * TS2339 to have — and withholding the assertion for one costs a report for a
 * break that does not happen: `ITEMS.flatMap((x, i, arr) => { arr.sort(); return
 * [x]; })` and the `arr.push(x)` spelling both compile under the assertion,
 * measured by appending it by hand and reading the checker.
 *
 * What such a call CAN break is assignability, and only by introducing a value
 * from outside the constant: `arr.push({ n: 3 })` is TS2322 once the assertion
 * narrows the element type. That is decided per CALL by
 * `introducesForeignElement`, not per method — an exemption keyed on the method
 * alone would trade two over-declines for a `--fix` that stops the file
 * compiling, which is the defect this walk exists to prevent (Issue #2340).
 */
const MUTABLE_ARRAY_PARAMETER_METHODS = new Set(['flatMap']);

/**
 * The `Object.values(X)` / `Object.entries(X)` call this value feeds — a fresh
 * array whose ELEMENTS are the constant's own property values, so freezing the
 * constant retypes them exactly as it retypes an array's elements.
 *
 * It is not a copy in `copyExpressionOf`'s sense: the result has a different
 * shape from the argument, so a write to the array itself says nothing about
 * the constant. It is resolved here instead, where only the ITERATION question
 * is asked and a decline still requires a write through the element binding.
 *
 * `Object.keys` is absent because its result is `string[]` whatever the
 * argument's type, so the assertion cannot reach a binding taken from it.
 */
const elementProjectionCallOf = (
  node: TSESTree.Node,
): TSESTree.CallExpression | null => {
  const parent = node.parent;
  if (
    parent?.type !== AST_NODE_TYPES.CallExpression ||
    parent.arguments[0] !== node
  ) {
    return null;
  }
  return isNamespacedCallee(parent.callee, 'Object', 'values') ||
    isNamespacedCallee(parent.callee, 'Object', 'entries')
    ? parent
    : null;
};

/**
 * Constructors that build a collection out of the argument's ELEMENTS.
 *
 * `new Set(ITEMS)` holds the constant's own contents, so iterating it hands out
 * the frozen elements and `for (const item of new Set(ITEMS)) { item.n = 2; }`
 * is TS2540 for an input that compiled (Issue #2340).
 *
 * The construction is not a copy in `copyExpressionOf`'s sense — the result has
 * a different shape from the argument, so a write to the collection says
 * nothing about the constant — which is why it is resolved here, where only the
 * ITERATION question is asked. `WeakSet`/`WeakMap` are absent because they are
 * not iterable, so no binding can be taken from one.
 */
const ELEMENT_PRESERVING_COLLECTION_NAMES = new Set(['Set', 'Map']);

/** Whether an expression CONSTRUCTS one of those collections. */
const isElementPreservingCollection = (node: TSESTree.Node): boolean => {
  const value = unwrapValueWrappers(node);
  if (value.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  const callee = unwrapValueWrappers(value.callee);
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    ELEMENT_PRESERVING_COLLECTION_NAMES.has(callee.name)
  );
};

const elementCollectionOf = (
  node: TSESTree.Node,
): TSESTree.NewExpression | null => {
  const parent = node.parent;
  return parent?.type === AST_NODE_TYPES.NewExpression &&
    parent.arguments[0] === node &&
    isElementPreservingCollection(parent)
    ? parent
    : null;
};

/**
 * Array methods whose result ITERATES the receiver's own elements.
 *
 * The result is an iterator rather than an array, which is why it belongs to
 * neither of the maps the walk already reads: nothing is copied, so
 * `TYPE_PRESERVING_COPY_METHODS` refuses it, and nothing is handed to a
 * callback, so `ELEMENT_PARAMETER_INDEX_BY_METHOD` refuses it too. Every
 * binding taken from it still carries the constant's element type, so
 * `for (const item of ITEMS.values()) { item.n = 2; }` is TS2540 once `ITEMS`
 * is frozen, for an input that compiled (Issue #2340). `entries` yields
 * `[index, element]` pairs, which carry the element exactly as `values` does.
 *
 * `keys` is absent for an ARRAY receiver, for the reason `Object.keys` is: it
 * yields INDICES, numbers whatever the receiver holds, which the assertion
 * cannot reach.
 */
const ELEMENT_ITERATOR_METHODS = new Set(['values', 'entries']);

/**
 * The same methods for a Set/Map receiver, where `keys` joins them.
 *
 * `Set.prototype.keys` is an alias for `values`, and a `Map`'s hands back the
 * frozen key of each entry, so `for (const item of new Set(ITEMS).keys()) {
 * item.n = 2; }` is TS2540 once `ITEMS` is frozen, for an input that compiled
 * — while the `for…of` and `forEach` spellings over the same `new Set(ITEMS)`
 * already decline (Issue #2341). One set per receiver, because a single set
 * would decide the two receivers by the same name and be wrong for one of them.
 *
 * The receiver is read syntactically: the collection this iterator is reached
 * through is the `new Set(ITEMS)` expression the derivation walk just resolved.
 */
const COLLECTION_ELEMENT_ITERATOR_METHODS = new Set([
  'values',
  'entries',
  'keys',
]);

const iteratorProjectionCallOf = (
  node: TSESTree.Node,
): TSESTree.CallExpression | null => {
  const parent = node.parent;
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== node
  ) {
    return null;
  }

  const method = accessedPropertyName(parent);
  const iteratorMethods = isElementPreservingCollection(node)
    ? COLLECTION_ELEMENT_ITERATOR_METHODS
    : ELEMENT_ITERATOR_METHODS;
  if (method === null || !iteratorMethods.has(method)) {
    return null;
  }

  // A method REFERENCE (`const walk = ITEMS.values;`) iterates nothing, so the
  // iterator exists only once the method is called — the same terms
  // `copyExpressionOf` reads a copy on.
  const callee = outermostValueOf(parent);
  return callee.parent?.type === AST_NODE_TYPES.CallExpression &&
    callee.parent.callee === callee
    ? callee.parent
    : null;
};

/**
 * The expressions a reference denotes a FROZEN value through: the reference
 * itself and every property access rooted at it — `CONFIG`, `CONFIG.list`,
 * `CONFIG.list.rows` for `CONFIG.list.rows`.
 *
 * `as const` freezes the value in depth, so a property of the constant carries
 * the assertion exactly as the constant does, and an iteration is routinely
 * reached through one (`CONFIG.list.values()`, `Array.from(CONFIG.list, fn)`).
 * A derivation resolver reads a node's immediate parent, so it sees only the
 * innermost access unless each step of the path is offered to it in turn
 * (Issue #2340).
 */
const accessPathsRootedAt = (identifier: TSESTree.Node): TSESTree.Node[] => {
  const paths: TSESTree.Node[] = [];
  let current: TSESTree.Node = outermostValueOf(identifier);

  for (;;) {
    paths.push(current);
    const parent: TSESTree.Node | undefined = current.parent;
    if (
      !parent ||
      parent.type !== AST_NODE_TYPES.MemberExpression ||
      parent.object !== current
    ) {
      return paths;
    }
    current = outermostValueOf(parent);
  }
};

/**
 * Whether `as const` reaches INTO this value, or stops at the property that
 * holds it.
 *
 * The assertion retypes the literal it is written on: nested array and object
 * literals become `readonly`, and primitive literals narrow to their literal
 * type. A value the literal merely refers to keeps whatever type it already
 * had, and an explicit `as T` cast is exactly such a value — so
 * `{ items: [] as string[] } as const` freezes the `items` PROPERTY while
 * leaving the array it holds a mutable `string[]`.
 *
 * Only the cast is screened, because it is the one spelling that PROVES the
 * assertion cannot deepen. Anything else answers true, so an unrecognized value
 * is still enrolled and the walk keeps declining — the direction that withholds
 * an assertion rather than breaking a build (Issue #2341).
 */
const assertionDeepensInto = (node: TSESTree.Node): boolean => {
  if (
    node.type !== AST_NODE_TYPES.TSAsExpression &&
    node.type !== AST_NODE_TYPES.TSTypeAssertion
  ) {
    return true;
  }
  return (
    node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeAnnotation.typeName.name === 'const'
  );
};

/**
 * The value a single access step reads out of a literal, or `undefined` when
 * the step cannot be resolved statically.
 *
 * A spread makes an object literal's own properties an incomplete account of
 * what it holds, so a miss under one is unresolved rather than absent.
 */
const literalValueAtKey = (
  value: TSESTree.Node,
  key: string | number,
): TSESTree.Node | undefined => {
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    if (typeof key !== 'string') {
      return undefined;
    }
    let resolved: TSESTree.Node | undefined;
    for (const property of value.properties) {
      if (property.type === AST_NODE_TYPES.SpreadElement) {
        return undefined;
      }
      const propertyKey = property.key;
      const keyName =
        !property.computed && propertyKey.type === AST_NODE_TYPES.Identifier
          ? propertyKey.name
          : propertyKey.type === AST_NODE_TYPES.Literal &&
            typeof propertyKey.value === 'string'
          ? propertyKey.value
          : null;
      // The LAST matching key wins, as it does at runtime.
      if (keyName === key) {
        resolved = property.value;
      }
    }
    return resolved;
  }

  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    if (typeof key !== 'number') {
      return undefined;
    }
    const element = value.elements[key];
    return element === null ||
      element === undefined ||
      element.type === AST_NODE_TYPES.SpreadElement
      ? undefined
      : element;
  }

  return undefined;
};

/**
 * The value a single MEMBER ACCESS step reads out of a literal, or `undefined`
 * when the step cannot be resolved statically.
 *
 * Delegates to `literalValueAtKey` so a property reached by a member access and
 * the same property reached by a destructuring pattern cannot be read on
 * different terms — the divergence between those two spellings is what this
 * screen exists to close (Issue #2341).
 */
const literalValueAtStep = (
  value: TSESTree.Node,
  step: TSESTree.MemberExpression,
): TSESTree.Node | undefined => {
  const name = accessedPropertyName(step);
  if (name !== null) {
    return literalValueAtKey(value, name);
  }
  return step.computed &&
    step.property.type === AST_NODE_TYPES.Literal &&
    typeof step.property.value === 'number'
    ? literalValueAtKey(value, step.property.value)
    : undefined;
};

/**
 * The names a destructuring pattern binds to values `as const` does NOT reach.
 *
 * A pattern binds a property WITHOUT writing a member access, so the step
 * screen in `frozenAccessPathsRootedAt` never sees `const { items } = CONFIG`
 * — it only sees `CONFIG.items`. Reading the pattern against the same literal
 * keeps the two spellings of one extraction on identical terms. They must
 * agree: `prefer-destructuring-no-class` rewrites the first into the second
 * under `--fix`, so a screen applied to one spelling alone lets a sibling fixer
 * flip this rule's verdict on unchanged semantics (Issue #2341).
 *
 * A `RestElement` is left enrolled because it gathers whatever the pattern did
 * not name, which no single literal value answers for.
 */
const collectUnfrozenPatternNames = (
  id: TSESTree.Node,
  value: TSESTree.Node | undefined,
  unfrozen: Set<string>,
): void => {
  if (value === undefined) {
    return;
  }

  if (id.type === AST_NODE_TYPES.AssignmentPattern) {
    collectUnfrozenPatternNames(id.left, value, unfrozen);
    return;
  }

  if (id.type === AST_NODE_TYPES.Identifier) {
    if (!assertionDeepensInto(value)) {
      unfrozen.add(id.name);
    }
    return;
  }

  const literal = unwrapValueWrappers(value);

  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of id.properties) {
      if (property.type !== AST_NODE_TYPES.Property) {
        continue;
      }
      const key = property.key;
      const name =
        !property.computed && key.type === AST_NODE_TYPES.Identifier
          ? key.name
          : key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string'
          ? key.value
          : null;
      if (name === null) {
        continue;
      }
      collectUnfrozenPatternNames(
        property.value,
        literalValueAtKey(literal, name),
        unfrozen,
      );
    }
    return;
  }

  if (id.type === AST_NODE_TYPES.ArrayPattern) {
    id.elements.forEach((element, index) => {
      if (!element || element.type === AST_NODE_TYPES.RestElement) {
        return;
      }
      collectUnfrozenPatternNames(
        element,
        literalValueAtKey(literal, index),
        unfrozen,
      );
    });
  }
};

/**
 * An expression that denotes frozen contents, carried with the LITERAL it is
 * read out of when that is statically known.
 *
 * The literal travels with the node because the pattern screen needs it at the
 * point a declarator is found, and only the access-path walk can resolve it —
 * a value reached through a copy or an element call has no literal of its own.
 */
type FrozenValue = {
  node: TSESTree.Node;
  literal: TSESTree.Node | undefined;
};

/**
 * The access paths rooted at a reference that the assertion actually FREEZES,
 * read against the literal the constant is declared from.
 *
 * The climb stops before the first step whose value `as const` cannot deepen
 * into, because neither that value nor anything reached through it carries the
 * assertion — a binding taken from it is no second name for frozen contents and
 * enrolling it would withhold the assertion for a break that cannot happen.
 *
 * Without a literal to read, every step answers unresolved and the result is
 * the whole path, which is what `accessPathsRootedAt` returns on its own.
 */
const frozenAccessPathsRootedAt = (
  identifier: TSESTree.Node,
  frozenValue: TSESTree.Node | undefined,
): FrozenValue[] => {
  const paths: FrozenValue[] = [];
  let current: TSESTree.Node = outermostValueOf(identifier);
  let value: TSESTree.Node | undefined = frozenValue
    ? unwrapValueWrappers(frozenValue)
    : undefined;

  for (;;) {
    paths.push({ node: current, literal: value });
    const parent: TSESTree.Node | undefined = current.parent;
    if (
      !parent ||
      parent.type !== AST_NODE_TYPES.MemberExpression ||
      parent.object !== current
    ) {
      return paths;
    }

    if (value !== undefined) {
      const stepValue = literalValueAtStep(value, parent);
      if (stepValue === undefined) {
        value = undefined;
      } else if (!assertionDeepensInto(stepValue)) {
        return paths;
      } else {
        value = unwrapValueWrappers(stepValue);
      }
    }

    current = outermostValueOf(parent);
  }
};

/**
 * Every way a value derived from this one keeps the constant's ELEMENT types:
 * a copy of it, the `Object.values`/`Object.entries` array over it, the
 * iterator its own `values`/`entries` hands back, and the collection built out
 * of it. Each resolver returns an ANCESTOR of the node it is given, which is
 * what lets the iteration walk follow them transitively without looping.
 */
const DERIVATION_RESOLVERS: readonly ((
  node: TSESTree.Node,
) => TSESTree.Node | null)[] = [
  copyExpressionOf,
  elementProjectionCallOf,
  iteratorProjectionCallOf,
  elementCollectionOf,
];

/**
 * The derivations that carry the constant's frozen type into a value a BINDING
 * can be initialized from: a copy of it, an element taken out of it, and the
 * `Object.values`/`Object.entries` array over it.
 *
 * The projection is followed for the reason a COPY is, which is the TYPE half
 * of the question rather than the mutation half. Its container is fresh, so a
 * write to the container itself is no readonly violation — but its elements are
 * the constant's own frozen property values, so `const vs = Object.values(CONFIG);
 * vs.push({ n: 9 });` is TS2322 for an input that compiled, and the mapper
 * spelling `Object.values(CONFIG).map(({ n }) => n)` carries that same
 * narrowing on into the derived array (Issue #2349). `Object.keys` is already
 * absent from the resolver itself, its result being `string[]` whatever the
 * argument holds.
 *
 * The remaining iteration resolvers stay absent: an ITERATOR is not a value a
 * binding is written through, and `new Set(ITEMS)` reshapes the constant into a
 * collection whose own question the iteration walk asks.
 */
const ALIAS_DERIVATION_RESOLVERS: readonly ((
  node: TSESTree.Node,
) => TSESTree.Node | null)[] = [
  copyExpressionOf,
  elementExpressionOf,
  elementProjectionCallOf,
];

/**
 * Every expression that denotes a value typed from this reference: the
 * reference and each step of the access path rooted at it, then — transitively
 * — whatever `resolvers` derive from any of them.
 *
 * Grown in place and walked by index, so a derivation OF a derivation is
 * reached by the same loop without recursion of its own. Every resolver returns
 * an ANCESTOR of the node it is given, so the walk strictly ascends and
 * terminates; `visited` keeps a node two resolvers agree on from being expanded
 * twice.
 */
const derivedValueExpressionsOf = (
  identifier: TSESTree.Node,
  resolvers: readonly ((node: TSESTree.Node) => TSESTree.Node | null)[],
  frozenValue?: TSESTree.Node,
): FrozenValue[] => {
  const pending = frozenAccessPathsRootedAt(identifier, frozenValue);
  const visited = new Set<TSESTree.Node>(pending.map(({ node }) => node));

  for (let index = 0; index < pending.length; index += 1) {
    for (const resolveDerivation of resolvers) {
      const derived = resolveDerivation(pending[index].node);
      if (!derived || visited.has(derived)) {
        continue;
      }
      visited.add(derived);
      // A copy or an element call hands back a value with no literal of its
      // own, so nothing downstream of one is screened — the direction that
      // keeps enrolling rather than withholding the assertion.
      pending.push({ node: derived, literal: undefined });
    }
  }

  return pending;
};

/**
 * A binding the iteration walk enrols, carried with the question the assertion
 * can break it on.
 *
 * `breaksOnAnyMutatingMethod` is false for the one enrolment whose declared type
 * is MUTABLE — see `MUTABLE_ARRAY_PARAMETER_METHODS` — where a mutating call
 * breaks only if it introduces a foreign value. Every other binding carries the
 * constant's own readonly-ness, so any mutating call through it is a TS2339 and
 * it takes the whole battery of checks.
 */
type EnrolledBinding = {
  variable: TSESLint.Scope.Variable;
  breaksOnAnyMutatingMethod: boolean;
  /**
   * The literal this binding's value is read out of, when it is statically
   * known — the constant's own initializer for the constant itself. Carried so
   * an access path through the binding can be screened against what `as const`
   * actually freezes; absent means unresolved, and every step is then enrolled.
   */
  frozenValue?: TSESTree.Node;
};

const enrolFully = (
  variables: readonly TSESLint.Scope.Variable[],
): EnrolledBinding[] =>
  variables.map((variable) => ({
    variable,
    breaksOnAnyMutatingMethod: true,
  }));

/**
 * The bindings a callback's parameters at `positions` introduce, each carrying
 * the question its position can break on.
 *
 * A callback routinely declares fewer parameters than the caller passes, so a
 * position is taken only where the signature actually spells it.
 *
 * The scope manager answers for the WHOLE function — every parameter, and a
 * function expression's own name — so the enrolled parameters' bindings are
 * picked out by the spans they are declared in. Taking the function's list
 * whole would enrol the accumulator of a `reduce`, typed from the seed value
 * rather than from the constant, and the index, which the assertion cannot
 * reach.
 */
const parameterBindingsOf = (
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  positions: readonly { index: number; breaksOnAnyMutatingMethod: boolean }[],
  declaredVariablesOf: (
    node: TSESTree.Node,
  ) => readonly TSESLint.Scope.Variable[],
): readonly EnrolledBinding[] => {
  const enrolled = positions.flatMap(({ index, breaksOnAnyMutatingMethod }) => {
    const param = callback.params[index];
    return param ? [{ param, breaksOnAnyMutatingMethod }] : [];
  });

  if (enrolled.length === 0) {
    return [];
  }

  return declaredVariablesOf(callback).flatMap((variable) => {
    const position = enrolled.find(({ param }) =>
      variable.defs.some(
        (def) =>
          def.name.range[0] >= param.range[0] &&
          def.name.range[1] <= param.range[1],
      ),
    );
    return position
      ? [
          {
            variable,
            breaksOnAnyMutatingMethod: position.breaksOnAnyMutatingMethod,
          },
        ]
      : [];
  });
};

/**
 * The bindings a construct that ITERATES `iterable` introduces: the head of a
 * `for…of` over it, the parameter an array method hands each element to, and —
 * when the iterated expression is the constant itself — the parameter that
 * method hands the RECEIVER ARRAY to.
 *
 * A `for…of` head is accepted in all three binding spellings, on the same terms
 * as `aliasDeclaratorOf` accepts all three declarator spellings — every name a
 * pattern introduces is typed from the value it destructures. A head that is
 * not a declaration assigns into a binding declared elsewhere, whose type the
 * constant never gave it, so it introduces nothing to enrol. `for await` is the
 * same node with `await` set and binds its element the same way, so the flag is
 * not screened.
 *
 * A callback parameter is reached only through a function LITERAL: a callback
 * passed by name is declared elsewhere, where its parameter carries whatever
 * type that declaration gives it rather than one read off the constant.
 *
 * `iteratesConstantValue` says whether `iterable` is the constant's own value
 * or member path rather than something derived from it. It gates the receiver
 * ARRAY parameter alone: the element parameter is typed from the constant
 * either way, while the array parameter names the constant only in the first
 * case — see `iterationBindingsOf`.
 */
const bindingsOfIterationOver = (
  iterable: TSESTree.Node,
  declaredVariablesOf: (
    node: TSESTree.Node,
  ) => readonly TSESLint.Scope.Variable[],
  iteratesConstantValue: boolean,
): readonly EnrolledBinding[] => {
  // The member path is resolved first because the iterated expression is
  // routinely a PROPERTY of the constant (`for (const x of CONFIG.list)`): the
  // property is frozen with the object that holds it, so iterating it hands the
  // body the constant's own frozen contents.
  const path = accessPathOf(iterable);
  const value = outermostValueOf(path ?? iterable);
  const parent = value.parent;

  if (!parent) {
    return [];
  }

  if (
    parent.type === AST_NODE_TYPES.ForOfStatement &&
    parent.right === value &&
    parent.left.type === AST_NODE_TYPES.VariableDeclaration
  ) {
    return enrolFully(declaredVariablesOf(parent.left));
  }

  // `Array.from(X, mapfn)` hands each element of `X` to `mapfn` exactly as
  // `X.map` hands it to a callback, so the mapper's first parameter is typed
  // from the constant and `Array.from(ITEMS, (item) => { item.n = 2; … })` is
  // TS2540 once `ITEMS` is frozen. The two-argument form reaches the walk
  // nowhere else: `isCopyingCall` admits `Array.from` at one argument alone,
  // because a mapper retypes the RESULT — which says nothing about the element
  // it is handed (Issue #2340). The mapper takes the element first and the
  // index second, and is handed no receiver array at all.
  if (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === value &&
    isNamespacedCallee(parent.callee, 'Array', 'from')
  ) {
    const mapper = parent.arguments[1];
    return mapper && isFunctionValue(mapper)
      ? parameterBindingsOf(
          mapper,
          [{ index: 0, breaksOnAnyMutatingMethod: true }],
          declaredVariablesOf,
        )
      : [];
  }

  if (path === null) {
    return [];
  }

  const method = accessedPropertyName(path);
  if (method === null) {
    return [];
  }

  const elementIndex = ELEMENT_PARAMETER_INDEX_BY_METHOD.get(method);

  if (
    elementIndex === undefined ||
    parent.type !== AST_NODE_TYPES.CallExpression ||
    parent.callee !== value
  ) {
    return [];
  }

  const callback = parent.arguments[0];
  if (!callback || !isFunctionValue(callback)) {
    return [];
  }

  const arrayIndex = iteratesConstantValue
    ? ARRAY_PARAMETER_INDEX_BY_METHOD.get(method)
    : undefined;

  return parameterBindingsOf(
    callback,
    [
      { index: elementIndex, breaksOnAnyMutatingMethod: true },
      ...(arrayIndex === undefined
        ? []
        : [
            {
              index: arrayIndex,
              breaksOnAnyMutatingMethod:
                !MUTABLE_ARRAY_PARAMETER_METHODS.has(method),
            },
          ]),
    ],
    declaredVariablesOf,
  );
};

/**
 * The bindings ITERATING this reference introduces, directly or through a value
 * derived from it that keeps its element types.
 *
 * Such a binding is typed from the constant exactly as a destructured copy is —
 * it carries the ELEMENT type, or for the receiver parameter the whole value —
 * so a write through it breaks on the assertion as a write through an alias
 * does:
 * `for (const item of ITEMS) { item.label = 'b'; }` is TS2540 once `ITEMS` is
 * frozen, for an input that compiled (Issue #2338). Enrolling the binding is
 * therefore the whole remedy; the walk's existing write, mutating-method and
 * inference checks answer the question on it, which is what keeps a loop that
 * only READS its element fixable.
 *
 * The derivations are followed because the receiver of the iteration is
 * routinely removed from the constant (`[...ITEMS].forEach(…)`,
 * `ITEMS.filter(Boolean).forEach(…)`, `Object.values(CONFIG).forEach(…)`,
 * `ITEMS.values()`, `new Set(ITEMS)`): each builds a fresh OUTER value whose
 * elements are still the frozen ones, so the element binding breaks
 * identically.
 *
 * Following them is TRANSITIVE, on the same reasoning as the alias walk — every
 * hop keeps the element type, so a chain of them keeps it too, and
 * `ITEMS.filter(Boolean).slice().forEach((item) => { item.n = 2; })` is the
 * same TS2540 as the one-hop spelling that already declines. A single step
 * gave two spellings of one construct opposite verdicts (Issue #2340).
 *
 * The derivations are resolved from each step of the reference's own access
 * path as well as from the reference, since the value a derivation is taken
 * from is routinely a PROPERTY of the constant — see `accessPathsRootedAt`.
 *
 * The receiver ARRAY parameter is enrolled for the constant's own value or
 * member path ALONE, the one iterable that hands the callback the constant
 * itself. A derivation hands it the fresh outer value it
 * built, and mutating that is no readonly violation:
 * `[...ITEMS].forEach((item, index, arr) => { arr.push(3); })` does break after
 * the fix, but as TS2345 — the spread narrows the element type, so `3` is not
 * assignable — which belongs to the literal-narrowing family filed as #2330 and
 * needs the type checker. Enrolling it here would withhold the assertion for a
 * reason this arm cannot justify, so it is an over-decline (Issue #2339).
 */
const iterationBindingsOf = (
  identifier: TSESTree.Node,
  declaredVariablesOf: (
    node: TSESTree.Node,
  ) => readonly TSESLint.Scope.Variable[],
): readonly EnrolledBinding[] => {
  const value = outermostValueOf(identifier);
  const bindings: EnrolledBinding[] = [
    ...bindingsOfIterationOver(value, declaredVariablesOf, true),
  ];

  // The constant's own value and access path are iterated by the call above,
  // which resolves the path itself; every DERIVED value is iterated on the
  // narrower terms — it hands a callback a fresh outer value rather than the
  // constant.
  const ownValues = new Set<TSESTree.Node>(accessPathsRootedAt(value));
  for (const { node: derived } of derivedValueExpressionsOf(
    value,
    DERIVATION_RESOLVERS,
  )) {
    if (ownValues.has(derived)) {
      continue;
    }
    bindings.push(
      ...bindingsOfIterationOver(derived, declaredVariablesOf, false),
    );
  }

  return bindings;
};

/**
 * Whether anything in the file stops this binding taking `as const`, under its
 * own name or through an alias of it.
 *
 * Two things disqualify it, because `as const` does two things. It freezes the
 * value, so a WRITE — through the binding (`X.push(1)`), or to a binding that
 * aliases it (`other = X`) — becomes TS2339/TS2540. And it makes the literal
 * type NON-WIDENING, so an INFERENCE site that read the widened type keeps the
 * literal instead, which rewrites a declaration the assertion was never asked
 * to touch.
 *
 * The type half reaches further than the value half, so the walk follows one
 * edge the mutation question does not need: a COPY (`[...X]`, `X.concat()`),
 * which is a fresh value but not a fresh type, and breaks on a write to the
 * copy rather than to `X`.
 *
 * Answered from the scope manager's reference list rather than a textual
 * search for the name, so a same-named binding in
 * another scope (`const arr` shadowed inside a callback) contributes nothing,
 * and a same-named method on an unrelated receiver (`other.push(1)`) is never
 * even visited.
 *
 * The walk follows aliases because a binding's own reference list is not where
 * a mutation through one is recorded: in
 * `const OTHER = ITEMS; OTHER.push(3);` the mutating call references `OTHER`, a
 * separate variable this one never enrols, and reading only `ITEMS`'s
 * references sees a plain read. Appending `as const` there emits TS2339 for an
 * input that compiled (Issue #2324). Following is transitive — every hop names
 * the one value — and `visited` keeps a chain that leads back on itself, which
 * a redeclared `var` can build, from looping forever.
 *
 * Iteration is followed on the same reasoning, keyed on what the construct
 * HANDS its body: a `for…of` head and an iteration callback's element parameter
 * are second names for the constant's contents, so `for (const item of ITEMS) {
 * item.label = 'b'; }` is TS2540 once `ITEMS` is frozen while `ITEMS`'s own
 * references show nothing but a read (Issue #2338); the parameter after the
 * index is a second name for the constant ITSELF, so `arr.push(2)` inside the
 * callback is the TS2339 the rule already declines for when the same call is
 * written directly (Issue #2339). Enrolling the binding is all it takes — the
 * checks above then decide, so a callback that only reads what it is handed
 * keeps the assertion.
 *
 * The declaring KEYWORD is deliberately not screened. `as const` types the
 * value `readonly`, and a binding takes its declared type from its initializer,
 * so `let other = ITEMS; other.push(3);` is the same TS2339 as the `const`
 * spelling; reassigning such a `let` does not recover mutability either,
 * because the reassignment is then rejected against that same frozen type. A
 * check keyed on `const` would leave the `let` spelling breaking builds under
 * `--fix`.
 */
const blocksAsConstAssertion = (
  variable: TSESLint.Scope.Variable,
  declaredVariablesOf: (
    node: TSESTree.Node,
  ) => readonly TSESLint.Scope.Variable[],
): boolean => {
  // The literal the constant is declared from, so an access path through it can
  // be screened against what `as const` actually freezes. Only the constant's
  // own declarator carries one: an ALIAS is initialized from a path into that
  // same literal, and resolving through it would need the path carried too, so
  // an alias is left unresolved and every step of it stays enrolled.
  const declaredValue = variable.defs.find(
    (def) => def.node.type === AST_NODE_TYPES.VariableDeclarator,
  )?.node;
  const frozenValue =
    declaredValue?.type === AST_NODE_TYPES.VariableDeclarator &&
    declaredValue.init
      ? declaredValue.init
      : undefined;

  // Grown in place and walked by index: an alias found mid-walk is appended and
  // reached by the same loop, so the traversal needs no recursion of its own.
  const pending: EnrolledBinding[] = [
    { variable, breaksOnAnyMutatingMethod: true, frozenValue },
  ];
  const visited = new Set<TSESLint.Scope.Variable>([variable]);

  /**
   * Whether a node is a REFERENCE to a binding already enrolled for this
   * constant, and so holds a value typed from the constant itself.
   *
   * Answered from the scope manager's reference lists rather than by name, on
   * the same terms as the rest of the walk: a same-named binding from another
   * scope names another value and must not exempt anything.
   *
   * A binding enrolled LATER in the walk than the one being examined answers
   * false here. That can only withhold an exemption, never grant one wrongly,
   * so the walk order costs a report at worst.
   */
  const isEnrolledReference = (node: TSESTree.Node): boolean => {
    const value = unwrapValueWrappers(node);
    if (value.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    for (const enrolledVariable of visited) {
      if (
        enrolledVariable.references.some(
          (enrolledReference) => enrolledReference.identifier === value,
        )
      ) {
        return true;
      }
    }
    return false;
  };

  for (let index = 0; index < pending.length; index += 1) {
    const {
      variable: enrolled,
      breaksOnAnyMutatingMethod,
      frozenValue: enrolledValue,
    } = pending[index];
    for (const reference of enrolled.references) {
      // Reassigning an alias is as disqualifying as writing through one. A
      // binding that takes its type from the constant narrows to the frozen
      // literal, so `let stage = DEFAULT; stage = 'live';` becomes TS2322 for
      // an input that compiled. `init` excludes the declaration's own write,
      // which is how the alias was established rather than a change to it.
      if (reference.isWrite() && !reference.init) {
        return true;
      }

      if (isInferenceSite(reference.identifier)) {
        return true;
      }

      const path = accessPathOf(reference.identifier);

      // The ELEMENT question is asked of every binding alike: the elements are
      // frozen whatever the container's own declaration says.
      if (path !== null && isWriteTarget(path)) {
        return true;
      }

      // The mutating-method question is asked in full of every binding the
      // assertion types `readonly`, where any such call is a TS2339. A
      // parameter the lib declares MUTABLE has no such break to have, so it is
      // asked the narrower question that remains: does this call introduce a
      // value the narrowed element type would have to accept (Issue #2340).
      if (
        path !== null &&
        isMutatingMethodCall(path) &&
        (breaksOnAnyMutatingMethod ||
          introducesForeignElement(path, isEnrolledReference))
      ) {
        return true;
      }

      // A binding is initialized from any expression that denotes the
      // constant's frozen contents, not from the reference alone. A PROPERTY or
      // ELEMENT of the constant carries the assertion exactly as the constant
      // does, so `const list = CONFIG.list; list.push(3);` is the same TS2339
      // the rule already declines for when the identical call is written
      // directly — only the extracted spelling escaped it, while the
      // DESTRUCTURED spelling of the same extraction was enrolled all along
      // (Issue #2341). A copy taken of the constant or of any step of that path
      // (`ITEMS.concat()`, `[...CONFIG.a.b]`) carries the frozen TYPE into a
      // fresh value on the same terms.
      const aliases = derivedValueExpressionsOf(
        reference.identifier,
        ALIAS_DERIVATION_RESOLVERS,
        enrolledValue,
      ).flatMap(({ node, literal }) => {
        const declarator = aliasDeclaratorOf(node);
        if (!declarator) {
          return [];
        }
        const variables = declaredVariablesOf(declarator);
        // The pattern screen applies only where the declarator destructures
        // THIS value directly. Reached through a storage container
        // (`const HOLDER = { ITEMS }`), the pattern names the container's own
        // properties, which this literal does not answer for.
        if (
          literal === undefined ||
          declarator.init !== outermostValueOf(node)
        ) {
          return variables;
        }
        const unfrozen = new Set<string>();
        collectUnfrozenPatternNames(declarator.id, literal, unfrozen);
        return unfrozen.size === 0
          ? variables
          : variables.filter((variable) => !unfrozen.has(variable.name));
      });

      // A binding introduced by ITERATING the constant is enrolled beside the
      // aliases: it names the constant's CONTENTS, which the assertion freezes
      // with the constant itself — see `iterationBindingsOf`. An alias is
      // enrolled on the constant's own terms, because it denotes the constant's
      // value and so carries its readonly-ness whole.
      const derived: EnrolledBinding[] = [
        ...enrolFully(aliases),
        ...iterationBindingsOf(reference.identifier, declaredVariablesOf),
      ];

      for (const alias of derived) {
        if (!visited.has(alias.variable)) {
          visited.add(alias.variable);
          pending.push(alias);
        }
      }
    }
  }

  return false;
};

/**
 * Walks the scope chain upward from `scope` (inclusive) and reports whether
 * `targetName` is bound anywhere between `scope` and `stopScope` (inclusive).
 * Mirrors how the engine resolves an identifier at a use site: the first scope
 * on the chain that declares the name wins. Used to detect whether a rewritten
 * reference would be captured by a binding sitting between it and the
 * declaration it currently resolves to.
 */
const isNameBoundInChain = (
  scope: TSESLint.Scope.Scope | null,
  stopScope: TSESLint.Scope.Scope | null,
  targetName: string,
): boolean => {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.set.has(targetName)) {
      return true;
    }
    if (current === stopScope) {
      break;
    }
    current = current.upper;
  }
  return false;
};

/**
 * Returns true when renaming `variable` to `newName` would collide with an
 * existing binding in any scope the rename touches, making the autofix
 * semantics-changing (and thus unsafe). The rename fixer rewrites the
 * declaration plus every in-file reference to `newName`; if `newName` already
 * resolves to a different binding the rewrite would either redeclare a name
 * already bound in the declaration scope or capture a reference onto an
 * intervening binding. In every such case the fix is suppressed (report-only).
 */
const renameWouldCollide = (
  variable: TSESLint.Scope.Variable,
  newName: string,
): boolean => {
  const declarationScope = variable.scope;

  // (1) Declaration site: `newName` already bound in the scope that holds the
  //     declaration would make the rename a redeclaration/shadow. The declared
  //     variable itself carries the old name, so any entry for `newName` is a
  //     distinct, colliding binding.
  if (declarationScope.set.has(newName)) {
    return true;
  }

  // (2) Reference sites: a binding of `newName` sitting between a reference and
  //     the declaration scope would swallow the rewritten identifier — the
  //     reference would resolve to that binding instead of the constant.
  for (const ref of variable.references) {
    const referenceScope = ref.from ?? declarationScope;
    if (isNameBoundInChain(referenceScope, declarationScope, newName)) {
      return true;
    }
  }

  return false;
};

// `undefined`, `NaN` and `Infinity` parse as identifiers but denote primitive
// values rather than a binding being aliased, so they stay subject to the
// naming check exactly like the literals they stand in for. Every other bare
// identifier initializer is an alias (see `isBindingAlias`).
const PRIMITIVE_VALUE_GLOBALS = new Set(['undefined', 'NaN', 'Infinity']);

// Next.js recognizes these export names by their literal identifier, so
// renaming them to UPPER_SNAKE_CASE silently breaks the framework contract
// (e.g. `export const config` controls the API-route body parser / runtime).
// Only the export name matters to Next.js, so the exemption is gated on the
// declaration being exported — a local, unexported `config` is safe to rename.
const NEXTJS_RESERVED_EXPORTS = new Set([
  'config',
  'getServerSideProps',
  'getStaticProps',
  'getStaticPaths',
  'getInitialProps',
  'middleware',
]);

/** Prettier's default print width, which this repo and agora both format with. */
const PRINT_WIDTH = 80;

/** Prettier's default `tabWidth`, the step it indents a broken group by. */
const INDENT_STEP = '  ';

const AS_CONST_SUFFIX = ' as const';

/**
 * The break a formatter puts after `=` once the appended `as const` has pushed
 * the declaration past the print width, or null where the flat spelling is the
 * one prettier settles on.
 *
 * The append always LENGTHENS the line by nine columns, so a declaration that
 * fitted before the fix routinely does not after it, and prettier's answer for
 * an over-wide assignment whose right-hand side cannot break internally is to
 * break after the `=` and indent one step. Leaving that break for the next
 * prettier run churns the file on every pass (#2126).
 *
 * `idDelta` carries the columns a rename landing in the same pass adds to the
 * declaration id, so the measurement is taken against the line the pass leaves
 * behind rather than the one it started from.
 *
 * Only a bare `Literal` initializer is broken this way. An object or array
 * literal is expanded across lines by prettier instead — a shape only a rebuild
 * from the literal's own items could emit, and such a rebuild owns every byte
 * between the braces, so a comment written among the items would be deleted by
 * it. The flat append is kept there: it is what the rule has always written.
 */
function asConstOverflowFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  statement: TSESTree.Node,
  init: TSESTree.Node,
  initText: string,
  idDelta: number,
): TSESLint.RuleFix | null {
  if (init.type !== AST_NODE_TYPES.Literal) {
    return null;
  }
  // A declaration already written across lines is broken where prettier broke
  // it, and the single line measured here is then not the whole of what moves.
  if (statement.loc.start.line !== statement.loc.end.line) {
    return null;
  }

  // A second STATEMENT sharing the line is a shape prettier splits before it
  // measures anything, so the width read here is not the one it decides on.
  const previous = sourceCode.getTokenBefore(statement);
  if (previous && previous.loc.end.line === statement.loc.start.line) {
    return null;
  }
  const next = sourceCode.getTokenAfter(statement);
  if (next && next.loc.start.line === statement.loc.end.line) {
    return null;
  }

  // Measured on the STATEMENT, not on the line: a trailing LINE comment is
  // printed as a suffix that never counts toward fitting (measured against
  // prettier 2.8.8: the identical declaration stays flat at 92 columns with one
  // and breaks at 84 with a block comment), while a trailing BLOCK comment
  // occupies columns like any other text and moves the answer.
  let measuredEndColumn = statement.loc.end.column;
  for (const comment of sourceCode.getCommentsAfter(statement)) {
    if (
      comment.loc.start.line !== statement.loc.end.line ||
      comment.type === AST_TOKEN_TYPES.Line
    ) {
      break;
    }
    measuredEndColumn = comment.loc.end.column;
  }

  if (measuredEndColumn + idDelta + AS_CONST_SUFFIX.length <= PRINT_WIDTH) {
    return null;
  }

  // Reading the token before the initializer WITH comments settles two hazards
  // at once: a comment between `=` and the value would be swallowed by the
  // replaced span, and a parenthesized initializer would lose its `(` while
  // keeping its `)`.
  const equals = sourceCode.getTokenBefore(init, { includeComments: true });
  if (
    !equals ||
    equals.type !== AST_TOKEN_TYPES.Punctuator ||
    equals.value !== '='
  ) {
    return null;
  }

  const line = sourceCode.lines[statement.loc.start.line - 1] ?? '';
  const indent = /^[\t ]*/.exec(line)?.[0] ?? '';
  return fixer.replaceTextRange(
    [equals.range[1], init.range[1]],
    `\n${indent}${INDENT_STEP}${initText}${AS_CONST_SUFFIX}`,
  );
}

type MessageIds = 'upperSnakeCase' | 'asConst';

export default createRule<[], MessageIds>({
  name: 'global-const-style',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce UPPER_SNAKE_CASE and as const for global static constants',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      upperSnakeCase:
        'Global constant "{{name}}" should be written in UPPER_SNAKE_CASE (e.g., "{{suggestedName}}") so it reads as a module-level configuration value that never changes; rename it to make its immutability obvious.',
      asConst:
        'Global constant "{{name}}" is initialized with {{valueKind}} but lacks `as const`, so TypeScript widens the type and code can mutate it accidentally; append `as const` to freeze the value and preserve literal types.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Check if the file is a TypeScript file
    const isTypeScript =
      context.getFilename().endsWith('.ts') ||
      context.getFilename().endsWith('.tsx');

    /**
     * Strips `as`/`<T>` casts only, and is deliberately narrower than
     * `unwrapValueWrappers`. The two carve-outs below — dynamic values and
     * binding aliases — silence the rule entirely, so widening them to see
     * through `!`/`satisfies` would newly exempt `const value = getValue()!`
     * and `const alias = other!` from the rename check. That is a detection
     * change of its own, distinct from the wrapper-blind component exemption
     * `unwrapValueWrappers` cures (Issue #1681).
     */
    const unwrapCasts = (node: TSESTree.Node): TSESTree.Node => {
      let target = node;
      while (
        target.type === AST_NODE_TYPES.TSTypeAssertion ||
        target.type === AST_NODE_TYPES.TSAsExpression
      ) {
        target = target.expression;
      }
      return target;
    };

    const isDynamicValue = (node: TSESTree.Node): boolean => {
      const target = unwrapCasts(node);

      if (
        target.type === AST_NODE_TYPES.CallExpression ||
        target.type === AST_NODE_TYPES.NewExpression ||
        target.type === AST_NODE_TYPES.BinaryExpression
      ) {
        return true;
      }

      if (target.type === AST_NODE_TYPES.ChainExpression) {
        return isDynamicValue(target.expression);
      }

      if (target.type === AST_NODE_TYPES.MemberExpression) {
        return isDynamicValue(target.object);
      }

      return false;
    };

    /**
     * A bare identifier initializer (`export const toUsernameSlugStamp =
     * toKvStamp;`) aliases an existing binding instead of declaring a
     * configuration value, so the rule's premise does not hold: the alias
     * inherits whatever convention its target follows, and a callable — the
     * dominant case, since aliasing a re-exported function is the idiom — is
     * always camelCase. Renaming one is also destructive, because the point of
     * such a re-export is preserving a name importers depend on and a
     * single-file fixer cannot rewrite them (Issue #1418).
     *
     * The check unwraps casts so a type-pinned alias (`x as Foo`,
     * `x as const`) is treated the same as the bare form. A `MemberExpression`
     * (`Foo.bar`) is deliberately not covered — it keeps whatever behavior
     * `isDynamicValue` already gives it.
     */
    const isBindingAlias = (node: TSESTree.Node): boolean => {
      const target = unwrapCasts(node);

      return (
        target.type === AST_NODE_TYPES.Identifier &&
        !PRIMITIVE_VALUE_GLOBALS.has(target.name)
      );
    };

    /**
     * The bindings a declaration node introduces, as the scope manager records
     * them. The mutation walk resolves an alias declarator through this rather
     * than looking its name up the scope chain: the scope manager already holds
     * the exact answer, while a name lookup would have to guess which scope a
     * `var` was hoisted into.
     */
    const declaredVariablesOf = (
      node: TSESTree.Node,
    ): readonly TSESLint.Scope.Variable[] => context.getDeclaredVariables(node);

    const describeValueKind = (node: TSESTree.Node): string => {
      const target = unwrapValueWrappers(node);

      if (target.type === AST_NODE_TYPES.ArrayExpression) {
        return 'an array literal';
      }
      if (target.type === AST_NODE_TYPES.ObjectExpression) {
        return 'an object literal';
      }
      if (target.type === AST_NODE_TYPES.Literal) {
        return 'a literal value';
      }
      return 'a value';
    };

    return {
      VariableDeclaration(node) {
        // Only check top-level const declarations
        if (node.kind !== 'const') {
          return;
        }

        // Skip if not at program level or not an exported declaration
        if (
          node.parent?.type !== AST_NODE_TYPES.Program &&
          node.parent?.type !== AST_NODE_TYPES.ExportNamedDeclaration
        ) {
          return;
        }

        // Skip if any declaration is a function value (component, hook or
        // helper) or a `memo`/`forwardRef` component factory call. The
        // initializer is classified through any type wrappers, so the pinned
        // forms (`… as FC`, `… satisfies ComponentType`, `…!`) are exempt on
        // the same terms as the bare expression they wrap.
        const shouldSkip = node.declarations.some((declaration) => {
          if (declaration.id.type !== AST_NODE_TYPES.Identifier) {
            return false;
          }

          const init = declaration.init;

          // Skip if no initializer
          if (!init) {
            return false;
          }

          const target = unwrapValueWrappers(init);

          return isFunctionValue(target) || isComponentFactoryCall(target);
        });

        if (shouldSkip) {
          return;
        }

        node.declarations.forEach((declaration) => {
          // Skip destructuring patterns
          if (declaration.id.type !== AST_NODE_TYPES.Identifier) {
            return;
          }

          const { name } = declaration.id;
          const init = declaration.init;

          // Skip if no initializer, if it's a dynamic value or class instance,
          // or if it merely aliases another binding
          if (!init || isDynamicValue(init) || isBindingAlias(init)) {
            return;
          }

          const sourceCode = context.getSourceCode();
          const initText = sourceCode.getText(init);
          const typeAnnotation = declaration.id.typeAnnotation;
          const typeText = typeAnnotation
            ? sourceCode.getText(typeAnnotation)
            : '';

          const isExported =
            node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
          // The whole of what a formatter measures: for an exported constant
          // the group starts at `export`, not at `const`.
          const statement = isExported && node.parent ? node.parent : node;

          // Resolve the declared variable up front: the component carve-out
          // below reads its reference list, the rename fix rewrites every one
          // of those references, and the width measurement asks whether that
          // rename lands in this pass.
          const renamedVariable =
            context
              .getDeclaredVariables(declaration)
              .find((variable) => variable.name === name) ?? null;

          // A React component is exempt from the rename however it is built.
          // #1681 covered the shapes that DECLARE one inline (a function value,
          // a `memo`/`forwardRef` call); a component read off another value —
          // `const Provider = provider.Provider`, a getter on a class instance —
          // is a MemberExpression that carve-out never reached. Renaming one
          // contradicts React's component spelling, and the rename is what
          // wrote unparseable JSX in the first place (Issue #2055). The
          // exemption gates only the rename check: the `as const` logic is
          // untouched.
          const isComponentBinding =
            (renamedVariable !== null &&
              isUsedAsJsxElementName(renamedVariable)) ||
            isComponentPropertyRead(init, name);

          /**
           * How many columns this pass's RENAME adds to the declaration id, or
           * null where that is not knowable here.
           *
           * The two fixes this rule emits for one declarator do not overlap, so
           * ESLint applies BOTH in the same pass: a rename that lengthens the
           * id moves the width the appended `as const` is measured against. An
           * id that keeps its spelling — because no rename is reported, or
           * because the rename fix withdraws — contributes nothing. Every
           * withdrawal the fix decides by scanning JSX is left UNKNOWN rather
           * than guessed, and an unknown answer withholds the break.
           */
          const pendingIdDelta = (): number | null => {
            const renamedTo = toUpperSnakeCase(name);
            const renameReported =
              !isUpperSnakeCase(name) &&
              !isJestMockCast(init) &&
              !isComponentBinding &&
              !(isExported && NEXTJS_RESERVED_EXPORTS.has(name));
            if (!renameReported) {
              return 0;
            }
            if (
              isExported ||
              !renamedVariable ||
              !isUpperSnakeCase(renamedTo) ||
              renameWouldCollide(renamedVariable, renamedTo)
            ) {
              return 0;
            }
            const rewritesJsx = (sourceCode.ast.tokens ?? []).some(
              (token) => token.type === AST_TOKEN_TYPES.JSXIdentifier,
            );
            const rewritesExportSpecifier = renamedVariable.references.some(
              (reference) =>
                reference.identifier.parent?.type ===
                AST_NODE_TYPES.ExportSpecifier,
            );
            if (rewritesJsx || rewritesExportSpecifier) {
              return null;
            }
            return renamedTo.length - name.length;
          };

          // Only check for as const in TypeScript files
          if (isTypeScript) {
            // An `as const` anywhere in the wrapper chain already freezes the
            // value, including when a later wrapper hides it
            // (`{...} as const satisfies Config`, `({...} as const)!`).
            const hasAsConstAssertion = (node: TSESTree.Node): boolean => {
              let current: TSESTree.Node = node;

              while (isValueWrapper(current)) {
                if (
                  (current.type === AST_NODE_TYPES.TSAsExpression ||
                    current.type === AST_NODE_TYPES.TSTypeAssertion) &&
                  current.typeAnnotation.type ===
                    AST_NODE_TYPES.TSTypeReference &&
                  current.typeAnnotation.typeName.type ===
                    AST_NODE_TYPES.Identifier &&
                  current.typeAnnotation.typeName.name === 'const'
                ) {
                  return true;
                }
                current = current.expression;
              }

              return false;
            };

            const shouldHaveAsConst = (node: TSESTree.Node): boolean => {
              // Skip if it's already an as const expression
              if (hasAsConstAssertion(node)) {
                return false;
              }

              const target = unwrapValueWrappers(node);

              // Skip an initializer already wrapped in a non-`const` type
              // wrapper (`{...} as T`, `<T>{...}`, `{...} as unknown as T`,
              // `{...} satisfies T`, `{...}!`). A `const` assertion may only be
              // applied to a literal, so appending one after such a chain is
              // TS1355 — the same failure mode the regex/null/boolean carve-outs
              // below exist for. Such a wrapper is also the author pinning the
              // type deliberately, exactly like the `id.typeAnnotation` case
              // skipped next.
              if (target !== node) {
                return false;
              }

              // Skip if there's an explicit type annotation
              if (declaration.id.typeAnnotation) {
                return false;
              }

              // Check if it's a literal, array, or object that should have as const
              // Skip regular expressions as they are already immutable
              if (target.type === AST_NODE_TYPES.Literal && 'regex' in target) {
                return false;
              }
              // Skip null and boolean literals. `null as const` is invalid
              // TypeScript (TS1355), so the autofix would produce uncompilable
              // code; `true`/`false` already have literal types, so `as const`
              // is redundant. (`undefined` is an Identifier, not a Literal, so
              // it never reaches the literal branch below.)
              if (
                target.type === AST_NODE_TYPES.Literal &&
                (target.value === null || typeof target.value === 'boolean')
              ) {
                return false;
              }
              if (
                target.type !== AST_NODE_TYPES.Literal &&
                target.type !== AST_NODE_TYPES.ArrayExpression &&
                target.type !== AST_NODE_TYPES.ObjectExpression
              ) {
                return false;
              }

              // A binding that is mutated later can never take the assertion:
              // `as const` types the value `readonly`, so the appended text
              // turns working code into TS2339/TS2540 (Issue #2013). The
              // report is withheld rather than merely the fix, on the same
              // terms as the `null`/boolean carve-out above — a violation no
              // legal edit can clear is not a violation. The rename is a
              // separate concern and still applies.
              const declaredVariable = context
                .getDeclaredVariables(declaration)
                .find((variable) => variable.name === name);

              return (
                !declaredVariable ||
                !blocksAsConstAssertion(declaredVariable, declaredVariablesOf)
              );
            };

            if (shouldHaveAsConst(init)) {
              context.report({
                node: declaration,
                messageId: 'asConst',
                data: {
                  name,
                  valueKind: describeValueKind(init),
                },
                fix(fixer) {
                  // A sibling declarator on the same statement carries its own
                  // report, and its fix lands in this pass too, so the columns
                  // this one is measured against move with it. Where the
                  // post-pass width is not knowable the flat append — the shape
                  // the rule has always written — is kept: the measurement can
                  // withhold a break, never emit one against a guess.
                  const idDelta =
                    node.declarations.length === 1 ? pendingIdDelta() : null;
                  const overflowFix =
                    idDelta === null
                      ? null
                      : asConstOverflowFix(
                          fixer,
                          sourceCode,
                          statement,
                          init,
                          initText,
                          idDelta,
                        );
                  return (
                    overflowFix ??
                    fixer.replaceText(init, `${initText}${AS_CONST_SUFFIX}`)
                  );
                },
              });
            }
          }

          // Skip the rename for exported Next.js reserved export names. Their
          // identifier is an external framework contract that cannot be
          // statically verified as safe to rename, so autofixing the rename
          // silently regresses behavior (Issue #1257). The `as const` check
          // above still applies since it never touches the export name.
          if (isExported && NEXTJS_RESERVED_EXPORTS.has(name)) {
            return;
          }

          // Check for UPPER_SNAKE_CASE. Jest mock handles (`x as jest.Mock<…>`)
          // are exempt: they are mutable test doubles, not immutable config, so
          // the `mockedX` idiom is intentional. The exemption gates only this
          // rename check — the `as const` logic above is untouched.
          if (
            !isUpperSnakeCase(name) &&
            !isJestMockCast(init) &&
            !isComponentBinding
          ) {
            const newName = toUpperSnakeCase(name);

            const idNode = declaration.id;

            context.report({
              node: declaration,
              messageId: 'upperSnakeCase',
              data: {
                name,
                suggestedName: newName,
              },
              fix(fixer) {
                // The rename rewrites the declaration AND every reference
                // together. Renaming only the declaration id (the previous
                // behavior) left every use site bound to a now-undefined name —
                // `--fix` exited 0 while silently corrupting working code
                // (Issue #1313, same defect class as #1256).
                const declaredVariable = renamedVariable;

                // Cannot resolve the variable — never emit a partial rename.
                if (!declaredVariable) {
                  return null;
                }

                // The conversion degenerates on some names: one built only from
                // underscores derives the empty string, and a leading
                // underscore in front of a digit derives a name that starts
                // with that digit. Applying either trades a naming report for a
                // file that no longer parses — `const  = {…}` — and the rename
                // rewrites every reference, so the damage spreads to each use
                // site. Declining leaves the report standing with no fix, which
                // is the honest outcome: the author has to choose a real name,
                // and no mechanical rewrite can choose one for them. The test is
                // the rule's own acceptance predicate, so a derivation that
                // would only relocate the same report (`_$` to `$`) is declined
                // on the same terms.
                if (!isUpperSnakeCase(newName)) {
                  return null;
                }

                // An exported binding's name is a cross-file contract: every
                // importer spells it out in a file this single-file fixer
                // cannot reach, so renaming the declaration breaks them all
                // (TS2724/TS2305, an unresolved JSX element, a `jest.mock`
                // factory key). The hazard lives entirely in those other files,
                // so it does not depend on whether the declaring file also uses
                // the name — a constants module with no local use sites is the
                // most exposed shape, not the safest. Report-only; the sibling
                // `as const` fix still applies because it never touches the
                // export name.
                if (isExported) {
                  return null;
                }

                // Suppress the fix when `newName` already binds something in a
                // scope the rename would touch — a rename fixer must never
                // change program semantics or shadow an existing binding.
                if (renameWouldCollide(declaredVariable, newName)) {
                  return null;
                }

                // Rewrite the declaration id (preserving any type annotation,
                // whose range is part of the id node) plus every reference.
                const fixes = [
                  fixer.replaceText(
                    idNode,
                    typeAnnotation ? `${newName}${typeText}` : newName,
                  ),
                ];

                // Every span this fix rewrites, keyed by range so a token and
                // the node covering it compare equal. It lets the closing-tag
                // audit below tell a rewritten tag from an untouched one.
                const rewrittenRanges = new Set<string>();
                const rangeKey = (node: { range: TSESTree.Range }): string =>
                  `${node.range[0]}:${node.range[1]}`;
                rewrittenRanges.add(rangeKey(idNode));

                for (const ref of declaredVariable.references) {
                  const refId = ref.identifier;
                  // The declaration write reference is the id node itself and
                  // is already handled above. Skipping it also avoids emitting
                  // overlapping fix ranges, which ESLint rejects.
                  if (refId === idNode) {
                    continue;
                  }

                  const refParent = refId.parent;

                  // A JSX tag name is spelled twice, and the scope manager
                  // references only the OPENING occurrence — the identifier in
                  // a closing tag resolves to no variable at all. Renaming the
                  // reference list alone therefore splits
                  // `<Provider>…</Provider>` into `<PROVIDER>…</Provider>`, and
                  // the emitted file no longer parses: `--fix` exits 0 having
                  // written source ESLint itself can never read again
                  // (Issue #2055, the #1740 precedent). The closing tag is
                  // reached through the element instead, and a self-closing
                  // element has none to rewrite.
                  if (refId.type === AST_NODE_TYPES.JSXIdentifier) {
                    const element = jsxElementOfTagName(refId);

                    // A JSX reference in a position the fixer does not model:
                    // withdraw rather than rewrite one half of a tag pair.
                    if (!element) {
                      return null;
                    }

                    const closingName = element.closingElement?.name;
                    if (closingName) {
                      const closingRoot = jsxTagNameRoot(closingName);
                      if (
                        closingRoot.type !== AST_NODE_TYPES.JSXIdentifier ||
                        closingRoot.name !== name
                      ) {
                        return null;
                      }
                      rewrittenRanges.add(rangeKey(closingRoot));
                      fixes.push(fixer.replaceText(closingRoot, newName));
                    }

                    rewrittenRanges.add(rangeKey(refId));
                    fixes.push(fixer.replaceText(refId, newName));
                    continue;
                  }

                  // An object-literal shorthand `{ fooBar }` desugars to
                  // `{ fooBar: fooBar }`: the one token is both the property key
                  // and its value. Rewriting it to `{ FOO_BAR }` would rename
                  // the KEY too, silently changing the object's shape. Expand to
                  // `oldKey: NEW_NAME` so only the value is renamed.
                  if (
                    refParent?.type === AST_NODE_TYPES.Property &&
                    refParent.shorthand &&
                    refParent.parent?.type === AST_NODE_TYPES.ObjectExpression
                  ) {
                    rewrittenRanges.add(rangeKey(refId));
                    fixes.push(fixer.replaceText(refId, `${name}: ${newName}`));
                    continue;
                  }

                  // A re-export specifier `export { fooBar }` binds the public
                  // export name to this identifier. Renaming it would change the
                  // exported name — a cross-file contract a single-file fixer
                  // cannot safely rewrite (the declaration-level export guard
                  // above only catches inline `export const`). Decline the fix.
                  if (refParent?.type === AST_NODE_TYPES.ExportSpecifier) {
                    return null;
                  }

                  rewrittenRanges.add(rangeKey(refId));
                  fixes.push(fixer.replaceText(refId, newName));
                }

                // Belt and braces: an opening tag this fix rewrites whose
                // closing tag it does not own leaves the pair split, and the
                // emitted file stops parsing. Rather than trust the rewrite
                // above to have paired every tag, the audit re-derives the
                // pairing from the source and withdraws the whole fix on any
                // asymmetry — a standing report is recoverable, unparseable
                // source is not.
                //
                // `</` is two punctuators followed by the tag name's root
                // identifier, so a JSX attribute named like the binding
                // (`<Foo apiEndpoint={…}/>`) never matches the triple. A
                // closing tag whose opening twin is untouched is left alone on
                // purpose: it spells a DIFFERENT binding (an intrinsic `</div>`
                // beside a `const div`, or a component shadowing this one
                // inside a callback), and rewriting neither half keeps it
                // parsing.
                const tokens = sourceCode.ast.tokens ?? [];
                for (let index = 0; index + 2 < tokens.length; index += 1) {
                  const nameToken = tokens[index + 2];
                  const opensClosingTag =
                    tokens[index].type === AST_TOKEN_TYPES.Punctuator &&
                    tokens[index].value === '<' &&
                    tokens[index + 1].type === AST_TOKEN_TYPES.Punctuator &&
                    tokens[index + 1].value === '/';
                  if (
                    !opensClosingTag ||
                    nameToken.type !== AST_TOKEN_TYPES.JSXIdentifier ||
                    nameToken.value !== name ||
                    rewrittenRanges.has(rangeKey(nameToken))
                  ) {
                    continue;
                  }

                  const closingRoot = sourceCode.getNodeByRangeIndex(
                    nameToken.range[0],
                  );
                  const element = closingRoot
                    ? jsxElementOfTagName(closingRoot)
                    : null;
                  // An unresolvable tag pair is an unmodelled shape: withdraw.
                  if (!element) {
                    return null;
                  }
                  if (
                    rewrittenRanges.has(
                      rangeKey(jsxTagNameRoot(element.openingElement.name)),
                    )
                  ) {
                    return null;
                  }
                }

                return fixes;
              },
            });
          }
        });
      },
    };
  },
});
