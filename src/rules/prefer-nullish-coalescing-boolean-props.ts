import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferNullishCoalescing';

/**
 * Determines if a node is within a boolean context in JSX props or other boolean contexts
 */
function isInBooleanContext(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  // Traverse up the AST to find if we're in a boolean context
  while (current && current.parent) {
    // If we're in a JSX attribute value
    if (current.parent.type === AST_NODE_TYPES.JSXAttribute) {
      const attributeName = current.parent.name.name;

      // Common boolean props in React components
      const booleanPropNames = [
        'disabled',
        'required',
        'checked',
        'selected',
        'readOnly',
        'autoFocus',
        'autoPlay',
        'controls',
        'default',
        'defer',
        'hidden',
        'isOpen',
        'loop',
        'multiple',
        'muted',
        'noValidate',
        'open',
        'scoped',
        'seamless',
        'itemScope',
        'allowFullScreen',
        'async',
        'autofocus',
        'autoplay',
        'formNoValidate',
        'spellcheck',
        'translate',
      ];

      // Check if the attribute name is a common boolean prop
      if (
        typeof attributeName === 'string' &&
        (booleanPropNames.includes(attributeName) ||
          // Also check for props that start with 'is', 'has', 'should', 'can', 'will', etc.
          /^(is|has|should|can|will|do|does|did|was|were|enable|disable)/.test(
            attributeName,
          ))
      ) {
        return true;
      }
    }

    // If we're in a boolean expression context
    if (
      current.parent.type === AST_NODE_TYPES.IfStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a logical expression that's part of a boolean context
    if (
      current.parent.type === AST_NODE_TYPES.LogicalExpression &&
      (current.parent.operator === '&&' || current.parent.operator === '||')
    ) {
      // Continue up the tree to check if the parent logical expression is in a boolean context
      current = current.parent;
      continue;
    }

    // If we're in a unary expression with a boolean operator
    if (
      current.parent.type === AST_NODE_TYPES.UnaryExpression &&
      current.parent.operator === '!'
    ) {
      return true;
    }

    // If we're in a conditional expression (ternary)
    if (
      current.parent.type === AST_NODE_TYPES.ConditionalExpression &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a variable declaration that has a boolean-like name
    if (
      current.parent.type === AST_NODE_TYPES.VariableDeclarator &&
      current.parent.id.type === AST_NODE_TYPES.Identifier
    ) {
      const variableName = current.parent.id.name;
      if (/^(is|has|should|can|will|do|does|did|was|were)/.test(variableName)) {
        return true;
      }
    }

    // If we're in a while loop condition
    if (
      current.parent.type === AST_NODE_TYPES.WhileStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a for loop condition
    if (
      current.parent.type === AST_NODE_TYPES.ForStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    // If we're in a do-while loop condition
    if (
      current.parent.type === AST_NODE_TYPES.DoWhileStatement &&
      current === current.parent.test
    ) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

/**
 * Checks if the left operand could be nullish (null or undefined)
 */
function couldBeNullish(node: TSESTree.Expression): boolean {
  // For literals, check the actual value
  if (node.type === AST_NODE_TYPES.Literal) {
    // If it's null or undefined, it's nullish
    if (node.value === null || node.value === undefined) {
      return true;
    }
    // Boolean literals, numbers, strings are not nullish
    if (
      typeof node.value === 'boolean' ||
      typeof node.value === 'number' ||
      typeof node.value === 'string'
    ) {
      return false;
    }
  }

  // For other expressions, assume they could be nullish
  return true;
}

export const preferNullishCoalescingBooleanProps = createRule<[], MessageIds>({
  name: 'prefer-nullish-coalescing-boolean-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      preferNullishCoalescing:
        'Prefer using nullish coalescing operator (??) instead of logical OR operator (||) when checking for null/undefined',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      LogicalExpression(node) {
        if (node.operator === '||') {
          // If the node is in a boolean context, we allow logical OR
          if (isInBooleanContext(node)) {
            return;
          }

          // Check if this could benefit from nullish coalescing
          // We only suggest nullish coalescing when the left operand could be nullish
          if (couldBeNullish(node.left)) {
            context.report({
              node,
              messageId: 'preferNullishCoalescing',
              fix(fixer) {
                return fixer.replaceText(
                  node,
                  `${context.getSourceCode().getText(node.left)} ?? ${context
                    .getSourceCode()
                    .getText(node.right)}`,
                );
              },
            });
          }
        }
      },
    };
  },
});
