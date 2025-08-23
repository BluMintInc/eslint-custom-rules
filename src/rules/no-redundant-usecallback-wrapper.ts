import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    memoizedHookNames?: string[];
    assumeAllUseAreMemoized?: boolean;
  },
];

type MessageIds = 'redundantWrapper';

function isHookLikeName(name: string): boolean {
  return name.startsWith('use');
}

function isKnownHookCallee(
  callee: TSESTree.LeftHandSideExpression,
  knownHooks: Set<string>,
  assumeAllUseAreMemoized: boolean,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return (
      (assumeAllUseAreMemoized && isHookLikeName(callee.name)) ||
      knownHooks.has(callee.name)
    );
  }
  // Support namespaced hook calls, e.g., Hooks.useAuthSubmit()
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    const prop = callee.property.name;
    return (
      (assumeAllUseAreMemoized && isHookLikeName(prop)) || knownHooks.has(prop)
    );
  }
  return false;
}

function isPreventDefaultCall(
  stmt: TSESTree.Statement,
  params: string[],
): boolean {
  if (stmt.type !== AST_NODE_TYPES.ExpressionStatement) return false;
  const expr = stmt.expression;
  if (expr.type !== AST_NODE_TYPES.CallExpression) return false;
  if (expr.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  const member = expr.callee;
  if (
    member.object.type === AST_NODE_TYPES.Identifier &&
    params.includes(member.object.name) &&
    member.property.type === AST_NODE_TYPES.Identifier &&
    (member.property.name === 'preventDefault' ||
      member.property.name === 'stopPropagation' ||
      member.property.name === 'stopImmediatePropagation')
  ) {
    return true;
  }
  return false;
}

function getParams(
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): string[] {
  const names: string[] = [];
  for (const p of node.params) {
    if (p.type === AST_NODE_TYPES.Identifier) names.push(p.name);
    else if (p.type === AST_NODE_TYPES.ObjectPattern) {
      for (const prop of p.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          if (prop.key.type === AST_NODE_TYPES.Identifier) {
            // Shorthand collects key name
            if ((prop as any).shorthand) {
              names.push(prop.key.name);
            }
          }
          // Collect bound identifier names (aliases/defaults)
          if (prop.value.type === AST_NODE_TYPES.Identifier) {
            names.push(prop.value.name);
          } else if (
            prop.value.type === AST_NODE_TYPES.AssignmentPattern &&
            prop.value.left.type === AST_NODE_TYPES.Identifier
          ) {
            names.push(prop.value.left.name);
          }
        } else if (prop.type === AST_NODE_TYPES.RestElement) {
          if (prop.argument.type === AST_NODE_TYPES.Identifier) {
            names.push(prop.argument.name);
          }
        }
      }
    }
  }
  return names;
}

function isIdentifierOrMemberOn(
  obj: TSESTree.Expression,
  nameSet: Set<string>,
): boolean {
  if (obj.type === AST_NODE_TYPES.Identifier) {
    return nameSet.has(obj.name);
  }
  if (
    obj.type === AST_NODE_TYPES.MemberExpression &&
    obj.object.type === AST_NODE_TYPES.Identifier
  ) {
    return nameSet.has(obj.object.name);
  }
  return false;
}

function unwrapChainExpression<T extends TSESTree.Node>(
  node: TSESTree.Node,
): T | null {
  if (!node) return null;
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return node.expression as unknown as T;
  }
  return node as unknown as T;
}

// intentionally removed: helper for param-only detection not needed after simplification

// reserved for potential future options/heuristics

