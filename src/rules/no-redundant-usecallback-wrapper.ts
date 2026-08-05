import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type Options = [
  {
    memoizedHookNames?: string[];
    assumeAllUseAreMemoized?: boolean;
  },
];

type MessageIds = 'redundantWrapper';

const LATEST_CALLBACK_MODULE = 'use-latest-callback';
const LATEST_CALLBACK_HOOK = 'useLatestCallback';
const MEMO_HOOK = 'useMemo';

/**
 * Type-level wrappers carry no runtime value, so a callback that leaves a
 * memoizing call through a cast is the same callback. Reading through them keeps
 * the proof from depending on whether the author spelled an annotation.
 */
const TYPE_ONLY_WRAPPERS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSInstantiationExpression,
]);

function unwrapValueExpression(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  while (
    current.type === AST_NODE_TYPES.ChainExpression ||
    TYPE_ONLY_WRAPPERS.has(current.type)
  ) {
    current = (current as unknown as { expression: TSESTree.Node }).expression;
  }
  return current;
}

/**
 * The bare name a callee resolves to, collapsing the namespaced spelling so
 * `React.useCallback` and `useCallback` answer alike.
 */
function calleeNameOf(callee: TSESTree.Node): string | null {
  const unwrapped = unwrapValueExpression(callee);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped.name;
  }
  if (
    unwrapped.type === AST_NODE_TYPES.MemberExpression &&
    !unwrapped.computed &&
    unwrapped.property.type === AST_NODE_TYPES.Identifier
  ) {
    return unwrapped.property.name;
  }
  return null;
}

function isFunctionLiteral(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

/**
 * Whether a `useMemo` factory demonstrably yields a function.
 *
 * `useMemo` memoizes any value, so its result is a memoized *callback* only when
 * the factory produces one. Only a factory that hands back a function literal
 * proves that in-source; a factory returning a call result, a conditional or a
 * value assembled across several statements might yield anything, and this rule
 * prefers a false negative to guessing.
 */
function producesFunction(factory: TSESTree.Node | undefined): boolean {
  if (!factory || !isFunctionLiteral(factory)) {
    return false;
  }
  const fn = factory as
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression;
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isFunctionLiteral(unwrapValueExpression(fn.body));
  }
  const statements = fn.body.body;
  if (statements.length !== 1) {
    return false;
  }
  const [only] = statements;
  if (only.type !== AST_NODE_TYPES.ReturnStatement || !only.argument) {
    return false;
  }
  return isFunctionLiteral(unwrapValueExpression(only.argument));
}

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

const EVENT_SUPPRESSION_METHODS = new Set([
  'preventDefault',
  'stopPropagation',
  'stopImmediatePropagation',
]);

/**
 * A wrapper that suppresses the event carries behaviour the rule's own remedy
 * cannot preserve: passing the memoized callback directly both drops the
 * suppression call and hands React's event to a callback that took no
 * arguments. Such a wrapper is not redundant, so the receiver is deliberately
 * unconstrained — deleting `x.preventDefault()` changes behaviour whether `x`
 * is a parameter, a captured value or a nested member.
 */
