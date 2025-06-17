import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'staleStateAcrossAwait';

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
        'Avoid setting the same state before and after async boundaries. Consider atomic updates or use explicit loading sentinels with eslint-disable-next-line.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track all useState setters globally
    const allSetterNames = new Set<string>();

    // Track data for each function
    const functionData = new Map<
      TSESTree.Node,
      {
        setterCalls: Array<{
          name: string;
          position: number;
          node: TSESTree.CallExpression;
          inConditional: boolean;
        }>;
        asyncBoundaries: Array<{ position: number; type: string }>;
      }
    >();

    function getCurrentFunction(node: TSESTree.Node): TSESTree.Node | null {
      let current = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function isInConditional(node: TSESTree.Node): boolean {
      let current = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.IfStatement ||
          current.type === AST_NODE_TYPES.ConditionalExpression ||
          current.type === AST_NODE_TYPES.LogicalExpression ||
          current.type === AST_NODE_TYPES.SwitchStatement
        ) {
          return true;
        }
        // Stop at function boundaries
        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          break;
        }
        current = current.parent;
      }
      return false;
    }

    function initFunctionData(functionNode: TSESTree.Node) {
      if (!functionData.has(functionNode)) {
        functionData.set(functionNode, {
          setterCalls: [],
          asyncBoundaries: [],
        });
      }
    }

    function analyzeFunction(functionNode: TSESTree.Node) {
      const data = functionData.get(functionNode);
      if (
        !data ||
        data.setterCalls.length === 0 ||
        data.asyncBoundaries.length === 0
      ) {
        return;
      }

      // Group setter calls by name
      const setterCallsByName = new Map<string, typeof data.setterCalls>();
      data.setterCalls.forEach((call) => {
        if (!setterCallsByName.has(call.name)) {
          setterCallsByName.set(call.name, []);
        }
        setterCallsByName.get(call.name)!.push(call);
      });

      // Check for violations
      setterCallsByName.forEach((calls) => {
        if (calls.length < 2) return;

        calls.sort((a, b) => a.position - b.position);

        for (let i = 0; i < calls.length - 1; i++) {
          const beforeCall = calls[i];
          const afterCall = calls[i + 1];

          // Skip if both calls are conditional (they might not both execute)
          if (beforeCall.inConditional && afterCall.inConditional) {
            continue;
          }

          const hasAsyncBoundaryBetween = data.asyncBoundaries.some(boundary =>
            boundary.position > beforeCall.position &&
            boundary.position < afterCall.position
          );

          if (hasAsyncBoundaryBetween) {
            context.report({
              node: beforeCall.node,
              messageId: 'staleStateAcrossAwait',
            });
            context.report({
              node: afterCall.node,
              messageId: 'staleStateAcrossAwait',
            });
          }
        }
      });
    }

    return {
      FunctionDeclaration(node) {
        initFunctionData(node);
      },
      FunctionExpression(node) {
        initFunctionData(node);
      },
      ArrowFunctionExpression(node) {
        initFunctionData(node);
      },
      'FunctionDeclaration:exit': analyzeFunction,
      'FunctionExpression:exit': analyzeFunction,
      'ArrowFunctionExpression:exit': analyzeFunction,

      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.ArrayPattern &&
            node.init?.type === AST_NODE_TYPES.CallExpression &&
            node.init.callee.type === AST_NODE_TYPES.Identifier &&
            node.init.callee.name === 'useState') {

          // Get the setter (second element in destructuring)
          if (node.id.elements.length >= 2 &&
              node.id.elements[1] &&
              node.id.elements[1].type === AST_NODE_TYPES.Identifier) {
            allSetterNames.add(node.id.elements[1].name);
          }
        }
      },

      CallExpression(node) {
        const functionNode = getCurrentFunction(node);
        if (!functionNode) return;

        const data = functionData.get(functionNode);
        if (!data) return;

        // Check if this is a setter call
        if (node.callee.type === AST_NODE_TYPES.Identifier &&
            allSetterNames.has(node.callee.name)) {
          data.setterCalls.push({
            name: node.callee.name,
            position: node.range[0],
            node,
            inConditional: isInConditional(node),
          });
        }

        // Check if this is a .then() call
        if (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.property.type === AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'then') {
          data.asyncBoundaries.push({
            position: node.range[0],
            type: 'then',
          });
        }
      },

      AwaitExpression(node) {
        const functionNode = getCurrentFunction(node);
        if (!functionNode) return;

        const data = functionData.get(functionNode);
        if (!data) return;

        data.asyncBoundaries.push({
          position: node.range[0],
          type: 'await',
        });
      },

      YieldExpression(node) {
        const functionNode = getCurrentFunction(node);
        if (!functionNode) return;

        const data = functionData.get(functionNode);
        if (!data) return;

        data.asyncBoundaries.push({
          position: node.range[0],
          type: 'yield',
        });
      },
    };
  },
});
