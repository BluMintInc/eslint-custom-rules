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
          const props: Record<string, TSESTree.Node> = {};

          function extractProps(typeNode: TSESTree.TypeNode) {
            if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
              typeNode.members.forEach((member) => {
                if (
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier
                ) {
                  props[member.key.name] = member.key;
                }
              });
            } else if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
              typeNode.types.forEach(extractProps);
            } else if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
              // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
              if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
                props[`...${typeNode.typeName.name}`] = typeNode.typeName;
                // If the type is directly assigned from another type (e.g., type MyProps = OtherProps)
                // consider all props from the referenced type as used
                if (node.typeAnnotation === typeNode) {
                  props[`...${node.id.name}`] = node.id;
                }
              }
            }
          }

          extractProps(node.typeAnnotation);
          propsTypes.set(node.id.name, props);
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
                  } else if (
                    prop.type === AST_NODE_TYPES.RestElement &&
                    prop.argument.type === AST_NODE_TYPES.Identifier
                  ) {
                    // Handle rest spread operator {...rest}
                    // When a rest operator is used, all remaining props are considered used
                    const propsType = propsTypes.get(typeName);
                    if (propsType) {
                      Object.keys(propsType).forEach((key) => {
                        if (key.startsWith('...')) {
                          used.add(key);
                        }
                      });
                    }
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
            // Check if this type is directly assigned from another type
            const isTypeAssignment = Object.keys(propsType).some(
              (key) => key === `...${typeName}`
            );

            // If it's a direct type assignment, all props are considered used
            if (!isTypeAssignment) {
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
