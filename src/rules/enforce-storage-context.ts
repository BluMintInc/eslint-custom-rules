import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceLocalStorage' | 'enforceSessionStorage';

// Set of methods and properties to check for localStorage and sessionStorage
const STORAGE_METHODS = new Set([
  'getItem',
  'setItem',
  'removeItem',
  'clear',
  'key',
  'length',
]);

export const enforceStorageContext = createRule<[], MessageIds>({
  name: 'enforce-storage-context',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of storage context providers (LocalStorage.tsx and SessionStorage.tsx) instead of direct browser storage APIs',
      recommended: 'error',
    },
    fixable: 'code', // This rule is automatically fixable
    schema: [], // No options
    messages: {
      enforceLocalStorage:
        'Use the LocalStorage context provider (useLocalStorage hook) instead of direct localStorage API calls',
      enforceSessionStorage:
        'Use the SessionStorage context provider (useSessionStorage hook) instead of direct sessionStorage API calls',
    },
  },
  defaultOptions: [],
  create(context) {
    // Check if the current file is one of the storage context implementations
    const filename = context.getFilename();
    if (
      filename.includes('LocalStorage.tsx') ||
      filename.includes('SessionStorage.tsx')
    ) {
      // Skip checking in the context implementation files
      return {};
    }

    // Track nodes that have been reported to avoid duplicate reports
    const reportedNodes = new Set<TSESTree.Node>();

    return {
      // Check for method calls like localStorage.getItem('key') or window.localStorage.getItem('key')
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const memberExpr = node.callee;

          if (
            memberExpr.property.type === AST_NODE_TYPES.Identifier &&
            STORAGE_METHODS.has(memberExpr.property.name)
          ) {
            const objectName = getStorageObjectName(memberExpr.object);

            if (objectName === 'localStorage') {
              context.report({
                node,
                messageId: 'enforceLocalStorage',
              });
              // Mark the member expression as reported to avoid duplicate reports
              reportedNodes.add(memberExpr);
            } else if (objectName === 'sessionStorage') {
              context.report({
                node,
                messageId: 'enforceSessionStorage',
              });
              // Mark the member expression as reported to avoid duplicate reports
              reportedNodes.add(memberExpr);
            }
          }
        }
      },

      // Check for direct property access like localStorage.length or window.localStorage.length
      MemberExpression(node: TSESTree.MemberExpression) {
        // Skip if this node has already been reported as part of a CallExpression
        if (reportedNodes.has(node)) {
          return;
        }

        // Skip if this is part of a larger member expression that will be handled by the parent
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.MemberExpression &&
          node.parent.object === node
        ) {
          return;
        }

        // Skip if this is part of a call expression (we handle those separately)
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.CallExpression &&
          node.parent.callee === node
        ) {
          return;
        }

        // Check for direct property access (e.g., localStorage.length)
        if (
          node.property.type === AST_NODE_TYPES.Identifier &&
          STORAGE_METHODS.has(node.property.name)
        ) {
          const objectName = getStorageObjectName(node.object);
          if (objectName === 'localStorage') {
            context.report({
              node,
              messageId: 'enforceLocalStorage',
            });
          } else if (objectName === 'sessionStorage') {
            context.report({
              node,
              messageId: 'enforceSessionStorage',
            });
          }
        }
      },
    };
  },
});

// Helper function to get the storage object name, handling window.localStorage and global.localStorage
function getStorageObjectName(node: TSESTree.Node): string | null {
  // Direct access: localStorage
  if (
    node.type === AST_NODE_TYPES.Identifier &&
    (node.name === 'localStorage' || node.name === 'sessionStorage')
  ) {
    return node.name;
  }

  // Window/global access: window.localStorage, global.localStorage
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    (node.object.name === 'window' || node.object.name === 'global') &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    (node.property.name === 'localStorage' || node.property.name === 'sessionStorage')
  ) {
    return node.property.name;
  }

  return null;
}
