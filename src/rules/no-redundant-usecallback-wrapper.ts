import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    memoizedHookNames?: string[];
  },
];

type MessageIds = 'redundantWrapper';

function isHookLikeName(name: string): boolean {
  return name.startsWith('use');
}

function isKnownHookCallee(
  callee: TSESTree.LeftHandSideExpression,
  knownHooks: Set<string>,
): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isHookLikeName(callee.name) || knownHooks.has(callee.name);
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
        if (
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier
        ) {
          names.push(prop.key.name);
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
    return (node.expression as unknown) as T;
  }
  return (node as unknown) as T;
}

function collectValueIdentifiers(node: TSESTree.Node | null, acc: Set<string>) {
  if (!node) return;
  switch (node.type) {
    case AST_NODE_TYPES.Identifier: {
      const parent = (node as any).parent;
      if (
        parent &&
        ((parent.type === AST_NODE_TYPES.MemberExpression &&
          (parent as TSESTree.MemberExpression).property === node &&
          !(parent as TSESTree.MemberExpression).computed) ||
          (parent.type === AST_NODE_TYPES.Property &&
            (parent as TSESTree.Property).key === node))
      ) {
        // skip property names
        return;
      }
      acc.add(node.name);
      return;
    }
    case AST_NODE_TYPES.MemberExpression: {
      // traverse only the object; traverse property only if computed
      collectValueIdentifiers(node.object as TSESTree.Node, acc);
      if (node.computed) {
        collectValueIdentifiers(node.property as TSESTree.Node, acc);
      }
      return;
    }
    case AST_NODE_TYPES.Property: {
      collectValueIdentifiers(node.value as TSESTree.Node, acc);
      return;
    }
    default: {
      for (const key in node) {
        if (key === 'parent') continue;
        const value = (node as any)[key];
        if (Array.isArray(value)) {
          for (const v of value)
            if (v && typeof v === 'object' && 'type' in v)
              collectValueIdentifiers(v as TSESTree.Node, acc);
        } else if (value && typeof value === 'object' && 'type' in value) {
          collectValueIdentifiers(value as TSESTree.Node, acc);
        }
      }
    }
  }
}

function depsArrayLength(arg: TSESTree.Node | undefined): number {
  if (!arg || arg.type !== AST_NODE_TYPES.ArrayExpression) return 0;
  return arg.elements.filter(Boolean).length;
}

function argsOnlyUseParams(args: TSESTree.Node[], params: string[]): boolean {
  const paramSet = new Set(params);
  const idents = new Set<string>();
  for (const a of args) {
    collectValueIdentifiers(a as TSESTree.Node, idents);
  }
  for (const name of idents) {
    if (!paramSet.has(name)) return false;
  }
  return idents.size > 0; // at least uses params
}

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

    // Track identifiers coming from hook-like calls
    const hookReturnObjects = new Set<string>(); // variables assigned to a hook call result (object or function)
    const hookReturnProps = new Set<string>(); // properties destructured from a hook call result

    return {
      VariableDeclarator(node) {
        if (!node.init || node.init.type !== AST_NODE_TYPES.CallExpression)
          return;
        const callee = node.init.callee;
        if (!isKnownHookCallee(callee, knownHooks)) return;

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
        // Detect useCallback wrappers
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useCallback' &&
          node.arguments.length >= 1
        ) {
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
              const replaceText = context.getSourceCode().getText(unwrappedArg);
              context.report({
                node,
                messageId: 'redundantWrapper',
                fix: (fixer) => fixer.replaceText(node, replaceText),
              });
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
                    // Allow parameter transformation or multiple deps
                    if (
                      argsOnlyUseParams(
                        (bodyExpr.arguments as unknown) as TSESTree.Node[],
                        params,
                      )
                    ) {
                      return;
                    }
                    const depLen = depsArrayLength(node.arguments[1]);
                    if (depLen > 1) return;
                    context.report({ node, messageId: 'redundantWrapper' });
                  } else {
                    const replaceText =
                      callee.type === AST_NODE_TYPES.MemberExpression
                        ? context.getSourceCode().getText(callee)
                        : (callee as TSESTree.Identifier).name;
                    context.report({
                      node,
                      messageId: 'redundantWrapper',
                      fix: (fixer) => fixer.replaceText(node, replaceText),
                    });
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
                        if (
                          argsOnlyUseParams(
                            (expr.arguments as unknown) as TSESTree.Node[],
                            params,
                          )
                        )
                          return; // allow parameter transformation
                        const depLen = depsArrayLength(node.arguments[1]);
                        if (depLen > 1) return; // allow multiple deps
                        context.report({ node, messageId: 'redundantWrapper' });
                      } else {
                        // No args: treat preventDefault-only as non-substantial; auto-fix
                        const replaceText =
                          callee.type === AST_NODE_TYPES.MemberExpression
                            ? context.getSourceCode().getText(callee)
                            : (callee as TSESTree.Identifier).name;
                        context.report({
                          node,
                          messageId: 'redundantWrapper',
                          fix: (fixer) => fixer.replaceText(node, replaceText),
                        });
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

