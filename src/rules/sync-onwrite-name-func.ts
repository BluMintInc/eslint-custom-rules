import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'mismatchedName';

export const syncOnwriteNameFunc = createRule<[], MessageIds>({
  name: 'sync-onwrite-name-func',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure that the name field matches the func field in onWrite handlers',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      mismatchedName:
        'OnWrite handler name "{{nameValue}}" does not match func reference "{{funcName}}". The name field is what gets registered for deploys, logs, and alerts, so a mismatch hides which function is actually running. Rename the "name" value to "{{funcName}}" or point "func" to a function named "{{nameValue}}" so the trigger label and implementation stay in sync.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ObjectExpression(node) {
        let nameProperty: TSESTree.Property | undefined;
        let funcProperty: TSESTree.Property | undefined;

        for (const property of node.properties) {
          if (property.type !== AST_NODE_TYPES.Property) continue;

          if (
            property.key.type === AST_NODE_TYPES.Identifier &&
            property.key.name === 'name' &&
            property.value.type === AST_NODE_TYPES.Literal &&
            typeof property.value.value === 'string'
          ) {
            nameProperty = property;
          }

          if (
            property.key.type === AST_NODE_TYPES.Identifier &&
            property.key.name === 'func'
          ) {
            funcProperty = property;
          }
        }

        if (!nameProperty || !funcProperty) {
          return;
        }

        const nameValue = (nameProperty.value as TSESTree.Literal)
          .value as string;
        let funcName: string;

        // Handle variable references
        if (funcProperty.value.type === AST_NODE_TYPES.Identifier) {
          const funcIdentifier = funcProperty.value;
          const scope = context.getScope();
          const variable = scope.references.find(
            (ref) => ref.identifier === funcIdentifier,
          )?.resolved;

          if (
            variable?.defs[0]?.node.type ===
              AST_NODE_TYPES.VariableDeclarator &&
            variable.defs[0].node.init?.type === AST_NODE_TYPES.Identifier
          ) {
            // If the variable is initialized with another identifier, use that name
            funcName = variable.defs[0].node.init.name;
          } else {
            // Otherwise use the variable name itself
            funcName = funcIdentifier.name;
          }
        } else {
          return; // Skip if func is not an identifier
        }

        if (nameValue !== funcName) {
          const value = nameProperty.value;
          if (value.type === AST_NODE_TYPES.Literal) {
            context.report({
              node: nameProperty,
              messageId: 'mismatchedName',
              data: {
                nameValue,
                funcName,
              },
              fix(fixer) {
                return fixer.replaceText(value, `'${funcName}'`);
              },
            });
          }
        }
      },
    };
  },
});
