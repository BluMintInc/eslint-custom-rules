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

export const preferDestructuringNoClass = createRule<[], MessageIds>({
  name: 'prefer-destructuring-no-class',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce destructuring when accessing properties, except for class instances. Extends ESLint core prefer-destructuring rule.',
      recommended: 'error',
      extendsBaseRule: 'prefer-destructuring',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          object: {
            type: 'boolean',
            default: true,
          },
          array: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferDestructuring: 'Use destructuring instead of accessing the property directly.',
    },
  },
  defaultOptions: [{
    object: true,
    array: false,
  }],
  create(context) {
    // Get the base prefer-destructuring rule
    const baseRule = context.sourceCode.eslintConfig?.rules?.['prefer-destructuring'];
    const baseRuleConfig = baseRule ? baseRule[1] : { object: true, array: false };

    // Create the base rule context
    const baseRuleContext = {
      ...context,
      options: [baseRuleConfig],
    };

    // Get the base rule implementation
    const baseRuleListeners = require('eslint/lib/rules/prefer-destructuring').default.create(baseRuleContext);

    return {
      MemberExpression(node) {
        // Skip if this is a class instance or static class member
        if (isClassInstance(node, context) || isStaticClassMember(node, context)) {
          return;
        }

        // Apply the base rule's MemberExpression handler
        if (baseRuleListeners.MemberExpression) {
          baseRuleListeners.MemberExpression(node);
        }
      },
    };
  },
});
