import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type ObjectInfo = {
  node: TSESTree.Node;
  references: Set<TSESTree.Node>;
  scope: string;
  isCircular?: boolean;
};

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
      circularReference:
        'Reference "{{referenceText}}" makes this object point back to itself (directly or through other objects). Circular object graphs throw in `JSON.stringify()` and keep members reachable longer, which causes memory leaks and unexpected mutations. Store a copy or a serialize-safe identifier instead of the original object when assigning.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const objectMap = new WeakMap<TSESTree.Node, ObjectInfo>();

    function reportCircularReference(
      node: TSESTree.Node,
      reference: TSESTree.Node,
    ) {
      context.report({
        node,
        messageId: 'circularReference',
        data: {
          referenceText: sourceCode.getText(reference),
        },
      });
    }

    function getUnwrappedObjectExpression(
      node: TSESTree.Node,
    ): TSESTree.ObjectExpression | null {
      if (node.type === AST_NODE_TYPES.ObjectExpression) return node;
      if (
        (node.type === AST_NODE_TYPES.TSAsExpression ||
          node.type === AST_NODE_TYPES.TSTypeAssertion) &&
        node.expression.type === AST_NODE_TYPES.ObjectExpression
      ) {
        return node.expression;
      }
      return null;
    }

    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isFunction(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === AST_NODE_TYPES.FunctionDeclaration
      );
    }

    function isPrimitive(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Literal) return true;
      if (isIdentifier(node) && (node.name === 'undefined' || node.name === 'null')) return true;
      return false;
    }

    function getVariable(name: string): TSESLint.Scope.Variable | null {
      let scope: TSESLint.Scope.Scope | null = context.getScope();
      while (scope) {
        const variable = scope.variables.find((v) => v.name === name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return null;
    }

    function getReferencedObject(
      node: TSESTree.Node,
      visitedVariables = new Set<TSESLint.Scope.Variable>(),
    ): TSESTree.Node | null {
      if (isIdentifier(node)) {
        const variable = getVariable(node.name);
        if (variable && !visitedVariables.has(variable) && variable.defs.length > 0) {
          visitedVariables.add(variable);
          const def = variable.defs[0];
          if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
            const unwrapped = getUnwrappedObjectExpression(def.node.init);
            if (unwrapped) return unwrapped;
            if (isIdentifier(def.node.init)) {
              return getReferencedObject(def.node.init, visitedVariables);
            }
          }
        }
      } else if (node.type === AST_NODE_TYPES.MemberExpression) {
        const object = node.object;
        const property = node.property;
        if (isIdentifier(object) && isIdentifier(property)) {
          const referencedObj = getReferencedObject(object, visitedVariables);
          if (referencedObj && referencedObj.type === AST_NODE_TYPES.ObjectExpression) {
            const prop = referencedObj.properties.find(
              (p) =>
                p.type === AST_NODE_TYPES.Property &&
                !p.computed &&
                isIdentifier(p.key) &&
                p.key.name === property.name,
            ) as TSESTree.Property | undefined;
            if (prop && (isFunction(prop.value) || isPrimitive(prop.value))) {
              return null;
            }
            return referencedObj;
          }
        }
      }
      return null;
    }

    function getObjectFromMemberExpression(
      node: TSESTree.MemberExpression,
    ): TSESTree.Node | null {
      let current: TSESTree.Node = node;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      if (isIdentifier(current)) {
        return getReferencedObject(current);
      }
      return null;
    }

    function detectCircularReference(
      currentNode: TSESTree.Node,
      visited: Set<TSESTree.Node> = new Set(),
      depth = 0,
    ): boolean {
      if (depth > 50) return false;
      if (visited.has(currentNode)) return true;

      const objectInfo = objectMap.get(currentNode);
      if (!objectInfo) return false;

      visited.add(currentNode);

      for (const ref of objectInfo.references) {
        const referencedObj = getReferencedObject(ref);
        if (referencedObj && detectCircularReference(referencedObj, new Set(visited), depth + 1)) {
          objectInfo.isCircular = true;
          return true;
        }
      }

      return false;
    }

    function checkAndReportCircularReference(
      targetObj: TSESTree.Node,
      reference: TSESTree.Node,
    ) {
      const unwrapped = getUnwrappedObjectExpression(targetObj);
      if (!unwrapped) return;

      const targetInfo = objectMap.get(unwrapped);
      if (targetInfo) {
        targetInfo.references.add(reference);
        if (detectCircularReference(unwrapped)) {
          reportCircularReference(reference, reference);
        }
      }
    }

    return {
      ObjectExpression(node) {
        const scope = context.getScope();
        const scopeId = `${scope.type}:${scope.block.range[0]}:${scope.block.range[1]}`;
        objectMap.set(node, { node, references: new Set(), scope: scopeId });
      },

      'ObjectExpression > Property'(node: TSESTree.Property) {
        const parentObject = node.parent as TSESTree.ObjectExpression;
        const value = node.value;

        if (isIdentifier(value)) {
          const referencedObj = getReferencedObject(value);
          if (referencedObj) {
            checkAndReportCircularReference(parentObject, value);
          }
        } else if (value.type === AST_NODE_TYPES.MemberExpression) {
          const referencedObj = getObjectFromMemberExpression(value);
          if (referencedObj) {
            checkAndReportCircularReference(parentObject, value);
          }
        }
      },

      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const right = node.right;
        const left = node.left;

        if (left.type !== AST_NODE_TYPES.MemberExpression) return;

        const targetObj = getObjectFromMemberExpression(left);
        if (!targetObj) return;

        if (isIdentifier(right)) {
          const referencedObj = getReferencedObject(right);
          if (referencedObj) {
            checkAndReportCircularReference(targetObj, right);
          }
        } else if (right.type === AST_NODE_TYPES.MemberExpression) {
          const referencedObj = getObjectFromMemberExpression(right);
          if (referencedObj) {
            checkAndReportCircularReference(targetObj, right);
          }
        }
      },
    };
  },
});
