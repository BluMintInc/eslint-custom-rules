import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'excessiveParentChain';

// Maximum number of consecutive .parent calls allowed before warning
const MAX_PARENT_CHAIN_LENGTH = 2;

// Handler types that this rule applies to
const HANDLER_TYPES = new Set([
  'DocumentChangeHandler',
  'DocumentChangeHandlerTransaction',
  'RealtimeDbChangeHandler',
  'RealtimeDbChangeHandlerTransaction',
]);

export const noExcessiveParentChain = createRule<[], MessageIds>({
  name: 'no-excessive-parent-chain',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers',
      recommended: 'error',
    },
    schema: [],
    messages: {
      excessiveParentChain:
        'Found {{count}} consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track variables that contain event data
    const eventDataVariables = new Map<string, string>();

    // Check if a function is one of our handler types
    function isHandlerFunction(node: TSESTree.Node): boolean {
      if (
        node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        node.type !== AST_NODE_TYPES.FunctionExpression
      ) {
        return false;
      }

      // Check if the function is assigned to a variable with a type annotation
      const parent = node.parent;
      if (
        parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        // Check for type annotation
        if (parent.id.typeAnnotation?.typeAnnotation) {
          const typeNode = parent.id.typeAnnotation.typeAnnotation;

          // Check if it's a reference to one of our handler types
          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
            HANDLER_TYPES.has(typeNode.typeName.name)
          ) {
            return true;
          }

          // Check for generic types that might be handlers
          if (
            typeNode.type === AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === AST_NODE_TYPES.Identifier
          ) {
            // Try to resolve the type name to see if it's one of our handler types
            const scope = context.getScope();
            const typeName = typeNode.typeName.name;
            const variable = scope.variables.find((v) => v.name === typeName);
            if (variable && variable.defs.length > 0) {
              const def = variable.defs[0];
              if (
                def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
                def.node.typeAnnotation.type ===
                  AST_NODE_TYPES.TSTypeReference &&
                def.node.typeAnnotation.typeName.type ===
                  AST_NODE_TYPES.Identifier &&
                HANDLER_TYPES.has(def.node.typeAnnotation.typeName.name)
              ) {
                return true;
              }
            }
          }
        }
      }

      // Check if the function is exported with a type annotation
      if (
        parent?.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        parent.declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
        parent.declaration.declarations[0]?.id.type ===
          AST_NODE_TYPES.Identifier &&
        parent.declaration.declarations[0].id.typeAnnotation?.typeAnnotation
      ) {
        const typeNode =
          parent.declaration.declarations[0].id.typeAnnotation.typeAnnotation;
        if (
          typeNode.type === AST_NODE_TYPES.TSTypeReference &&
          typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
          HANDLER_TYPES.has(typeNode.typeName.name)
        ) {
          return true;
        }
      }

      return false;
    }

    // Count consecutive .parent calls in a member expression chain
    function countParentChain(node: TSESTree.MemberExpression): number {
      let count = 1; // Start with 1 for the current .parent
      let current: TSESTree.Node = node.object;

      // Traverse the chain of member expressions
      while (
        current.type === AST_NODE_TYPES.MemberExpression &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        current.property.name === 'parent'
      ) {
        count++;
        current = current.object;
      }

      return count;
    }

    // This function has been removed as it's no longer needed

    return {
      // Track variable assignments that contain event data
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
          // Track direct event.data assignments
          if (
            node.init.type === AST_NODE_TYPES.MemberExpression &&
            node.init.property.type === AST_NODE_TYPES.Identifier &&
            node.init.property.name === 'data' &&
            node.init.object.type === AST_NODE_TYPES.Identifier
          ) {
            // Store the variable name and the source object (event)
            eventDataVariables.set(node.id.name, node.init.object.name);
          }

          // Track assignments from other tracked variables
          if (
            node.init.type === AST_NODE_TYPES.Identifier &&
            eventDataVariables.has(node.init.name)
          ) {
            // Store the variable name with the same source as the original variable
            eventDataVariables.set(
              node.id.name,
              eventDataVariables.get(node.init.name) || '',
            );
          }

          // Track assignments from event data properties
          if (
            node.init.type === AST_NODE_TYPES.MemberExpression &&
            node.init.object.type === AST_NODE_TYPES.Identifier &&
            eventDataVariables.has(node.init.object.name)
          ) {
            // Store the variable name with the same source as the original variable
            eventDataVariables.set(
              node.id.name,
              eventDataVariables.get(node.init.object.name) || '',
            );
          }
        }

        // Also track destructuring assignments
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init?.type === AST_NODE_TYPES.Identifier
        ) {
          for (const property of node.id.properties) {
            if (
              property.type === AST_NODE_TYPES.Property &&
              property.key.type === AST_NODE_TYPES.Identifier &&
              property.key.name === 'data' &&
              property.value.type === AST_NODE_TYPES.Identifier
            ) {
              // Store the destructured variable name
              eventDataVariables.set(property.value.name, node.init.name);
            }
          }
        }
      },

      // Check for excessive parent chains in member expressions
      MemberExpression(node) {
        // Only check for .parent chains
        if (
          node.property.type !== AST_NODE_TYPES.Identifier ||
          node.property.name !== 'parent'
        ) {
          return;
        }

        // Count the number of consecutive .parent calls
        const parentCount = countParentChain(node);
        if (parentCount <= MAX_PARENT_CHAIN_LENGTH) {
          return;
        }

        // Check if we're in a handler function
        let current: TSESTree.Node | undefined = node;
        let inHandler = false;
        while (current) {
          if (
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionExpression
          ) {
            if (isHandlerFunction(current)) {
              inHandler = true;
              break;
            }
          }
          current = current.parent;
        }

        if (!inHandler) {
          return;
        }

        // Check if this is part of a ref access pattern
        let isRefAccess = false;
        let memberExpr: TSESTree.Node = node;

        // Navigate up the member expression chain to find if there's a 'ref' property
        while (memberExpr.type === AST_NODE_TYPES.MemberExpression) {
          if (
            memberExpr.property.type === AST_NODE_TYPES.Identifier &&
            memberExpr.property.name === 'ref'
          ) {
            isRefAccess = true;
            break;
          }
          memberExpr = memberExpr.object;
        }

        // Only report if this is a ref.parent chain
        if (isRefAccess) {
          context.report({
            node,
            messageId: 'excessiveParentChain',
            data: {
              count: parentCount,
            },
          });
        }
      },
    };
  },
});
