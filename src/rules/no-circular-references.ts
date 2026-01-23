import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type ObjectInfo = {
  references: Set<TSESTree.Node>;
  assignedProperties: Map<string | number, TSESTree.Node>;
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

    function getUnwrappedObjectOrArray(
      node: TSESTree.Node,
    ): TSESTree.ObjectExpression | TSESTree.ArrayExpression | null {
      const current = ASTHelpers.unwrapTSAssertions(node);
      return current.type === AST_NODE_TYPES.ObjectExpression ||
        current.type === AST_NODE_TYPES.ArrayExpression
        ? current
        : null;
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

    function getVariable(node: TSESTree.Identifier): TSESLint.Scope.Variable | null {
      let scope: TSESLint.Scope.Scope | null = ASTHelpers.getScope(context, node);
      while (scope) {
        const variable = scope.variables.find((v) => v.name === node.name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return null;
    }

    function getReferencedObject(
      node: TSESTree.Node,
      visitedVariables = new Set<TSESLint.Scope.Variable>(),
      visitedNodes = new Set<TSESTree.Node>(),
    ): TSESTree.Node | null {
      const current = ASTHelpers.unwrapTSAssertions(node);
      if (visitedNodes.has(current)) return null;
      visitedNodes.add(current);

      if (
        current.type === AST_NODE_TYPES.ArrayExpression ||
        current.type === AST_NODE_TYPES.ObjectExpression
      ) {
        return current;
      }

      if (isIdentifier(current)) {
        const variable = getVariable(current);
        if (variable && !visitedVariables.has(variable) && variable.defs.length > 0) {
          visitedVariables.add(variable);
          const def = variable.defs[0];
          if (def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
            const result = getReferencedObject(def.node.init, visitedVariables, visitedNodes);
            if (result) return result;
          }
        }
      } else if (current.type === AST_NODE_TYPES.MemberExpression) {
        const object = current.object;
        const property = current.property;
        const referencedObj = getReferencedObject(object, visitedVariables, visitedNodes);
        if (referencedObj) {
          const info = objectMap.get(referencedObj);
          let propValue: TSESTree.Node | undefined;

          const key =
            !current.computed && isIdentifier(property)
              ? property.name
              : current.computed && property.type === AST_NODE_TYPES.Literal
                ? property.value
                : null;

          if (key !== null && (typeof key === 'string' || typeof key === 'number')) {
            // 1. Check assigned properties first (overrides literal properties)
            if (info) {
              propValue = info.assignedProperties.get(key);
            }

            // 2. Check object literal properties
            if (!propValue && referencedObj.type === AST_NODE_TYPES.ObjectExpression) {
              const prop = referencedObj.properties.find(
                (p) =>
                  p.type === AST_NODE_TYPES.Property &&
                  !p.computed &&
                  ((isIdentifier(p.key) && p.key.name === key) ||
                    (p.key.type === AST_NODE_TYPES.Literal && p.key.value === key)),
              ) as TSESTree.Property | undefined;
              if (prop) propValue = prop.value;
            }

            // 3. Check array literal elements
            if (
              !propValue &&
              referencedObj.type === AST_NODE_TYPES.ArrayExpression &&
              typeof key === 'number'
            ) {
              const element = referencedObj.elements[key];
              if (element && element.type !== AST_NODE_TYPES.SpreadElement) {
                propValue = element;
              }
            }
          }

          if (propValue) {
            const unwrappedValue = getUnwrappedObjectOrArray(propValue);
            if (unwrappedValue) return unwrappedValue;
            if (isIdentifier(propValue) || propValue.type === AST_NODE_TYPES.MemberExpression) {
              return getReferencedObject(propValue, visitedVariables, visitedNodes);
            }
            if (isFunction(propValue) || isPrimitive(propValue)) {
              return null;
            }
          }
        }
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
          return true;
        }
      }

      return false;
    }

    function checkAndReportCircularReference(
      targetObj: TSESTree.Node,
      reference: TSESTree.Node,
    ) {
      const unwrapped = getUnwrappedObjectOrArray(targetObj);
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
        objectMap.set(node, { references: new Set(), assignedProperties: new Map() });
      },

      ArrayExpression(node) {
        objectMap.set(node, { references: new Set(), assignedProperties: new Map() });
      },

      'ArrayExpression > *'(node: TSESTree.Node | null) {
        if (!node || node.type === AST_NODE_TYPES.SpreadElement) return;
        const parentArray = node.parent as TSESTree.ArrayExpression;
        const referencedObj = getReferencedObject(node);
        if (referencedObj) {
          checkAndReportCircularReference(parentArray, node);
        }
      },

      'ObjectExpression > Property'(node: TSESTree.Property) {
        const parentObject = node.parent as TSESTree.ObjectExpression;
        const value = node.value;

        const referencedObj = getReferencedObject(value);
        if (referencedObj) {
          checkAndReportCircularReference(parentObject, value);
        }
      },

      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const right = node.right;
        const left = node.left;

        if (left.type !== AST_NODE_TYPES.MemberExpression) return;

        const targetObj = getReferencedObject(left.object);
        if (!targetObj) return;

        // Reassignments should override literal properties during resolution.
        const targetInfo = objectMap.get(targetObj);
        if (targetInfo) {
          if (!left.computed && isIdentifier(left.property)) {
            targetInfo.assignedProperties.set(left.property.name, right);
          } else if (left.computed && left.property.type === AST_NODE_TYPES.Literal) {
            const key = left.property.value;
            if (typeof key === 'string' || typeof key === 'number') {
              targetInfo.assignedProperties.set(key, right);
            }
          }
        }

        const referencedObj = getReferencedObject(right);
        if (referencedObj) {
          checkAndReportCircularReference(targetObj, right);
        }
      },
    };
  },
});
