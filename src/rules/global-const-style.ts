import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
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
              return (
                target.type === AST_NODE_TYPES.Literal ||
                target.type === AST_NODE_TYPES.ArrayExpression ||
                target.type === AST_NODE_TYPES.ObjectExpression
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

          // Check for UPPER_SNAKE_CASE. Jest mock handles (`x as jest.Mock<…>`)
          // are exempt: they are mutable test doubles, not immutable config, so
          // the `mockedX` idiom is intentional. The exemption gates only this
          // rename check — the `as const` logic above is untouched.
          if (!isUpperSnakeCase(name) && !isJestMockCast(init)) {
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
                // Resolve the declared variable so the rename can rewrite the
                // declaration AND every reference together. Renaming only the
                // declaration id (the previous behavior) left every use site
                // bound to a now-undefined name — `--fix` exited 0 while
                // silently corrupting working code (Issue #1313, same defect
                // class as #1256).
                const declaredVariable =
                  context
                    .getDeclaredVariables(declaration)
                    .find((variable) => variable.name === name) ?? null;

                // Cannot resolve the variable — never emit a partial rename.
                if (!declaredVariable) {
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
                for (const ref of declaredVariable.references) {
                  const refId = ref.identifier;
                  // The declaration write reference is the id node itself and
                  // is already handled above. Skipping it also avoids emitting
                  // overlapping fix ranges, which ESLint rejects.
                  if (refId === idNode) {
                    continue;
                  }

                  const refParent = refId.parent;

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

                  fixes.push(fixer.replaceText(refId, newName));
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
