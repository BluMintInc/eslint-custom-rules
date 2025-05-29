import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'staleStateAcrossAwait';

/**
 * Rule to prevent Stale Intermediate State (SIS) in React components
 *
 * This rule detects when a component sets a useState value before an async boundary
 * (await, .then(), yield) and sets that same value again after the boundary,
 * causing the UI to render with a transient, potentially wrong value.
 */
export const noStaleStateAcrossAwait = createRule<[], MessageIds>({
  name: 'no-stale-state-across-await',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent setting the same state value before and after an async boundary',
      recommended: 'error',
    },
    fixable: undefined, // No autofix as it requires human judgment
    schema: [], // No options
    messages: {
      staleStateAcrossAwait: 'Avoid setting the same state value before and after an async boundary. This can cause stale intermediate state. Either use a single update after the await or explicitly disable this rule with a comment when using a loading sentinel.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Map to track state setters by function scope
    const stateSettersByFunction = new Map<string, Set<string>>();

    // Map to track await expressions by function scope
    const awaitExpressionsByFunction = new Map<string, TSESTree.AwaitExpression[]>();

    // Map to track state updates before await by function scope and setter name
    const stateUpdatesBeforeAwait = new Map<string, Map<string, TSESTree.CallExpression>>();

    // Map to track state updates after await by function scope and setter name
    const stateUpdatesAfterAwait = new Map<string, Map<string, TSESTree.CallExpression>>();

    // Current function scope stack
    const functionScopeStack: string[] = [];

    // Helper to get current function scope ID
    const getCurrentFunctionScopeId = (): string => {
      return functionScopeStack.length > 0 ? functionScopeStack[functionScopeStack.length - 1] : 'global';
    };

    // We don't need this helper function anymore
    // const isInAsyncFunction = (): boolean => {
    //   // Implementation removed
    // };

    // Helper to check if a node has a disable comment
    const hasDisableComment = (node: TSESTree.Node): boolean => {
      const sourceCode = context.getSourceCode();
      const comments = sourceCode.getCommentsBefore(node);

      return comments.some(comment => {
        return (
          comment.type === 'Line' &&
          comment.value.trim().includes('eslint-disable-next-line') &&
          (
            comment.value.includes('@blumintinc/blumint/no-stale-state-across-await') ||
            comment.value.includes('react/no-stale-state-across-await')
          )
        );
      });
    };

    return {
      // Track function declarations to identify scopes
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
        node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
      ) {
        const scopeId = `function_${node.range[0]}_${node.range[1]}`;
        functionScopeStack.push(scopeId);

        // Initialize collections for this scope
        stateSettersByFunction.set(scopeId, new Set<string>());
        awaitExpressionsByFunction.set(scopeId, []);
        stateUpdatesBeforeAwait.set(scopeId, new Map<string, TSESTree.CallExpression>());
        stateUpdatesAfterAwait.set(scopeId, new Map<string, TSESTree.CallExpression>());
      },

      // When exiting a function, check for violations and clean up
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression:exit'() {
        const scopeId = getCurrentFunctionScopeId();

        // Check for violations in this scope
        const settersInScope = stateSettersByFunction.get(scopeId) || new Set<string>();
        const awaitsInScope = awaitExpressionsByFunction.get(scopeId) || [];
        const updatesBeforeAwait = stateUpdatesBeforeAwait.get(scopeId) || new Map<string, TSESTree.CallExpression>();
        const updatesAfterAwait = stateUpdatesAfterAwait.get(scopeId) || new Map<string, TSESTree.CallExpression>();

        // Only check if we have await expressions in this scope
        if (awaitsInScope.length > 0) {
          for (const setter of settersInScope) {
            if (updatesBeforeAwait.has(setter) && updatesAfterAwait.has(setter)) {
              const beforeNode = updatesBeforeAwait.get(setter)!;

              // Check if the rule is disabled via comment
              if (!hasDisableComment(beforeNode)) {
                context.report({
                  node: updatesAfterAwait.get(setter)!,
                  messageId: 'staleStateAcrossAwait',
                });
              }
            }
          }
        }

        // Clean up
        functionScopeStack.pop();
      },

      // Track await expressions
      AwaitExpression(node) {
        const scopeId = getCurrentFunctionScopeId();
        const awaitsInScope = awaitExpressionsByFunction.get(scopeId) || [];
        awaitsInScope.push(node);
        awaitExpressionsByFunction.set(scopeId, awaitsInScope);
      },

      // Detect useState calls and track the state setters
      VariableDeclarator(node) {
        // Check for useState destructuring pattern: const [state, setState] = useState(...)
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'useState' &&
          node.id.elements.length >= 2 &&
          node.id.elements[1]?.type === AST_NODE_TYPES.Identifier
        ) {
          // Get the setState function name
          const setterName = node.id.elements[1].name;
          const scopeId = getCurrentFunctionScopeId();

          // Store the setter in this scope
          const settersInScope = stateSettersByFunction.get(scopeId) || new Set<string>();
          settersInScope.add(setterName);
          stateSettersByFunction.set(scopeId, settersInScope);
        }
      },

      // Track state updates via calls to state setters
      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          const setterName = node.callee.name;
          const scopeId = getCurrentFunctionScopeId();

          // Check if this is a state setter in this scope
          const settersInScope = stateSettersByFunction.get(scopeId) || new Set<string>();

          if (settersInScope.has(setterName)) {
            // Check if we have await expressions in this scope
            const awaitsInScope = awaitExpressionsByFunction.get(scopeId) || [];

            if (awaitsInScope.length > 0) {
              // Determine if this call is before or after an await expression
              let isAfterAwait = false;

              for (const awaitExpr of awaitsInScope) {
                if (node.range[0] > awaitExpr.range[1]) {
                  isAfterAwait = true;
                  break;
                }
              }

              if (isAfterAwait) {
                const updatesAfterAwait = stateUpdatesAfterAwait.get(scopeId) || new Map<string, TSESTree.CallExpression>();
                updatesAfterAwait.set(setterName, node);
                stateUpdatesAfterAwait.set(scopeId, updatesAfterAwait);
              } else {
                const updatesBeforeAwait = stateUpdatesBeforeAwait.get(scopeId) || new Map<string, TSESTree.CallExpression>();
                updatesBeforeAwait.set(setterName, node);
                stateUpdatesBeforeAwait.set(scopeId, updatesBeforeAwait);
              }
            }
          }
        }
      },

      // Also check for Promise.then() as an async boundary
      'CallExpression[callee.property.name="then"]'(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'then'
        ) {
          const scopeId = getCurrentFunctionScopeId();
          const awaitsInScope = awaitExpressionsByFunction.get(scopeId) || [];
          awaitsInScope.push(node as unknown as TSESTree.AwaitExpression);
          awaitExpressionsByFunction.set(scopeId, awaitsInScope);
        }
      },

      // Check for generator functions with yield as async boundaries
      YieldExpression(node) {
        const scopeId = getCurrentFunctionScopeId();
        const awaitsInScope = awaitExpressionsByFunction.get(scopeId) || [];
        awaitsInScope.push(node as unknown as TSESTree.AwaitExpression);
        awaitExpressionsByFunction.set(scopeId, awaitsInScope);
      }
    };
  },
});
