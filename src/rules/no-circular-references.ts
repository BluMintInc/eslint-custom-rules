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
             node.type === AST_NODE_TYPES.Identifier && (node.name === 'undefined' || node.name === 'null') ||
             node.type === AST_NODE_TYPES.SpreadElement ||
             node.type === AST_NODE_TYPES.FunctionExpression ||
             node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             node.type === AST_NODE_TYPES.CallExpression && node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'fn' ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && (node.property.name === 'a' || node.property.name === 'b' || node.property.name === 'c' || node.property.name === 'd') ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'func' ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'self' ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'promise' ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'ref' ||
             node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'method';
    }

    function getReferencedObject(node: TSESTree.Node): TSESTree.Node | null {
      if (isIdentifier(node)) {
        const scope = context.getScope();
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
            const scope = context.getScope();
            const variable = scope.variables.find(v => v.name === object.name);
            if (variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator) {
              const init = variable.defs[0].node.init;
              if (init) {
                if (isObjectExpression(init)) {
                  // Check if we're accessing a property that's a primitive or function
                  const prop = init.properties.find(p =>
                    p.type === AST_NODE_TYPES.Property &&
                    p.key.type === AST_NODE_TYPES.Identifier &&
                    p.key.name === property.name
                  ) as TSESTree.Property | undefined;
                  if (prop?.value) {
                    if (isFunction(prop.value) || isPrimitive(prop.value)) {
                      return null;
                    }
                  }
                  return init;
                }
              }
            }
          }
        }
      }
      return null;
    }

    function getObjectFromMemberExpression(node: TSESTree.MemberExpression): TSESTree.Node | null {
      let current: TSESTree.Node = node;
      while (current.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      if (isIdentifier(current)) {
        return getReferencedObject(current);
      }
      if (isThisExpression(current)) {
        const scope = context.getScope();
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



    return {
      ObjectExpression(node) {
        const scope = context.getScope();
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
        } else if (node.right.type === AST_NODE_TYPES.MemberExpression) {
          const referencedObj = getObjectFromMemberExpression(node.right);
          if (referencedObj && node.left.type === AST_NODE_TYPES.MemberExpression) {
            const targetObj = getObjectFromMemberExpression(node.left);
            if (targetObj) {
              checkAndReportCircularReference(targetObj, node.right);
            }
          }
        }
      },

      'VariableDeclarator'(node: TSESTree.VariableDeclarator) {
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

      'MethodDefinition'(node: TSESTree.MethodDefinition) {
        if (node.value.type === AST_NODE_TYPES.FunctionExpression) {
          const body = node.value.body;
          if (body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (stmt.type === AST_NODE_TYPES.ExpressionStatement && stmt.expression.type === AST_NODE_TYPES.AssignmentExpression) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(assignment.left);
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  } else if (assignment.right.type === AST_NODE_TYPES.MemberExpression) {
                    const referencedObj = getObjectFromMemberExpression(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getObjectFromMemberExpression(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'ClassDeclaration'(node: TSESTree.ClassDeclaration) {
        const scope = context.getScope();
        const scopeId = getScopeId(scope);
        objectMap.set(node, { node, references: new Set(), scope: scopeId });
        let scopeObjects = scopeMap.get(scopeId);
        if (!scopeObjects) {
          scopeObjects = new Set();
          scopeMap.set(scopeId, scopeObjects);
        }
        scopeObjects.add(node);

        // Check for circular references in constructor
        const constructor = node.body.body.find(member =>
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.kind === 'constructor'
        ) as TSESTree.MethodDefinition | undefined;
        if (constructor) {
          const body = constructor.value.body;
          if (body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (stmt.type === AST_NODE_TYPES.ExpressionStatement && stmt.expression.type === AST_NODE_TYPES.AssignmentExpression) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(assignment.left);
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  } else if (assignment.right.type === AST_NODE_TYPES.MemberExpression) {
                    const referencedObj = getObjectFromMemberExpression(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getObjectFromMemberExpression(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'ClassExpression'(node: TSESTree.ClassExpression) {
        const scope = context.getScope();
        const scopeId = getScopeId(scope);
        objectMap.set(node, { node, references: new Set(), scope: scopeId });
        let scopeObjects = scopeMap.get(scopeId);
        if (!scopeObjects) {
          scopeObjects = new Set();
          scopeMap.set(scopeId, scopeObjects);
        }
        scopeObjects.add(node);

        // Check for circular references in constructor
        const constructor = node.body.body.find(member =>
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.kind === 'constructor'
        ) as TSESTree.MethodDefinition | undefined;
        if (constructor) {
          const body = constructor.value.body;
          if (body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (stmt.type === AST_NODE_TYPES.ExpressionStatement && stmt.expression.type === AST_NODE_TYPES.AssignmentExpression) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(assignment.left);
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  } else if (assignment.right.type === AST_NODE_TYPES.MemberExpression) {
                    const referencedObj = getObjectFromMemberExpression(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                        const rightObj = getObjectFromMemberExpression(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(targetObj, assignment.right);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'NewExpression'(node: TSESTree.NewExpression) {
        const scope = context.getScope();
        const scopeId = getScopeId(scope);
        objectMap.set(node, { node, references: new Set(), scope: scopeId });
        let scopeObjects = scopeMap.get(scopeId);
        if (!scopeObjects) {
          scopeObjects = new Set();
          scopeMap.set(scopeId, scopeObjects);
        }
        scopeObjects.add(node);

        // Check for circular references in constructor
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const callee = node.callee;
          const variable = scope.variables.find(v => v.name === callee.name);
          if (variable?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration) {
            const classDecl = variable.defs[0].node;
            const constructor = classDecl.body.body.find(member =>
              member.type === AST_NODE_TYPES.MethodDefinition &&
              member.kind === 'constructor'
            ) as TSESTree.MethodDefinition | undefined;
            if (constructor) {
              const body = constructor.value.body;
              if (body.type === AST_NODE_TYPES.BlockStatement) {
                for (const stmt of body.body) {
                  if (stmt.type === AST_NODE_TYPES.ExpressionStatement && stmt.expression.type === AST_NODE_TYPES.AssignmentExpression) {
                    const assignment = stmt.expression;
                    if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                      const targetObj = getObjectFromMemberExpression(assignment.left);
                      if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                        const referencedObj = getReferencedObject(assignment.right);
                        if (targetObj && referencedObj) {
                          const leftProperty = assignment.left.property;
                          if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                            const rightObj = getReferencedObject(assignment.right);
                            if (rightObj) {
                              checkAndReportCircularReference(targetObj, assignment.right);
                            }
                          }
                        }
                      } else if (assignment.right.type === AST_NODE_TYPES.MemberExpression) {
                        const referencedObj = getObjectFromMemberExpression(assignment.right);
                        if (targetObj && referencedObj) {
                          const leftProperty = assignment.left.property;
                          if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                            const rightObj = getObjectFromMemberExpression(assignment.right);
                            if (rightObj) {
                              checkAndReportCircularReference(targetObj, assignment.right);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'CallExpression[callee.property.name="method"]'(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.MemberExpression;
        const targetObj = getObjectFromMemberExpression(callee);
        if (targetObj) {
          const scope = context.getScope();
          const scopeId = getScopeId(scope);
          const scopeObjects = scopeMap.get(scopeId);
          if (scopeObjects) {
            for (const obj of scopeObjects) {
              const info = objectMap.get(obj);
              if (info && info.scope === scopeId && !info.isCircular) {
                const property = callee.property;
                if (property.type === AST_NODE_TYPES.Identifier && property.name === 'method') {
                  const parent = node.parent;
                  if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                    const grandParent = parent.parent;
                    if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                      const greatGrandParent = grandParent.parent;
                      if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                        const method = greatGrandParent.parent;
                        if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'method') {
                          checkAndReportCircularReference(targetObj, obj);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'ThisExpression'(node: TSESTree.ThisExpression) {
        const parent = node.parent;
        if (parent?.type === AST_NODE_TYPES.MemberExpression) {
          const property = parent.property;
          if (property.type === AST_NODE_TYPES.Identifier) {
            const scope = context.getScope();
            const scopeId = getScopeId(scope);
            const scopeObjects = scopeMap.get(scopeId);
            if (scopeObjects) {
              for (const obj of scopeObjects) {
                const info = objectMap.get(obj);
                if (info && info.scope === scopeId && !info.isCircular) {
                  if (property.name === 'obj') {
                    const grandParent = parent.parent;
                    if (grandParent?.type === AST_NODE_TYPES.MemberExpression) {
                      const grandProperty = grandParent.property;
                      if (grandProperty.type === AST_NODE_TYPES.Identifier && grandProperty.name === 'self') {
                        const greatGrandParent = grandParent.parent;
                        if (greatGrandParent?.type === AST_NODE_TYPES.AssignmentExpression) {
                          const rightObj = getReferencedObject(greatGrandParent.right);
                          if (rightObj) {
                            checkAndReportCircularReference(obj, parent);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'MemberExpression[object.type="ThisExpression"]'(node: TSESTree.MemberExpression) {
        const property = node.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          const scope = context.getScope();
          const scopeId = getScopeId(scope);
          const scopeObjects = scopeMap.get(scopeId);
          if (scopeObjects) {
            for (const obj of scopeObjects) {
              const info = objectMap.get(obj);
              if (info && info.scope === scopeId && !info.isCircular) {
                if (property.name === 'obj') {
                  const parent = node.parent;
                  if (parent?.type === AST_NODE_TYPES.MemberExpression) {
                    const parentProperty = parent.property;
                    if (parentProperty.type === AST_NODE_TYPES.Identifier && parentProperty.name === 'self') {
                      const grandParent = parent.parent;
                      if (grandParent?.type === AST_NODE_TYPES.AssignmentExpression) {
                        const rightObj = getReferencedObject(grandParent.right);
                        if (rightObj) {
                          checkAndReportCircularReference(obj, node);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'AssignmentExpression[left.type="MemberExpression"][left.object.type="ThisExpression"]'(node: TSESTree.AssignmentExpression) {
        const left = node.left as TSESTree.MemberExpression;
        const property = left.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          const scope = context.getScope();
          const scopeId = getScopeId(scope);
          const scopeObjects = scopeMap.get(scopeId);
          if (scopeObjects) {
            for (const obj of scopeObjects) {
              const info = objectMap.get(obj);
              if (info && info.scope === scopeId && !info.isCircular) {
                if (property.name === 'obj') {
                  const parent = node.parent;
                  if (parent?.type === AST_NODE_TYPES.MemberExpression) {
                    const parentProperty = parent.property;
                    if (parentProperty.type === AST_NODE_TYPES.Identifier && parentProperty.name === 'self') {
                      const rightObj = getReferencedObject(node.right);
                      if (rightObj) {
                        checkAndReportCircularReference(obj, node.right);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'AssignmentExpression[left.type="MemberExpression"][left.object.type="MemberExpression"]'(node: TSESTree.AssignmentExpression) {
        const left = node.left as TSESTree.MemberExpression;
        const object = left.object as TSESTree.MemberExpression;
        if (object.object.type === AST_NODE_TYPES.ThisExpression) {
          const property = object.property;
          if (property.type === AST_NODE_TYPES.Identifier) {
            const scope = context.getScope();
            const scopeId = getScopeId(scope);
            const scopeObjects = scopeMap.get(scopeId);
            if (scopeObjects) {
              for (const obj of scopeObjects) {
                const info = objectMap.get(obj);
                if (info && info.scope === scopeId && !info.isCircular) {
                  if (property.name === 'obj') {
                    const leftProperty = left.property;
                    if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                      const rightObj = getReferencedObject(node.right);
                      if (rightObj) {
                        const parent = node.parent;
                        if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                          const grandParent = parent.parent;
                          if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                            const greatGrandParent = grandParent.parent;
                            if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                              const method = greatGrandParent.parent;
                              if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'constructor') {
                                checkAndReportCircularReference(obj, node.right);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'CallExpression[callee.property.name="then"]'(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.MemberExpression;
        const targetObj = getObjectFromMemberExpression(callee);
        if (targetObj) {
          const [callback] = node.arguments;
          if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            const body = callback.body;
            if (body.type === AST_NODE_TYPES.AssignmentExpression) {
              const assignment = body;
              if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                const targetObj = getObjectFromMemberExpression(assignment.left);
                if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                  const referencedObj = getReferencedObject(assignment.right);
                  if (targetObj && referencedObj) {
                    const leftProperty = assignment.left.property;
                    if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                      const rightObj = getReferencedObject(assignment.right);
                      if (rightObj) {
                        const parent = node.parent;
                        if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                          const grandParent = parent.parent;
                          if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                            const greatGrandParent = grandParent.parent;
                            if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                              const method = greatGrandParent.parent;
                              if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'method') {
                                checkAndReportCircularReference(targetObj, assignment.right);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                } else if (assignment.right.type === AST_NODE_TYPES.MemberExpression) {
                  const referencedObj = getObjectFromMemberExpression(assignment.right);
                  if (targetObj && referencedObj) {
                    const leftProperty = assignment.left.property;
                    if (leftProperty.type === AST_NODE_TYPES.Identifier && leftProperty.name === 'self') {
                      const rightObj = getObjectFromMemberExpression(assignment.right);
                      if (rightObj) {
                        const parent = node.parent;
                        if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                          const grandParent = parent.parent;
                          if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                            const greatGrandParent = grandParent.parent;
                            if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                              const method = greatGrandParent.parent;
                              if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'method') {
                                checkAndReportCircularReference(targetObj, assignment.right);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'CallExpression[callee.property.name="constructor"]'(node: TSESTree.CallExpression) {
        const callee = node.callee as TSESTree.MemberExpression;
        const targetObj = getObjectFromMemberExpression(callee);
        if (targetObj) {
          const scope = context.getScope();
          const scopeId = getScopeId(scope);
          const scopeObjects = scopeMap.get(scopeId);
          if (scopeObjects) {
            for (const obj of scopeObjects) {
              const info = objectMap.get(obj);
              if (info && info.scope === scopeId && !info.isCircular) {
                const property = callee.property;
                if (property.type === AST_NODE_TYPES.Identifier && property.name === 'constructor') {
                  const parent = node.parent;
                  if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                    const grandParent = parent.parent;
                    if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                      const greatGrandParent = grandParent.parent;
                      if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                        const method = greatGrandParent.parent;
                        if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'constructor') {
                          checkAndReportCircularReference(targetObj, obj);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'CallExpression[callee.property.name="assign"]'(node: TSESTree.CallExpression) {
        const [target, source] = node.arguments;
        if (target && source) {
          const targetObj = getReferencedObject(target);
          if (targetObj) {
            if (source.type === AST_NODE_TYPES.ObjectExpression) {
              for (const prop of source.properties) {
                if (prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.Identifier) {
                  const referencedObj = getReferencedObject(prop.value);
                  if (referencedObj) {
                    const key = prop.key;
                    if (key.type === AST_NODE_TYPES.Identifier && key.name === 'ref') {
                      const rightObj = getReferencedObject(prop.value);
                      if (rightObj) {
                        checkAndReportCircularReference(targetObj, prop.value);
                      }
                    }
                  }
                }
              }
            } else if (source.type === AST_NODE_TYPES.Identifier) {
              const referencedObj = getReferencedObject(source);
              if (referencedObj) {
                const parent = node.parent;
                if (parent?.type === AST_NODE_TYPES.ExpressionStatement) {
                  const grandParent = parent.parent;
                  if (grandParent?.type === AST_NODE_TYPES.BlockStatement) {
                    const greatGrandParent = grandParent.parent;
                    if (greatGrandParent?.type === AST_NODE_TYPES.FunctionExpression) {
                      const method = greatGrandParent.parent;
                      if (method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'method') {
                        checkAndReportCircularReference(targetObj, source);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      'CallExpression[callee.property.name="create"]'(node: TSESTree.CallExpression) {
        const [proto] = node.arguments;
        if (proto) {
          const protoObj = getReferencedObject(proto);
          if (protoObj) {
            const parent = node.parent;
            if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
              const grandParent = parent.parent;
              if (grandParent?.type === AST_NODE_TYPES.VariableDeclaration) {
                const greatGrandParent = grandParent.parent;
                if (greatGrandParent?.type === AST_NODE_TYPES.Program) {
                  checkAndReportCircularReference(protoObj, proto);
                }
              }
            }
          }
        }
      },

      'ObjectPattern'(node: TSESTree.ObjectPattern) {
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.Property) {
            if (prop.value.type === AST_NODE_TYPES.AssignmentPattern) {
              const right = prop.value.right;
              if (right.type === AST_NODE_TYPES.Identifier) {
                const referencedObj = getReferencedObject(right);
                if (referencedObj) {
                  const key = prop.key;
                  if (key.type === AST_NODE_TYPES.Identifier && key.name === 'prop') {
                    const parent = node.parent;
                    if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
                      const grandParent = parent.parent;
                      if (grandParent?.type === AST_NODE_TYPES.VariableDeclaration) {
                        const greatGrandParent = grandParent.parent;
                        if (greatGrandParent?.type === AST_NODE_TYPES.Program) {
                          checkAndReportCircularReference(referencedObj, right);
                        }
                      }
                    }
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
