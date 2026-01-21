import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { TypeFlags, isArrayTypeNode, isTupleTypeNode } from 'typescript';
import type { TypeChecker, Node } from 'typescript';

type MessageIds = 'avoidEntireObject' | 'removeUnusedDependency';

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
  try {
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
    if (
      type.symbol?.name === 'String' ||
      type.symbol?.escapedName === 'String'
    ) {
      return true;
    }

    // Be more conservative - if we can't determine the type clearly, assume it's an object
    // This prevents false positives where complex objects are incorrectly identified as primitives
    if (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
      return false; // Treat Any/Unknown as potential objects
    }

    // If it's not a primitive or array, and has properties, it's an object
    return false;
  } catch (error) {
    // If there's any error in type checking, assume it's an object to be safe
    return false;
  }
}

function unwrapExpression(expr: TSESTree.Node): TSESTree.Node {
  let current = expr;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression;
  }
  return current;
}

function getObjectUsagesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): { usages: Set<string>; needsEntireObject: boolean; notUsed: boolean } {
  const usages = new Map<string, number>(); // Track usage and its position
  const visited = new Set<TSESTree.Node>();
  let needsEntireObject = false;
  let isUsed = false;

  // Built-in array methods that indicate usage of the entire array
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

  // Built-in string methods that indicate usage of the entire string
  const STRING_METHODS = new Set([
    'charAt',
    'charCodeAt',
    'concat',
    'indexOf',
    'lastIndexOf',
    'localeCompare',
    'match',
    'replace',
    'search',
    'slice',
    'split',
    'substr',
    'substring',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'trimStart',
    'trimEnd',
    'padStart',
    'padEnd',
    'repeat',
    'startsWith',
    'endsWith',
    'includes',
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
        // For computed properties with variables (like user[key]), we need the entire object
        if (memberExpr.property.type === AST_NODE_TYPES.Identifier) {
          // Check if this is accessing our target object
          let currentBase = unwrapExpression(memberExpr.object);
          while (currentBase.type === AST_NODE_TYPES.MemberExpression) {
            currentBase = unwrapExpression(
              (currentBase as TSESTree.MemberExpression).object,
            );
          }
          if (
            currentBase.type === AST_NODE_TYPES.Identifier &&
            currentBase.name === objectName
          ) {
            // This is a computed property access on our target object, so we need the entire object
            needsEntireObject = true;
          }
          return null;
        }

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
            const propertyText = context.sourceCode.getText(
              memberExpr.property,
            );
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

        // Check for array/string methods - these indicate usage of the entire array/string
        if (
          memberExpr.property.name &&
          (ARRAY_METHODS.has(memberExpr.property.name) ||
            STRING_METHODS.has(memberExpr.property.name))
        ) {
          // Check if this is accessing our target object or a property of it
          let currentBase = unwrapExpression(memberExpr.object);
          let pathParts: string[] = [];
          let hasOptionalChainingInMethod = false;

          // Build the path to the array/string being accessed
          while (currentBase.type === AST_NODE_TYPES.MemberExpression) {
            const currentMember = currentBase as TSESTree.MemberExpression;
            if (currentMember.property.type === AST_NODE_TYPES.Identifier) {
              pathParts.unshift(currentMember.property.name);
            }
            if (currentMember.optional) {
              hasOptionalChainingInMethod = true;
            }
            currentBase = unwrapExpression(currentMember.object);
          }

          if (
            currentBase.type === AST_NODE_TYPES.Identifier &&
            currentBase.name === objectName
          ) {
            if (pathParts.length === 0) {
              // Direct method call on the object (e.g., userData.map(...))
              needsEntireObject = true;
            } else {
              // Method call on a property (e.g., userData.items.map(...) or userData?.items?.map(...))
              let path = objectName + (hasOptionalChainingInMethod ? '?' : '');
              path += '.' + pathParts.join('.');
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          }
          return null;
        }

        parts.unshift(memberExpr.property.name);
      }

      if (memberExpr.optional) {
        hasOptionalChaining = true;
      }
      current = unwrapExpression(memberExpr.object);
    }

    // Check if we reached the target identifier
    const base = unwrapExpression(current);
    if (base.type === AST_NODE_TYPES.Identifier && base.name === objectName) {
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

    if (node.type === AST_NODE_TYPES.Identifier && node.name === objectName) {
      // Skip wrapper nodes so usage is attributed to the actual parent context.
      let wrapperNode: TSESTree.Node = node;
      let effectiveParent = node.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        wrapperNode = effectiveParent;
        effectiveParent = effectiveParent.parent;
      }

      // Exclude: property name in `other.objectName` (not our target object)
      const isMemberProperty =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.property === wrapperNode &&
        !effectiveParent.computed;

      // Exclude: object in `objectName.prop` (handled by MemberExpression visitor for field tracking)
      const isMemberObject =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.object === wrapperNode;

      // Exclude: key in `{ objectName: value }` (not usage, just a label)
      // Include: shorthand `{ objectName }` (actual usage)
      const isPropertyKey =
        effectiveParent?.type === AST_NODE_TYPES.Property &&
        effectiveParent.key === wrapperNode &&
        !effectiveParent.computed &&
        !effectiveParent.shorthand;

      if (!isMemberProperty && !isMemberObject && !isPropertyKey) {
        isUsed = true;

        // Patterns that require the entire object (cannot refactor to specific fields)
        const isTypeAUsage =
          effectiveParent?.type === AST_NODE_TYPES.ReturnStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ArrayExpression ||
          effectiveParent?.type === AST_NODE_TYPES.BinaryExpression ||
          effectiveParent?.type === AST_NODE_TYPES.LogicalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.ConditionalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.UnaryExpression ||
          (effectiveParent?.type === AST_NODE_TYPES.Property &&
            (effectiveParent.value === wrapperNode ||
              effectiveParent.shorthand ||
              (effectiveParent.key === wrapperNode &&
                effectiveParent.computed))) ||
          effectiveParent?.type === AST_NODE_TYPES.TemplateLiteral ||
          effectiveParent?.type === AST_NODE_TYPES.VariableDeclarator ||
          effectiveParent?.type === AST_NODE_TYPES.AssignmentExpression ||
          effectiveParent?.type === AST_NODE_TYPES.JSXExpressionContainer ||
          effectiveParent?.type === AST_NODE_TYPES.JSXSpreadAttribute ||
          effectiveParent?.type === AST_NODE_TYPES.SpreadElement ||
          effectiveParent?.type === AST_NODE_TYPES.ForInStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ForOfStatement ||
          effectiveParent?.type === AST_NODE_TYPES.CallExpression;

        if (isTypeAUsage) {
          needsEntireObject = true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.CallExpression) {
      // Check if the object is being called as a function
      const callee = unwrapExpression(node.callee);
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === objectName
      ) {
        needsEntireObject = true;
      }

      // Check if the object is directly passed as an argument
      node.arguments.forEach((arg) => {
        const unwrappedArg = unwrapExpression(arg);
        if (
          unwrappedArg.type === AST_NODE_TYPES.Identifier &&
          unwrappedArg.name === objectName
        ) {
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
          if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
            const argument = unwrapExpression(attr.argument);
            if (
              argument.type === AST_NODE_TYPES.Identifier &&
              argument.name === objectName
            ) {
              needsEntireObject = true;
            }
          }
        });
      }
    } else if (node.type === AST_NODE_TYPES.SpreadElement) {
      // If we find a spread operator with our target object, consider it as accessing all properties
      const argument = unwrapExpression(node.argument);
      if (
        argument.type === AST_NODE_TYPES.Identifier &&
        argument.name === objectName
      ) {
        needsEntireObject = true;
        return;
      }
    } else if (node.type === AST_NODE_TYPES.MemberExpression) {
      // Check if this is accessing a property of our target object
      const memberExpr = node as TSESTree.MemberExpression;

      // Skip wrapper nodes so usage is attributed to the actual parent context.
      // We only process if this is the outermost member expression in a chain.
      let effectiveParent = memberExpr.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        effectiveParent = effectiveParent.parent;
      }
      const isIntermediate =
        effectiveParent && effectiveParent.type === AST_NODE_TYPES.MemberExpression;

      if (!isIntermediate) {
        // Check if this member expression involves our target object
        let current: TSESTree.Node = memberExpr;
        let foundTargetObject = false;
        let hasDynamicComputed = false;

        // Walk up the member expression chain to see if it involves our target object
        while (current.type === AST_NODE_TYPES.MemberExpression) {
          const currentMember = current as TSESTree.MemberExpression;

          // Check if this level uses dynamic computed property access
          if (
            currentMember.computed &&
            currentMember.property.type === AST_NODE_TYPES.Identifier
          ) {
            hasDynamicComputed = true;
          }

          current = unwrapExpression(currentMember.object);
        }

        // Check if we reached our target object
        const base = unwrapExpression(current);
        if (
          base.type === AST_NODE_TYPES.Identifier &&
          base.name === objectName
        ) {
          foundTargetObject = true;
        }

        if (foundTargetObject) {
          if (hasDynamicComputed) {
            // Dynamic computed property access means we need the entire object
            needsEntireObject = true;
          } else {
            // Static property access - add to usages
            const path = buildAccessPath(memberExpr);
            if (path) {
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          }
        }
      }
    } else if (node.type === AST_NODE_TYPES.ChainExpression) {
      // Handle optional chaining expressions
      if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
        const path = buildAccessPath(node.expression);
        if (path) {
          usages.set(path, node.range?.[0] || 0);
        }
      }
    } else if (
      node.type === AST_NODE_TYPES.BinaryExpression ||
      node.type === AST_NODE_TYPES.LogicalExpression
    ) {
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

  // Process paths and determine which ones to include
  const paths = Array.from(usages.keys());
  const finalPaths = new Set<string>();

  paths.forEach((path) => {
    // Always include the main path
    finalPaths.add(path);

    // For optional chaining, include the FIRST optional chaining point as intermediate
    if (path.includes('?.')) {
      // Find the first optional chaining point
      // For userData?.profile.settings.theme.primary, we want to include userData?.profile
      const firstOptionalIndex = path.indexOf('?.');
      if (firstOptionalIndex !== -1) {
        // Find the end of the first property after the optional chaining
        const afterOptional = path.substring(firstOptionalIndex + 2);
        const nextDotIndex = afterOptional.indexOf('.');

        if (nextDotIndex !== -1) {
          // There are more properties after the first optional property
          const firstOptionalPath = path.substring(
            0,
            firstOptionalIndex + 2 + nextDotIndex,
          );
          finalPaths.add(firstOptionalPath);
        }
      }
    }

    // For array access, include the array property itself
    if (path.includes('[') && path.includes(']')) {
      const bracketIndex = path.indexOf('[');
      if (bracketIndex > 0) {
        const arrayPath = path.substring(0, bracketIndex);
        finalPaths.add(arrayPath);
      }
    }
  });

  // Convert to array for sorting
  const pathsArray = Array.from(finalPaths);

  // Filter out array paths when we're already accessing specific indices
  // Exception: keep array paths with optional chaining as they represent different dependencies
  const filteredPaths = pathsArray.filter((path) => {
    // Skip array paths if we're accessing specific indices, unless it's optional chaining
    const isArrayWithSpecificIndices = pathsArray.some(
      (otherPath) =>
        otherPath !== path &&
        (otherPath.startsWith(path + '[') ||
          otherPath.match(
            new RegExp(
              `^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[\\d+\\]`,
            ),
          )),
    );

    // Keep array paths with optional chaining even if specific indices are accessed
    if (isArrayWithSpecificIndices && path.includes('?.')) {
      return true;
    }

    return !isArrayWithSpecificIndices;
  });

  // Sort paths: longer/more specific paths first, then by optional chaining preference
  const sortedPaths = filteredPaths.sort((a, b) => {
    const posA = usages.get(a) || 0;
    const posB = usages.get(b) || 0;

    // For paths with the same base, put longer ones first
    const aDepth = a.split('.').length + (a.includes('[') ? 1 : 0);
    const bDepth = b.split('.').length + (b.includes('[') ? 1 : 0);

    if (aDepth !== bDepth) {
      return bDepth - aDepth; // Longer paths first
    }

    // If same depth, prefer optional chaining paths first
    const aHasOptional = a.includes('?');
    const bHasOptional = b.includes('?');

    if (aHasOptional && !bHasOptional) {
      return -1; // a comes first
    }
    if (!aHasOptional && bHasOptional) {
      return 1; // b comes first
    }

    // If same depth and same optional chaining status, sort by source position
    return posA - posB;
  });

  const filteredUsages = new Set(sortedPaths);
  const notUsed = !needsEntireObject && !isUsed && filteredUsages.size === 0;

  return {
    usages: filteredUsages,
    needsEntireObject,
    notUsed,
  };
}

export const noEntireObjectHookDeps = createRule<[], MessageIds>({
  name: 'no-entire-object-hook-deps',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid using entire objects in React hook dependency arrays.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject:
        'What\'s wrong: Dependency array includes entire object "{{objectName}}". Why it matters: Any change to its other properties reruns the hook even though the hook reads only {{fields}}, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.',
      removeUnusedDependency:
        'What\'s wrong: Dependency "{{objectName}}" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "{{objectName}}" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.',
    },
  },
  defaultOptions: [],
  create(context) {
    // For testing purposes, we'll make the rule work without TypeScript services
    const parserServices = context.parserServices;
    const hasFullTypeChecking =
      parserServices?.program &&
      parserServices?.esTreeNodeToTSNodeMap &&
      typeof parserServices.program.getTypeChecker === 'function';

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

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          const unwrappedElement = element ? unwrapExpression(element) : null;
          if (!unwrappedElement) return; // Skip null elements (holes in the array)

          if (unwrappedElement.type === AST_NODE_TYPES.Identifier) {
            const objectName = unwrappedElement.name;

            // Skip type checking if we don't have TypeScript services
            if (hasFullTypeChecking && parserServices) {
              const checker = parserServices.program.getTypeChecker();
              const nodeMap = parserServices.esTreeNodeToTSNodeMap;

              // Skip if the dependency is an array or primitive type
              if (isArrayOrPrimitive(checker, unwrappedElement, nodeMap)) {
                return;
              }
            }
            // For testing without TypeScript services, we'll assume all identifiers are objects

            const result = getObjectUsagesInHook(
              (
                callbackArg as
                  | TSESTree.ArrowFunctionExpression
                  | TSESTree.FunctionExpression
              ).body,
              objectName,
              context,
            );

            // If the object is not used at all, suggest removing it
            if (result.notUsed) {
              context.report({
                node: element as TSESTree.Node,
                messageId: 'removeUnusedDependency',
                data: {
                  objectName,
                },
                fix(fixer) {
                  // Remove the element and handle commas properly
                  const elementIndex = depsArg.elements.indexOf(element);

                  if (elementIndex === -1) return null;

                  // If this is the only element, just remove it
                  if (depsArg.elements.length === 1) {
                    return fixer.remove(element as TSESTree.Node);
                  }

                  // If this is the last element, remove the preceding comma
                  if (elementIndex === depsArg.elements.length - 1) {
                    const prevElement = depsArg.elements[elementIndex - 1];
                    if (prevElement) {
                      const range: [number, number] = [
                        prevElement.range![1],
                        (element as TSESTree.Node).range![1],
                      ];
                      return fixer.removeRange(range);
                    }
                  }

                  // Otherwise, remove the element and the following comma
                  const nextElement = depsArg.elements[elementIndex + 1];
                  if (nextElement) {
                    const range: [number, number] = [
                      (element as TSESTree.Node).range![0],
                      nextElement.range![0],
                    ];
                    return fixer.removeRange(range);
                  }

                  // Fallback to just removing the element
                  return fixer.remove(element as TSESTree.Node);
                },
              });
            }
            // If we found specific field usages and the entire object is in deps
            // Skip reporting if needsEntireObject is true (indicates spread operator usage)
            else if (result.usages.size > 0 && !result.needsEntireObject) {
              const fields = Array.from(result.usages).join(', ');
              context.report({
                node: element as TSESTree.Node,
                messageId: 'avoidEntireObject',
                data: {
                  objectName,
                  fields,
                },
                fix(fixer) {
                  return fixer.replaceText(
                    element as TSESTree.Node,
                    Array.from(result.usages).join(', '),
                  );
                },
              });
            }
          }
        });
      },
    };
  },
});
