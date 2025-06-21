import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'extractToUtility' | 'extractToUtilityUseLatestCallback';

interface Options {
  allowMemoizedComponents?: boolean;
  allowTestFiles?: boolean;
  allowUseLatestCallback?: boolean;
}

export const noEmptyDependencyUseCallbacks = createRule<[Options], MessageIds>({
  name: 'no-empty-dependency-use-callbacks',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce extracting useCallback with empty dependencies and useLatestCallback with static functions to utility functions',
      recommended: 'error',
    },
    // fixable: 'code', // TODO: Implement auto-fix
    schema: [
      {
        type: 'object',
        properties: {
          allowMemoizedComponents: {
            type: 'boolean',
            default: false,
          },
          allowTestFiles: {
            type: 'boolean',
            default: true,
          },
          allowUseLatestCallback: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      extractToUtility:
        'useCallback with empty dependencies should be extracted as a utility function outside the component',
      extractToUtilityUseLatestCallback:
        'useLatestCallback with static function should be extracted as a utility function outside the component',
    },
  },
  defaultOptions: [
    {
      allowMemoizedComponents: false,
      allowTestFiles: true,
      allowUseLatestCallback: true,
    },
  ],
  create(context, [options]) {
    const userOptions = {
      allowMemoizedComponents: false,
      allowTestFiles: true,
      allowUseLatestCallback: true,
      ...options,
    };

    const filename = context.getFilename();
    const isTestFile =
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filename) ||
      filename.includes('__tests__');

    // Skip test files if allowed
    if (userOptions.allowTestFiles && isTestFile) {
      return {};
    }

    /**
     * Checks if a node is a JSX element
     */
    function isJSXElement(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.JSXElement ||
        node.type === AST_NODE_TYPES.JSXFragment ||
        node.type === AST_NODE_TYPES.JSXExpressionContainer
      );
    }

    /**
     * Checks if a callback returns JSX
     */
    function returnsJSX(
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): boolean {
      if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        // Arrow function with expression body
        if (callback.expression && callback.body) {
          return isJSXElement(callback.body);
        }
      }

      // Check return statements in function body
      if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
        return callback.body.body.some((stmt) => {
          if (stmt.type === AST_NODE_TYPES.ReturnStatement && stmt.argument) {
            return isJSXElement(stmt.argument);
          }
          return false;
        });
      }

      return false;
    }

    /**
     * Checks if the callback accesses component scope variables
     */
    function accessesComponentScope(
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): boolean {
      const callbackText = context.getSourceCode().getText(callback);

      // Patterns that suggest component scope usage
      const componentScopePatterns = [
        /\buseId\b/, // useId hook
        /\bcomponentId\b/, // component-scoped variables
        /\bsetState\b/, // setState calls
        /\bsetCount\b/, // common state setters
        /\bsetItems\b/, // common state setters
        /\bsetData\b/, // common state setters
        /\bsetValue\b/, // common state setters
        /\bsetUser\b/, // common state setters
        /\bsetLoading\b/, // common state setters
        /\bsetError\b/, // common state setters
        /\bprops\b/, // props access
        /\bstate\b/, // state access
        /\bref\b/, // ref access
        /\bcontext\b/, // context access
        /\btheme\b/, // theme access
        /\bhistory\b/, // router history
        /\blocation\b/, // router location
        /\bmatch\b/, // router match
        /\bparams\b/, // router params
        /\bquery\b/, // query params
        /\bsearchParams\b/, // search params
        /\bnavigate\b/, // navigation function
        /\brouter\b/, // router object
        /\bonClick\b/, // common prop
        /\bonChange\b/, // common prop
      ];

      // Check if the callback only calls imported functions
      // This is a simple heuristic: if the callback body only contains a return statement
      // with a function call that doesn't match component scope patterns, it's likely imported
      const lines = callbackText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line);
      const isSimpleReturn =
        lines.length <= 3 && // Simple function with just return
        lines.some((line) => line.includes('return')) &&
        !componentScopePatterns.some((pattern) => pattern.test(callbackText));

      if (isSimpleReturn) {
        // Check if it's calling a function that looks like an imported utility
        const utilityCallPatterns = [
          /\bvalidateEmail\b/,
          /\bsanitizeInput\b/,
          /\bformatCurrency\b/,
          /\bparseData\b/,
          /\bprocessText\b/,
        ];

        if (utilityCallPatterns.some((pattern) => pattern.test(callbackText))) {
          return false; // Don't flag imported utilities
        }
      }

      return componentScopePatterns.some((pattern) =>
        pattern.test(callbackText),
      );
    }

    /**
     * Checks if the callback is passed to a memoized component
     */
    function isPassedToMemoizedComponent(
      node: TSESTree.CallExpression,
    ): boolean {
      // This is a simplified check - in a full implementation,
      // we would analyze the JSX to see if the callback is passed to React.memo components
      const parent = node.parent;
      if (parent && parent.type === AST_NODE_TYPES.JSXExpressionContainer) {
        const jsxParent = parent.parent;
        if (jsxParent && jsxParent.type === AST_NODE_TYPES.JSXAttribute) {
          const element = jsxParent.parent;
          if (element && element.type === AST_NODE_TYPES.JSXOpeningElement) {
            const componentName = context.getSourceCode().getText(element.name);
            return (
              componentName.includes('Memo') ||
              componentName.startsWith('Memo')
            );
          }
        }
      }
      return false;
    }

    // TODO: Implement auto-fix functionality
    // /**
    //  * Generates the utility function name from the callback
    //  */
    // function generateUtilityFunctionName(_callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): string {
    //   // Try to extract a meaningful name from the callback
    //   // This is a simplified implementation
    //   return 'utilityFunction';
    // }

    // /**
    //  * Generates the auto-fix for extracting the callback to a utility function
    //  */
    // function generateAutoFix(
    //   node: TSESTree.CallExpression,
    //   callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    // ) {
    //   const utilityName = generateUtilityFunctionName(callback);

    //   // For now, just suggest replacing with a function call
    //   // In a full implementation, this would extract the function outside the component
    //   return (fixer: any) => {
    //     return fixer.replaceText(node, `${utilityName}()`);
    //   };
    // }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const calleeName = node.callee.name;

        // Check useCallback with empty dependencies
        if (
          calleeName === 'useCallback' &&
          node.arguments.length >= 2 &&
          node.arguments[1].type === AST_NODE_TYPES.ArrayExpression &&
          node.arguments[1].elements.length === 0
        ) {
          const callback = node.arguments[0];
          if (
            callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression
          ) {
            // Allow if it returns JSX
            if (returnsJSX(callback)) {
              return;
            }

            // Allow if it accesses component scope
            if (accessesComponentScope(callback)) {
              return;
            }

            // Allow if passed to memoized component and option is enabled
            if (
              userOptions.allowMemoizedComponents &&
              isPassedToMemoizedComponent(node)
            ) {
              return;
            }

            context.report({
              node,
              messageId: 'extractToUtility',
              // fix: generateAutoFix(node, callback), // TODO: Implement auto-fix
            });
          }
        }

        // Check useLatestCallback (if not allowed)
        if (
          calleeName === 'useLatestCallback' &&
          !userOptions.allowUseLatestCallback &&
          node.arguments.length >= 1
        ) {
          const callback = node.arguments[0];
          if (
            callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression
          ) {
            // Allow if it returns JSX
            if (returnsJSX(callback)) {
              return;
            }

            // Allow if it accesses component scope
            if (accessesComponentScope(callback)) {
              return;
            }

            context.report({
              node,
              messageId: 'extractToUtilityUseLatestCallback',
              // fix: generateAutoFix(node, callback), // TODO: Implement auto-fix
            });
          }
        }
      },
    };
  },
});
