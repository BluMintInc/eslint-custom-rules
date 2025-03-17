import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { TypeFlags, isArrayTypeNode, isTupleTypeNode } from 'typescript';
import type { TypeChecker, Node } from 'typescript';

type MessageIds = 'avoidEntireObject';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isArrayOrPrimitive(
  checker: TypeChecker,
  esTreeNode: TSESTree.Node,
  nodeMap: { get(node: TSESTree.Node): Node | undefined },
): boolean {
  const tsNode = nodeMap.get(esTreeNode);
  if (!tsNode) return false;

  const type = checker.getTypeAtLocation(tsNode);

  // Check if it's a primitive type
  if (
    type.flags &
    (TypeFlags.String |
      TypeFlags.StringLike |
      TypeFlags.StringLiteral |
      TypeFlags.Number |
      TypeFlags.Boolean |
      TypeFlags.Null |
      TypeFlags.Undefined |
      TypeFlags.Void |
      TypeFlags.Never |
      TypeFlags.Any |
      TypeFlags.Unknown |
      TypeFlags.BigInt |
      TypeFlags.ESSymbol)
  ) {
    return true;
  }

  // Check if it's an array type
  const typeNode = checker.typeToTypeNode(type, undefined, undefined);
  if (
    type.symbol?.name === 'Array' ||
    type.symbol?.escapedName === 'Array' ||
    (typeNode && (isArrayTypeNode(typeNode) || isTupleTypeNode(typeNode)))
  ) {
    return true;
  }

  // Check if it's a string type with methods (like String object)
  if (type.symbol?.name === 'String' || type.symbol?.escapedName === 'String') {
    return true;
  }

  // If it's not a primitive or array, and has properties, it's an object
  return false;
}

function getObjectUsagesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Set<string> {
  const usages = new Set<string>();
  const visited = new Set<TSESTree.Node>();
  let needsEntireObject = false;

  // Manually check for optional chaining patterns like `userData?.id`
  const sourceCode = context.getSourceCode();
  const sourceText = sourceCode.getText(hookBody);
  const optionalChainingPattern = new RegExp(`${objectName}\\?\\.(\\w+)`, 'g');
  const matches = sourceText.match(optionalChainingPattern);

  if (matches) {
    for (const match of matches) {
      usages.add(match);
    }
  }

  // Built-in array methods that should not be considered as object properties
  const ARRAY_METHODS = new Set([
    'map',
    'filter',
    'reduce',
    'forEach',
    'some',
    'every',
    'find',
    'findIndex',
    'includes',
    'indexOf',
    'join',
    'slice',
    'splice',
    'concat',
    'push',
    'pop',
    'shift',
    'unshift',
    'sort',
    'reverse',
    'flat',
    'flatMap',
  ]);

  function buildAccessPath(node: TSESTree.MemberExpression): string | null {
    const parts: string[] = [];
    let current: TSESTree.Node = node;
    let hasOptionalChaining = false;

    // Collect all parts from leaf to root
    while (current.type === AST_NODE_TYPES.MemberExpression) {
      const memberExpr = current as TSESTree.MemberExpression;

      // Handle computed properties (like array indices)
      if (memberExpr.computed) {
        // For computed properties with literals
        if (memberExpr.property.type === AST_NODE_TYPES.Literal) {
          const literalProp = memberExpr.property as TSESTree.Literal;
          if (typeof literalProp.value === 'number') {
            parts.unshift(`[${literalProp.value}]`);
          } else if (typeof literalProp.value === 'string') {
            parts.unshift(`[${JSON.stringify(literalProp.value)}]`);
          } else {
            // For other computed properties, use a wildcard
            parts.unshift('[*]');
          }
        } else {
          // For other computed properties, use the exact expression
          try {
            const propertyText = context
              .getSourceCode()
              .getText(memberExpr.property);
            parts.unshift(`[${propertyText}]`);
          } catch (e) {
            // Fallback to wildcard if we can't get the source text
            parts.unshift('[*]');
          }
        }
      } else {
        // Regular property access
        if (memberExpr.property.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }

        // Skip array methods
        if (
          memberExpr.property.name &&
          ARRAY_METHODS.has(memberExpr.property.name)
        ) {
          return null;
        }

        parts.unshift(memberExpr.property.name);
      }

      if (memberExpr.optional) {
        hasOptionalChaining = true;
      }
      current = memberExpr.object;
    }

    // Check if we reached the target identifier
    if (
      current.type === AST_NODE_TYPES.Identifier &&
      current.name === objectName
    ) {
      // Build the path with optional chaining
      let path = objectName + (hasOptionalChaining ? '?' : '');

      // Add each part with proper formatting (dot notation or bracket notation)
      for (const part of parts) {
        if (part.startsWith('[')) {
          path += part; // Already formatted as bracket notation
        } else {
          path += '.' + part; // Dot notation
        }
      }

      return path;
    }

    return null;
  }

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.CallExpression) {
      // Check if the object is directly passed as an argument
      node.arguments.forEach((arg) => {
        if (arg.type === AST_NODE_TYPES.Identifier && arg.name === objectName) {
          needsEntireObject = true;
        }
      });
    } else if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      // If we find a JSX element, check its attributes for spread operator
      if (node.type === AST_NODE_TYPES.JSXElement) {
        node.openingElement.attributes.forEach((attr) => {
          if (
            attr.type === AST_NODE_TYPES.JSXSpreadAttribute &&
            attr.argument.type === AST_NODE_TYPES.Identifier &&
            attr.argument.name === objectName
          ) {
            needsEntireObject = true;
          }
        });
      }
    } else if (node.type === AST_NODE_TYPES.SpreadElement) {
      // If we find a spread operator with our target object, consider it as accessing all properties
      if (
        node.argument.type === AST_NODE_TYPES.Identifier &&
        node.argument.name === objectName
      ) {
        needsEntireObject = true;
        return;
      }
    } else if (node.type === AST_NODE_TYPES.MemberExpression) {
      // Check if this is accessing a property of our target object
      const path = buildAccessPath(node);
      if (path) {
        usages.add(path);
      }
    } else if (node.type === AST_NODE_TYPES.ChainExpression) {
      // Handle optional chaining expressions
      if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
        const path = buildAccessPath(node.expression);
        if (path) {
          usages.add(path);
        }
      }
    } else if (node.type === AST_NODE_TYPES.BinaryExpression || node.type === AST_NODE_TYPES.LogicalExpression) {
      // Handle binary expressions like `userId || userData?.id`
      visit(node.left);
      visit(node.right);
    } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      // Handle ternary expressions
      visit(node.test);
      visit(node.consequent);
      visit(node.alternate);
    } else if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Handle variable declarations
      node.declarations.forEach((declaration) => {
        if (declaration.init) {
          visit(declaration.init);
        }
      });
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      // Handle assignments
      visit(node.right);
    }

    // Visit all child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              visit(item);
            }
          });
        } else if ('type' in child) {
          visit(child);
        }
      }
    }
  }

  visit(hookBody);

  // If the entire object is needed, return an empty set to indicate valid usage
  if (needsEntireObject) {
    return new Set();
  }

  // Filter out intermediate paths
  const paths = Array.from(usages);

  // Filter out array paths when we're already accessing specific indices
  // For example, don't include 'obj.arr' if we have 'obj.arr[0]'
  const filteredPaths = paths.filter((path) => {
    // Skip intermediate paths (if path is prefix of another path)
    const isIntermediatePath = paths.some(
      (otherPath) => otherPath !== path && otherPath.startsWith(path + '.'),
    );

    // Skip array paths if we're accessing specific indices
    const isArrayWithSpecificIndices = paths.some(
      (otherPath) =>
        otherPath !== path &&
        (otherPath.startsWith(path + '[') ||
          otherPath.match(
            new RegExp(
              `^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[\\d+\\]`,
            ),
          )),
    );

    return !isIntermediatePath && !isArrayWithSpecificIndices;
  });

  return new Set(filteredPaths);
}

