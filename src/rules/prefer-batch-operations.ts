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

function isSetterCall(call: TSESTree.CallExpression): boolean {
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (call.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  return SETTER_METHODS.has(call.callee.property.name);
}

function getAllCallsFromExpression(
  expr: TSESTree.Expression,
): TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];

  function traverse(node: TSESTree.Expression): void {
    switch (node.type) {
      case AST_NODE_TYPES.CallExpression:
        calls.push(node);

        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const obj = node.callee.object;
          if (
            obj.type !== AST_NODE_TYPES.Identifier &&
            obj.type !== AST_NODE_TYPES.ThisExpression &&
            obj.type !== AST_NODE_TYPES.Literal
          ) {
            traverse(obj as TSESTree.Expression);
          }
        }

        for (const arg of node.arguments) {
          if (!arg) continue;
          if (arg.type === AST_NODE_TYPES.SpreadElement) {
            traverse(arg.argument as TSESTree.Expression);
          } else {
            traverse(arg as TSESTree.Expression);
          }
        }
        break;
      case AST_NODE_TYPES.AwaitExpression:
        traverse(node.argument as TSESTree.Expression);
        break;
      case AST_NODE_TYPES.ArrayExpression:
        for (const el of node.elements) {
          if (!el) continue;
          if (el.type === AST_NODE_TYPES.SpreadElement) {
            traverse(el.argument as TSESTree.Expression);
          } else {
            traverse(el as TSESTree.Expression);
          }
        }
        break;
      case AST_NODE_TYPES.ObjectExpression:
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.SpreadElement) {
            traverse(prop.argument as TSESTree.Expression);
          } else if (prop.type === AST_NODE_TYPES.Property) {
            const val = prop.value;
            if (
              val.type !== AST_NODE_TYPES.Identifier &&
              val.type !== AST_NODE_TYPES.Literal &&
              val.type !== AST_NODE_TYPES.ThisExpression
            ) {
              traverse(val as TSESTree.Expression);
            }
          }
        }
        break;
      case AST_NODE_TYPES.SequenceExpression:
        for (const expr of node.expressions) {
          traverse(expr as TSESTree.Expression);
        }
        break;
      case AST_NODE_TYPES.UnaryExpression:
        traverse(node.argument as TSESTree.Expression);
        break;
      case AST_NODE_TYPES.LogicalExpression:
        traverse(node.left);
        traverse(node.right);
        break;
      case AST_NODE_TYPES.ConditionalExpression:
        traverse(node.test);
        traverse(node.consequent);
        traverse(node.alternate);
        break;
      case AST_NODE_TYPES.MemberExpression:
        if (
          node.object.type !== AST_NODE_TYPES.Identifier &&
          node.object.type !== AST_NODE_TYPES.ThisExpression &&
          node.object.type !== AST_NODE_TYPES.Literal
        ) {
          traverse(node.object);
        }
        break;
      // For function expressions, we don't traverse inside them
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.Identifier:
      case AST_NODE_TYPES.Literal:
      case AST_NODE_TYPES.ThisExpression:
        break;
      default:
        break;
    }
  }

  traverse(expr);
  return calls;
}

function findLoopNode(
  node: TSESTree.Node,
):
  | { node: TSESTree.Node; isArrayMethod?: string; isPromiseAll?: boolean }
  | undefined {
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
          // Check if Promise.all contains mixed operation types
          if (current.arguments.length > 0) {
            let hasSetterCalls = false;
            let hasNonSetterCalls = false;

            // Handle direct array expressions
            if (current.arguments[0].type === AST_NODE_TYPES.ArrayExpression) {
              const arrayElements = current.arguments[0].elements;

              // Analyze each element in the Promise.all array
              for (const element of arrayElements) {
                if (!element) continue;

                // Skip spread elements for now
                if (element.type === AST_NODE_TYPES.SpreadElement) continue;

                // Check all possible calls in this element
                const allCalls = getAllCallsFromExpression(element);
                let hasSetterInElement = false;
                let hasNonSetterInElement = false;

                for (const call of allCalls) {
                  if (isSetterCall(call)) {
                    hasSetterInElement = true;
                  } else {
                    hasNonSetterInElement = true;
                  }
                }

                if (hasSetterInElement) {
                  hasSetterCalls = true;
                }
                if (hasNonSetterInElement) {
                  hasNonSetterCalls = true;
                }
              }
            } else {
              // For non-array expressions (e.g., variables, method calls),
              // we can't easily analyze the contents, so assume mixed operations
              hasNonSetterCalls = true;
            }

            // If we have both setter calls and non-setter calls, don't flag
            // This handles the case where different operation types are mixed
            if (hasSetterCalls && hasNonSetterCalls) {
              return undefined;
            }
          }

          return { node: current, isArrayMethod: 'map', isPromiseAll: true };
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
  firstNode: TSESTree.Node;
};

const loopSetterCalls = new Map<TSESTree.Node, Map<string, SetterCallInfo>>();
const reportedLoops = new Set<TSESTree.Node>();

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
        reportedLoops.clear();
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

        // Determine if this is a traditional loop
        const isTraditionalLoop =
          !loopInfo.isArrayMethod &&
          !loopInfo.isPromiseAll &&
          (loopInfo.node.type === AST_NODE_TYPES.ForStatement ||
            loopInfo.node.type === AST_NODE_TYPES.ForInStatement ||
            loopInfo.node.type === AST_NODE_TYPES.ForOfStatement ||
            loopInfo.node.type === AST_NODE_TYPES.WhileStatement ||
            loopInfo.node.type === AST_NODE_TYPES.DoWhileStatement);

        if (existing) {
          // If we see a different method on the same setter instance, don't report
          if (existing.methodName !== methodName) return;
          existing.count++;

          // For Promise.all contexts, report only once per loop context, on the second occurrence
          if (
            loopInfo.isPromiseAll &&
            existing.count === 2 &&
            !reportedLoops.has(loopInfo.node)
          ) {
            reportedLoops.add(loopInfo.node);

            const messageId =
              methodName === 'set' ? 'preferSetAll' : 'preferOverwriteAll';
            context.report({
              node: existing.firstNode,
              messageId,
              fix: () => null, // We can't provide a fix because we don't know the array structure
            });
          }
        } else {
          setterCalls.set(key, { methodName, count: 1, firstNode: node });

          // Check if we now have multiple different setter instances in a traditional loop
          if (isTraditionalLoop) {
            const setterInstances = new Set(Array.from(setterCalls.keys()));
            if (setterInstances.size > 1) {
              // This is a valid use case when using multiple setters in a loop
              // For example: userSetter.set(doc.user) and orderSetter.set(doc.order)
              // Each setter operates on a different collection, so they can't be batched together
              // Don't report anything for this loop
              return;
            }

            // For traditional loops, report on the first occurrence since we know it's in a loop
            if (!reportedLoops.has(loopInfo.node)) {
              reportedLoops.add(loopInfo.node);
              const messageId =
                methodName === 'set' ? 'preferSetAll' : 'preferOverwriteAll';
              context.report({
                node,
                messageId,
                fix: () => null, // We can't provide a fix because we don't know the array structure
              });
            }
          }

          // For array methods, report on the first occurrence
          else if (loopInfo.isArrayMethod) {
            if (!reportedLoops.has(loopInfo.node)) {
              reportedLoops.add(loopInfo.node);
              const messageId =
                methodName === 'set' ? 'preferSetAll' : 'preferOverwriteAll';
              context.report({
                node,
                messageId,
                fix: () => null, // We can't provide a fix because we don't know the array structure
              });
            }
          }
        }
      },
    };
  },
});
