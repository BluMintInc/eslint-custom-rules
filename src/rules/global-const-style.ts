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
 * Whether the binding is written through anywhere in the file. Answered from
 * the scope manager's reference list rather than a textual search for the
 * name, so a same-named binding in another scope (`const arr` shadowed inside a
 * callback) contributes nothing, and a same-named method on an unrelated
 * receiver (`other.push(1)`) is never even visited.
 */
const isBindingMutated = (variable: TSESLint.Scope.Variable): boolean =>
  variable.references.some((reference) => {
    const path = accessPathOf(reference.identifier);
    return path !== null && (isMutatingMethodCall(path) || isWriteTarget(path));
  });

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

          const sourceCode = context.sourceCode;
          const initText = sourceCode.getText(init);
          const typeAnnotation = declaration.id.typeAnnotation;
          const typeText = typeAnnotation
            ? sourceCode.getText(typeAnnotation)
            : '';

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

              return !declaredVariable || !isBindingMutated(declaredVariable);
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
                  return fixer.replaceText(init, `${initText} as const`);
                },
              });
            }
          }

          // Skip the rename for exported Next.js reserved export names. Their
          // identifier is an external framework contract that cannot be
          // statically verified as safe to rename, so autofixing the rename
          // silently regresses behavior (Issue #1257). The `as const` check
          // above still applies since it never touches the export name.
          const isExported =
            node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
          if (isExported && NEXTJS_RESERVED_EXPORTS.has(name)) {
            return;
          }

          // Resolve the declared variable up front: the component carve-out
          // below reads its reference list, and the rename fix rewrites every
          // one of those references.
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
          // exemption gates only this rename check, exactly like the jest-mock
          // one: the `as const` logic above is untouched.
          const isComponentBinding =
            (renamedVariable !== null &&
              isUsedAsJsxElementName(renamedVariable)) ||
            isComponentPropertyRead(init, name);

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
