import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type Options = [
  {
    ignoreWithToJSON?: boolean;
  }
];

export const noCircularRefs = createRule<Options, MessageIds>({
  name: 'no-circular-refs',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow circular references in objects',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreWithToJSON: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      circularReference: 'Circular reference detected. Objects should not reference themselves directly or indirectly.',
    },
  },
  defaultOptions: [{ ignoreWithToJSON: false }],
  create(context) {
    const [options] = context.options;
    const objectRefs = new Map<string, Set<string>>();
    const objectNodes = new Map<string, TSESTree.Node>();
    const objectHasToJSON = new Set<string>();

    function addObject(name: string, node: TSESTree.Node): void {
      objectRefs.set(name, new Set());
      objectNodes.set(name, node);
    }

    function addReference(fromName: string, toName: string): void {
      const refs = objectRefs.get(fromName);
      if (refs) {
        refs.add(toName);
      }
    }

    function hasCircularReference(
      startName: string,
      currentName: string,
      visited = new Set<string>()
    ): boolean {
      if (visited.has(currentName)) {
        return currentName === startName;
      }

      visited.add(currentName);
      const refs = objectRefs.get(currentName);
      if (refs) {
        for (const ref of refs) {
          if (hasCircularReference(startName, ref, new Set(visited))) {
            return true;
          }
        }
      }

      return false;
    }

    function checkAndReportCircular(name: string): void {
      if (hasCircularReference(name, name)) {
        const node = objectNodes.get(name);
        if (node) {
          if (options.ignoreWithToJSON && objectHasToJSON.has(name)) {
            return;
          }
          context.report({
            node,
            messageId: 'circularReference',
          });
        }
      }
    }

    return {
      VariableDeclarator(node): void {
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          if (node.init?.type === AST_NODE_TYPES.ObjectExpression) {
            const hasToJSON = node.init.properties.some(
              (prop) =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'toJSON'
            );
            addObject(node.id.name, node);
            if (hasToJSON) {
              objectHasToJSON.add(node.id.name);
            }
          }
        }
      },

      AssignmentExpression(node): void {
        if (node.left.type === AST_NODE_TYPES.MemberExpression) {
          const obj = node.left.object;
          if (obj.type === AST_NODE_TYPES.Identifier) {
            const objName = obj.name;
            if (node.right.type === AST_NODE_TYPES.Identifier) {
              const rightName = node.right.name;
              if (objectRefs.has(objName) && objectRefs.has(rightName)) {
                addReference(objName, rightName);
                checkAndReportCircular(objName);
              }
            }
          }
        }

        // Handle toJSON method assignment
        if (
          node.left.type === AST_NODE_TYPES.MemberExpression &&
          node.left.property.type === AST_NODE_TYPES.Identifier &&
          node.left.property.name === 'toJSON' &&
          node.left.object.type === AST_NODE_TYPES.Identifier
        ) {
          const objName = node.left.object.name;
          objectHasToJSON.add(objName);
        }
      },

      Property(node): void {
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.value.type === AST_NODE_TYPES.Identifier
        ) {
          const parentNode = node.parent;
          const parentParent = parentNode.parent;
          if (
            parentParent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parentParent.id.type === AST_NODE_TYPES.Identifier
          ) {
            const objName = parentParent.id.name;
            const valueName = node.value.name;
            if (objectRefs.has(objName) && objectRefs.has(valueName)) {
              addReference(objName, valueName);
              checkAndReportCircular(objName);
            }
          }
        }
      },
    };
  },
});
