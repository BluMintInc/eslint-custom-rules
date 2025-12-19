import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

export const requireUseMemoObjectLiterals = createRule({
  name: 'require-usememo-object-literals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Enforce using useMemo for inline object/array literals passed as props to JSX components to prevent unnecessary re-renders. When object/array literals are defined inline in JSX, they create new references on every render, causing child components to re-render even if the values haven't changed. Wrap them in useMemo to maintain referential equality.",
      recommended: 'error',
    },
    messages: {
      requireUseMemo:
        'Inline {{literalType}} literal passed to {{componentName}} prop "{{propName}}" is recreated on every render, producing a new reference that forces child components to re-render even when values stay the same. Wrap the literal in useMemo (or hoist a memoized constant) so the prop reference remains stable between renders.',
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
        if (
          typeof propName === 'string' &&
          (propName === 'sx' || propName.endsWith('Sx'))
        ) {
          return;
        }

        const { expression } = node.value;

        // Check if the expression is an object or array literal
        if (
          (expression.type === 'ObjectExpression' ||
            expression.type === 'ArrayExpression') &&
          // Ensure we're in a function component context
          ASTHelpers.getAncestors(context, node).some(
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
            const literalType =
              expression.type === 'ObjectExpression' ? 'object' : 'array';
            context.report({
              node: expression,
              messageId: 'requireUseMemo',
              data: {
                literalType,
                propName: typeof propName === 'string' ? propName : 'prop',
                componentName: elementName,
              },
            });
          }
        }
      },
    };
  },
});
