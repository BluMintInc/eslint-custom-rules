import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

function isInsideFunction(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return true;
    }
    current = current.parent as TSESTree.Node;
  }
  return false;
}

function isFunctionDefinition(node: TSESTree.Expression | null): boolean {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function unwrapExpression(
  node: TSESTree.Expression | null,
): TSESTree.Expression | null {
  let current: TSESTree.Expression | null = node;
  // Unwrap common TS/JS wrappers iteratively
  // We intentionally include ParenthesizedExpression via a runtime string check
  while (current) {
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression' ||
      current.type === 'TSTypeAssertion' ||
      (current as any).type === 'ParenthesizedExpression'
    ) {
      const inner = (current as any).expression as
        | TSESTree.Expression
        | undefined;
      if (!inner) break;
      current = inner;
      continue;
    }
    break;
  }
  return current;
}

function isMutableValue(node: TSESTree.Expression | null): boolean {
  const unwrapped = unwrapExpression(node);
  if (!unwrapped) return false;

  // If explicitly marked readonly with `as const`, treat as immutable
  if (node && isAsConstExpression(node)) {
    return false;
  }

  // Check for JSX elements (always mutable due to props/context)
  if (unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment') {
    return true;
  }

  // Check for object expressions (always mutable)
  if (unwrapped.type === 'ObjectExpression') {
    return true;
  }

  // Arrays are mutable objects unless explicitly narrowed with `as const`.
  if (unwrapped.type === 'ArrayExpression') {
    return true;
  }

  // Check for new expressions (e.g., new Map(), new Set())
  if (unwrapped.type === 'NewExpression') {
    return true;
  }

  // Check for array/object methods that return mutable values
  if (unwrapped.type === 'CallExpression') {
    const callee = unwrapped.callee;
    if (callee.type === 'MemberExpression') {
      // Handle both Identifier and non-Identifier property nodes
      if (callee.property.type !== 'Identifier') {
        return false;
      }
      const methodName = callee.property.name;
      const mutatingMethods = [
        'slice',
        'map',
        'filter',
        'concat',
        'from',
        'reduce',
        'flatMap',
        'splice',
        'reverse',
        'sort',
        'fill',
      ];
      return mutatingMethods.includes(methodName);
    }
  }

  return false;
}

function isNumericLiteral(node: TSESTree.Node | null): boolean {
  if (!node) return false;
  return (
    node.type === 'Literal' &&
    typeof (node as TSESTree.Literal).value === 'number'
  );
}

function isZeroOrOne(node: TSESTree.Node | null): boolean {
  if (!isNumericLiteral(node)) return false;
  const value = (node as TSESTree.Literal).value as number;
  return value === 0 || value === 1;
}

function isAsConstExpression(node: TSESTree.Node | null): boolean {
  if (!node) return false;

  // If this is an "as const" assertion directly
  if (node.type === 'TSAsExpression') {
    if (
      node.typeAnnotation.type === 'TSTypeReference' &&
      node.typeAnnotation.typeName.type === 'Identifier' &&
      node.typeAnnotation.typeName.name === 'const'
    ) {
      return true;
    }
    // Not "as const" - check nested expression
    return isAsConstExpression(node.expression);
  }

  // Unwrap other wrappers and re-check
  if (node.type === 'TSSatisfiesExpression') {
    return isAsConstExpression(node.expression);
  }
  if (node.type === 'TSNonNullExpression') {
    return isAsConstExpression(node.expression);
  }
  if (node.type === 'ChainExpression') {
    return isAsConstExpression(node.expression);
  }
  if (node.type === 'TSTypeAssertion') {
    return isAsConstExpression(node.expression);
  }
  // ParenthesizedExpression handled via runtime check to avoid enum type issues
  if ((node as any).type === 'ParenthesizedExpression') {
    return isAsConstExpression((node as any).expression);
  }

  return false;
}

export const extractGlobalConstants: TSESLint.RuleModule<
  'extractGlobalConstants' | 'requireAsConst',
  never[]
