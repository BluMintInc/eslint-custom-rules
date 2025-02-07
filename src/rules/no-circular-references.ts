import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type ObjectInfo = {
  node: TSESTree.Node;
  references: Set<TSESTree.Node>;
};

const objectMap = new WeakMap<TSESTree.Node, ObjectInfo>();

export const noCircularReferences = createRule<[], MessageIds>({
  name: 'no-circular-references',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow circular references in objects',
      recommended: 'error',
    },
    schema: [],
    messages: {
      circularReference: 'Circular reference detected in object. This can cause issues with JSON serialization and memory leaks.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
      return node.type === AST_NODE_TYPES.ObjectExpression;
    }

    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function getReferencedObject(node: TSESTree.Node): TSESTree.Node | null {
      if (isIdentifier(node)) {
        const variable = context.getScope().variables.find(v => v.name === node.name);
        if (variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
          const init = variable.defs[0].node.init;
          return init && isObjectExpression(init) ? init : null;
        }
      }
      return null;
    }

    function detectCircularReference(
      currentNode: TSESTree.Node,
      visited: Set<TSESTree.Node> = new Set()
    ): boolean {
      if (visited.has(currentNode)) {
        return true;
      }

      const objectInfo = objectMap.get(currentNode);
      if (!objectInfo) {
        return false;
      }

      visited.add(currentNode);

      for (const ref of objectInfo.references) {
        const referencedObj = getReferencedObject(ref);
        if (referencedObj && detectCircularReference(referencedObj, new Set(visited))) {
          return true;
        }
      }

      return false;
    }

    return {
      ObjectExpression(node) {
        objectMap.set(node, { node, references: new Set() });
      },

      'ObjectExpression > Property'(node: TSESTree.Property) {
        const parentObject = node.parent as TSESTree.ObjectExpression;
        const value = node.value;

        if (isIdentifier(value)) {
          const referencedObj = getReferencedObject(value);
          if (referencedObj) {
            const parentInfo = objectMap.get(parentObject);
            if (parentInfo) {
              parentInfo.references.add(value);
              if (detectCircularReference(parentObject)) {
                context.report({
                  node: value,
                  messageId: 'circularReference',
                });
              }
            }
          }
        }
      },

      'AssignmentExpression'(node: TSESTree.AssignmentExpression) {
        if (node.right.type === AST_NODE_TYPES.Identifier) {
          const referencedObj = getReferencedObject(node.right);
          if (referencedObj && node.left.type === AST_NODE_TYPES.MemberExpression) {
            let current: TSESTree.Node = node.left;
            while (current.type === AST_NODE_TYPES.MemberExpression) {
              current = current.object;
            }
            if (isIdentifier(current)) {
              const targetObj = getReferencedObject(current);
              if (targetObj) {
                const targetInfo = objectMap.get(targetObj);
                if (targetInfo) {
                  targetInfo.references.add(node.right);
                  if (detectCircularReference(targetObj)) {
                    context.report({
                      node: node.right,
                      messageId: 'circularReference',
                    });
                  }
                }
              }
            }
          }
        }
      },
    };
  },
});
