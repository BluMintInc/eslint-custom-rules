import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noOverridableMethodCallsInConstructor';

export const noOverridableMethodCallsInConstructor = createRule<[], MessageIds>({
  name: 'no-overridable-method-calls-in-constructor',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow calling overridable methods in constructors to prevent unexpected behavior',
      recommended: 'error',
    },
    fixable: undefined, // This rule is not automatically fixable
    schema: [],
    messages: {
      noOverridableMethodCallsInConstructor:
        'Avoid calling overridable methods in constructors. This can lead to unexpected behavior when the method is overridden in a derived class.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a method is overridable (not private and not static)
     */
    function isOverridableMethod(node: TSESTree.MethodDefinition): boolean {
      // Private methods are not overridable
      if (node.accessibility === 'private') {
        return false;
      }

      // Static methods are not overridable in the same way as instance methods
      if (node.static) {
        return false;
      }

      return true;
    }

    /**
     * Checks if a method is abstract
     */
    function isAbstractMethod(node: TSESTree.MethodDefinition): boolean {
      // Check if the method has the 'abstract' modifier
      if (node.type === AST_NODE_TYPES.MethodDefinition) {
        return node.key.type === AST_NODE_TYPES.Identifier &&
               node.value.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression;
      }
      return false;
    }

    /**
     * Collects all method names from a class, categorized by whether they are overridable
     */
    function collectMethodNames(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): { overridableMethods: Set<string>; abstractMethods: Set<string> } {
      const overridableMethods = new Set<string>();
      const abstractMethods = new Set<string>();

      for (const member of classNode.body.body) {
        if (member.type === AST_NODE_TYPES.MethodDefinition) {
          const methodName = getMethodName(member.key);
          if (methodName) {
            if (isAbstractMethod(member)) {
              abstractMethods.add(methodName);
            } else if (isOverridableMethod(member)) {
              overridableMethods.add(methodName);
            }
          }
        }
      }

      return { overridableMethods, abstractMethods };
    }

    /**
     * Gets the method name from a property key
     */
    function getMethodName(key: TSESTree.PropertyName): string | null {
      switch (key.type) {
        case AST_NODE_TYPES.Identifier:
          return key.name;
        case AST_NODE_TYPES.Literal:
          return typeof key.value === 'string' ? key.value : String(key.value);
        default:
          return null; // Computed property names are not handled
      }
    }

    /**
     * Checks if a call expression is calling a method on 'this' or 'super'
     */
    function isThisOrSuperMethodCall(node: TSESTree.CallExpression): {
      isMethodCall: boolean;
      methodName: string | null;
      isSuper: boolean;
    } {
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        !node.callee.computed // Ignore computed properties like this[methodName]()
      ) {
        const object = node.callee.object;
        const property = node.callee.property;

        // Check if it's a call on 'this'
        if (
          object.type === AST_NODE_TYPES.ThisExpression &&
          property.type === AST_NODE_TYPES.Identifier
        ) {
          return {
            isMethodCall: true,
            methodName: property.name,
            isSuper: false,
          };
        }

        // Check if it's a call on 'super'
        if (
          object.type === AST_NODE_TYPES.Super &&
          property.type === AST_NODE_TYPES.Identifier
        ) {
          return {
            isMethodCall: true,
            methodName: property.name,
            isSuper: true,
          };
        }
      }

      return { isMethodCall: false, methodName: null, isSuper: false };
    }

    return {
      // Process class declarations and expressions
      'ClassDeclaration, ClassExpression'(
        node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
      ) {
        const { overridableMethods, abstractMethods } = collectMethodNames(node);

        // Find the constructor method
        const constructor = node.body.body.find(
          (member): member is TSESTree.MethodDefinition =>
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.kind === 'constructor',
        );

        if (!constructor || !constructor.value.body) {
          return; // No constructor or constructor has no body
        }

        // Function to recursively check for method calls in the constructor
        function checkForMethodCalls(bodyNode: TSESTree.Node) {
          if (!bodyNode || typeof bodyNode !== 'object') {
            return;
          }

          if (bodyNode.type === AST_NODE_TYPES.CallExpression) {
            const { isMethodCall, methodName, isSuper } = isThisOrSuperMethodCall(
              bodyNode,
            );

            if (isMethodCall && methodName) {
              // Abstract methods are always a problem when called from constructor
              if (abstractMethods.has(methodName)) {
                context.report({
                  node: bodyNode,
                  messageId: 'noOverridableMethodCallsInConstructor',
                });
              }
              // Overridable methods are a problem when called on 'this'
              // (super calls are generally safer but still not ideal)
              else if (overridableMethods.has(methodName) && !isSuper) {
                context.report({
                  node: bodyNode,
                  messageId: 'noOverridableMethodCallsInConstructor',
                });
              }
            }
          }

          // Avoid circular references by not checking 'parent' property
          const keysToSkip = new Set(['parent', 'loc', 'range']);

          // Recursively check all child nodes
          for (const key in bodyNode) {
            if (keysToSkip.has(key)) continue;

            const child = bodyNode[key];
            if (child && typeof child === 'object') {
              if ('type' in child) {
                checkForMethodCalls(child);
              } else if (Array.isArray(child)) {
                child.forEach((item) => {
                  if (item && typeof item === 'object' && 'type' in item) {
                    checkForMethodCalls(item);
                  }
                });
              }
            }
          }
        }

        // Start checking from the constructor body
        checkForMethodCalls(constructor.value.body);
      },
    };
  },
});
