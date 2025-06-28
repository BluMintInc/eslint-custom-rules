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

          // Skip if the return statement includes computed property access or function calls
          if (hasComputedPropertyOrFunctionCall(returnStatement.argument)) {
            return;
          }

          // Check if the return statement is accessing a property from a constructor parameter
          if (isConstructorParameterPropertyAccess(returnStatement.argument)) {
            context.report({
              node,
              messageId: 'noPassthroughGetter',
            });
          }
        }
      },
    };

    /**
     * Check if the node is a simple property access from a constructor parameter
     * like this.settings.property or this.settings['property'] or this.settings.nested.deep.property
     */
    function isConstructorParameterPropertyAccess(node: TSESTree.Expression): boolean {
      // Check for member expressions like this.settings.property
      if (node.type === 'MemberExpression') {
        return isConstructorParameterAccess(node);
      }

      return false;
    }

    /**
     * Check if the node is accessing a property from a constructor parameter
     * Patterns to match: this.constructorParam.property, this.constructorParam['property'], this.constructorParam.nested.deep.property
     * Patterns to NOT match: this.property, SomeClass.property, this.methodCall()
     */
    function isConstructorParameterAccess(node: TSESTree.MemberExpression): boolean {
      // We need at least two levels: this.param.property
      // The base case should be this.constructorParameter
      if (node.object.type === 'ThisExpression') {
        // This is just this.property - not a constructor parameter property access
        return false;
      }

      // If the object is another member expression, check if it's this.constructorParameter
      if (node.object.type === 'MemberExpression') {
        // Check if this is this.constructorParameter.property (or deeper nesting)
        if (node.object.object.type === 'ThisExpression') {
          // This is this.constructorParameter.property - this is what we want to flag
          return true;
        }

        // Check for deeper nesting like this.constructorParameter.nested.deep.property
        return isConstructorParameterAccess(node.object);
      }

      // Handle static property access like ClassName.staticProperty.value
      // This should NOT be flagged as it's not a constructor parameter
      if (node.object.type === 'Identifier') {
        return false;
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

    /**
     * Check if the node includes computed property access or function calls
     */
    function hasComputedPropertyOrFunctionCall(node: TSESTree.Expression): boolean {
      // Check for call expressions like this.settings.getValue() or this.getPropertyName()
      if (node.type === 'CallExpression') {
        return true;
      }

      // Check for template literals like `id-${this.settings.uid}`
      if (node.type === 'TemplateLiteral') {
        return true;
      }

      // Check for new expressions like new SomeClass(this.settings.data)
      if (node.type === 'NewExpression') {
        return true;
      }

      // Check for binary expressions like this.settings.value + this.settings.other
      if (node.type === 'BinaryExpression') {
        return true;
      }

      // Check for array expressions like [this.settings.value]
      if (node.type === 'ArrayExpression') {
        return true;
      }

      // Check for object expressions like { value: this.settings.value }
      if (node.type === 'ObjectExpression') {
        return true;
      }

      // Check for member expressions with computed properties like this.settings[key]
      if (node.type === 'MemberExpression') {
        // If the property is computed with a dynamic expression (not a literal), it's not a simple property access
        if (node.computed && node.property.type !== 'Literal') {
          return true;
        }

        // Recursively check the object part
        return hasComputedPropertyOrFunctionCall(node.object);
      }

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