export const noRedundantUseCallbackWrapper = createRule<Options, MessageIds>({
  name: 'no-redundant-usecallback-wrapper',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent wrapping already memoized/stable callbacks from hooks/contexts in an extra useCallback()',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          memoizedHookNames: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          assumeAllUseAreMemoized: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      redundantWrapper:
        'Redundant useCallback wrapper around an already memoized callback. Pass the memoized function directly.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const option = context.options?.[0] ?? {};
    const knownHooks = new Set(option.memoizedHookNames ?? []);
    const assumeAllUseAreMemoized = option.assumeAllUseAreMemoized === true;

    // Track identifiers coming from hook-like calls
    const hookReturnObjects = new Set<string>(); // variables assigned to a hook call result (object or function)
    const hookReturnProps = new Set<string>(); // properties destructured from a hook call result

    return {
      VariableDeclarator(node) {
        if (!node.init || node.init.type !== AST_NODE_TYPES.CallExpression)
          return;
        const callee = node.init.callee;
        if (!isKnownHookCallee(callee, knownHooks, assumeAllUseAreMemoized))
          return;

        if (node.id.type === AST_NODE_TYPES.Identifier) {
          hookReturnObjects.add(node.id.name);
          return;
        }

        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of node.id.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              if (prop.value.type === AST_NODE_TYPES.Identifier) {
                hookReturnProps.add(prop.value.name);
              } else if (
                prop.value.type === AST_NODE_TYPES.AssignmentPattern &&
                prop.value.left.type === AST_NODE_TYPES.Identifier
              ) {
                hookReturnProps.add(prop.value.left.name);
              }
            }
          }
          return;
        }
      },

      CallExpression(node) {
        // Detect useCallback wrappers (including React.useCallback)
        const calleeNode = node.callee;
        const isUseCallback =
          (calleeNode.type === AST_NODE_TYPES.Identifier &&
            calleeNode.name === 'useCallback') ||
          (calleeNode.type === AST_NODE_TYPES.MemberExpression &&
            !calleeNode.computed &&
            calleeNode.property.type === AST_NODE_TYPES.Identifier &&
            calleeNode.property.name === 'useCallback');
        if (isUseCallback && node.arguments.length >= 1) {
          const arg = node.arguments[0];
          const unwrappedArg = unwrapChainExpression<TSESTree.Node>(arg);

          // Case 1: useCallback(memoizedFn, ...) or useCallback(ctx.memoized, ...)
          if (
            unwrappedArg &&
            (unwrappedArg.type === AST_NODE_TYPES.Identifier ||
              unwrappedArg.type === AST_NODE_TYPES.MemberExpression)
          ) {
            if (
              (unwrappedArg.type === AST_NODE_TYPES.Identifier &&
                (hookReturnProps.has(unwrappedArg.name) ||
                  hookReturnObjects.has(unwrappedArg.name))) ||
              (unwrappedArg.type === AST_NODE_TYPES.MemberExpression &&
                unwrappedArg.object.type === AST_NODE_TYPES.Identifier &&
                hookReturnObjects.has(unwrappedArg.object.name))
            ) {
              if (unwrappedArg.type === AST_NODE_TYPES.Identifier) {
                const replaceText = unwrappedArg.name;
                context.report({
                  node,
                  messageId: 'redundantWrapper',
                  fix: (fixer) => fixer.replaceText(node, replaceText),
                });
              } else {
                // Member function — report only, no fix to avoid breaking `this`.
                context.report({ node, messageId: 'redundantWrapper' });
              }
            }
            return;
          }

          // Case 2: useCallback(() => memoizedFn(...), ...)
          if (
            unwrappedArg &&
            (unwrappedArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              unwrappedArg.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            const fn = unwrappedArg;
            const params = getParams(fn);

            // Handle implicit return: () => memoizedFn()
            if (
              fn.type === AST_NODE_TYPES.ArrowFunctionExpression &&
              fn.body.type !== AST_NODE_TYPES.BlockStatement
            ) {
              const bodyExpr = unwrapChainExpression<TSESTree.Expression>(
                fn.body,
              );
              if (bodyExpr && bodyExpr.type === AST_NODE_TYPES.CallExpression) {
                const callee = unwrapChainExpression<TSESTree.Expression>(
                  bodyExpr.callee,
                );
                if (
                  (callee &&
                    isIdentifierOrMemberOn(
                      callee as TSESTree.Expression,
                      hookReturnObjects,
                    )) ||
                  (callee &&
                    callee.type === AST_NODE_TYPES.Identifier &&
                    hookReturnProps.has(callee.name))
                ) {
                  if (bodyExpr.arguments.length > 0) {
                    // Passing any arguments: treat as non-redundant (avoid false positives)
                    return;
                  } else {
                    if (callee.type === AST_NODE_TYPES.Identifier) {
                      const replaceText = (callee as TSESTree.Identifier).name;
                      context.report({
                        node,
                        messageId: 'redundantWrapper',
                        fix: (fixer) => fixer.replaceText(node, replaceText),
                      });
                    } else {
                      // Member function — report only, no fix to avoid breaking `this`.
                      context.report({ node, messageId: 'redundantWrapper' });
                    }
                  }
                }
              }
              return;
            }

            // Handle block body: () => { [maybe e.preventDefault()]; return memoizedFn(); }
            if (fn.body && fn.body.type === AST_NODE_TYPES.BlockStatement) {
              const stmts = fn.body.body.filter(Boolean);
              if (stmts.length >= 1 && stmts.length <= 2) {
                let idx = 0;
                if (
                  stmts.length === 2 &&
                  isPreventDefaultCall(stmts[0], params)
                ) {
                  idx = 1;
                }

                const last = stmts[idx];
                if (
                  last.type === AST_NODE_TYPES.ReturnStatement ||
                  last.type === AST_NODE_TYPES.ExpressionStatement
                ) {
                  const expr =
                    last.type === AST_NODE_TYPES.ReturnStatement
                      ? last.argument
                      : last.expression;
                  if (expr && expr.type === AST_NODE_TYPES.CallExpression) {
                    const callee = unwrapChainExpression<TSESTree.Expression>(
                      expr.callee,
                    );
                    const isHookProp =
                      callee &&
                      callee.type === AST_NODE_TYPES.Identifier &&
                      hookReturnProps.has(callee.name);
                    const isHookObjMember =
                      callee &&
                      callee.type === AST_NODE_TYPES.MemberExpression &&
                      callee.object.type === AST_NODE_TYPES.Identifier &&
                      hookReturnObjects.has(callee.object.name);
                    if (isHookProp || isHookObjMember) {
                      if ((expr.arguments?.length ?? 0) > 0) {
                        // Passing any arguments: treat as non-redundant
                        return;
                      } else {
                        // No args and trivial wrapper
                        if (callee.type === AST_NODE_TYPES.Identifier) {
                          const replaceText = (callee as TSESTree.Identifier)
                            .name;
                          context.report({
                            node,
                            messageId: 'redundantWrapper',
                            fix: (fixer) =>
                              fixer.replaceText(node, replaceText),
                          });
                        } else {
                          // Member function — report only, no fix to avoid breaking `this`.
                          context.report({
                            node,
                            messageId: 'redundantWrapper',
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
      },
    };
  },
});

export default noRedundantUseCallbackWrapper;
