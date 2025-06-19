import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'staleStateAcrossAwait';

export const noStaleStateAcrossAwait = createRule<[], MessageIds>({
  name: 'no-stale-state-across-await',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent stale intermediate state by disallowing useState setter calls both before and after async boundaries (await, .then(), yield) within the same function',
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
    // Track useState setters by mapping variable names to setter names
    const useStateSetters = new Set<string>();

    return {
      // Track useState destructuring to map setter names
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'useState'
        ) {
          const arrayPattern = node.id;
          if (
            arrayPattern.elements.length >= 2 &&
            arrayPattern.elements[1]?.type === AST_NODE_TYPES.Identifier
          ) {
            const setterName = arrayPattern.elements[1].name;
            useStateSetters.add(setterName);
          }
        }
      },

      // Check functions for violations
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
        node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
      ) {
        // Collect all setter calls and async boundaries in this function
        const setterCalls: { name: string; position: number }[] = [];
        const asyncBoundaries: { position: number; type: string }[] = [];

        // Walk through the function body to find setter calls and async boundaries
        function walkNode(n: TSESTree.Node, skipNestedFunctions = true) {
          if (n.type === AST_NODE_TYPES.CallExpression) {
            // Check for setter calls
            if (
              n.callee.type === AST_NODE_TYPES.Identifier &&
              useStateSetters.has(n.callee.name)
            ) {
              setterCalls.push({
                name: n.callee.name,
                position: n.range[0],
              });
            }

            // Check for .then() calls
            if (
              n.callee.type === AST_NODE_TYPES.MemberExpression &&
              n.callee.property.type === AST_NODE_TYPES.Identifier &&
              n.callee.property.name === 'then'
            ) {
              asyncBoundaries.push({
                position: n.range[0],
                type: 'then',
              });

              // Walk into .then() callback arguments to find setter calls
              if (n.arguments && n.arguments.length > 0) {
                for (const arg of n.arguments) {
                  if (
                    arg.type === AST_NODE_TYPES.FunctionExpression ||
                    arg.type === AST_NODE_TYPES.ArrowFunctionExpression
                  ) {
                    // Walk into the callback function body
                    walkNode(arg, false);
                  }
                }
              }
            }
          }

          if (n.type === AST_NODE_TYPES.AwaitExpression) {
            asyncBoundaries.push({
              position: n.range[0],
              type: 'await',
            });
          }

          if (n.type === AST_NODE_TYPES.YieldExpression) {
            asyncBoundaries.push({
              position: n.range[0],
              type: 'yield',
            });
          }

          // Recursively walk child nodes
          for (const key in n) {
            if (key === 'parent') continue;
            const value = (n as any)[key];
            if (Array.isArray(value)) {
              for (const item of value) {
                if (item && typeof item === 'object' && item.type) {
                  // Skip nested functions unless we're explicitly walking into callbacks
                  if (
                    skipNestedFunctions &&
                    (item.type === AST_NODE_TYPES.FunctionDeclaration ||
                     item.type === AST_NODE_TYPES.FunctionExpression ||
                     item.type === AST_NODE_TYPES.ArrowFunctionExpression)
                  ) {
                    continue;
                  }
                  walkNode(item, skipNestedFunctions);
                }
              }
            } else if (value && typeof value === 'object' && value.type) {
              // Skip nested functions unless we're explicitly walking into callbacks
              if (
                skipNestedFunctions &&
                (value.type === AST_NODE_TYPES.FunctionDeclaration ||
                 value.type === AST_NODE_TYPES.FunctionExpression ||
                 value.type === AST_NODE_TYPES.ArrowFunctionExpression)
              ) {
                return;
              }
              walkNode(value, skipNestedFunctions);
            }
          }
        }

        // Walk the function body
        if (node.body) {
          walkNode(node.body);
        }

        // Check for violations
        const setterCallsByName = new Map<string, { name: string; position: number }[]>();
        for (const call of setterCalls) {
          if (!setterCallsByName.has(call.name)) {
            setterCallsByName.set(call.name, []);
          }
          setterCallsByName.get(call.name)!.push(call);
        }

        // Check each setter for violations
        for (const [setterName, calls] of setterCallsByName) {
          if (calls.length < 2) continue; // Need at least 2 calls to have a violation

          // Check if there are calls both before and after any async boundary
          for (const boundary of asyncBoundaries) {
            const callsBefore = calls.filter(call => call.position < boundary.position);
            const callsAfter = calls.filter(call => call.position > boundary.position);

            if (callsBefore.length > 0 && callsAfter.length > 0) {
              // Report violation on the function node
              context.report({
                node,
                messageId: 'staleStateAcrossAwait',
                data: {
                  setterName,
                },
              });
              break; // Only report once per setter
            }
          }
        }
      },
    };
  },
});
