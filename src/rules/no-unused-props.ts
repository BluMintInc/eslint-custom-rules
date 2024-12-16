import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const noUnusedProps = createRule({
  name: 'no-unused-props',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect unused props in React component type definitions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      unusedProp: 'Prop "{{propName}}" is defined in type but not used in component',
    },
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    let propsType: Record<string, TSESTree.Node> = {};
    let usedProps: Set<string> = new Set();
    let currentComponent: TSESTree.Node | null = null;

    return {
      TSTypeAliasDeclaration(node) {
        if (node.id.name === 'Props') {
          if (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral) {
            node.typeAnnotation.members.forEach((member) => {
              if (member.type === AST_NODE_TYPES.TSPropertySignature && member.key.type === AST_NODE_TYPES.Identifier) {
                propsType[member.key.name] = member.key;
              }
            });
          }
        }
      },

      VariableDeclaration(node) {
        if (node.declarations.length === 1) {
          const declaration = node.declarations[0];
          if (declaration.init?.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            const param = declaration.init.params[0];
            if (param?.type === AST_NODE_TYPES.ObjectPattern && param.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
              const typeName = param.typeAnnotation.typeAnnotation.typeName;
              if (typeName.type === AST_NODE_TYPES.Identifier && typeName.name === 'Props') {
                currentComponent = node;
                param.properties.forEach((prop) => {
                  if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
                    usedProps.add(prop.key.name);
                  }
                });
              }
            }
          }
        }
      },

      'VariableDeclaration:exit'(node) {
        if (node === currentComponent) {
          Object.keys(propsType).forEach((prop) => {
            if (!usedProps.has(prop)) {
              context.report({
                node: propsType[prop],
                messageId: 'unusedProp',
                data: { propName: prop },
              });
            }
          });

          // Reset state
          propsType = {};
          usedProps.clear();
          currentComponent = null;
        }
      },
    };
  },
});
