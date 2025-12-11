import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'excessiveParentChain';
type Options = [{ max?: number }];

// Maximum number of consecutive .parent calls allowed before warning
const DEFAULT_MAX_PARENT_CHAIN_LENGTH = 2;

// Handler types that this rule applies to
const HANDLER_TYPES = new Set([
  'DocumentChangeHandler',
  'DocumentChangeHandlerTransaction',
  'RealtimeDbChangeHandler',
  'RealtimeDbChangeHandlerTransaction',
]);

export const noExcessiveParentChain = createRule<Options, MessageIds>({
  name: 'no-excessive-parent-chain',
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        'Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: {
            type: 'integer',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      excessiveParentChain:
        'Avoid using long chains of .parent calls ({{count}} found). Use the params object from the event parameter instead, which provides type-safe access to path segments.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const maxParentChainLength =
      context.options[0]?.max ?? DEFAULT_MAX_PARENT_CHAIN_LENGTH;

    // Track variables that contain event data
    const eventDataVariables = new Map<string, string>();
    const eventIdentifiers = new Set<string>();
    const HANDLER_PARAM_SOURCE = '__handler_param__';

    const recordEventIdentifier = (name: string) => {
      eventIdentifiers.add(name);
    };

    const getRootIdentifier = (
      node: TSESTree.MemberExpression,
    ): string | null => {
      let current: TSESTree.Node = node;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      return current.type === AST_NODE_TYPES.Identifier ? current.name : null;
    };

    const hasRefProperty = (node: TSESTree.MemberExpression): boolean => {
      let current: TSESTree.MemberExpression | null = node;
      while (current) {
        if (
          current.property.type === AST_NODE_TYPES.Identifier &&
          current.property.name === 'ref'
        ) {
          return true;
        }
        current =
          current.object.type === AST_NODE_TYPES.MemberExpression
            ? current.object
            : null;
      }
      return false;
    };

    const registerHandlerParams = (
      node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ) => {
      for (const param of node.params) {
        if (param.type === AST_NODE_TYPES.Identifier) {
          recordEventIdentifier(param.name);
        }

        if (param.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of param.properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.value.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'data'
            ) {
              eventDataVariables.set(prop.value.name, HANDLER_PARAM_SOURCE);
              recordEventIdentifier(HANDLER_PARAM_SOURCE);
            }
          }
        }
      }
    };

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
      // Register handler parameters to capture destructured event data
      'ArrowFunctionExpression, FunctionExpression'(
        node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      ) {
        if (isHandlerFunction(node)) {
          registerHandlerParams(node);
        }
      },

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
            recordEventIdentifier(node.init.object.name);
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
            const source = eventDataVariables.get(node.init.name);
            if (source) {
              recordEventIdentifier(source);
            }
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
            const source = eventDataVariables.get(node.init.object.name);
            if (source) {
              recordEventIdentifier(source);
            }
          }
        }

        // Also track destructuring assignments
        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init?.type === AST_NODE_TYPES.Identifier
        ) {
          const eventSource =
            eventDataVariables.get(node.init.name) ||
            (eventIdentifiers.has(node.init.name) ? node.init.name : null);

          for (const property of node.id.properties) {
            if (
              property.type === AST_NODE_TYPES.Property &&
              property.key.type === AST_NODE_TYPES.Identifier &&
              property.value.type === AST_NODE_TYPES.Identifier &&
              eventSource
            ) {
              const targetName = property.value.name;
              eventDataVariables.set(targetName, eventSource);
              recordEventIdentifier(eventSource);
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
        if (parentCount <= maxParentChainLength) {
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

        // Only report when the chain originates from tracked event data and contains a ref segment
        const rootIdentifier = getRootIdentifier(node);
        if (!rootIdentifier) {
          return;
        }

        if (
          !hasRefProperty(node) ||
          (!eventDataVariables.has(rootIdentifier) &&
            !eventIdentifiers.has(rootIdentifier))
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'excessiveParentChain',
          data: {
            count: parentCount,
          },
          suggest: [
            {
              messageId: 'excessiveParentChain',
              fix(fixer) {
                return fixer.replaceText(node, 'event.params');
              },
            },
          ],
        });
      },
    };
  },
});
