import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
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
const isFunctionValue = (node: TSESTree.Node): boolean =>
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

/**
 * Whether a call COPIES the argument at `index` while keeping its type.
 *
 * `Array.from(X)` and `structuredClone(X)` both hand back a fresh, mutable
 * value whose element or property types are the argument's — so freezing the
 * argument narrows the copy exactly as a spread does. `Array.from(X, fn)` is
 * excluded for the same reason `map` is: a mapper retypes the result, so
 * nothing of the constant's type survives into it.
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
    return call.arguments.length === 1;
  }
  return false;
};

/**
 * Array methods whose result keeps the receiver's ELEMENT type. `map` is
 * absent because its result is typed from the CALLBACK, so the constant's type
 * reaches it only for a callback that returns its argument unchanged — a no-op
 * `map`. Admitting it would withhold the assertion from every derived array
 * anything is computed from, to cover a spelling nobody writes.
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
      method !== null &&
      TYPE_PRESERVING_COPY_METHODS.has(method) &&
      callee.parent?.type === AST_NODE_TYPES.CallExpression &&
      callee.parent.callee === callee
    ) {
      return callee.parent;
    }
  }

  return null;
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

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.TSDeclareFunction,
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
  // Grown in place and walked by index: an alias found mid-walk is appended and
  // reached by the same loop, so the traversal needs no recursion of its own.
  const pending: TSESLint.Scope.Variable[] = [variable];
  const visited = new Set<TSESLint.Scope.Variable>(pending);

  for (let index = 0; index < pending.length; index += 1) {
    for (const reference of pending[index].references) {
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

      if (
        path !== null &&
        (isMutatingMethodCall(path) || isWriteTarget(path))
      ) {
        return true;
      }

      // A copy carries the constant's frozen type into a second binding, so it
      // is enrolled on the same terms as an alias — but it is reached through a
      // member access (`ITEMS.concat()`), which the alias walk deliberately
      // refuses, so it is resolved before that refusal applies.
      const copy = copyExpressionOf(outermostValueOf(reference.identifier));

      const declarator = copy
        ? aliasDeclaratorOf(copy)
        : path === null
        ? aliasDeclaratorOf(reference.identifier)
        : null;

      if (!declarator) {
        continue;
      }

      for (const alias of declaredVariablesOf(declarator)) {
        if (!visited.has(alias)) {
          visited.add(alias);
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
