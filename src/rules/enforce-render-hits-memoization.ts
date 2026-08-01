import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'requireMemoizedTransformBefore'
  | 'requireMemoizedRender'
  | 'requireMemoizedRenderHits'
  | 'noDirectComponentInRender';

const LATEST_CALLBACK_MODULE = 'use-latest-callback';
const LATEST_CALLBACK_HOOK = 'useLatestCallback';

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

      // Get the variable declaration for this identifier
      const variable = context
        .getScope()
        .variables.find((v) => v.name === (node as TSESTree.Identifier).name);
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

    const isInsideMemoizedCall = (node: TSESTree.Node): boolean => {
      // Handle the case when node is already a memoized call
      if (isMemoizedCall(node)) return true;

      // Check if the node is a reference to a memoized variable
      if (isMemoizedVariable(node)) return true;

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

          // Variable to track if we need to check properties (check both by default)
          const checkProps = {
            transformBefore: true,
            render: true,
          };

          // First pass: Check if transformBefore or render properties exist as shorthand
          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            // If it's shorthand property syntax like { transformBefore } and already a memoized variable
            if (
              prop.key.name === 'transformBefore' &&
              prop.shorthand &&
              prop.key.type === AST_NODE_TYPES.Identifier
            ) {
              checkProps.transformBefore = !isMemoizedVariable(prop.key);
            } else if (
              prop.key.name === 'render' &&
              prop.shorthand &&
              prop.key.type === AST_NODE_TYPES.Identifier
            ) {
              checkProps.render = !isMemoizedVariable(prop.key);
            }
          }

          // Second pass: Check non-shorthand properties
          for (const prop of options.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;

            // Skip shorthand properties that we already checked
            if (prop.shorthand) continue;

            if (
              prop.key.name === 'transformBefore' &&
              checkProps.transformBefore
            ) {
              // Skip if the value is already a memoized call
              if (isMemoizedCall(prop.value)) continue;

              if (!isInsideMemoizedCall(prop.value)) {
                context.report({
                  node: prop.value,
                  messageId: 'requireMemoizedTransformBefore',
                });
              }
            } else if (prop.key.name === 'render' && checkProps.render) {
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