function isEventSuppressionCall(stmt: TSESTree.Statement): boolean {
  if (stmt.type !== AST_NODE_TYPES.ExpressionStatement) return false;
  const expr = unwrapChainExpression<TSESTree.Expression>(stmt.expression);
  if (!expr || expr.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = unwrapChainExpression<TSESTree.Expression>(expr.callee);
  if (!callee) return false;
  // A destructured `({ preventDefault })` reaches the method without a receiver.
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return EVENT_SUPPRESSION_METHODS.has(callee.name);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return EVENT_SUPPRESSION_METHODS.has(callee.property.name);
  }
  return false;
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
      // The wrapper is named rather than hardcoded: the rule reports
      // `useLatestCallback` too, which has no dependency array, so a message
      // asserting one would describe code the reader cannot find.
      redundantWrapper:
        '{{wrapper}} is wrapping memoized callback "{{callbackName}}", adding a redundant memoization layer without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const option = context.options?.[0] ?? {};
    const knownHooks = new Set<string>(option.memoizedHookNames ?? []);
    const assumeAllUseAreMemoized = option.assumeAllUseAreMemoized === true;
    const sourceCode = context.sourceCode;

    // Every callee that memoizes the callback handed to it. `useLatestCallback`
    // belongs here because `use-latest-callback` — 'error' in the same
    // recommended config, and fixable — rewrites every `useCallback(fn, deps)`
    // into `useLatestCallback(fn)`. The wrapper it produces is the very
    // construct this rule objects to, still allocating a fresh arrow around an
    // already stable callback, so without this entry one `eslint --fix` renames
    // the violation out of view while leaving it byte-for-byte intact — and the
    // config mandating that spelling means it is also written by hand (#1726).
    const wrapperNames = new Set(['useCallback', LATEST_CALLBACK_HOOK]);

    /**
     * The wrapper's name if this callee is one, else null. Reading the name
     * rather than a boolean lets the report say which wrapper it found, since
     * the local binding need not be spelled `useLatestCallback` at all.
     */
    const wrapperNameOf = (
      callee: TSESTree.LeftHandSideExpression,
    ): string | null => {
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return wrapperNames.has(callee.name) ? callee.name : null;
      }
      // Namespaced spelling, e.g. React.useCallback
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return wrapperNames.has(callee.property.name)
          ? callee.property.name
          : null;
      }
      return null;
    };

    /**
     * Whether the binding this identifier resolves to holds a callback whose
     * memoization is visible in this very file.
     *
     * `memoizedHookNames` exists for callbacks whose stability only the consumer
     * knows about. A `const` initialized from `useCallback`, `useLatestCallback`
     * or a `useMemo` that yields a function needs no such knowledge: the
     * memoizing call sits in the same source, so wrapping its result is provably
     * redundant and the rule reports it under the default options — without
     * which the rule can report nothing at all in a config that does not set
     * `memoizedHookNames`.
     *
     * The binding is resolved through scope analysis rather than matched by
     * name, because a name set cannot tell the memoized `inner` of one component
     * from the `inner` prop of the next, and would report the prop — the wrapper
     * that is the only thing making it stable.
     */
    const isLocallyMemoizedCallback = (
      identifier: TSESTree.Identifier,
      wrapperCall: TSESTree.CallExpression,
    ): boolean => {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, identifier),
        identifier.name,
      );
      if (!variable || variable.defs.length !== 1) {
        return false;
      }
      const declarator = variable.defs[0].node;
      if (
        declarator.type !== AST_NODE_TYPES.VariableDeclarator ||
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        !declarator.init
      ) {
        return false;
      }
      // A rebindable declaration breaks the proof: the value read at the wrapper
      // need not be the one the memoizing call produced.
      const declaration = declarator.parent;
      if (
        declaration?.type !== AST_NODE_TYPES.VariableDeclaration ||
        declaration.kind !== 'const'
      ) {
        return false;
      }
      // A wrapper sitting inside the initializer it reads is self-referential,
      // and collapsing it would emit `const x = x`.
      if (
        wrapperCall.range[0] >= declarator.range[0] &&
        wrapperCall.range[1] <= declarator.range[1]
      ) {
        return false;
      }
      const init = unwrapValueExpression(declarator.init);
      if (init.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      const initName = calleeNameOf(init.callee);
      if (!initName) {
        return false;
      }
      // Every wrapper this rule reports is itself a memoizing call, so the same
      // set answers both questions: what makes a callback stable, and what
      // redundantly re-wraps one that already is.
      if (wrapperNames.has(initName)) {
        return true;
      }
      return initName === MEMO_HOOK && producesFunction(init.arguments[0]);
    };

    // Track identifiers coming from hook-like calls
    const hookReturnObjects = new Set<string>(); // variables assigned to a hook call result (object or function)
    const hookReturnProps = new Set<string>(); // properties destructured from a hook call result

    return {
      ImportDeclaration(node) {
        // The module's sole export is the hook, so its DEFAULT specifier binds
        // it under whatever local name the file chose — a shape a set of bare
        // hook names cannot see. `use-latest-callback`'s own fixer picks that
        // name with `freeImportName`, falling back to `useLatestCallback2` when
        // `useLatestCallback` is already taken in the file, so the alias is
        // authored by the sibling fixer rather than being hypothetical.
        if (
          node.source.value !== LATEST_CALLBACK_MODULE ||
          (node.importKind && node.importKind !== 'value')
        ) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
            (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.importKind !== 'type' &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === LATEST_CALLBACK_HOOK)
          ) {
            wrapperNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (!node.init) return;
        const initCall = unwrapChainExpression<TSESTree.CallExpression>(
          node.init as unknown as TSESTree.Node,
        );
        if (!initCall || initCall.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }
        const callee = unwrapChainExpression<TSESTree.LeftHandSideExpression>(
          initCall.callee as TSESTree.Node,
        );
        if (!callee) return;
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
        // Detect memoization wrappers (including React.useCallback and the
        // useLatestCallback spelling the config's own fixer produces)
        const calleeNode =
          unwrapChainExpression<TSESTree.LeftHandSideExpression>(
            node.callee as TSESTree.Node,
          );
        if (!calleeNode) return;
        const wrapper = wrapperNameOf(calleeNode);
        if (wrapper && node.arguments.length >= 1) {
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
                  hookReturnObjects.has(unwrappedArg.name) ||
                  isLocallyMemoizedCallback(unwrappedArg, node))) ||
              (unwrappedArg.type === AST_NODE_TYPES.MemberExpression &&
                unwrappedArg.object.type === AST_NODE_TYPES.Identifier &&
                hookReturnObjects.has(unwrappedArg.object.name))
            ) {
              if (unwrappedArg.type === AST_NODE_TYPES.Identifier) {
                const replaceText = unwrappedArg.name;
                context.report({
                  node,
                  messageId: 'redundantWrapper',
                  data: {
                    wrapper,
                    callbackName: sourceCode.getText(unwrappedArg),
                  },
                  fix: (fixer) => fixer.replaceText(node, replaceText),
                });
              } else {
                // Member function — report only, no fix to avoid breaking `this`.
                context.report({
                  node,
                  messageId: 'redundantWrapper',
                  data: {
                    wrapper,
                    callbackName: sourceCode.getText(unwrappedArg),
                  },
                });
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
                    (hookReturnProps.has(callee.name) ||
                      isLocallyMemoizedCallback(callee, node)))
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
                        data: {
                          wrapper,
                          callbackName: sourceCode.getText(callee),
                        },
                        fix: (fixer) => fixer.replaceText(node, replaceText),
                      });
                    } else {
                      // Member function — report only, no fix to avoid breaking `this`.
                      context.report({
                        node,
                        messageId: 'redundantWrapper',
                        data: {
                          wrapper,
                          callbackName: sourceCode.getText(callee),
                        },
                      });
                    }
                  }
                }
              }
              return;
            }

            // Handle block body: () => { return memoizedFn(); }
            if (fn.body && fn.body.type === AST_NODE_TYPES.BlockStatement) {
              const stmts = fn.body.body.filter(Boolean);
              // An event-suppression call disqualifies the wrapper outright: no
              // spelling of "pass the callback directly" keeps it, so reporting
              // here would prescribe a remedy that does not exist.
              if (stmts.some(isEventSuppressionCall)) return;
              // Exactly one statement. A wrapper that sequences a second call is
              // doing work the delegate alone does not, so collapsing it would
              // drop that call — only the branch's own statement is ever read,
              // so a wider count silently discards whatever it did not look at.
              if (stmts.length === 1) {
                const first = stmts[0];
                if (
                  first.type === AST_NODE_TYPES.ReturnStatement ||
                  first.type === AST_NODE_TYPES.ExpressionStatement
                ) {
                  const expr =
                    first.type === AST_NODE_TYPES.ReturnStatement
                      ? first.argument
                      : first.expression;
                  if (expr && expr.type === AST_NODE_TYPES.CallExpression) {
                    const callee = unwrapChainExpression<TSESTree.Expression>(
                      expr.callee,
                    );
                    const isHookProp =
                      callee &&
                      callee.type === AST_NODE_TYPES.Identifier &&
                      (hookReturnProps.has(callee.name) ||
                        isLocallyMemoizedCallback(callee, node));
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
                            data: {
                              wrapper,
                              callbackName: sourceCode.getText(callee),
                            },
                            fix: (fixer) =>
                              fixer.replaceText(node, replaceText),
                          });
                        } else {
                          // Member function — report only, no fix to avoid breaking `this`.
                          context.report({
                            node,
                            messageId: 'redundantWrapper',
                            data: {
                              wrapper,
                              callbackName: sourceCode.getText(callee),
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
      },
    };
  },
});

export default noRedundantUseCallbackWrapper;
