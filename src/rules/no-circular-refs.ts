import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type ObjectInfo = {
  node: TSESTree.Node;
  identifier?: string;
};

type ScopeTracker = {
  objects: Map<string, ObjectInfo>;
  references: Map<string, Set<string>>;
};

export const noCircularRefs = createRule<[], MessageIds>({
  name: 'no-circular-refs',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow circular references in objects',
      recommended: 'error',
    },
    schema: [],
    messages: {
      circularReference: 'Circular reference detected. Objects should not reference themselves directly or indirectly.',
    },
  },
  defaultOptions: [],
  create(context) {
    const scopeTracker: ScopeTracker = {
      objects: new Map(),
      references: new Map(),
    };

    function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
      return node.type === AST_NODE_TYPES.ObjectExpression;
    }

    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function addObject(name: string, node: TSESTree.Node): void {
      scopeTracker.objects.set(name, { node });
      if (!scopeTracker.references.has(name)) {
        scopeTracker.references.set(name, new Set());
      }
    }

    function addReference(fromName: string, toName: string): void {
      const refs = scopeTracker.references.get(fromName);
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
      const refs = scopeTracker.references.get(currentName);
      if (refs) {
        for (const ref of refs) {
          if (hasCircularReference(startName, ref, visited)) {
            return true;
          }
        }
      }

      return false;
    }

    function checkAndReportCircular(name: string): void {
      if (hasCircularReference(name, name)) {
        const obj = scopeTracker.objects.get(name);
        if (obj) {
          context.report({
            node: obj.node,
            messageId: 'circularReference',
          });
        }
      }
    }

    return {
      VariableDeclarator(node): void {
        if (isIdentifier(node.id) && node.init && isObjectExpression(node.init)) {
          addObject(node.id.name, node.init);
        }
      },

      AssignmentExpression(node): void {
        function getRootObject(expr: TSESTree.Expression): TSESTree.Identifier | null {
          if (isIdentifier(expr)) {
            return expr;
          }
          if (expr.type === AST_NODE_TYPES.MemberExpression) {
            return getRootObject(expr.object);
          }
          return null;
        }

        const leftRoot = getRootObject(node.left);
        const rightRoot = getRootObject(node.right);

        if (leftRoot && rightRoot) {
          const leftName = leftRoot.name;
          const rightName = rightRoot.name;
          if (scopeTracker.objects.has(leftName) && scopeTracker.objects.has(rightName)) {
            addReference(leftName, rightName);
            checkAndReportCircular(leftName);
          }
        }
      },

      Property(node): void {
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          isIdentifier(node.value)
        ) {
          const parentNode = node.parent;
          const parentParent = parentNode.parent;
          if (
            parentParent?.type === AST_NODE_TYPES.VariableDeclarator &&
            isIdentifier(parentParent.id)
          ) {
            const objName = parentParent.id.name;
            const valueName = node.value.name;
            if (scopeTracker.objects.has(objName) && scopeTracker.objects.has(valueName)) {
              addReference(objName, valueName);
              checkAndReportCircular(objName);
            }
          }
        }
      },
    };
  },
});
