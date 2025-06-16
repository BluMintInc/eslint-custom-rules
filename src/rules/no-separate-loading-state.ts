import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noSeparateLoadingState';

const LOADING_STATE_PATTERNS = [
  /^is.*Loading$/i,  // matches isProfileLoading, isDataLoading, etc.
  /^isLoading.+/i,   // matches isLoadingProfile, isLoadingData, etc.
];

/**
 * Checks if a variable name matches the loading state patterns
 */
function isLoadingStatePattern(name: string): boolean {
  return LOADING_STATE_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Checks if a node is a useState call
 */
function isUseStateCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useState'
  );
}

/**
 * Checks if we're inside a React function component or custom hook
 */
function isInReactContext(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current) {
    if (current.type === AST_NODE_TYPES.FunctionDeclaration) {
      const funcName = current.id?.name;
      // React components start with uppercase, hooks start with 'use'
      if (funcName && (/^[A-Z]/.test(funcName) || /^use[A-Z]/.test(funcName))) {
        return true;
      }
    } else if (current.type === AST_NODE_TYPES.FunctionExpression ||
               current.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      // Check if this is assigned to a variable with React naming convention
      const parent = current.parent;
      if (parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier) {
        const varName = parent.id.name;
        if (/^[A-Z]/.test(varName) || /^use[A-Z]/.test(varName)) {
          return true;
        }
      }
    }
    current = current.parent as TSESTree.Node;
  }

  return false;
}

/**
 * Checks if the setter function is used in a pattern that suggests async loading
 */
function hasAsyncLoadingPattern(
  context: any,
  setterName: string,
  scope: TSESTree.Node
): boolean {
  const sourceCode = context.getSourceCode();
  const scopeText = sourceCode.getText(scope);

  // Look for patterns like:
  // setIsLoading(true); ... await ... setIsLoading(false);
  // setIsProfileLoading(true); ... api.get ... setIsProfileLoading(false);
  const setTruePattern = new RegExp(`${setterName}\\s*\\(\\s*true\\s*\\)`, 'g');
  const setFalsePattern = new RegExp(`${setterName}\\s*\\(\\s*false\\s*\\)`, 'g');
  const awaitPattern = /await\s+/g;
  const asyncCallPattern = /\.(get|post|put|delete|fetch)\s*\(/g;

  const hasTrueCall = setTruePattern.test(scopeText);
  const hasFalseCall = setFalsePattern.test(scopeText);
  const hasAsyncOperation = awaitPattern.test(scopeText) || asyncCallPattern.test(scopeText);

  return hasTrueCall && hasFalseCall && hasAsyncOperation;
}

export const noSeparateLoadingState = createRule<[], MessageIds>({
  name: 'no-separate-loading-state',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow separate loading state variables, prefer encoding loading state in the primary data state',
      recommended: 'error',
    },
    // No autofix as it requires manual type changes
    schema: [],
    messages: {
      noSeparateLoadingState:
        'Avoid separate loading state "{{variableName}}". Instead, encode the loading state directly in the primary state using a sentinel value like \'loading\' or a discriminated union type.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Only check array pattern destructuring (useState returns an array)
        if (node.id.type !== AST_NODE_TYPES.ArrayPattern ||
            !node.init ||
            node.init.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }

        const callExpression = node.init;

        // Check if it's a useState call
        if (!isUseStateCall(callExpression)) {
          return;
        }

        // Check if we're in a React context (component or hook)
        if (!isInReactContext(node)) {
          return;
        }

        const arrayPattern = node.id;

        // Check if the first element (state variable) matches loading patterns
        if (arrayPattern.elements.length > 0 &&
            arrayPattern.elements[0] &&
            arrayPattern.elements[0].type === AST_NODE_TYPES.Identifier) {

          const stateVariableName = arrayPattern.elements[0].name;

          if (isLoadingStatePattern(stateVariableName)) {
            // Get the setter name (second element)
            let setterName = '';
            if (arrayPattern.elements.length > 1 &&
                arrayPattern.elements[1] &&
                arrayPattern.elements[1].type === AST_NODE_TYPES.Identifier) {
              setterName = arrayPattern.elements[1].name;
            }

            // Find the containing function to check for async loading pattern
            let containingFunction: TSESTree.Node | undefined = node;
            while (containingFunction &&
                   containingFunction.type !== AST_NODE_TYPES.FunctionDeclaration &&
                   containingFunction.type !== AST_NODE_TYPES.FunctionExpression &&
                   containingFunction.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
              containingFunction = containingFunction.parent as TSESTree.Node;
            }

            // Check if the setter is used in an async loading pattern
            const hasAsyncPattern = containingFunction && setterName ?
              hasAsyncLoadingPattern(context, setterName, containingFunction) : false;

            // Report the error if it matches the pattern or if we can't determine the pattern
            // (being conservative and flagging all loading state patterns)
            if (hasAsyncPattern || setterName) {
              context.report({
                node: arrayPattern.elements[0],
                messageId: 'noSeparateLoadingState',
                data: {
                  variableName: stateVariableName,
                },
              });
            }
          }
        }
      },
    };
  },
});
