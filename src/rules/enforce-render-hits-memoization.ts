import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'requireMemoizedTransformBefore'
  | 'requireMemoizedRender'
  | 'requireMemoizedRenderHits'
  | 'noDirectComponentInRender';

const LATEST_CALLBACK_MODULE = 'use-latest-callback';
const LATEST_CALLBACK_HOOK = 'useLatestCallback';

function isFunctionNode(
  node: TSESTree.Node | null | undefined,
): node is
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration {
  if (!node) return false;
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

/**
 * Nearest enclosing function of a node, or `null` when the node sits at module
 * scope. Class and object methods are reached through their `FunctionExpression`
 * value, so no separate `MethodDefinition` case is needed.
 *
 * The walk starts at the parent, so a `FunctionDeclaration` passed in as the
 * declaration site reports the function that CONTAINS it rather than itself.
 */
function getEnclosingFunction(
  node: TSESTree.Node,
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration
  | null {
  let current: TSESTree.Node | undefined | null = node.parent;
  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }
    if (current.type === AST_NODE_TYPES.Program) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Declaration forms whose binding is created once for the program's lifetime.
 *
 * `let` and `var` are deliberately excluded: a reassignable binding can hand
 * `useRenderHits` a different function on a later render, which is precisely
 * the instability this rule exists to catch.
 */
function isStableDeclaration(def: TSESLint.Scope.Definition): boolean {
  switch (def.type) {
    case TSESLint.Scope.DefinitionType.FunctionName:
      return true;
    case TSESLint.Scope.DefinitionType.ImportBinding:
      // A type-only import binds no value, so its local name names nothing
      // callable — the same reason the memoization-callee set rejects one.
      return (
        def.parent.importKind !== 'type' &&
        (def.node.type !== AST_NODE_TYPES.ImportSpecifier ||
          def.node.importKind !== 'type')
      );
    case TSESLint.Scope.DefinitionType.Variable:
      return def.parent.kind === 'const';
    default:
      return false;
  }
}

/**
 * The hazard is identity churn measured against the CONSUMER, not absolute
 * scope depth: `useRenderHits` only ever sees a new identity when the function
 * that CALLS it re-runs and rebuilds the binding on the way. That holds exactly
 * when the declaration and the call share a nearest enclosing function.
 *
 * When the declaration sits in a strictly outer function — a component factory,
 * an HOC, a `describe` callback consumed from a nested `it` — the binding is
 * created once per outer call and the calling function is created in that same
 * call, so every run of the consumer sees the identical reference. The message's
 * remedy is also unavailable there: `useCallback` cannot legally be called in a
 * function that is neither a component nor a hook, and a helper closing over an
 * outer parameter cannot be hoisted to module scope. Module scope is the
 * degenerate case: the declaration has no enclosing function at all.
 *
 * Scope resolution guarantees the declaration's scope is on the consumer's scope
 * chain, so "not the same function" and "strictly encloses" coincide here.
 *
 * A custom hook is deliberately NOT special-cased. A hook body does re-run per
 * render, and when it also holds the `useRenderHits` call the two functions
 * coincide, so the same predicate reports it.
 */
function isStableForConsumer(
  defNode: TSESTree.Node,
  consumerFunction: TSESTree.Node | null,
): boolean {
  const definitionFunction = getEnclosingFunction(defNode);
  return definitionFunction === null || definitionFunction !== consumerFunction;
}

export const enforceRenderHitsMemoization = createRule<[], MessageIds>({
  name: 'enforce-render-hits-memoization',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce proper memoization and usage of useRenderHits and renderHits',
      recommended: 'error',
    },
    schema: [],
    messages: {
      requireMemoizedTransformBefore:
        'transformBefore is recreated on every render, so useRenderHits sees a new transform identity each pass and re-derives (and re-renders) the whole hit list even when the hits did not change. Memoize it with useCallback, useMemo, or useLatestCallback so the reference stays stable across renders.',
      requireMemoizedRender:
        'render is recreated on every render, so useRenderHits sees a new render identity each pass and re-renders every hit even when the hits did not change. Memoize it with useCallback, useMemo, or useLatestCallback so the reference stays stable across renders.',
      requireMemoizedRenderHits:
        'renderHits builds a fresh element for every hit, so calling it outside a memoization boundary re-creates the entire list on each render. Wrap the call in useCallback, useMemo, or useLatestCallback so the elements are rebuilt only when the hits they came from change.',
      noDirectComponentInRender:
        'Do not pass React components directly to render prop, use a memoized arrow function instead',
    },
  },
  defaultOptions: [],
  create(context) {
    // Every callee this rule accepts as a memoization boundary. `useCallback`
    // and `useMemo` are seeded bare because the rule never resolves React's
    // import either; local names bound from `use-latest-callback` are added as
    // its imports are visited.
    //
    // `useLatestCallback` belongs in the same set rather than a separate one:
    // nothing here inspects a dependency array, so the hook taking none (it
    // keeps the latest callback behind a ref that is stable for the component's
    // whole life) costs the rule no precision. It has to be here because
    // `use-latest-callback` — 'error' in the same recommended config, and
    // fixable — rewrites every `useCallback` into it, and ESLint re-lints until
    // the output settles, so one `eslint --fix` run does both steps. Without
    // this entry correctly memoized code goes in and a demand to memoize it
    // comes out, and the demand names the very hook the sibling fixer just
    // removed, so following it loops forever (issue #1585).
    const memoizationCallees = new Set([
      'useCallback',
      'useMemo',
      LATEST_CALLBACK_HOOK,
    ]);

    const isMemoizationCallee = (node: TSESTree.Node): boolean =>
      node.type === AST_NODE_TYPES.Identifier &&
      memoizationCallees.has(node.name);

    const isReactComponent = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;
      return /^[A-Z]/.test(node.name);
    };

    const isMemoizedCall = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.CallExpression) return false;
      if (!node.callee) return false;
      return isMemoizationCallee(node.callee);
    };

    const isWithinMemoizationCall = (node: TSESTree.Node): boolean => {
      let current: TSESTree.Node | undefined = node;
      while (current?.parent) {
        if (
          current.parent.type === AST_NODE_TYPES.CallExpression &&
          isMemoizationCallee(current.parent.callee)
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    };

    const isMemoizedVariable = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;

      // The whole scope chain has to be searched rather than the current
      // scope's own variable list: a useRenderHits call sitting inside a nested
      // block or a nested component reaches its memoized declaration through an
      // enclosing scope, and reading one scope's `variables` would miss it and
      // demand a useCallback around a value that already has one.
      const variable = ASTUtils.findVariable(context.getScope(), node);
      if (!variable) return false;

      // Check if the variable is initialized with a memoized call
      for (const def of variable.defs) {
        if (!def || !def.node) continue;

        if (
          def.node.type === AST_NODE_TYPES.VariableDeclarator &&
          def.node.init
        ) {
          if (isMemoizedCall(def.node.init)) {
            return true;
          }
        }
      }

      return false;
    };

    /**
     * A prop pointing at a declaration that lives outside the body of the
     * function calling `useRenderHits`.
     *
     * Such a binding is created once per run of the enclosing scope, and the
     * calling function is created in that same run, so its identity is fixed for
     * the whole life of that closure — strictly more stable than anything a hook
     * can hand back. Demanding a `useCallback` wrapper around it asks for work
     * that can only make the reference less stable, never more, and in a factory
     * the wrapper is not even legal (rules-of-hooks) while a helper closing over
     * an outer parameter cannot be hoisted to module scope either.
     *
     * Module and global scope are the degenerate case of "outside", and both
     * count. Under `sourceType: 'script'` — the parser default, and what a
     * consumer's config may well leave in place — a top-level declaration binds
     * to the *global* scope and no module scope exists at all (issue #1578);
     * measuring against the enclosing function rather than the scope type keeps
     * the carve-out for consumers who never opted into module parsing.
     *
     * The module-scope shape is not hypothetical:
     * `no-empty-dependency-use-callbacks` — 'error' in the same recommended
     * config, and fixable — hoists a dependency-free callback to module scope
     * and drops the hook, so one `eslint --fix` run rewrites memoized code into
     * exactly this form. Without the carve-out the config demands the very hook
     * its own fixer just removed (issue #1586).
     */
    const isStableOuterScopeBinding = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.Identifier) return false;

      // The scope chain has to be walked rather than a single scope's variable
      // list read: the useRenderHits call sits inside the component, so an
      // outer-scope declaration is never among the current scope's own
      // variables.
      const variable = ASTUtils.findVariable(context.getScope(), node);
      if (!variable) return false;

      // The prop value sits lexically inside the useRenderHits call, so its
      // nearest enclosing function is the consuming one.
      const consumerFunction = getEnclosingFunction(node);

      return variable.defs.some(
        (def) =>
          isStableDeclaration(def) &&
          isStableForConsumer(def.node, consumerFunction),
      );
    };

    const isInsideMemoizedCall = (node: TSESTree.Node): boolean => {
      // Handle the case when node is already a memoized call
      if (isMemoizedCall(node)) return true;

      // Check if the node is a reference to a memoized variable
      if (isMemoizedVariable(node)) return true;

      // A declaration outside every component body needs no memoization: it is
      // already as stable as a reference can be.
      if (isStableOuterScopeBinding(node)) return true;

      // Check if the node is inside a memoization hook call
      if (isWithinMemoizationCall(node)) return true;

      // Check if the node is a reference to a memoized value
      const scope = context.getScope();
      // Make sure node is an Identifier before accessing name property
      if (node.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      const variable = scope.variables.find((v) => v.name === node.name);

      if (!variable) {
        return false;
      }

      // Check if any definition is a memoized value
      for (const def of variable.defs) {
        const parent = def.node.parent;
        if (
          parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.init?.type === AST_NODE_TYPES.CallExpression &&
          isMemoizationCallee(parent.init.callee)
        ) {
          return true;
        }
      }

      // Check if any reference is inside a memoized call
      for (const ref of variable.references) {
        if (isWithinMemoizationCall(ref.identifier)) return true;
      }

      // Check if the node is a property of an object that is memoized
      const parent = node.parent;
      if (
        parent?.type === AST_NODE_TYPES.Property &&
        parent.parent?.type === AST_NODE_TYPES.ObjectExpression
      ) {
        if (isWithinMemoizationCall(parent.parent)) return true;
      }

      return false;
    };

    let useRenderHitsName = 'useRenderHits';
    let renderHitsName = 'renderHits';

    return {
      ImportDeclaration(node) {
        // The module's sole export is the hook, so its DEFAULT specifier binds
        // it under whatever local name the file chose — a shape a set of bare
        // hook names cannot see. `use-latest-callback`'s own fixer picks that
        // name, falling back to `useLatestCallback2` when `useLatestCallback`
        // is already taken in the file, so the alias is not hypothetical.
        if (
          node.source.value === LATEST_CALLBACK_MODULE &&
          (!node.importKind || node.importKind === 'value')
        ) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                specifier.importKind !== 'type' &&
                specifier.imported.type === AST_NODE_TYPES.Identifier &&
                specifier.imported.name === LATEST_CALLBACK_HOOK)
            ) {
              memoizationCallees.add(specifier.local.name);
            }
          }
        }

        if (node.source.value.endsWith('useRenderHits')) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'useRenderHits'
            ) {
              useRenderHitsName = specifier.local.name;
              break;
            }
          }
        } else if (node.source.value.endsWith('renderHits')) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.name === 'renderHits'
            ) {
              renderHitsName = specifier.local.name;
              break;
            }
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === useRenderHitsName
        ) {
          if (node.arguments.length === 0) return;

          const options = node.arguments[0];
          if (options.type !== AST_NODE_TYPES.ObjectExpression) return;

          // Shorthand props are checked exactly like written-out ones. `{ render }`
          // and `render: render` describe the same value, and the config's own
          // fixable `object-shorthand: ['error', 'always']` rewrites the second
          // into the first, so exempting the shorthand form would let a single
          // `eslint --fix` erase every report this rule makes about a prop whose
          // variable happens to share the API's name — the shape idiomatic code
          // reaches for first (issue #1588).
          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            if (prop.key.name === 'transformBefore') {
              if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedTransformBefore',
                });
              }
            } else if (prop.key.name === 'render') {
              if (isReactComponent(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'noDirectComponentInRender',
                });
              } else if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedRender',
                });
              }
            }
          }
        }

        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === renderHitsName
        ) {
          if (isWithinMemoizationCall(node)) return;

          context.report({
            node,
            messageId: 'requireMemoizedRenderHits',
          });
        }
      },
    };
  },
});
