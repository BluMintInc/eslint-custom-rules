import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'mismatchedName';

export const syncOnwriteNameFunc = createRule<[], MessageIds>({
  name: 'sync-onwrite-name-func',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure that the name field matches the func field in onWrite handlers',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      mismatchedName: 'The name field should match the func field in onWrite handlers',
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
            property.key.name === 'func' &&
            property.value.type === AST_NODE_TYPES.Identifier
          ) {
            funcProperty = property;
          }
        }

        if (!nameProperty || !funcProperty) {
          return;
        }

        const nameValue = (nameProperty.value as TSESTree.Literal).value as string;
        const funcName = (funcProperty.value as TSESTree.Identifier).name;

        if (nameValue !== funcName) {
          const value = nameProperty.value;
          if (value.type === AST_NODE_TYPES.Literal) {
            context.report({
              node: nameProperty,
              messageId: 'mismatchedName',
              fix(fixer) {
                return fixer.replaceText(
                  value,
                  `'${funcName}'`
                );
              },
            });
          }
        }
      },
    };
  },
});
