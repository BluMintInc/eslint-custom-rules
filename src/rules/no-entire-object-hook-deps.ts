import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidEntireObject';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    HOOK_NAMES.has(callee.name)
  );
}

function getObjectUsagesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
): Set<string> {
  const usages = new Set<string>();
  const visited = new Set<TSESTree.Node>();

  function buildAccessPath(node: TSESTree.MemberExpression): string | null {
    const parts: string[] = [];
    let current: TSESTree.Node = node;

    while (current.type === AST_NODE_TYPES.MemberExpression) {
      if (current.computed) {
        return null; // Skip computed properties
      }
      if (current.property.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }
      parts.unshift(current.property.name);
      current = current.object;
    }

    if (current.type === AST_NODE_TYPES.Identifier && current.name === objectName) {
      parts.unshift(objectName);
      return parts.join('.');
    }

    return null;
  }

  function visit(node: TSESTree.Node): void {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
      const accessPath = buildAccessPath(node);
      if (accessPath) {
        usages.add(accessPath);
      }
    }

    // Visit children
    switch (node.type) {
      case AST_NODE_TYPES.BlockStatement:
      case AST_NODE_TYPES.Program:
        node.body.forEach(child => visit(child));
        break;
      case AST_NODE_TYPES.ExpressionStatement:
        visit(node.expression);
        break;
      case AST_NODE_TYPES.CallExpression:
        visit(node.callee);
        node.arguments.forEach(arg => visit(arg));
        break;
      case AST_NODE_TYPES.MemberExpression:
        visit(node.object);
        if (!node.computed) {
          visit(node.property);
        }
        break;
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
        if (node.body.type === AST_NODE_TYPES.BlockStatement) {
          visit(node.body);
        } else {
          visit(node.body);
        }
        break;
      case AST_NODE_TYPES.ReturnStatement:
        if (node.argument) {
          visit(node.argument);
        }
        break;
      case AST_NODE_TYPES.ConditionalExpression:
        visit(node.test);
        visit(node.consequent);
        visit(node.alternate);
        break;
      case AST_NODE_TYPES.LogicalExpression:
      case AST_NODE_TYPES.BinaryExpression:
        visit(node.left);
        visit(node.right);
        break;
      case AST_NODE_TYPES.TemplateLiteral:
        node.expressions.forEach(expr => visit(expr));
        break;
    }
  }

  visit(hookBody);

  // Filter out intermediate paths
  const paths = Array.from(usages);
  const filteredPaths = paths.filter(path =>
    !paths.some(otherPath =>
      otherPath !== path && otherPath.startsWith(path + '.')
    )
  );
  return new Set(filteredPaths);
}

export const noEntireObjectHookDeps = createRule<[], MessageIds>({
  name: 'no-entire-object-hook-deps',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Avoid using entire objects in React hook dependency arrays when only specific fields are used',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject: 'Avoid using entire object "{{objectName}}" in dependency array. Use specific fields: {{fields}}',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (
          !depsArg ||
          depsArg.type !== AST_NODE_TYPES.ArrayExpression
        ) {
          return;
        }

        // Get the hook callback function
        const callbackArg = node.arguments[0];
        if (
          !callbackArg ||
          (callbackArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            callbackArg.type !== AST_NODE_TYPES.FunctionExpression)
        ) {
          return;
        }

        // Check each dependency in the array
        depsArg.elements.forEach(element => {
          if (
            element &&
            element.type === AST_NODE_TYPES.Identifier
          ) {
            const objectName = element.name;
            const usages = getObjectUsagesInHook(callbackArg.body, objectName);

            // If we found specific field usages and the entire object is in deps
            if (usages.size > 0) {
              const fields = Array.from(usages).join(', ');
              context.report({
                node: element,
                messageId: 'avoidEntireObject',
                data: {
                  objectName,
                  fields,
                },
                fix(fixer) {
                  // Only provide fix if we have specific fields to suggest
                  if (usages.size > 0) {
                    return fixer.replaceText(
                      element,
                      Array.from(usages).join(', ')
                    );
                  }
                  return null;
                },
              });
            }
          }
        });
      },
    };
  },
});
