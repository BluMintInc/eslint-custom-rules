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
      upperSnakeCase: 'Global constants should be in UPPER_SNAKE_CASE',
      asConst: 'Global constants should use "as const"',
    },
  },
  defaultOptions: [],
  create(context) {
    // Check if the file is a TypeScript file
    const isTypeScript = context.getFilename().endsWith('.ts') || context.getFilename().endsWith('.tsx');

    return {
      VariableDeclaration(node) {
        // Only check top-level const declarations
        if (node.kind !== 'const') {
          return;
        }

        // Skip if not at program level
        if (node.parent?.type !== AST_NODE_TYPES.Program) {
          return;
        }

        // Skip if any declaration is a function component, arrow function, forwardRef, or memo
        const shouldSkip = node.declarations.some(declaration => {
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
          if (/^[A-Z]/.test(name) && init.type === AST_NODE_TYPES.ArrowFunctionExpression) {
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
            if (expression.type === AST_NODE_TYPES.CallExpression &&
                expression.callee.type === AST_NODE_TYPES.Identifier) {
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
          const typeText = typeAnnotation ? sourceCode.getText(typeAnnotation) : '';

          // Only check for as const in TypeScript files
          if (isTypeScript) {
            const isAsConstExpression = (node: TSESTree.Node): boolean => {
              if (node.type === AST_NODE_TYPES.TSAsExpression) {
                return (
                  node.typeAnnotation?.type === AST_NODE_TYPES.TSTypeReference &&
                  (node.typeAnnotation?.typeName as TSESTree.Identifier)?.name === 'const'
                );
              }
              return false;
            };

            const shouldHaveAsConst = (node: TSESTree.Node): boolean => {
              // Skip if it's already an as const expression
              if (isAsConstExpression(node)) {
                return false;
              }

              // Handle type assertions
              if (node.type === AST_NODE_TYPES.TSTypeAssertion || node.type === AST_NODE_TYPES.TSAsExpression) {
                return shouldHaveAsConst(node.expression);
              }

              // Check if it's a literal, array, or object that should have as const
              return (
                node.type === AST_NODE_TYPES.Literal ||
                node.type === AST_NODE_TYPES.ArrayExpression ||
                node.type === AST_NODE_TYPES.ObjectExpression
              );
            };

            // Only require as const if it's not a Record type
            const isRecordType = typeAnnotation?.typeAnnotation?.type === AST_NODE_TYPES.TSTypeReference &&
              (typeAnnotation.typeAnnotation.typeName as TSESTree.Identifier)?.name === 'Record';

            if (shouldHaveAsConst(init) && !isRecordType) {
              context.report({
                node: declaration,
                messageId: 'asConst',
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
              fix(fixer) {
                if (typeAnnotation) {
                  return fixer.replaceText(declaration, `${newName}${typeText} = ${initText}`);
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
