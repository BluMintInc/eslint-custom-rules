import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceEarlyDestructuring';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

/**
 * Finds all object destructuring patterns inside a hook callback body
 */
function findDestructuringInHook(
  hookBody: TSESTree.Node,
  context: any,
): Map<string, { pattern: TSESTree.ObjectPattern; isConditional: boolean }[]> {
  const destructuringMap = new Map<string, { pattern: TSESTree.ObjectPattern; isConditional: boolean }[]>();
  const visited = new Set<TSESTree.Node>();

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    // Check for variable declarations with object destructuring
    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of node.declarations) {
        if (
          declarator.id.type === AST_NODE_TYPES.ObjectPattern &&
          declarator.init
        ) {
          // Check if this destructuring is inside a conditional
          const isInConditional = isInsideConditional(declarator);

          // If the init is an identifier, track it
          if (declarator.init.type === AST_NODE_TYPES.Identifier) {
            const objectName = declarator.init.name;
            if (!destructuringMap.has(objectName)) {
              destructuringMap.set(objectName, []);
            }
            destructuringMap.get(objectName)?.push({
              pattern: declarator.id,
              isConditional: isInConditional
            });
          }
          // If the init is a member expression, track the object
          else if (declarator.init.type === AST_NODE_TYPES.MemberExpression) {
            let current: TSESTree.Node = declarator.init;
            let path = '';

            // Build the full path (e.g., obj.prop.subprop)
            while (current.type === AST_NODE_TYPES.MemberExpression) {
              const prop = current.property;
              const propName = prop.type === AST_NODE_TYPES.Identifier
                ? prop.name
                : context.getSourceCode().getText(prop);

              path = path ? `${propName}.${path}` : propName;
              current = current.object;
            }

            if (current.type === AST_NODE_TYPES.Identifier) {
              const objectName = current.name;
              const fullPath = path ? `${objectName}.${path}` : objectName;

              if (!destructuringMap.has(fullPath)) {
                destructuringMap.set(fullPath, []);
              }
              destructuringMap.get(fullPath)?.push({
                pattern: declarator.id,
                isConditional: isInConditional
              });
            }
          }
          // Handle logical expressions like obj || {}
          else if (declarator.init.type === AST_NODE_TYPES.LogicalExpression) {
            if (declarator.init.left.type === AST_NODE_TYPES.Identifier) {
              const objectName = declarator.init.left.name;
              if (!destructuringMap.has(objectName)) {
                destructuringMap.set(objectName, []);
              }
              destructuringMap.get(objectName)?.push({
                pattern: declarator.id,
                isConditional: true // Treat logical expressions as conditional
              });
            }
          }
        }
      }
    }

    // Visit all child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

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
  return destructuringMap;
}

/**
 * Extracts all property accesses from an object in a hook body
 */
function findObjectPropertiesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
): Set<string> {
  const propertyAccesses = new Set<string>();
  const visited = new Set<TSESTree.Node>();

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    // Check for member expressions accessing the target object
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      if (
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === objectName &&
        node.property.type === AST_NODE_TYPES.Identifier
      ) {
        propertyAccesses.add(node.property.name);
      }
      // Handle optional chaining
      else if (
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === objectName &&
        node.optional
      ) {
        if (node.property.type === AST_NODE_TYPES.Identifier) {
          propertyAccesses.add(`${objectName}?.${node.property.name}`);
        }
      }
    }

    // Visit all child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

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
  return propertyAccesses;
}

/**
 * Checks if a node is inside an async function
 */
function isInsideAsyncFunction(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current && current.parent) {
    if (
      (current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        current.type === AST_NODE_TYPES.FunctionExpression ||
        current.type === AST_NODE_TYPES.FunctionDeclaration) &&
      current.async
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

/**
 * Checks if a node is inside a conditional block
 */
function isInsideConditional(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current && current.parent) {
    if (
      current.parent.type === AST_NODE_TYPES.IfStatement ||
      current.parent.type === AST_NODE_TYPES.ConditionalExpression ||
      current.parent.type === AST_NODE_TYPES.SwitchStatement ||
      current.parent.type === AST_NODE_TYPES.LogicalExpression
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

/**
 * Gets the properties from an object pattern
 */
function getPropertiesFromPattern(
  pattern: TSESTree.ObjectPattern,
  context: any,
): string[] {
  const properties: string[] = [];

  for (const prop of pattern.properties) {
    if (prop.type === AST_NODE_TYPES.Property) {
      if (prop.key.type === AST_NODE_TYPES.Identifier) {
        properties.push(prop.key.name);
      } else {
        // For computed properties, use the source text
        properties.push(context.getSourceCode().getText(prop.key));
      }
    } else if (prop.type === AST_NODE_TYPES.RestElement) {
      // For rest elements, we can't determine specific properties
      return [];
    }
  }

  return properties;
}

export const enforceEarlyDestructuring = createRule<[], MessageIds>({
  name: 'enforce-early-destructuring',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce early destructuring of objects, especially in React hooks, to prevent unnecessary re-renders and improve code maintainability',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceEarlyDestructuring:
        'Move object destructuring outside the hook to prevent unnecessary re-renders. Update dependency array to include specific fields: {{fields}}',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
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

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        // Find destructuring inside the hook
        const destructuringMap = findDestructuringInHook(callbackArg.body, context);

        // Skip if no destructuring found
        if (destructuringMap.size === 0) {
          return;
        }

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          if (!element) return; // Skip null elements (holes in the array)

          if (element.type === AST_NODE_TYPES.Identifier) {
            const objectName = element.name;

            // Skip if no destructuring for this object
            if (!destructuringMap.has(objectName)) {
              return;
            }

            // Get all destructuring patterns for this object
            const patternInfos = destructuringMap.get(objectName) || [];

            // Skip if all destructuring is inside conditionals or async functions
            const hasNonConditionalDestructuring = patternInfos.some(
              ({ isConditional, pattern }) =>
                !isConditional && !isInsideAsyncFunction(pattern)
            );

            if (!hasNonConditionalDestructuring) {
              return;
            }

            // Get all properties accessed from this object
            const propertyAccesses = findObjectPropertiesInHook(
              callbackArg.body,
              objectName,
            );

            // Get all properties from destructuring patterns (include all properties, even from conditional destructuring)
            const destructuredProps = patternInfos
              .flatMap(({ pattern }) => getPropertiesFromPattern(pattern, context));

            // If we have destructuring and property accesses, report the issue
            if (destructuredProps.length > 0 || propertyAccesses.size > 0) {
              // Combine all properties for the dependency array
              const allProps = new Set([
                ...Array.from(propertyAccesses),
                ...destructuredProps,
              ]);

              // Skip if no properties found (might be using spread operator)
              if (allProps.size === 0) {
                return;
              }

              const fields = Array.from(allProps).join(', ');

              context.report({
                node: element,
                messageId: 'enforceEarlyDestructuring',
                data: {
                  fields,
                },
                fix(fixer) {
                  // Just update the dependency array
                  return fixer.replaceText(element, fields);
                },
              });
            }
          }
        });
      },
    };
  },
});


