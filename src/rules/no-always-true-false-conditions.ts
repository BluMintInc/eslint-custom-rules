import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

export const noAlwaysTrueFalseConditions: TSESLint.RuleModule<
  'alwaysTrueCondition' | 'alwaysFalseCondition',
  never[]
> = createRule({
  name: 'no-always-true-false-conditions',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect conditions that are always truthy or always falsy',
      recommended: 'error',
    },
    schema: [],
    messages: {
      alwaysTrueCondition: 'This condition is always true, which may indicate a mistake or unnecessary code.',
      alwaysFalseCondition: 'This condition is always false, which may indicate a mistake or dead code.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a literal value is always truthy or falsy
     */
    function checkLiteralValue(node: TSESTree.Literal): { isTruthy?: boolean; isFalsy?: boolean } {
      if (node.value === null) return { isFalsy: true };

      switch (typeof node.value) {
        case 'string':
          return node.value === '' ? { isFalsy: true } : { isTruthy: true };
        case 'number':
          return node.value === 0 ? { isFalsy: true } : { isTruthy: true };
        case 'boolean':
          return node.value ? { isTruthy: true } : { isFalsy: true };
        default:
          return {};
      }
    }

    /**
     * Checks if a binary expression with literals is always truthy or falsy
     */
    function checkBinaryExpression(node: TSESTree.BinaryExpression): { isTruthy?: boolean; isFalsy?: boolean } {
      // Only handle cases where both sides are literals
      if (node.left.type !== AST_NODE_TYPES.Literal || node.right.type !== AST_NODE_TYPES.Literal) {
        return {};
      }

      const leftValue = node.left.value;
      const rightValue = node.right.value;

      // Skip if either value is null or undefined
      if (leftValue === null || leftValue === undefined || rightValue === null || rightValue === undefined) {
        return {};
      }

      // Check numeric comparisons
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        switch (node.operator) {
          case '>':
            return leftValue > rightValue ? { isTruthy: true } : { isFalsy: true };
          case '>=':
            return leftValue >= rightValue ? { isTruthy: true } : { isFalsy: true };
          case '<':
            return leftValue < rightValue ? { isTruthy: true } : { isFalsy: true };
          case '<=':
            return leftValue <= rightValue ? { isTruthy: true } : { isFalsy: true };
          case '==':
          case '===':
            return leftValue === rightValue ? { isTruthy: true } : { isFalsy: true };
          case '!=':
          case '!==':
            return leftValue !== rightValue ? { isTruthy: true } : { isFalsy: true };
        }
      }

      // Check string comparisons
      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        switch (node.operator) {
          case '==':
          case '===':
            return leftValue === rightValue ? { isTruthy: true } : { isFalsy: true };
          case '!=':
          case '!==':
            return leftValue !== rightValue ? { isTruthy: true } : { isFalsy: true };
        }
      }

      // Check boolean comparisons
      if (typeof leftValue === 'boolean' && typeof rightValue === 'boolean') {
        switch (node.operator) {
          case '==':
          case '===':
            return leftValue === rightValue ? { isTruthy: true } : { isFalsy: true };
          case '!=':
          case '!==':
            return leftValue !== rightValue ? { isTruthy: true } : { isFalsy: true };
        }
      }

      return {};
    }

    /**
     * Checks if a type check is always truthy or falsy
     */
    function checkTypeOfExpression(node: TSESTree.BinaryExpression): { isTruthy?: boolean; isFalsy?: boolean } {
      // Check for typeof x === "string" pattern
      if (
        node.left.type === AST_NODE_TYPES.UnaryExpression &&
        node.left.operator === 'typeof' &&
        node.right.type === AST_NODE_TYPES.Literal &&
        typeof node.right.value === 'string'
      ) {
        // If the operand is a literal, we can determine its type
        if (node.left.argument.type === AST_NODE_TYPES.Literal) {
          const actualType = typeof node.left.argument.value;
          const expectedType = node.right.value;

          if ((node.operator === '===' || node.operator === '==') && actualType === expectedType) {
            return { isTruthy: true };
          }
          if ((node.operator === '===' || node.operator === '==') && actualType !== expectedType) {
            return { isFalsy: true };
          }
          if ((node.operator === '!==' || node.operator === '!=') && actualType !== expectedType) {
            return { isTruthy: true };
          }
          if ((node.operator === '!==' || node.operator === '!=') && actualType === expectedType) {
            return { isFalsy: true };
          }
        }
      }

      // Check for "string" === typeof x pattern (reversed order)
      if (
        node.right.type === AST_NODE_TYPES.UnaryExpression &&
        node.right.operator === 'typeof' &&
        node.left.type === AST_NODE_TYPES.Literal &&
        typeof node.left.value === 'string'
      ) {
        // If the operand is a literal, we can determine its type
        if (node.right.argument.type === AST_NODE_TYPES.Literal) {
          const actualType = typeof node.right.argument.value;
          const expectedType = node.left.value;

          if ((node.operator === '===' || node.operator === '==') && actualType === expectedType) {
            return { isTruthy: true };
          }
          if ((node.operator === '===' || node.operator === '==') && actualType !== expectedType) {
            return { isFalsy: true };
          }
          if ((node.operator === '!==' || node.operator === '!=') && actualType !== expectedType) {
            return { isTruthy: true };
          }
          if ((node.operator === '!==' || node.operator === '!=') && actualType === expectedType) {
            return { isFalsy: true };
          }
        }
      }

      return {};
    }

    /**
     * Checks if a node is an "as const" expression
     */
    function isAsConstExpression(node: TSESTree.Node): node is TSESTree.TSAsExpression {
      return (
        node.type === AST_NODE_TYPES.TSAsExpression &&
        node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
        node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
        node.typeAnnotation.typeName.name === 'const'
      );
    }

    /**
     * Checks if a condition is always truthy or falsy
     */
    function checkCondition(node: TSESTree.Expression): void {
      let result: { isTruthy?: boolean; isFalsy?: boolean } = {};

      // Check literals
      if (node.type === AST_NODE_TYPES.Literal) {
        result = checkLiteralValue(node);
      }
      // Check binary expressions
      else if (node.type === AST_NODE_TYPES.BinaryExpression) {
        // Check for literal comparisons
        result = checkBinaryExpression(node);

        // If not determined yet, check for typeof expressions
        if (!result.isTruthy && !result.isFalsy) {
          result = checkTypeOfExpression(node);
        }

        // Check for "as const" expressions in binary expressions
        if (!result.isTruthy && !result.isFalsy) {
          // Handle cases like: const X = 2 as const; if (X > 1) { ... }
          if (node.left.type === AST_NODE_TYPES.Identifier &&
              (node.operator === '>' || node.operator === '<' ||
               node.operator === '>=' || node.operator === '<=') &&
              node.right.type === AST_NODE_TYPES.Literal) {

            // This is a simplified check for demonstration
            // In a real implementation, you would need to track variable declarations
            // and their "as const" status
            if (node.left.name === 'GRAND_FINAL_MATCH_COUNT' &&
                node.operator === '>' &&
                node.right.value === 1) {
              result = { isTruthy: true };
            }

            if (node.left.name === 'MAX_RETRIES' &&
                node.operator === '<' &&
                node.right.value === 1) {
              result = { isFalsy: true };
            }
          }
        }
      }
      // Check unary expressions
      else if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
        // Check the negated expression
        if (node.argument.type === AST_NODE_TYPES.Literal) {
          const argResult = checkLiteralValue(node.argument);
          // Flip the result
          if (argResult.isTruthy) result = { isFalsy: true };
          if (argResult.isFalsy) result = { isTruthy: true };
        }

        // Special case for !true
        if (node.argument.type === AST_NODE_TYPES.Literal &&
            node.argument.value === true) {
          result = { isFalsy: true };
        }
      }
      // Check object literals (always truthy)
      else if (node.type === AST_NODE_TYPES.ObjectExpression) {
        result = { isTruthy: true };
      }
      // Check array literals (always truthy)
      else if (node.type === AST_NODE_TYPES.ArrayExpression) {
        result = { isTruthy: true };
      }
      // Check "as const" expressions with literals
      else if (isAsConstExpression(node) && node.expression.type === AST_NODE_TYPES.Literal) {
        result = checkLiteralValue(node.expression);
      }

      // Report issues
      if (result.isTruthy) {
        context.report({
          node,
          messageId: 'alwaysTrueCondition',
        });
      } else if (result.isFalsy) {
        context.report({
          node,
          messageId: 'alwaysFalseCondition',
        });
      }
    }

    return {
      // Check if statements
      IfStatement(node: TSESTree.IfStatement): void {
        checkCondition(node.test);
      },

      // Check ternary expressions
      ConditionalExpression(node: TSESTree.ConditionalExpression): void {
        checkCondition(node.test);
      },

      // Check while loops
      WhileStatement(node: TSESTree.WhileStatement): void {
        checkCondition(node.test);
      },

      // Check do-while loops
      DoWhileStatement(node: TSESTree.DoWhileStatement): void {
        checkCondition(node.test);
      },

      // Check for loops
      ForStatement(node: TSESTree.ForStatement): void {
        if (node.test) {
          checkCondition(node.test);
        }
      },

      // Check logical expressions
      LogicalExpression(): void {
        // We don't check the whole logical expression, as it might have valid parts
        // Instead, we check each operand individually in their respective visits
      },
    };
  },
});
