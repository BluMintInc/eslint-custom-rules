import { createRule } from '../utils/createRule';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'redundantWrapper' | 'useDirectFunction' | 'useTypeAssertion';

interface Options {
  hookPatterns?: string[];
  allowedWrapperPatterns?: string[];
}

const DEFAULT_HOOK_PATTERNS = [
  'use*', // Any hook starting with 'use'
];

const DEFAULT_ALLOWED_WRAPPER_PATTERNS = [
  'useCallback',
  'useMemo',
  'useDeepCompareCallback',
  'useDeepCompareMemo',
];

export const noRedundantCallbackWrapping = createRule<[Options], MessageIds>({
  name: 'no-redundant-callback-wrapping',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent redundant wrapping of already-memoized callback functions in React\'s useCallback or similar memoization hooks. When functions from custom hooks or contexts are already stabilized, wrapping them again creates unnecessary overhead with no additional performance benefits.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          hookPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_HOOK_PATTERNS,
          },
          allowedWrapperPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_ALLOWED_WRAPPER_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      redundantWrapper:
        'Redundant {{wrapperName}} wrapping of already-memoized function "{{functionName}}". The function is already stabilized from {{hookName}}.',
      useDirectFunction:
        'Use the memoized function directly instead of wrapping it in {{wrapperName}}.',
      useTypeAssertion:
        'Consider using type assertion or inline arrow function instead of {{wrapperName}} for type adaptation.',
    },
  },
  defaultOptions: [
    {
      hookPatterns: DEFAULT_HOOK_PATTERNS,
      allowedWrapperPatterns: DEFAULT_ALLOWED_WRAPPER_PATTERNS,
    },
  ],
  create(context, [options]) {
    const hookPatterns = options.hookPatterns || DEFAULT_HOOK_PATTERNS;
    const allowedWrapperPatterns = options.allowedWrapperPatterns || DEFAULT_ALLOWED_WRAPPER_PATTERNS;

    // Track memoized functions from hooks
    const memoizedFunctions = new Map<string, { hookName: string; variableName: string }>();

    /**
     * Check if a pattern matches using simple glob-like matching
     */
    function matchesPattern(name: string, patterns: string[]): boolean {
      return patterns.some(pattern => {
        if (pattern.endsWith('*')) {
          return name.startsWith(pattern.slice(0, -1));
        }
        return name === pattern;
      });
    }

    /**
     * Check if a function call is a hook call
     */
    function isHookCall(node: TSESTree.CallExpression): boolean {
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        return matchesPattern(node.callee.name, hookPatterns);
      }
      return false;
    }

    /**
     * Check if a function call is a memoization wrapper
     */
    function isMemoizationWrapper(node: TSESTree.CallExpression): boolean {
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        return matchesPattern(node.callee.name, allowedWrapperPatterns);
      }
      return false;
    }

    /**
     * Extract function names from destructuring patterns
     */
    function extractFunctionNamesFromPattern(
      pattern: TSESTree.BindingName,
      hookName: string,
    ): void {
      if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
        pattern.properties.forEach(prop => {
          if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
            const functionName = prop.key.name;
            let variableName = functionName;

            // Handle renamed destructuring like { signIn: customSignIn }
            if (prop.value.type === AST_NODE_TYPES.Identifier) {
              variableName = prop.value.name;
            }

            memoizedFunctions.set(variableName, { hookName, variableName });
          }
        });
      } else if (pattern.type === AST_NODE_TYPES.Identifier) {
        // Handle cases like const authSubmit = useAuthSubmit()
        memoizedFunctions.set(pattern.name, { hookName, variableName: pattern.name });
      }
    }

    /**
     * Check if the callback body contains substantial logic beyond just calling the memoized function
     */
    function hasSubstantialLogic(body: TSESTree.Statement | TSESTree.Expression, targetFunction: string): boolean {
      // If it's a block statement, check all statements
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        const statements = body.body;

        // Count non-trivial statements
        let otherStatementCount = 0;

        statements.forEach(stmt => {
          if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
            const expr = stmt.expression;
            if (expr.type === AST_NODE_TYPES.CallExpression) {
              if (expr.callee.type === AST_NODE_TYPES.MemberExpression &&
                  expr.callee.property.type === AST_NODE_TYPES.Identifier &&
                  expr.callee.property.name === 'preventDefault') {
                // preventDefault is not substantial
              } else if (expr.callee.type === AST_NODE_TYPES.Identifier &&
                         expr.callee.name === targetFunction) {
                // Target function call is not substantial
              } else {
                otherStatementCount++;
              }
            } else {
              otherStatementCount++;
            }
          } else {
            otherStatementCount++;
          }
        });

        // Only substantial if there are other statements beyond preventDefault and target function call
        return otherStatementCount > 0;
      }

      // For expression bodies, check if it's just calling the target function
      if (body.type === AST_NODE_TYPES.CallExpression &&
          body.callee.type === AST_NODE_TYPES.Identifier &&
          body.callee.name === targetFunction) {
        return false;
      }

      // For arrow function expressions that return another function
      if (body.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return hasSubstantialLogic(body.body, targetFunction);
      }

      return true;
    }

    /**
     * Check if the callback has parameter transformation or uses parameters
     */
    function hasParameterTransformation(
      callbackParams: TSESTree.Parameter[],
      callbackBody: TSESTree.Statement | TSESTree.Expression,
    ): boolean {
      // If the callback has parameters, check if they're used in any way
      if (callbackParams.length > 0) {
        // Extract parameter names
        const paramNames = callbackParams
          .filter(param => param.type === AST_NODE_TYPES.Identifier)
          .map(param => (param as TSESTree.Identifier).name);

        if (paramNames.length > 0) {
          // Check if any parameter is used in the callback body
          return usesAnyParameter(callbackBody, paramNames);
        }
      }
      return false;
    }

    /**
     * Check if the callback body uses any of the given parameters
     */
    function usesAnyParameter(node: TSESTree.Node, paramNames: string[]): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return paramNames.includes(node.name);
      }

      if (node.type === AST_NODE_TYPES.BlockStatement) {
        return node.body.some(stmt => usesAnyParameter(stmt, paramNames));
      }

      if (node.type === AST_NODE_TYPES.ExpressionStatement) {
        return usesAnyParameter(node.expression, paramNames);
      }

      if (node.type === AST_NODE_TYPES.CallExpression) {
        return usesAnyParameter(node.callee, paramNames) ||
               node.arguments.some(arg => usesAnyParameter(arg, paramNames));
      }

      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return usesAnyParameter(node.object, paramNames) ||
               (node.computed && usesAnyParameter(node.property, paramNames));
      }

      // Add more node types as needed
      for (const key in node) {
        if (key === 'parent' || key === 'type') continue;
        const value = (node as any)[key];
        if (Array.isArray(value)) {
          if (value.some(item => item && typeof item === 'object' && usesAnyParameter(item, paramNames))) {
            return true;
          }
        } else if (value && typeof value === 'object' && value.type) {
          if (usesAnyParameter(value, paramNames)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check if there are multiple changing dependencies
     */
    function hasMultipleDependencies(dependencies: TSESTree.Expression[], targetFunction: string): boolean {
      // If there are dependencies other than the target function, it might be justified
      return dependencies.some(dep => {
        if (dep.type === AST_NODE_TYPES.Identifier) {
          return dep.name !== targetFunction;
        }
        return true; // Complex dependencies count as additional
      });
    }

    return {
      // Track hook calls and their destructured functions
      VariableDeclarator(node) {
        if (node.init &&
            node.init.type === AST_NODE_TYPES.CallExpression &&
            isHookCall(node.init)) {

          const hookName = node.init.callee.type === AST_NODE_TYPES.Identifier
            ? node.init.callee.name
            : 'unknown';

          extractFunctionNamesFromPattern(node.id, hookName);
        }
      },

      // Check useCallback and similar wrapper calls
      CallExpression(node) {
        if (!isMemoizationWrapper(node)) {
          return;
        }



        const wrapperName = node.callee.type === AST_NODE_TYPES.Identifier
          ? node.callee.name
          : 'unknown';

        // Check if this is a useCallback/useMemo call with a function
        if (node.arguments.length < 1) {
          return;
        }

        const firstArg = node.arguments[0];
        if (firstArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            firstArg.type !== AST_NODE_TYPES.FunctionExpression) {
          return;
        }

        const callback = firstArg;
        const dependencies = node.arguments[1];

        // Check if the callback body only calls a memoized function
        let targetFunctionCall: TSESTree.CallExpression | null = null;
        let targetFunctionName: string | null = null;

        function extractTargetFunction(expr: TSESTree.Expression): { call: TSESTree.CallExpression; name: string } | null {
          if (expr.type === AST_NODE_TYPES.CallExpression) {
            if (expr.callee.type === AST_NODE_TYPES.Identifier) {
              return { call: expr, name: expr.callee.name };
            } else if (expr.callee.type === AST_NODE_TYPES.MemberExpression &&
                       expr.callee.object.type === AST_NODE_TYPES.Identifier) {
              // Handle cases like authSubmit.signIn()
              return { call: expr, name: expr.callee.object.name };
            }
          } else if (expr.type === AST_NODE_TYPES.ArrowFunctionExpression) {
            // Handle useMemo(() => () => calculate(), [calculate])
            return extractTargetFunction(expr.body as TSESTree.Expression);
          }
          return null;
        }

        if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
          // Handle block body
          const statements = callback.body.body;


          // Look for the target function call among all statements
          for (const stmt of statements) {
            if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
              const result = extractTargetFunction(stmt.expression);
              if (result) {
                // Check if this is a memoized function
                if (memoizedFunctions.has(result.name)) {
                  targetFunctionCall = result.call;
                  targetFunctionName = result.name;
                  break;
                }
              }
            }
          }
        } else {
          // Handle expression body
          const result = extractTargetFunction(callback.body);
          if (result) {
            targetFunctionCall = result.call;
            targetFunctionName = result.name;
          }
        }

        if (!targetFunctionCall || !targetFunctionName) {
          return;
        }

        // Check if the target function is memoized
        const memoizedInfo = memoizedFunctions.get(targetFunctionName);
        if (!memoizedInfo) {
          return;
        }

        // Check edge cases that justify the wrapping

        // 1. Check for substantial additional logic
        if (hasSubstantialLogic(callback.body, targetFunctionName)) {
          return;
        }

        // 2. Check for parameter transformation
        if (hasParameterTransformation(callback.params, callback.body)) {
          return;
        }

        // 3. Check for multiple dependencies
        if (dependencies &&
            dependencies.type === AST_NODE_TYPES.ArrayExpression &&
            hasMultipleDependencies(dependencies.elements.filter(Boolean) as TSESTree.Expression[], targetFunctionName)) {
          return;
        }

        // Report the redundant wrapping
        context.report({
          node,
          messageId: 'redundantWrapper',
          data: {
            wrapperName,
            functionName: targetFunctionName,
            hookName: memoizedInfo.hookName,
          },
          fix(fixer) {
            // Provide auto-fix: replace the wrapper with the direct function reference
            return fixer.replaceText(node, targetFunctionName!);
          },
        });
      },
    };
  },
});