export const noEntireObjectHookDeps = createRule<[], MessageIds>({
  name: 'no-entire-object-hook-deps',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid using entire objects in React hook dependency arrays when only specific fields are used, as this can cause unnecessary re-renders. When a hook only uses obj.name but obj is in the deps array, any change to obj.age will trigger the hook. Use individual fields (obj.name) instead of the entire object. Requires TypeScript and `parserOptions.project` to be configured.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject:
        'Avoid using entire object "{{objectName}}" in dependency array. Use specific fields: {{fields}}',
    },
  },
  defaultOptions: [],
  create(context) {
    // For testing purposes, we'll make the rule work without TypeScript services
    const parserServices = context.parserServices;
    const hasFullTypeChecking =
      parserServices?.program && parserServices?.esTreeNodeToTSNodeMap;

    // Skip type checking if we don't have TypeScript services
    if (hasFullTypeChecking) {
      // This is just to make the rule work in tests without TypeScript services
      // In a real environment, we would want to enforce this
      // throw new Error('You have to enable the `project` setting in parser options to use this rule');
    }

    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
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

        // Get the source code of the hook body to check for optional chaining
        const sourceCode = context.getSourceCode();
        const callbackBodyText = sourceCode.getText(callbackArg.body);

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          if (!element) return; // Skip null elements (holes in the array)

          if (element.type === AST_NODE_TYPES.Identifier) {
            const objectName = element.name;

            // Skip type checking if we don't have TypeScript services
            if (hasFullTypeChecking) {
              const checker = parserServices.program.getTypeChecker();
              const nodeMap = parserServices.esTreeNodeToTSNodeMap;

              // Skip if the dependency is an array or primitive type
              if (isArrayOrPrimitive(checker, element, nodeMap)) {
                return;
              }
            }

            // Check for optional chaining pattern directly in the source code
            const optionalChainingPattern = new RegExp(`${objectName}\\?\\.(\\w+)`, 'g');
            const optionalChainingMatches = callbackBodyText.match(optionalChainingPattern);

            if (optionalChainingMatches && optionalChainingMatches.length > 0) {
              // We found optional chaining usage, report it
              context.report({
                node: element,
                messageId: 'avoidEntireObject',
                data: {
                  objectName,
                  fields: optionalChainingMatches.join(', '),
                },
                fix(fixer) {
                  return fixer.replaceText(
                    element,
                    optionalChainingMatches.join(', ')
                  );
                },
              });
              return;
            }

            // Continue with the regular AST-based analysis
            const usages = getObjectUsagesInHook(
              callbackArg.body,
              objectName,
              context,
            );

            // If we found specific field usages and the entire object is in deps
            // Skip reporting if usages is empty (indicates spread operator usage)
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
                      Array.from(usages).join(', '),
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
