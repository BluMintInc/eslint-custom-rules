import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferNullishCoalescing';

/**
 * This rule overrides the behavior of @typescript-eslint/prefer-nullish-coalescing
 * to only suggest using the nullish coalescing operator when checking for null/undefined,
 * not when intentionally checking for all falsy values.
 */
export const preferNullishCoalescingOverride = createRule<[], MessageIds>({
  name: 'prefer-nullish-coalescing-override',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using nullish coalescing operator instead of logical OR operator, but only when appropriate',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferNullishCoalescing:
        'Replace "{{left}} || {{right}}" with nullish coalescing when you only want a fallback for null or undefined. The logical OR operator treats "", 0, and false as missing values and silently swaps in the fallback, which hides valid data. Use "{{left}} ?? {{right}}" so only nullish inputs trigger the fallback.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Checks if a node is in a boolean context where truthiness matters
     */
    function isInBooleanContext(node: TSESTree.LogicalExpression): boolean {
      const parent = node.parent;
      if (!parent) return false;

      switch (parent.type) {
        // Direct boolean contexts
        case AST_NODE_TYPES.IfStatement:
        case AST_NODE_TYPES.WhileStatement:
        case AST_NODE_TYPES.DoWhileStatement:
        case AST_NODE_TYPES.ForStatement:
          return parent.test === node;

        case AST_NODE_TYPES.ConditionalExpression:
          return parent.test === node;

        // Logical expressions (&&, ||, !)
        case AST_NODE_TYPES.LogicalExpression:
          return true;

        case AST_NODE_TYPES.UnaryExpression:
          return parent.operator === '!';

        // JSX expressions that expect boolean values
        case AST_NODE_TYPES.JSXExpressionContainer:
          return isJSXBooleanContext(parent);

        default:
          return false;
      }
    }

    /**
     * Checks if a JSX expression container is in a boolean context
     */
    function isJSXBooleanContext(
      jsxContainer: TSESTree.JSXExpressionContainer,
    ): boolean {
      const parent = jsxContainer.parent;
      if (!parent) return false;

      // Check if used as a child expression (conditional rendering or child selection).
      // Other guards (rightOperandSuggestsFalsyHandling, etc.) will prevent unsafe conversions.
      if (
        parent.type === AST_NODE_TYPES.JSXElement ||
        parent.type === AST_NODE_TYPES.JSXFragment
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if the right operand suggests we want to handle all falsy values
     */
    function rightOperandSuggestsFalsyHandling(
      right: TSESTree.Expression,
    ): boolean {
      // String literals suggest we want to handle empty strings too
      if (
        right.type === AST_NODE_TYPES.Literal &&
        typeof right.value === 'string'
      ) {
        return true;
      }

      // Number literals (especially 0) suggest we want to handle falsy numbers
      if (
        right.type === AST_NODE_TYPES.Literal &&
        typeof right.value === 'number'
      ) {
        return true;
      }

      // Boolean literals suggest boolean logic
      if (
        right.type === AST_NODE_TYPES.Literal &&
        typeof right.value === 'boolean'
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if the left operand is likely to be used for boolean logic
     */
    function leftOperandSuggestsBooleanLogic(
      left: TSESTree.Expression,
    ): boolean {
      // Variables with boolean-like names
      if (left.type === AST_NODE_TYPES.Identifier) {
        const name = left.name.toLowerCase();
        const booleanPrefixes = [
          'is',
          'has',
          'can',
          'should',
          'will',
          'was',
          'were',
          'are',
        ];
        const booleanSuffixes = [
          'enabled',
          'disabled',
          'active',
          'inactive',
          'valid',
          'invalid',
        ];

        return (
          booleanPrefixes.some((prefix) => name.startsWith(prefix)) ||
          booleanSuffixes.some((suffix) => name.endsWith(suffix))
        );
      }

      // Binary expressions that result in booleans
      if (left.type === AST_NODE_TYPES.BinaryExpression) {
        const comparisonOperators = [
          '===',
          '!==',
          '==',
          '!=',
          '<',
          '>',
          '<=',
          '>=',
        ];
        return comparisonOperators.includes(left.operator);
      }

      return false;
    }

    /**
     * Checks if this is a variable assignment context where falsy handling is expected
     */
    function isVariableAssignmentWithFalsyHandling(
      node: TSESTree.LogicalExpression,
    ): boolean {
      const parent = node.parent;
      if (!parent) return false;

      // Variable declarations like: const name = username || 'Anonymous'
      if (
        parent.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.init === node
      ) {
        return rightOperandSuggestsFalsyHandling(node.right);
      }

      // Assignment expressions like: this.name = username || 'Anonymous'
      if (
        parent.type === AST_NODE_TYPES.AssignmentExpression &&
        parent.right === node
      ) {
        return rightOperandSuggestsFalsyHandling(node.right);
      }

      return false;
    }

    /**
     * Checks if this logical OR should be converted to nullish coalescing
     */
    function shouldConvertToNullishCoalescing(
      _node: TSESTree.LogicalExpression,
    ): boolean {
      return false;
    }

    void isInBooleanContext;
    void leftOperandSuggestsBooleanLogic;
    void rightOperandSuggestsFalsyHandling;
    void isVariableAssignmentWithFalsyHandling;

    return {
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (shouldConvertToNullishCoalescing(node)) {
          context.report({
            node,
            messageId: 'preferNullishCoalescing',
            data: {
              left: sourceCode.getText(node.left),
              right: sourceCode.getText(node.right),
            },
            fix(fixer) {
              return fixer.replaceText(
                node,
                `${sourceCode.getText(node.left)} ?? ${sourceCode.getText(
                  node.right,
                )}`,
              );
            },
          });
        }
      },
    };
  },
});
