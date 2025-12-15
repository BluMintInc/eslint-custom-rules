import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const isUpperSnakeCase = (str: string): boolean =>
  /^[A-Z][A-Z0-9_]*$/.test(str);

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
          if (
            !init ||
            init.type === AST_NODE_TYPES.CallExpression ||
            init.type === AST_NODE_TYPES.BinaryExpression ||
            init.type === AST_NODE_TYPES.NewExpression
          ) {
            return;
          }

          const sourceCode = context.getSourceCode();
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

          // Check for UPPER_SNAKE_CASE
          if (!isUpperSnakeCase(name)) {
            const newName = name
              .replace(/([A-Z])/g, '_$1')
              .toUpperCase()
              .replace(/^_/, '');

            context.report({
              node: declaration,
              messageId: 'upperSnakeCase',
              data: {
                name,
                suggestedName: newName,
              },
              fix(fixer) {
                if (typeAnnotation) {
                  return fixer.replaceText(
                    declaration,
                    `${newName}${typeText} = ${initText}`,
                  );
                } else {
                  return fixer.replaceText(declaration.id, newName);
                }
              },
            });
          }
        });
      },
    };
  },
});
