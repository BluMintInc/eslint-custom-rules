import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'staleStateAcrossAwait';

interface FunctionScope {
  stateSetters: Set<string>;
  setterCalls: Map<string, TSESTree.CallExpression[]>;
  asyncBoundaries: TSESTree.Node[];
}

export const noStaleStateAcrossAwait = createRule<[], MessageIds>({
  name: 'no-stale-state-across-await',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent stale intermediate state by disallowing useState updates both before and after async boundaries',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      staleStateAcrossAwait:
        'State setter "{{setterName}}" is called both before and after an async boundary. This can cause stale intermediate state. Consider using atomic updates or explicit loading sentinels with eslint-disable-next-line.',
    },
  },
  defaultOptions: [],
  create(context) {
    const functionScopes: FunctionScope[] = [];
    const allStateSetters: Set<string> = new Set(); // Track all state setters globally

    function getCurrentScope(): FunctionScope | undefined {
      return functionScopes[functionScopes.length - 1];
    }




    return {
      // Track function entries
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'() {
        functionScopes.push({
          stateSetters: new Set(),
          setterCalls: new Map(),
          asyncBoundaries: [],
        });
      },

      // Track function exits and check for violations
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression:exit'() {
        const scope = getCurrentScope();
        if (!scope) return;

        // Check for violations in this scope
        for (const [setterName, calls] of scope.setterCalls) {
          if (calls.length < 2 || scope.asyncBoundaries.length === 0) {
            continue;
          }

          const callsBefore: TSESTree.CallExpression[] = [];
          const callsAfter: TSESTree.CallExpression[] = [];

          for (const call of calls) {
            const isAfterAnyBoundary = scope.asyncBoundaries.some(
              boundary => call.range[0] > boundary.range[1]
            );

            if (isAfterAnyBoundary) {
              callsAfter.push(call);
            } else {
              callsBefore.push(call);
            }
          }

          // Report violation if there are calls both before and after async boundaries
          if (callsBefore.length > 0 && callsAfter.length > 0) {
            context.report({
              node: callsAfter[0],
              messageId: 'staleStateAcrossAwait',
              data: {
                setterName,
              },
            });
          }
        }

        functionScopes.pop();
      },

      // Track useState declarations
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'useState' &&
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.id.elements.length >= 2 &&
          node.id.elements[1] &&
          node.id.elements[1].type === AST_NODE_TYPES.Identifier
        ) {
          const setterName = node.id.elements[1].name;
          allStateSetters.add(setterName);

          // Also add to current scope if it exists
          const scope = getCurrentScope();
          if (scope) {
            scope.stateSetters.add(setterName);
            scope.setterCalls.set(setterName, []);
          }
        }
      },

      // Track async boundaries
      'AwaitExpression, YieldExpression'(node: TSESTree.AwaitExpression | TSESTree.YieldExpression) {
        const scope = getCurrentScope();
        if (!scope) return;
        scope.asyncBoundaries.push(node);
      },

      // Track calls
      CallExpression(node) {
        const scope = getCurrentScope();
        if (!scope) return;

        // Check if this is a .then() call (async boundary)
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'then'
        ) {
          scope.asyncBoundaries.push(node);
          return;
        }

        // Check if this is a state setter call (check against all known setters)
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          allStateSetters.has(node.callee.name)
        ) {
          const setterName = node.callee.name;

          // Initialize the setter in current scope if not already present
          if (!scope.setterCalls.has(setterName)) {
            scope.setterCalls.set(setterName, []);
          }

          const calls = scope.setterCalls.get(setterName) || [];
          calls.push(node);
          scope.setterCalls.set(setterName, calls);
        }
      },
    };
  },
});
