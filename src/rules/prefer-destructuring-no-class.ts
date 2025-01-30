import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDestructuring';

function isClassInstance(node: TSESTree.Node, context: any): boolean {
  // Check if node is a MemberExpression
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;

    // If object is a NewExpression, it's a class instance
    if (object.type === AST_NODE_TYPES.NewExpression) {
      return true;
    }

    // If object is an identifier, check if it refers to a class instance
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find((ref: any) => ref.identifier.name === variable);

      if (ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
        const init = ref.resolved.defs[0].node.init;
        return init?.type === AST_NODE_TYPES.NewExpression;
      }

      // Check if the identifier refers to a class (not an instance)
      if (ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration) {
        return false;
      }
    }

    // Recursively check if parent object is a class instance
    if (object.type === AST_NODE_TYPES.MemberExpression) {
      return isClassInstance(object, context);
    }
  }
  return false;
}

function isStaticClassMember(node: TSESTree.Node, context: any): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const object = node.object;
    if (object.type === AST_NODE_TYPES.Identifier) {
      const variable = object.name;
      const scope = context.getScope();
      const ref = scope.references.find((ref: any) => ref.identifier.name === variable);
      return ref?.resolved?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration;
    }
  }
  return false;
}

function shouldEnforceDestructuring(node: TSESTree.Node, context: any): boolean {
  // Don't enforce destructuring for class instances or static class members
  if (isClassInstance(node, context) || isStaticClassMember(node, context)) {
    return false;
  }
  return true;
}

export const preferDestructuringNoClass = createRule<[], MessageIds>({
  name: 'prefer-destructuring-no-class',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce destructuring when accessing properties, except for class instances',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferDestructuring: 'Use destructuring instead of accessing the property directly.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      MemberExpression(node) {
        // Skip if this is part of an assignment pattern
        if (node.parent?.type === AST_NODE_TYPES.AssignmentPattern) {
          return;
        }

        // Only check property access with dot notation
        if (node.computed || !node.property || node.property.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        // Check if this is part of a variable declaration
        if (node.parent?.type === AST_NODE_TYPES.VariableDeclarator) {
          // Skip if this is a class instance or static class member
          if (!shouldEnforceDestructuring(node, context)) {
            return;
          }

          const propertyName = node.property.name;
          let objectName = '';

          // Handle nested property access
          if (node.object.type === AST_NODE_TYPES.MemberExpression) {
            const parts: string[] = [];
            let current: TSESTree.Node = node.object;
            while (current.type === AST_NODE_TYPES.MemberExpression) {
              if (current.property.type === AST_NODE_TYPES.Identifier) {
                parts.unshift(current.property.name);
              }
              current = current.object;
            }
            if (current.type === AST_NODE_TYPES.Identifier) {
              parts.unshift(current.name);
              objectName = parts.join('.');
            }
          } else if (node.object.type === AST_NODE_TYPES.Identifier) {
            objectName = node.object.name;
          }

          if (objectName) {
            context.report({
              node,
              messageId: 'preferDestructuring',
              fix(fixer) {
                const parent = node.parent as TSESTree.VariableDeclarator;
                return fixer.replaceText(
                  parent,
                  `{ ${propertyName} } = ${objectName}`
                );
              },
            });
          }
        }
      },
    };
  },
});
