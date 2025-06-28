import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';

export const noPassthroughGetters = createRule({
  create(context) {
    return {
      // Target getter methods in classes
      MethodDefinition(node) {
        // Only check getter methods
        if (node.kind !== 'get') {
          return;
        }

        // Skip if the getter has decorators (like @Memoize)
        if (node.decorators && node.decorators.length > 0) {
          return;
        }

        const methodBody = node.value.body;
        if (!methodBody) {
          return;
        }

        // Check if the getter body is a simple return statement
        if (
          methodBody.body.length === 1 &&
          methodBody.body[0].type === 'ReturnStatement'
        ) {
          const returnStatement = methodBody
            .body[0] as TSESTree.ReturnStatement;

          // Skip if there's no return argument
          if (!returnStatement.argument) {
            return;
          }

          // Skip if the return statement uses super
          if (containsSuper(returnStatement.argument)) {
            return;
          }

          // Skip if the return statement includes type assertions or casting
          if (hasTypeAssertion(returnStatement.argument)) {
            return;
          }

          // Skip if the return statement includes null/undefined handling
          if (hasNullUndefinedHandling(returnStatement.argument)) {
            return;
          }

          // Check if the return statement is accessing a property from this.something
          if (isSimplePropertyAccess(returnStatement.argument)) {
            context.report({
              node,
              messageId: 'noPassthroughGetter',
            });
          }
        }
      },
    };

    /**
     * Check if the node is a simple property access like this.settings.property
     */
    function isSimplePropertyAccess(node: TSESTree.Expression): boolean {
      // Check for member expressions like this.settings.property
      if (node.type === 'MemberExpression') {
        // Check if we're accessing a property from this.something
        if (node.object.type === 'MemberExpression') {
          const objectExpression = node.object;

          // Check if the object is 'this'
          if (objectExpression.object.type === 'ThisExpression') {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check if the node contains a reference to super
     */
    function containsSuper(node: TSESTree.Expression): boolean {
      if (node.type === 'MemberExpression') {
        if (node.object.type === 'Super') {
          return true;
        }
        return containsSuper(node.object);
      }
      return false;
    }

    /**
     * Check if the node has a type assertion or casting
     */
    function hasTypeAssertion(node: TSESTree.Expression): boolean {
      if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
        return true;
      }

      if (node.type === 'MemberExpression') {
        return hasTypeAssertion(node.object);
      }

      return false;
    }

    /**
     * Check if the node handles null/undefined values
     */
    function hasNullUndefinedHandling(node: TSESTree.Expression): boolean {
      // Check for logical expressions like this.settings.property || []
      if (node.type === 'LogicalExpression') {
        return true;
      }

      // Check for conditional expressions like this.settings.property ? this.settings.property : []
      if (node.type === 'ConditionalExpression') {
        return true;
      }

      // Check for optional chaining like this.settings?.property
      if (node.type === 'MemberExpression' && node.optional) {
        return true;
      }

      // The nullish coalescing check is already covered by the LogicalExpression check above

      return false;
    }
  },

  name: 'no-passthrough-getters',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid unnecessary getter methods that simply return properties from constructor parameters',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noPassthroughGetter:
        'Avoid unnecessary getter methods that simply return properties from constructor parameters. Access the property directly instead.',
    },
  },
  defaultOptions: [],
});
