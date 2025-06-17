import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'staleStateAcrossAwait';

interface SetterCall {
  name: string;
  node: TSESTree.CallExpression;
  position: number;
}

interface AsyncBoundary {
  node: TSESTree.Node;
  position: number;
  type: 'await' | 'then' | 'yield';
}

export const noStaleStateAcrossAwait = createRule<[], MessageIds>({
  name: 'no-stale-state-across-await',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent stale intermediate state across async boundaries',
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
    // Track valid setters at the component level
    const validSetters = new Set<string>();

    // Track state setters and async boundaries per function scope
    const functionScopes = new Map<TSESTree.Node, {
      setterCalls: SetterCall[];
      asyncBoundaries: AsyncBoundary[];
    }>();

    function getCurrentFunctionNode(): TSESTree.Node | null {
      const ancestors = context.getAncestors();

      // Look for the nearest function-like ancestor
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (
          ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
          ancestor.type === AST_NODE_TYPES.FunctionExpression ||
          ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return ancestor;
        }
      }

      return null;
    }

    function initializeFunctionScope(node: TSESTree.Node) {
      if (!functionScopes.has(node)) {
        functionScopes.set(node, {
          setterCalls: [],
          asyncBoundaries: [],
        });
      }
    }

    function isUseStateCall(node: TSESTree.CallExpression): boolean {
      return (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useState'
      );
    }

    function isStateSetterCall(node: TSESTree.CallExpression): string | null {
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        const name = node.callee.name;
        // Check if it follows the useState setter pattern (starts with 'set')
        if (name.startsWith('set') && name.length > 3) {
          return name;
        }
      }
      return null;
    }

    function isThenCall(node: TSESTree.CallExpression): boolean {
      return (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'then'
      );
    }

    function checkForStaleState(functionNode: TSESTree.Node) {
      const scope = functionScopes.get(functionNode);
      if (!scope || scope.asyncBoundaries.length === 0) {
        return;
      }

      // Group setter calls by setter name
      const setterGroups = new Map<string, SetterCall[]>();
      for (const call of scope.setterCalls) {
        if (!setterGroups.has(call.name)) {
          setterGroups.set(call.name, []);
        }
        setterGroups.get(call.name)!.push(call);
      }

      // Check each setter for violations
      for (const [setterName, calls] of setterGroups) {
        // Only check setters that are actually from useState
        if (!validSetters.has(setterName)) {
          continue;
        }

        let hasCallBeforeAsync = false;
        let hasCallAfterAsync = false;
        const violatingCalls: SetterCall[] = [];

        for (const call of calls) {
          const isBeforeAnyAsync = scope.asyncBoundaries.some(
            boundary => call.position < boundary.position
          );
          const isAfterAnyAsync = scope.asyncBoundaries.some(
            boundary => call.position > boundary.position
          );

          if (isBeforeAnyAsync) {
            hasCallBeforeAsync = true;
          }
          if (isAfterAnyAsync) {
            hasCallAfterAsync = true;
            violatingCalls.push(call);
          }
        }

        // Report violations for calls that happen after async boundaries
        // when there are also calls before async boundaries
        if (hasCallBeforeAsync && hasCallAfterAsync) {
          for (const violatingCall of violatingCalls) {
            context.report({
              node: violatingCall.node,
              messageId: 'staleStateAcrossAwait',
              data: {
                setterName,
              },
            });
          }
        }
      }
    }

    return {
      // Track function entries
      FunctionDeclaration(node) {
        initializeFunctionScope(node);
      },
      FunctionExpression(node) {
        initializeFunctionScope(node);
      },
      ArrowFunctionExpression(node) {
        initializeFunctionScope(node);
      },

      // Track useState declarations to identify valid setters
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          isUseStateCall(node.init)
        ) {
          // Extract setter name from destructuring
          const arrayPattern = node.id;
          if (arrayPattern.elements.length >= 2 && arrayPattern.elements[1]) {
            const setterElement = arrayPattern.elements[1];
            if (setterElement.type === AST_NODE_TYPES.Identifier) {
              validSetters.add(setterElement.name);
            }
          }
        }
      },

      // Track state setter calls
      CallExpression(node) {
        const functionNode = getCurrentFunctionNode();
        if (!functionNode) return;

        initializeFunctionScope(functionNode);
        const scope = functionScopes.get(functionNode)!;

        // Check for state setter calls
        const setterName = isStateSetterCall(node);
        if (setterName) {
          // Check if this setter call is inside a .then() callback
          const ancestors = context.getAncestors();
          let isInThenCallback = false;
          let thenCallPosition = -1;

          // Look for a .then() call in the ancestors
          for (let i = ancestors.length - 1; i >= 0; i--) {
            const ancestor = ancestors[i];
            if (ancestor.type === AST_NODE_TYPES.CallExpression && isThenCall(ancestor)) {
              isInThenCallback = true;
              thenCallPosition = ancestor.range[0];
              break;
            }
            // Stop if we hit another function boundary
            if (
              ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
              ancestor.type === AST_NODE_TYPES.FunctionExpression ||
              ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
            ) {
              if (ancestor === functionNode) {
                continue; // This is the current function, keep looking
              } else {
                break; // Hit a different function, stop looking
              }
            }
          }

          scope.setterCalls.push({
            name: setterName,
            node,
            position: isInThenCallback ? thenCallPosition + 1 : node.range[0], // Use .then() position + 1 for calls inside .then()
          });
        }

        // Check for .then() calls (async boundary)
        if (isThenCall(node)) {
          scope.asyncBoundaries.push({
            node,
            position: node.range[0],
            type: 'then',
          });
        }
      },

      // Track await expressions (async boundary)
      AwaitExpression(node) {
        const functionNode = getCurrentFunctionNode();
        if (functionNode) {
          initializeFunctionScope(functionNode);
          const scope = functionScopes.get(functionNode)!;
          scope.asyncBoundaries.push({
            node,
            position: node.range[0],
            type: 'await',
          });
        }
      },

      // Track yield expressions (async boundary)
      YieldExpression(node) {
        const functionNode = getCurrentFunctionNode();
        if (functionNode) {
          initializeFunctionScope(functionNode);
          const scope = functionScopes.get(functionNode)!;
          scope.asyncBoundaries.push({
            node,
            position: node.range[0],
            type: 'yield',
          });
        }
      },

      // Check for violations when exiting functions
      'FunctionDeclaration:exit'(node) {
        checkForStaleState(node);
      },
      'FunctionExpression:exit'(node) {
        checkForStaleState(node);
      },
      'ArrowFunctionExpression:exit'(node) {
        checkForStaleState(node);
      },
    };
  },
});
