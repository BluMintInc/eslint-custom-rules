import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const isUpperSnakeCase = (str: string): boolean =>
  /^[A-Z][A-Z0-9_]*$/.test(str);

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
const isJestMockCast = (node: TSESTree.Node): boolean => {
  if (node.type !== AST_NODE_TYPES.TSAsExpression) {
    return false;
  }
  const typeAnnotation = node.typeAnnotation;
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

    const unwrapAssertions = (node: TSESTree.Node): TSESTree.Node => {
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
      const target = unwrapAssertions(node);

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

    const describeValueKind = (node: TSESTree.Node): string => {
      const target = unwrapAssertions(node);

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

        // Skip if any declaration is a function component, arrow function, forwardRef, or memo
        const shouldSkip = node.declarations.some((declaration) => {
          if (declaration.id.type !== AST_NODE_TYPES.Identifier) {
            return false;
          }

          const name = declaration.id.name;
          const init = declaration.init;

          // Skip if no initializer
          if (!init) {
            return false;
          }

          // Skip function components (uppercase name + arrow function)
          if (
            /^[A-Z]/.test(name) &&
            init.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            return true;
          }

          // Skip any arrow function
          if (init.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            return true;
          }

          // Skip forwardRef and memo calls
          if (init.type === AST_NODE_TYPES.CallExpression) {
            if (init.callee.type === AST_NODE_TYPES.Identifier) {
              return ['forwardRef', 'memo'].includes(init.callee.name);
            }
          }

          // Skip type assertions on forwardRef and memo calls
          if (init.type === AST_NODE_TYPES.TSAsExpression) {
            const expression = init.expression;
            if (
              expression.type === AST_NODE_TYPES.CallExpression &&
              expression.callee.type === AST_NODE_TYPES.Identifier
            ) {
              return ['forwardRef', 'memo'].includes(expression.callee.name);
            }
          }

          return false;
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

          // Skip if no initializer or if it's a dynamic value or class instance
          if (!init || isDynamicValue(init)) {
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
            const hasAsConstAssertion = (node: TSESTree.Node): boolean => {
              let current: TSESTree.Node | undefined = node;

              while (
                current &&
                (current.type === AST_NODE_TYPES.TSAsExpression ||
                  current.type === AST_NODE_TYPES.TSTypeAssertion)
              ) {
                const { typeAnnotation } = current;
                if (
                  typeAnnotation?.type === AST_NODE_TYPES.TSTypeReference &&
                  typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
                  typeAnnotation.typeName.name === 'const'
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

              const target = unwrapAssertions(node);

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
            const newName = name
              .replace(/([A-Z])/g, '_$1')
              .toUpperCase()
              .replace(/^_/, '');

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

                // Exported symbols with in-file use sites are cross-file
                // contracts whose importers a single-file fixer cannot reach;
                // rewriting the local sites alone would still leave the export
                // renamed and importers broken. Report-only. (A bare exported
                // declaration with no extra references keeps the historical
                // rename behavior — nothing to orphan in-file.)
                const hasExtraReferences = declaredVariable.references.some(
                  (ref) => ref.identifier !== idNode,
                );
                if (isExported && hasExtraReferences) {
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
