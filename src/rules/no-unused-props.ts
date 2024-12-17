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
      unusedProp:
        'Prop "{{propName}}" is defined in type but not used in component',
    },
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    const propsTypes: Map<string, Record<string, TSESTree.Node>> = new Map();
    const usedProps: Map<string, Set<string>> = new Map();
    let currentComponent: { node: TSESTree.Node; typeName: string } | null =
      null;

    return {
      TSTypeAliasDeclaration(node) {
        if (node.id.name.endsWith('Props')) {
          if (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral) {
            const props: Record<string, TSESTree.Node> = {};
            node.typeAnnotation.members.forEach((member) => {
              if (
                member.type === AST_NODE_TYPES.TSPropertySignature &&
                member.key.type === AST_NODE_TYPES.Identifier
              ) {
                props[member.key.name] = member.key;
              }
            });
            propsTypes.set(node.id.name, props);
          }
        }
      },

      VariableDeclaration(node) {
        if (node.declarations.length === 1) {
          const declaration = node.declarations[0];
          if (
            declaration.init?.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            const param = declaration.init.params[0];
            if (
              param?.type === AST_NODE_TYPES.ObjectPattern &&
              param.typeAnnotation?.typeAnnotation.type ===
                AST_NODE_TYPES.TSTypeReference &&
              param.typeAnnotation.typeAnnotation.typeName.type ===
                AST_NODE_TYPES.Identifier
            ) {
              const typeName =
                param.typeAnnotation.typeAnnotation.typeName.name;
              if (typeName.endsWith('Props')) {
                currentComponent = { node, typeName };
                const used = new Set<string>();
                param.properties.forEach((prop) => {
                  if (
                    prop.type === AST_NODE_TYPES.Property &&
                    prop.key.type === AST_NODE_TYPES.Identifier
                  ) {
                    used.add(prop.key.name);
                  }
                });
                usedProps.set(typeName, used);
              }
            }
          }
        }
      },

      'VariableDeclaration:exit'(node) {
        if (currentComponent?.node === node) {
          const { typeName } = currentComponent;
          const propsType = propsTypes.get(typeName);
          const used = usedProps.get(typeName);

          if (propsType && used) {
            Object.keys(propsType).forEach((prop) => {
              if (!used.has(prop)) {
                context.report({
                  node: propsType[prop],
                  messageId: 'unusedProp',
                  data: { propName: prop },
                });
              }
            });
          }

          // Reset state for this component
          propsTypes.delete(typeName);
          usedProps.delete(typeName);
          currentComponent = null;
        }
      },
    };
  },
});
