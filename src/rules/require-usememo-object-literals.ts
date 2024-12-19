import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const requireUseMemoObjectLiterals = createRule({
  name: 'require-usememo-object-literals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useMemo for inline object literals passed as props to JSX components',
      recommended: 'error',
    },
    messages: {
      requireUseMemo:
        'Inline object/array literals in JSX props should be wrapped in useMemo to prevent unnecessary re-renders',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // Skip if the value is not an expression
        if (!node.value || node.value.type !== 'JSXExpressionContainer') {
          return;
        }

        // Skip if the prop name is 'sx' or ends with 'Sx'
        const propName = node.name.name;
        if (typeof propName === 'string' && (propName === 'sx' || propName.endsWith('Sx'))) {
          return;
        }

        const { expression } = node.value;

        // Check if the expression is an object or array literal
        if (
          (expression.type === 'ObjectExpression' ||
            expression.type === 'ArrayExpression') &&
          // Ensure we're in a function component context
          context
            .getAncestors()
            .some(
              (ancestor) =>
                ancestor.type === 'FunctionDeclaration' ||
                ancestor.type === 'ArrowFunctionExpression' ||
                ancestor.type === 'FunctionExpression',
            )
        ) {
          // Check if the parent component name starts with an uppercase letter
          // to ensure it's a React component
          const jsxElement = node.parent as TSESTree.JSXOpeningElement;
          const elementName =
            jsxElement.name.type === 'JSXIdentifier'
              ? jsxElement.name.name
              : '';

          if (elementName && /^[A-Z]/.test(elementName)) {
            context.report({
              node: expression,
              messageId: 'requireUseMemo',
            });
          }
        }
      },
    };
  },
});
