import { createRule } from '../utils/createRule';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'missingConsoleError' | 'missingConsoleWarn' | 'missingConsoleBoth';

export const enforceConsoleError = createRule<[], MessageIds>({
  name: 'enforce-console-error',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce proper logging for useAlertDialog based on severity. When severity is "error", console.error must be included. When severity is "warning", console.warn must be included. This ensures all user-facing errors and warnings are properly logged to monitoring systems.',
      recommended: 'error',
    },
    messages: {
      missingConsoleError:
        'useAlertDialog with severity "error" requires a console.error statement in the same function scope for proper monitoring.',
      missingConsoleWarn:
        'useAlertDialog with severity "warning" requires a console.warn statement in the same function scope for proper monitoring.',
      missingConsoleBoth:
        'useAlertDialog with dynamic severity requires both console.error and console.warn statements in the same function scope for proper monitoring.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track all open calls and console calls in the entire file
    const openCalls: Array<{
      node: TSESTree.CallExpression;
      severity: string;
      functionScope: TSESTree.Node;
    }> = [];
    const consoleCalls: Array<{
      node: TSESTree.CallExpression;
      method: 'error' | 'warn';
      functionScope: TSESTree.Node;
    }> = [];
    let hasUseAlertDialog = false;
    let currentFunctionScope: TSESTree.Node | null = null;

    function isUseAlertDialogCall(node: TSESTree.CallExpression): boolean {
      return (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useAlertDialog'
      );
    }

    function isConsoleCall(node: TSESTree.CallExpression, method: 'error' | 'warn'): boolean {
      return (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'console' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === method
      );
    }

    function getSeverityFromObjectExpression(node: TSESTree.ObjectExpression): string | null {
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          // Handle both computed and non-computed properties
          let isSeverityProperty = false;

          if (!prop.computed && prop.key.type === AST_NODE_TYPES.Identifier && prop.key.name === 'severity') {
            isSeverityProperty = true;
          } else if (prop.computed && prop.key.type === AST_NODE_TYPES.Literal && prop.key.value === 'severity') {
            isSeverityProperty = true;
          }

          if (isSeverityProperty) {
            if (prop.value.type === AST_NODE_TYPES.Literal && typeof prop.value.value === 'string') {
              return prop.value.value;
            }
            // If severity is not a literal, treat as dynamic
            return 'dynamic';
          }
        }
      }
      return null;
    }



    return {
      'Program:exit'() {
        // Only check if we have useAlertDialog in the file
        if (!hasUseAlertDialog) return;

        // Group open calls by their containing function
        const functionGroups = new Map<TSESTree.Node, {
          openCalls: Array<{ node: TSESTree.CallExpression; severity: string }>;
          consoleCalls: Array<{ node: TSESTree.CallExpression; method: 'error' | 'warn' }>;
        }>();

        // Group open calls by function
        openCalls.forEach(({ node, severity, functionScope }) => {
          if (!functionGroups.has(functionScope)) {
            functionGroups.set(functionScope, { openCalls: [], consoleCalls: [] });
          }
          functionGroups.get(functionScope)!.openCalls.push({ node, severity });
        });

        // Group console calls by function
        consoleCalls.forEach(({ node, method, functionScope }) => {
          if (!functionGroups.has(functionScope)) {
            functionGroups.set(functionScope, { openCalls: [], consoleCalls: [] });
          }
          functionGroups.get(functionScope)!.consoleCalls.push({ node, method });
        });

        // Check each function for violations
        functionGroups.forEach((group) => {
          const hasError = group.openCalls.some(call => call.severity === 'error');
          const hasWarning = group.openCalls.some(call => call.severity === 'warning');
          const hasDynamic = group.openCalls.some(call => call.severity === 'dynamic');
          const hasConsoleError = group.consoleCalls.some(call => call.method === 'error');
          const hasConsoleWarn = group.consoleCalls.some(call => call.method === 'warn');

          const needsConsoleError = hasError || hasDynamic;
          const needsConsoleWarn = hasWarning || hasDynamic;

          if (hasDynamic && (!hasConsoleError || !hasConsoleWarn)) {
            const dynamicCall = group.openCalls.find(call => call.severity === 'dynamic');
            if (dynamicCall) {
              context.report({
                node: dynamicCall.node,
                messageId: 'missingConsoleBoth',
              });
            }
          } else {
            if (needsConsoleError && !hasConsoleError) {
              const errorCall = group.openCalls.find(call => call.severity === 'error');
              if (errorCall) {
                context.report({
                  node: errorCall.node,
                  messageId: 'missingConsoleError',
                });
              }
            }

            if (needsConsoleWarn && !hasConsoleWarn) {
              const warningCall = group.openCalls.find(call => call.severity === 'warning');
              if (warningCall) {
                context.report({
                  node: warningCall.node,
                  messageId: 'missingConsoleWarn',
                });
              }
            }
          }
        });
      },

      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) {
        currentFunctionScope = node;
      },

      'FunctionDeclaration:exit'() {
        currentFunctionScope = null;
      },
      'FunctionExpression:exit'() {
        currentFunctionScope = null;
      },
      'ArrowFunctionExpression:exit'() {
        currentFunctionScope = null;
      },

      CallExpression(node: TSESTree.CallExpression) {
        // Track useAlertDialog calls
        if (isUseAlertDialogCall(node)) {
          hasUseAlertDialog = true;
        }

        // Track open method calls (both member expressions and direct calls)
        const isOpenCall = (
          (node.callee.type === AST_NODE_TYPES.MemberExpression &&
           node.callee.property.type === AST_NODE_TYPES.Identifier &&
           node.callee.property.name === 'open') ||
          (node.callee.type === AST_NODE_TYPES.Identifier &&
           node.callee.name === 'open')
        ) && node.arguments.length > 0;

        if (isOpenCall) {
          const firstArg = node.arguments[0];
          if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
            const severity = getSeverityFromObjectExpression(firstArg);
            if (severity && currentFunctionScope) {
              openCalls.push({
                node,
                severity,
                functionScope: currentFunctionScope,
              });
            }
          }
        }

        // Track console calls
        if (currentFunctionScope) {
          if (isConsoleCall(node, 'error')) {
            consoleCalls.push({
              node,
              method: 'error',
              functionScope: currentFunctionScope,
            });
          }

          if (isConsoleCall(node, 'warn')) {
            consoleCalls.push({
              node,
              method: 'warn',
              functionScope: currentFunctionScope,
            });
          }
        }
      },
    };
  },
});
