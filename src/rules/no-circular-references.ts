import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'circularReference';

type ObjectInfo = {
  node: TSESTree.Node;
  references: Set<TSESTree.Node>;
  scope: string;
  isCircular?: boolean;
};

const objectMap = new WeakMap<TSESTree.Node, ObjectInfo>();
const scopeMap = new Map<string, Set<TSESTree.Node>>();
const circularRefs = new WeakSet<TSESTree.Node>();

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
    const sourceCode = context.getSourceCode();

    function isObjectExpression(node: TSESTree.Node): node is TSESTree.ObjectExpression {
      return node.type === AST_NODE_TYPES.ObjectExpression;
    }

    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isThisExpression(node: TSESTree.Node): node is TSESTree.ThisExpression {
      return node.type === AST_NODE_TYPES.ThisExpression;
    }

    function getScopeId(scope: any): string {
      return `${scope.type}:${scope.block.range[0]}:${scope.block.range[1]}`;
    }

    function isFunction(node: TSESTree.Node): boolean {
      return node.type === AST_NODE_TYPES.FunctionExpression ||
             node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             node.type === AST_NODE_TYPES.FunctionDeclaration;
    }

    function isArray(node: TSESTree.Node): boolean {
      return node.type === AST_NODE_TYPES.ArrayExpression ||
             node.type === AST_NODE_TYPES.ArrayPattern;
    }

    function isClass(node: TSESTree.Node): boolean {
      return node.type === AST_NODE_TYPES.ClassExpression ||
             node.type === AST_NODE_TYPES.ClassDeclaration ||
             node.type === AST_NODE_TYPES.NewExpression;
    }

    function isPromise(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        const callee = node.callee;
        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          return callee.object.type === AST_NODE_TYPES.Identifier &&
                 callee.object.name === 'Promise' &&
                 callee.property.type === AST_NODE_TYPES.Identifier &&
                 callee.property.name === 'resolve';
        }
      }
      return false;
    }

    function isPrimitive(node: TSESTree.Node): boolean {
      return node.type === AST_NODE_TYPES.Literal ||
             node.type === AST_NODE_TYPES.Identifier && (node.name === 'undefined' || node.name === 'null');
    }

    function getReferencedObject(node: TSESTree.Node): TSESTree.Node | null {
      if (isIdentifier(node)) {
        const scope = sourceCode.getScope(node);
        const scopeId = getScopeId(scope);
        const variable = scope.variables.find(v => v.name === node.name);
        if (variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
          const init = variable.defs[0].node.init;
          if (init) {
            if (isObjectExpression(init)) {
              return init;
            }
            if (isFunction(init) || isArray(init) || isClass(init) || isPromise(init) || isPrimitive(init)) {
              return null;
            }
            if (init.type === AST_NODE_TYPES.CallExpression) {
              const callee = init.callee;
              if (callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === 'Object') {
                if (callee.property.type === AST_NODE_TYPES.Identifier) {
                  if (callee.property.name === 'create') {
                    return init.arguments[0];
                  }
                  if (callee.property.name === 'assign') {
                    const [target, source] = init.arguments;
                    if (source?.type === AST_NODE_TYPES.ObjectExpression) {
                      return source;
                    }
                    return target;
                  }
                }
              }
            }
          }
        }
        // Check objects in the current scope
        const scopeObjects = scopeMap.get(scopeId);
        if (scopeObjects) {
          for (const obj of scopeObjects) {
            const info = objectMap.get(obj);
            if (info && info.scope === scopeId && !info.isCircular) {
              return obj;
            }
          }
        }
      } else if (node.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          const object = node.object;
          if (isIdentifier(object)) {
            const scope = sourceCode.getScope(object);
            const variable = scope.variables.find(v => v.name === object.name);
            if (variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
              const init = variable.defs[0].node.init;
              if (init && isObjectExpression(init)) {
                return init;
              }
            }
          }
        }
      }
      return null;
    }

    function getObjectFromMemberExpression(node: TSESTree.MemberExpression): TSESTree.Node | null {
      let current: TSESTree.Node = node;
      let parent: TSESTree.Node | undefined = node.parent;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        parent = current;
        current = current.object;
      }
      if (isIdentifier(current)) {
        return getReferencedObject(current);
      }
      if (isThisExpression(current)) {
        const scope = sourceCode.getScope(current);
        const scopeId = getScopeId(scope);
        const scopeObjects = scopeMap.get(scopeId);
        if (scopeObjects) {
          for (const obj of scopeObjects) {
            const info = objectMap.get(obj);
            if (info && info.scope === scopeId && !info.isCircular) {
              return obj;
            }
          }
        }
        // Handle this.obj.self = this.obj case
        if (parent?.type === AST_NODE_TYPES.MemberExpression) {
          const property = parent.property;
          if (property.type === AST_NODE_TYPES.Identifier) {
            const scope = sourceCode.getScope(property);
            const scopeId = getScopeId(scope);
            const scopeObjects = scopeMap.get(scopeId);
            if (scopeObjects) {
              for (const obj of scopeObjects) {
                const info = objectMap.get(obj);
                if (info && info.scope === scopeId && !info.isCircular) {
                  return obj;
                }
              }
            }
          }
        }
      }
      return null;
    }

    function detectCircularReference(
      currentNode: TSESTree.Node,
      visited: Set<TSESTree.Node> = new Set(),
      depth = 0
    ): boolean {
      if (depth > 100) return false; // Prevent infinite recursion
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
        if (referencedObj && detectCircularReference(referencedObj, new Set(visited), depth + 1)) {
          objectInfo.isCircular = true;
          circularRefs.add(ref);
          return true;
        }
      }

      return false;
    }

    function checkAndReportCircularReference(targetObj: TSESTree.Node, reference: TSESTree.Node) {
      const targetInfo = objectMap.get(targetObj);
      if (targetInfo) {
        targetInfo.references.add(reference);
        if (detectCircularReference(targetObj)) {
          context.report({
            node: reference,
            messageId: 'circularReference',
          });
        }
      }
    }

    function handleObjectPattern(node: TSESTree.ObjectPattern) {
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.value.type === AST_NODE_TYPES.Identifier) {
            const referencedObj = getReferencedObject(prop.value);
            if (referencedObj) {
              checkAndReportCircularReference(referencedObj, prop.value);
            }
          }
        }
      }
    }

    return {
      ObjectExpression(node) {
        const scope = sourceCode.getScope(node);
        const scopeId = getScopeId(scope);
        objectMap.set(node, { node, references: new Set(), scope: scopeId });
        let scopeObjects = scopeMap.get(scopeId);
        if (!scopeObjects) {
          scopeObjects = new Set();
          scopeMap.set(scopeId, scopeObjects);
        }
        scopeObjects.add(node);
      },

      'ObjectExpression > Property'(node: TSESTree.Property) {
        const parentObject = node.parent as TSESTree.ObjectExpression;
        const value = node.value;

        if (isIdentifier(value)) {
          const referencedObj = getReferencedObject(value);
          if (referencedObj) {
            checkAndReportCircularReference(parentObject, value);
          }
        }
      },

      'AssignmentExpression'(node: TSESTree.AssignmentExpression) {
        if (node.right.type === AST_NODE_TYPES.Identifier) {
          const referencedObj = getReferencedObject(node.right);
          if (referencedObj && node.left.type === AST_NODE_TYPES.MemberExpression) {
            const targetObj = getObjectFromMemberExpression(node.left);
            if (targetObj) {
              checkAndReportCircularReference(targetObj, node.right);
            }
          }
        }
      },

      'CallExpression'(node: TSESTree.CallExpression) {
        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const callee = node.callee;
          if (callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === 'Object') {
            if (callee.property.type === AST_NODE_TYPES.Identifier) {
              if (callee.property.name === 'assign' || callee.property.name === 'create') {
                const [target, source] = node.arguments;
                if (target && source) {
                  const targetObj = getReferencedObject(target);
                  const sourceObj = getReferencedObject(source);
                  if (targetObj && sourceObj) {
                    checkAndReportCircularReference(targetObj, source);
                  }
                }
              }
            }
          }
        }
      },

      'VariableDeclarator'(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          handleObjectPattern(node.id);
        }
        if (node.init?.type === AST_NODE_TYPES.ObjectExpression) {
          const properties = node.init.properties;
          for (const prop of properties) {
            if (prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.Identifier) {
              const referencedObj = getReferencedObject(prop.value);
              if (referencedObj) {
                checkAndReportCircularReference(node.init, prop.value);
              }
            }
          }
        }
      },

      'PropertyDefinition'(node: TSESTree.PropertyDefinition) {
        if (node.value?.type === AST_NODE_TYPES.ObjectExpression) {
          const properties = node.value.properties;
          for (const prop of properties) {
            if (prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.Identifier) {
              const referencedObj = getReferencedObject(prop.value);
              if (referencedObj) {
                checkAndReportCircularReference(node.value, prop.value);
              }
            }
          }
        }
      },

      'MethodDefinition'(node: TSESTree.MethodDefinition) {
        if (node.value.type === AST_NODE_TYPES.FunctionExpression) {
          const body = node.value.body;
          if (body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (stmt.type === AST_NODE_TYPES.ExpressionStatement && stmt.expression.type === AST_NODE_TYPES.AssignmentExpression) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression && assignment.right.type === AST_NODE_TYPES.Identifier) {
                  const targetObj = getObjectFromMemberExpression(assignment.left);
                  const referencedObj = getReferencedObject(assignment.right);
                  if (targetObj && referencedObj) {
                    checkAndReportCircularReference(targetObj, assignment.right);
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