> = createRule({
  create(context) {
    return {
      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        if (node.kind !== 'const') {
          return;
        }

        // Skip if any of the declarations are function definitions or mutable values
        if (
          node.declarations.some(
            (d) => isFunctionDefinition(d.init) || isMutableValue(d.init),
          )
        ) {
          return;
        }

        const scope = context.getScope();
        const hasDependencies = node.declarations.some(
          (declaration) =>
            declaration.init &&
            ASTHelpers.declarationIncludesIdentifier(declaration.init),
        );

        // Skip constants with 'as const' type assertions used in loops
        const hasAsConstAssertion = node.declarations.some(
          (declaration) =>
            declaration.init && isAsConstExpression(declaration.init),
        );

        // Only check function/block scoped constants without dependencies
        if (
          !hasDependencies &&
          !hasAsConstAssertion &&
          (scope.type === 'function' || scope.type === 'block') &&
          isInsideFunction(node) &&
          node.declarations.some((d) => d.id.type === 'Identifier')
        ) {
          for (const d of node.declarations) {
            if (d.id.type !== 'Identifier') continue;
            const constName = d.id.name;
            context.report({
              node: d,
              messageId: 'extractGlobalConstants',
              data: { declarationName: constName },
            });
          }
        }
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (
          node.parent &&
          (node.parent.type === 'FunctionDeclaration' ||
            node.parent.type === 'FunctionExpression' ||
            node.parent.type === 'ArrowFunctionExpression')
        ) {
          const scope = context.getScope();
          const hasDependencies = ASTHelpers.blockIncludesIdentifier(node.body);
          if (!hasDependencies && scope.type === 'function') {
            const funcName = node.id?.name;
            context.report({
              node,
              messageId: 'extractGlobalConstants',
              data: {
                declarationName: funcName,
              },
            });
          }
        }
      },
      ForStatement(node: TSESTree.ForStatement) {
        // Check initialization
        if (node.init && node.init.type === 'VariableDeclaration') {
          for (const decl of node.init.declarations) {
            if (
              decl.init &&
              isNumericLiteral(decl.init) &&
              !isZeroOrOne(decl.init) &&
              !isAsConstExpression(decl.init)
            ) {
              context.report({
                node: decl.init,
                messageId: 'requireAsConst',
                data: {
                  value: (decl.init as TSESTree.Literal).value,
                },
              });
            }
          }
        }

        // Check test condition
        if (node.test && node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }

        // Check update expression
        if (node.update) {
          if (node.update.type === 'AssignmentExpression') {
            if (
              node.update.right &&
              isNumericLiteral(node.update.right) &&
              !isZeroOrOne(node.update.right) &&
              !isAsConstExpression(node.update.right)
            ) {
              context.report({
                node: node.update.right,
                messageId: 'requireAsConst',
                data: {
                  value: (node.update.right as TSESTree.Literal).value,
                },
              });
            }
          } else if (node.update.type === 'BinaryExpression') {
            if (
              isNumericLiteral(node.update.right) &&
              !isZeroOrOne(node.update.right) &&
              !isAsConstExpression(node.update.right)
            ) {
              context.report({
                node: node.update.right,
                messageId: 'requireAsConst',
                data: {
                  value: (node.update.right as TSESTree.Literal).value,
                },
              });
            }
          }
        }
      },
      WhileStatement(node: TSESTree.WhileStatement) {
        // Check test condition
        if (node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }
      },
      DoWhileStatement(node: TSESTree.DoWhileStatement) {
        // Check test condition
        if (node.test.type === 'BinaryExpression') {
          if (
            isNumericLiteral(node.test.right) &&
            !isZeroOrOne(node.test.right) &&
            !isAsConstExpression(node.test.right)
          ) {
            context.report({
              node: node.test.right,
              messageId: 'requireAsConst',
              data: {
                value: (node.test.right as TSESTree.Literal).value,
              },
            });
          }
        }
      },
    };
  },

  name: 'extract-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Extract static constants and functions to the global scope when possible, and enforce type narrowing with as const for numeric literals in loops',
      recommended: 'error',
    },
    schema: [],
    messages: {
      extractGlobalConstants:
        'Move this declaration {{ declarationName }} to the global scope and rename it to UPPER_SNAKE_CASE if necessary.',
      requireAsConst:
        'Numeric literal {{ value }} in loop expression should be extracted to a constant with "as const" type assertion.',
    },
  },
  defaultOptions: [],
});
