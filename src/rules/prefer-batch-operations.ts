import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSetAll' | 'preferOverwriteAll';

const SETTER_METHODS = new Set(['set', 'overwrite']);
const ARRAY_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'reduce',
  'every',
  'some',
]);

function isArrayMethod(node: TSESTree.Node): {
  isValid: boolean;
  methodName?: string;
} {
  if (node.type !== AST_NODE_TYPES.CallExpression) return { isValid: false };
  const callee = node.callee;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    ARRAY_METHODS.has(callee.property.name)
  ) {
    return { isValid: true, methodName: callee.property.name };
  }
  return { isValid: false };
}

function isPromiseAll(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Promise' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'all'
  );
}

function findLoopNode(
  node: TSESTree.Node,
): { node: TSESTree.Node; isArrayMethod?: string } | undefined {
  let current: TSESTree.Node | undefined = node;
  let loopNode: TSESTree.Node | null = null;

  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
        loopNode = current;
        break;

      case AST_NODE_TYPES.CallExpression:
        // Check for Promise.all
        if (isPromiseAll(current)) {
          return { node: current, isArrayMethod: 'map' };
        }
        // Check for array methods
        const { isValid, methodName: currentMethodName } =
          isArrayMethod(current);
        if (isValid && currentMethodName) {
          // For sequential array methods, check if the callback is async
          if (
            currentMethodName === 'forEach' ||
            currentMethodName === 'reduce' ||
            currentMethodName === 'filter'
          ) {
            const callback = current.arguments[0];
            if (
              callback &&
              (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                callback.type === AST_NODE_TYPES.FunctionExpression) &&
              callback.async
            ) {
              return { node: current, isArrayMethod: currentMethodName };
            }
          }
          return { node: current, isArrayMethod: currentMethodName };
        }
        break;

      case AST_NODE_TYPES.Program:
        // Return loop if we found one
        if (loopNode) {
          return { node: loopNode };
        }
        return undefined;
    }
    current = current.parent as TSESTree.Node;
  }
  return undefined;
}

function isFirestoreSetterInstance(node: TSESTree.Node): boolean {
  // Check if it's a DocSetter instance
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'DocSetter'
    );
  }

  return false;
}

function isMapInstance(node: TSESTree.Node): boolean {
  // Check if it's a Map instance
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'Map'
    );
  }

  return false;
}

function findVariableDeclaration(
  node: TSESTree.Node,
  varName: string,
): TSESTree.VariableDeclarator | undefined {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current.type === AST_NODE_TYPES.Program) {
      for (const statement of current.body) {
        if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const decl of statement.declarations) {
            if (
              decl.id.type === AST_NODE_TYPES.Identifier &&
              decl.id.name === varName
            ) {
              return decl;
            }
          }
        }
      }
    }
    current = current.parent as TSESTree.Node;
  }
  return undefined;
}

function isSetterMethodCall(node: TSESTree.Node): {
  isValid: boolean;
  methodName?: string;
  setterInstance?: string;
} {
  if (node.type !== AST_NODE_TYPES.CallExpression) return { isValid: false };
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression)
    return { isValid: false };
  if (callee.property.type !== AST_NODE_TYPES.Identifier)
    return { isValid: false };
  if (!SETTER_METHODS.has(callee.property.name)) return { isValid: false };

  // Get the setter instance
  const object = callee.object;
  if (object.type !== AST_NODE_TYPES.Identifier) return { isValid: false };
  const setterInstance = object.name;

  // Find the variable declaration
  const decl = findVariableDeclaration(node, setterInstance);
  if (!decl || !decl.init) return { isValid: false };

  // Skip if it's a Map instance
  if (isMapInstance(decl.init)) return { isValid: false };

  // Check if it's a Firestore setter instance
  if (!isFirestoreSetterInstance(decl.init)) return { isValid: false };

  // Get the method name
  const methodName = callee.property.name;

  return { isValid: true, methodName, setterInstance };
}

// Add this before the rule definition
type SetterCallInfo = {
  methodName: string;
  count: number;
};

const loopSetterCalls = new Map<TSESTree.Node, Map<string, SetterCallInfo>>();

export const preferBatchOperations = createRule<[], MessageIds>({
  name: 'prefer-batch-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using setAll() and overwriteAll() instead of multiple set() or overwrite() calls',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSetAll:
        'Use setAll() instead of multiple set() calls for better performance',
      preferOverwriteAll:
        'Use overwriteAll() instead of multiple overwrite() calls for better performance',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      'Program:exit'() {
        // Clear the maps for the next file
        loopSetterCalls.clear();
      },

      CallExpression(node) {
        const { isValid, methodName, setterInstance } =
          isSetterMethodCall(node);
        if (!isValid || !methodName || !setterInstance) return;

        // Check if we're in a loop or Promise.all
        const loopInfo = findLoopNode(node);
        if (!loopInfo) return;

        // Get or create the setter calls map for this loop
        let setterCalls = loopSetterCalls.get(loopInfo.node);
        if (!setterCalls) {
          setterCalls = new Map();
          loopSetterCalls.set(loopInfo.node, setterCalls);
        }

        // Track setter instance and method calls for this loop
        const key = setterInstance;
        const existing = setterCalls.get(key);
        if (existing) {
          // If we see a different method on the same setter instance, don't report
          if (existing.methodName !== methodName) return;
          existing.count++;
        } else {
          setterCalls.set(key, { methodName, count: 1 });
        }

        // Report on the first occurrence of a repeated call
        // For Promise.all and array methods, report on the first occurrence
        // For regular loops, report on the first occurrence too since we know it's in a loop
        const shouldReport = loopInfo.isArrayMethod
          ? ['forEach', 'reduce', 'filter', 'map'].includes(
              loopInfo.isArrayMethod,
            )
          : setterCalls.get(key)!.count === 1;

        // Don't report if we have multiple different setter instances in a loop
        // Only check this for regular loops, not array methods or Promise.all
        if (shouldReport && !loopInfo.isArrayMethod) {
          const setterInstances = new Set(Array.from(setterCalls.keys()));
          if (setterInstances.size > 1) {
            // This is a valid use case when using multiple setters in a loop
            // For example: userSetter.set(doc.user) and orderSetter.set(doc.order)
            // Each setter operates on a different collection, so they can't be batched together
            // We only want to report when using the same setter instance multiple times
            // For example: userSetter.set(doc.user) multiple times should use userSetter.setAll()
            if (
              loopInfo.node.type.startsWith('For') ||
              loopInfo.node.type.startsWith('While') ||
              loopInfo.node.type.startsWith('Do')
            ) {
              return;
            }
          }
        }

        // Report on the first occurrence of a repeated call
        // For Promise.all and array methods, report on the first occurrence
        // For regular loops, report on the first occurrence too since we know it's in a loop
        if (shouldReport) {
          const messageId =
            methodName === 'set' ? 'preferSetAll' : 'preferOverwriteAll';
          context.report({
            node,
            messageId,
            fix: () => null, // We can't provide a fix because we don't know the array structure
          });
        }
      },
    };
  },
});
