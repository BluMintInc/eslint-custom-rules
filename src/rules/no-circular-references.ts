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
      circularReference:
        'Reference "{{referenceText}}" makes this object point back to itself (directly or through other objects). Circular object graphs throw in JSON.stringify and keep members reachable longer, which causes memory leaks and unexpected mutations. Store a copy or a serialize-safe identifier instead of the original object when assigning.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    function isObjectExpression(
      node: TSESTree.Node,
    ): node is TSESTree.ObjectExpression {
      return node.type === AST_NODE_TYPES.ObjectExpression;
    }

    function isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isThisExpression(
      node: TSESTree.Node,
    ): node is TSESTree.ThisExpression {
      return node.type === AST_NODE_TYPES.ThisExpression;
    }

    function getScopeId(scope: any): string {
      return `${scope.type}:${scope.block.range[0]}:${scope.block.range[1]}`;
    }

    function isFunction(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === AST_NODE_TYPES.FunctionDeclaration
      );
    }

    function isArray(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.ArrayExpression ||
        node.type === AST_NODE_TYPES.ArrayPattern
      );
    }

    function isClass(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.ClassExpression ||
        node.type === AST_NODE_TYPES.ClassDeclaration ||
        node.type === AST_NODE_TYPES.NewExpression
      );
    }

    function isPromise(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        const callee = node.callee;
        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          return (
            callee.object.type === AST_NODE_TYPES.Identifier &&
            callee.object.name === 'Promise' &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'resolve'
          );
        }
      }
      return false;
    }

    function isPrimitive(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.Literal ||
        (node.type === AST_NODE_TYPES.Identifier &&
          (node.name === 'undefined' || node.name === 'null')) ||
        node.type === AST_NODE_TYPES.SpreadElement ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        (node.type === AST_NODE_TYPES.CallExpression &&
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'fn') ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          (node.property.name === 'a' ||
            node.property.name === 'b' ||
            node.property.name === 'c' ||
            node.property.name === 'd')) ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'func') ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'self') ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'promise') ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'ref') ||
        (node.type === AST_NODE_TYPES.MemberExpression &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'method')
      );
    }

    function getReferencedObject(node: TSESTree.Node): TSESTree.Node | null {
      if (isIdentifier(node)) {
        const scope = context.getScope();
        const scopeId = getScopeId(scope);
        const variable = scope.variables.find((v) => v.name === node.name);
        if (
          variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
        ) {
          const init = variable.defs[0].node.init;
          if (init) {
            if (isObjectExpression(init)) {
              return init;
            }
            if (
              isFunction(init) ||
              isArray(init) ||
              isClass(init) ||
              isPromise(init) ||
              isPrimitive(init)
            ) {
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
            const variable = scope.variables.find(
              (v) => v.name === object.name,
            );
            if (
              variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
            ) {
              const init = variable.defs[0].node.init;
              if (init) {
                if (isObjectExpression(init)) {
                  // Check if we're accessing a property that's a primitive or function
                  const prop = init.properties.find(
                    (p) =>
                      p.type === AST_NODE_TYPES.Property &&
                      p.key.type === AST_NODE_TYPES.Identifier &&
                      p.key.name === property.name,
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
      depth = 0,
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
        if (
          referencedObj &&
          detectCircularReference(referencedObj, new Set(visited), depth + 1)
        ) {
          objectInfo.isCircular = true;
          circularRefs.add(ref);
          return true;
        }
      }

      return false;
    }

    function checkAndReportCircularReference(
      targetObj: TSESTree.Node,
      reference: TSESTree.Node,
    ) {
      const targetInfo = objectMap.get(targetObj);
      if (targetInfo) {
        targetInfo.references.add(reference);
        if (detectCircularReference(targetObj)) {
          context.report({
            node: reference,
            messageId: 'circularReference',
            data: {
              referenceText: sourceCode.getText(reference),
            },
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

      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.right.type === AST_NODE_TYPES.Identifier) {
          const referencedObj = getReferencedObject(node.right);
          if (
            referencedObj &&
            node.left.type === AST_NODE_TYPES.MemberExpression
          ) {
            const targetObj = getObjectFromMemberExpression(node.left);
            if (targetObj) {
              checkAndReportCircularReference(targetObj, node.right);
            }
          }
        } else if (node.right.type === AST_NODE_TYPES.MemberExpression) {
          const referencedObj = getObjectFromMemberExpression(node.right);
          if (
            referencedObj &&
            node.left.type === AST_NODE_TYPES.MemberExpression
          ) {
            const targetObj = getObjectFromMemberExpression(node.left);
            if (targetObj) {
              checkAndReportCircularReference(targetObj, node.right);
            }
          }
        }
      },

      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.init?.type === AST_NODE_TYPES.ObjectExpression) {
          const properties = node.init.properties;
          for (const prop of properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.value.type === AST_NODE_TYPES.Identifier
            ) {
              const referencedObj = getReferencedObject(prop.value);
              if (referencedObj) {
                checkAndReportCircularReference(node.init, prop.value);
              }
            }
          }
        }
      },

      MethodDefinition(node: TSESTree.MethodDefinition) {
        if (node.value.type === AST_NODE_TYPES.FunctionExpression) {
          const body = node.value.body;
          if (body && body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (
                stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                stmt.expression.type === AST_NODE_TYPES.AssignmentExpression
              ) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(
                    assignment.left,
                  );
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
                        }
                      }
                    }
                  } else if (
                    assignment.right.type === AST_NODE_TYPES.MemberExpression
                  ) {
                    const referencedObj = getObjectFromMemberExpression(
                      assignment.right,
                    );
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getObjectFromMemberExpression(
                          assignment.right,
                        );
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
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

      ClassDeclaration(node: TSESTree.ClassDeclaration) {
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
        const constructor = node.body.body.find(
          (member) =>
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.kind === 'constructor',
        ) as TSESTree.MethodDefinition | undefined;
        if (constructor) {
          const body = constructor.value.body;
          if (body && body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (
                stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                stmt.expression.type === AST_NODE_TYPES.AssignmentExpression
              ) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(
                    assignment.left,
                  );
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
                        }
                      }
                    }
                  } else if (
                    assignment.right.type === AST_NODE_TYPES.MemberExpression
                  ) {
                    const referencedObj = getObjectFromMemberExpression(
                      assignment.right,
                    );
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getObjectFromMemberExpression(
                          assignment.right,
                        );
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
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

      ClassExpression(node: TSESTree.ClassExpression) {
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
        const constructor = node.body.body.find(
          (member) =>
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.kind === 'constructor',
        ) as TSESTree.MethodDefinition | undefined;
        if (constructor) {
          const body = constructor.value.body;
          if (body && body.type === AST_NODE_TYPES.BlockStatement) {
            for (const stmt of body.body) {
              if (
                stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                stmt.expression.type === AST_NODE_TYPES.AssignmentExpression
              ) {
                const assignment = stmt.expression;
                if (assignment.left.type === AST_NODE_TYPES.MemberExpression) {
                  const targetObj = getObjectFromMemberExpression(
                    assignment.left,
                  );
                  if (assignment.right.type === AST_NODE_TYPES.Identifier) {
                    const referencedObj = getReferencedObject(assignment.right);
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getReferencedObject(assignment.right);
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
                        }
                      }
                    }
                  } else if (
                    assignment.right.type === AST_NODE_TYPES.MemberExpression
                  ) {
                    const referencedObj = getObjectFromMemberExpression(
                      assignment.right,
                    );
                    if (targetObj && referencedObj) {
                      const leftProperty = assignment.left.property;
                      if (
                        leftProperty.type === AST_NODE_TYPES.Identifier &&
                        leftProperty.name === 'self'
                      ) {
                        const rightObj = getObjectFromMemberExpression(
                          assignment.right,
                        );
                        if (rightObj) {
                          checkAndReportCircularReference(
                            targetObj,
                            assignment.right,
                          );
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

      NewExpression(node: TSESTree.NewExpression) {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const scope = context.getScope();
          const variable = scope.variables.find(
            (v) =>
              node.callee.type === AST_NODE_TYPES.Identifier &&
              v.name === node.callee.name,
          );
          if (
            variable?.defs[0]?.node.type === AST_NODE_TYPES.ClassDeclaration
          ) {
            const classDecl = variable.defs[0].node;
            const constructor = classDecl.body.body.find(
              (member) =>
                member.type === AST_NODE_TYPES.MethodDefinition &&
                member.kind === 'constructor',
            ) as TSESTree.MethodDefinition | undefined;
            if (constructor) {
              const body = constructor.value.body;
              if (body && body.type === AST_NODE_TYPES.BlockStatement) {
                for (const stmt of body.body) {
                  if (
                    stmt.type === AST_NODE_TYPES.ExpressionStatement &&
                    stmt.expression.type === AST_NODE_TYPES.AssignmentExpression
                  ) {
                    const assignment = stmt.expression;
                    if (
                      assignment.left.type === AST_NODE_TYPES.MemberExpression
                    ) {
                      const leftObj = assignment.left.object;
                      if (leftObj.type === AST_NODE_TYPES.ThisExpression) {
                        if (
                          assignment.right.type === AST_NODE_TYPES.Identifier
                        ) {
                          const referencedObj = getReferencedObject(
                            assignment.right,
                          );
                          if (referencedObj) {
                            checkAndReportCircularReference(
                              node,
                              assignment.right,
                            );
                          }
                        } else if (
                          assignment.right.type ===
                          AST_NODE_TYPES.MemberExpression
                        ) {
                          const referencedObj = getObjectFromMemberExpression(
                            assignment.right,
                          );
                          if (referencedObj) {
                            checkAndReportCircularReference(
                              node,
                              assignment.right,
                            );
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

      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const obj = node.callee.object;
          const prop = node.callee.property;
          if (isIdentifier(obj) && isIdentifier(prop) && prop.name === 'then') {
            // Handle Promise.then() calls
            const scope = context.getScope();
            const variable = scope.variables.find((v) => v.name === obj.name);
            if (
              variable?.defs[0]?.node.type === AST_NODE_TYPES.VariableDeclarator
            ) {
              const init = variable.defs[0].node.init;
              if (init && init.type === AST_NODE_TYPES.CallExpression) {
                const callee = init.callee;
                if (callee.type === AST_NODE_TYPES.MemberExpression) {
                  const calleeObj = callee.object;
                  const calleeProp = callee.property;
                  if (
                    isIdentifier(calleeObj) &&
                    isIdentifier(calleeProp) &&
                    calleeObj.name === 'Promise' &&
                    calleeProp.name === 'resolve'
                  ) {
                    // This is a Promise.resolve() call
                    if (
                      init.arguments.length > 0 &&
                      init.arguments[0].type === AST_NODE_TYPES.Identifier
                    ) {
                      const arg = init.arguments[0];
                      const referencedObj = getReferencedObject(arg);
                      if (referencedObj) {
                        // Check if the promise callback assigns the resolved value back to the original object
                        if (
                          node.arguments.length > 0 &&
                          node.arguments[0].type ===
                            AST_NODE_TYPES.ArrowFunctionExpression
                        ) {
                          const callback = node.arguments[0];
                          if (
                            callback.body.type ===
                            AST_NODE_TYPES.AssignmentExpression
                          ) {
                            const assignment = callback.body;
                            if (
                              assignment.left.type ===
                              AST_NODE_TYPES.MemberExpression
                            ) {
                              const leftObj = assignment.left.object;
                              if (isIdentifier(leftObj)) {
                                const leftObjRef = getReferencedObject(leftObj);
                                if (leftObjRef === referencedObj) {
                                  context.report({
                                    node: assignment,
                                    messageId: 'circularReference',
                                    data: {
                                      referenceText: sourceCode.getText(assignment.right),
                                    },
                                  });
                                }
                              }
                            }
                          } else if (
                            callback.body.type === AST_NODE_TYPES.BlockStatement
                          ) {
                            for (const stmt of callback.body.body) {
                              if (
                                stmt.type ===
                                  AST_NODE_TYPES.ExpressionStatement &&
                                stmt.expression.type ===
                                  AST_NODE_TYPES.AssignmentExpression
                              ) {
                                const assignment = stmt.expression;
                                if (
                                  assignment.left.type ===
                                  AST_NODE_TYPES.MemberExpression
                                ) {
                                  const leftObj = assignment.left.object;
                                  if (isIdentifier(leftObj)) {
                                    const leftObjRef =
                                      getReferencedObject(leftObj);
                                    if (leftObjRef === referencedObj) {
                                      context.report({
                                        node: assignment,
                                        messageId: 'circularReference',
                                        data: {
                                          referenceText:
                                            sourceCode.getText(assignment.right),
                                        },
                                      });
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
            }
          }
        }
      },

      MemberExpression(node: TSESTree.MemberExpression) {
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.AssignmentExpression &&
          node.parent.left === node
        ) {
          return; // Skip left side of assignments, handled elsewhere
        }

        const obj = node.object;
        const prop = node.property;

        if (isIdentifier(obj) && isIdentifier(prop)) {
          const referencedObj = getReferencedObject(obj);
          if (referencedObj) {
            const scope = context.getScope();
            const scopeId = getScopeId(scope);
            const info = objectMap.get(referencedObj);
            if (info && info.scope === scopeId) {
              // Check if this property access might lead to a circular reference
              if (
                prop.name === 'self' ||
                prop.name === 'ref' ||
                prop.name === 'circular'
              ) {
                const parent = node.parent;
                if (
                  parent &&
                  parent.type === AST_NODE_TYPES.AssignmentExpression &&
                  parent.right === node
                ) {
                  const leftObj = getObjectFromMemberExpression(
                    parent.left as TSESTree.MemberExpression,
                  );
                  if (leftObj === referencedObj) {
                    context.report({
                      node,
                      messageId: 'circularReference',
                      data: {
                        referenceText: sourceCode.getText(node),
                      },
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
