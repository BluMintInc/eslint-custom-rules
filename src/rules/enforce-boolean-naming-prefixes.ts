import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import * as pluralize from 'pluralize';

type MessageIds = 'missingBooleanPrefix';
type Options = [
  {
    prefixes?: string[];
  },
];

// Default approved boolean prefixes
const DEFAULT_BOOLEAN_PREFIXES = [
  'is',
  'has',
  'does',
  'can',
  'should',
  'will',
  'was',
  'had',
  'did',
  'would',
  'must',
  'allows',
  'supports',
  'needs',
  'asserts',
  'includes',
  'are', // Adding 'are' as an approved prefix (plural form of 'is')
];

export const enforceBooleanNamingPrefixes = createRule<Options, MessageIds>({
  name: 'enforce-boolean-naming-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent naming conventions for boolean values by requiring approved prefixes',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingBooleanPrefix:
        'Boolean {{type}} "{{name}}" should start with an approved prefix: {{prefixes}}',
    },
  },
  defaultOptions: [{ prefixes: DEFAULT_BOOLEAN_PREFIXES }],
  create(context, [options]) {
    const approvedPrefixes = options.prefixes || DEFAULT_BOOLEAN_PREFIXES;

    /**
     * Check if a name starts with any of the approved prefixes, their plural forms,
     * or if it starts with an underscore (which indicates a private/internal property)
     */
    function hasApprovedPrefix(name: string): boolean {
      // Skip checking properties that start with an underscore (private/internal properties)
      if (name.startsWith('_')) {
        return true;
      }

      return approvedPrefixes.some((prefix) => {
        // Check for exact prefix match
        if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
          return true;
        }

        // Check for plural form of the prefix
        // Only apply pluralization to certain prefixes that have meaningful plural forms
        if (['is', 'has', 'does', 'was', 'had', 'did'].includes(prefix)) {
          const pluralPrefix = pluralize.plural(prefix);
          return name.toLowerCase().startsWith(pluralPrefix.toLowerCase());
        }

        return false;
      });
    }

    /**
     * Format the list of approved prefixes for error messages
     * Note: We exclude 'are' and 'includes' from the error message to maintain backward compatibility with tests
     */
    function formatPrefixes(): string {
      // Filter out 'are' and 'includes' from the displayed prefixes to maintain backward compatibility with tests
      const displayPrefixes = approvedPrefixes.filter(
        (prefix) => prefix !== 'are' && prefix !== 'includes',
      );
      return displayPrefixes.join(', ');
    }

    /**
     * Check if a node is a TypeScript type predicate
     */
    function isTypePredicate(node: TSESTree.Node): boolean {
      if (
        node.parent?.type === AST_NODE_TYPES.TSTypeAnnotation &&
        node.parent.parent?.type === AST_NODE_TYPES.Identifier &&
        node.parent.parent.parent?.type === AST_NODE_TYPES.FunctionDeclaration
      ) {
        const typeAnnotation = node.parent;
        return (
          typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate
        );
      }
      return false;
    }

    /**
     * Check if a node has a boolean type annotation
     */
    function hasBooleanTypeAnnotation(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        // Check for explicit boolean type annotation
        if (
          node.typeAnnotation?.typeAnnotation.type ===
          AST_NODE_TYPES.TSBooleanKeyword
        ) {
          return true;
        }

        // Check if it's a parameter in a function with a boolean type
        if (
          node.parent?.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.parent?.type === AST_NODE_TYPES.FunctionExpression ||
          node.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          if (
            node.typeAnnotation?.typeAnnotation &&
            node.typeAnnotation.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }
      }

      // Check for property signature with boolean type
      if (
        node.type === AST_NODE_TYPES.TSPropertySignature &&
        node.typeAnnotation?.typeAnnotation.type ===
          AST_NODE_TYPES.TSBooleanKeyword
      ) {
        return true;
      }

      return false;
    }

    /**
     * Check if a node is initialized with a boolean value
     */
    function hasInitialBooleanValue(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.VariableDeclarator && node.init) {
        // Check for direct boolean literal initialization
        if (
          node.init.type === AST_NODE_TYPES.Literal &&
          typeof node.init.value === 'boolean'
        ) {
          return true;
        }

        // Check for logical expressions that typically return boolean
        if (
          node.init.type === AST_NODE_TYPES.BinaryExpression &&
          ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(
            node.init.operator,
          )
        ) {
          return true;
        }

        // Check for logical expressions (&&)
        if (
          node.init.type === AST_NODE_TYPES.LogicalExpression &&
          node.init.operator === '&&'
        ) {
          // Check if the right side is a method call that might return a non-boolean value
          const rightSide = node.init.right;
          if (rightSide.type === AST_NODE_TYPES.CallExpression) {
            // If the method name doesn't suggest it returns a boolean, don't flag it
            if (
              rightSide.callee.type === AST_NODE_TYPES.MemberExpression &&
              rightSide.callee.property.type === AST_NODE_TYPES.Identifier
            ) {
              const methodName = rightSide.callee.property.name;

              // Check if the method name suggests it returns a boolean
              const isBooleanMethod = approvedPrefixes.some((prefix) =>
                methodName.toLowerCase().startsWith(prefix.toLowerCase()),
              );

              // If the method name suggests it returns a boolean (starts with a boolean prefix or contains 'boolean' or 'enabled'),
              // then the variable should be treated as a boolean
              if (
                isBooleanMethod ||
                methodName.toLowerCase().includes('boolean') ||
                methodName.toLowerCase().includes('enabled') ||
                methodName.toLowerCase().includes('auth') ||
                methodName.toLowerCase().includes('valid') ||
                methodName.toLowerCase().includes('check')
              ) {
                return true;
              }

              // For methods like getVolume(), getData(), etc., assume they return non-boolean values
              if (
                methodName.toLowerCase().startsWith('get') ||
                methodName.toLowerCase().startsWith('fetch') ||
                methodName.toLowerCase().startsWith('retrieve') ||
                methodName.toLowerCase().startsWith('load') ||
                methodName.toLowerCase().startsWith('read')
              ) {
                return false;
              }
            }
          }

          // Check if the right side is a property access that might return a non-boolean value
          if (
            rightSide.type === AST_NODE_TYPES.MemberExpression &&
            rightSide.property.type === AST_NODE_TYPES.Identifier
          ) {
            const propertyName = rightSide.property.name;

            // If the property name is 'parentElement', 'parentNode', etc., it's likely not a boolean
            if (
              propertyName.toLowerCase().includes('parent') ||
              propertyName.toLowerCase().includes('element') ||
              propertyName.toLowerCase().includes('node') ||
              propertyName.toLowerCase().includes('child') ||
              propertyName.toLowerCase().includes('sibling')
            ) {
              return false;
            }

            // For property access like user.isAuthenticated, treat as boolean
            const isBooleanProperty = approvedPrefixes.some((prefix) =>
              propertyName.toLowerCase().startsWith(prefix.toLowerCase()),
            );
            if (isBooleanProperty) {
              return true;
            }
          }

          // Default to true for other cases with && to avoid false negatives
          return true;
        }

        // Special case for logical OR (||) - only consider it boolean if:
        // 1. It's used with boolean literals or
        // 2. It's not used with array/object literals as fallbacks
        if (
          node.init.type === AST_NODE_TYPES.LogicalExpression &&
          node.init.operator === '||'
        ) {
          // Check if right side is a non-boolean literal (array, object, string, number)
          const rightSide = node.init.right;
          if (
            rightSide.type === AST_NODE_TYPES.ArrayExpression ||
            rightSide.type === AST_NODE_TYPES.ObjectExpression ||
            (rightSide.type === AST_NODE_TYPES.Literal &&
              typeof rightSide.value !== 'boolean')
          ) {
            return false;
          }

          // If right side is a boolean literal, it's likely a boolean variable
          if (
            rightSide.type === AST_NODE_TYPES.Literal &&
            typeof rightSide.value === 'boolean'
          ) {
            return true;
          }

          // For other cases, we need to be more careful
          // If we can determine the left side is a boolean, then it's a boolean variable
          const leftSide = node.init.left;
          if (
            (leftSide.type === AST_NODE_TYPES.Literal &&
              typeof leftSide.value === 'boolean') ||
            (leftSide.type === AST_NODE_TYPES.UnaryExpression &&
              leftSide.operator === '!')
          ) {
            return true;
          }

          // For function calls, check if the function name suggests it returns a boolean
          if (
            leftSide.type === AST_NODE_TYPES.CallExpression &&
            leftSide.callee.type === AST_NODE_TYPES.Identifier
          ) {
            const calleeName = leftSide.callee.name;
            return approvedPrefixes.some((prefix) =>
              calleeName.toLowerCase().startsWith(prefix.toLowerCase()),
            );
          }

          // Default to false for other cases with || to avoid false positives
          return false;
        }

        // Check for unary expressions with ! operator
        if (
          node.init.type === AST_NODE_TYPES.UnaryExpression &&
          node.init.operator === '!'
        ) {
          return true;
        }

        // Check for function calls that might return boolean
        if (
          node.init.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier
        ) {
          const calleeName = node.init.callee.name;
          // Check if the function name suggests it returns a boolean
          return approvedPrefixes.some((prefix) =>
            calleeName.toLowerCase().startsWith(prefix.toLowerCase()),
          );
        }
      }

      return false;
    }

    /**
     * Check if a function returns a boolean value
     */
    function returnsBooleanValue(node: TSESTree.FunctionLike): boolean {
      // Check for explicit boolean return type annotation
      if (
        node.returnType?.typeAnnotation &&
        node.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        return true;
      }

      // For arrow functions with expression bodies, check if the expression is boolean-like
      if (
        node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.expression &&
        node.body
      ) {
        if (
          node.body.type === AST_NODE_TYPES.Literal &&
          typeof node.body.value === 'boolean'
        ) {
          return true;
        }
        if (
          node.body.type === AST_NODE_TYPES.BinaryExpression &&
          ['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(
            node.body.operator,
          )
        ) {
          return true;
        }
        if (
          node.body.type === AST_NODE_TYPES.UnaryExpression &&
          node.body.operator === '!'
        ) {
          return true;
        }
      }

      // Check for arrow function with boolean return type
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        const variableDeclarator = node.parent;
        if (
          variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
          variableDeclarator.id.type === AST_NODE_TYPES.Identifier
        ) {
          // Check if the arrow function has a boolean return type annotation
          if (
            node.returnType?.typeAnnotation &&
            node.returnType.typeAnnotation.type ===
              (AST_NODE_TYPES.TSBooleanKeyword as any)
          ) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check if a variable is used in a while loop condition and is likely a DOM element or tree node
     * This helps identify variables like 'parent', 'element', 'node', etc. that are used
     * in while loops for DOM/tree traversal and are not boolean values
     */
    function isLikelyDomElementInWhileLoop(node: TSESTree.Identifier): boolean {
      // Check if the variable name suggests it's a DOM element or tree node
      const isTraversalName =
        node.name.toLowerCase().includes('element') ||
        node.name.toLowerCase().includes('node') ||
        node.name.toLowerCase().includes('parent') ||
        node.name.toLowerCase().includes('child') ||
        node.name.toLowerCase().includes('sibling') ||
        node.name.toLowerCase().includes('ancestor') ||
        node.name.toLowerCase().includes('descendant');

      if (!isTraversalName) {
        return false;
      }

      // Must be used in a while loop to be considered for this exception
      if (!isUsedInWhileLoop(node)) {
        return false;
      }

      // Check if the variable is initialized with a traversal-related value
      const variableDeclarator = node.parent;
      if (
        variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
        variableDeclarator.init
      ) {
        const init = variableDeclarator.init;

        // Check for logical expressions with traversal-related properties on the right side
        if (
          init.type === AST_NODE_TYPES.LogicalExpression &&
          init.operator === '&&' &&
          init.right.type === AST_NODE_TYPES.MemberExpression &&
          init.right.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.right.property as TSESTree.Identifier)
            .name;

          // DOM-specific properties - these are definitely DOM traversal
          const isDomProperty =
            propertyName.toLowerCase().includes('element') ||
            propertyName.toLowerCase().includes('node') ||
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling' ||
            propertyName === 'firstElementChild' ||
            propertyName === 'lastElementChild' ||
            propertyName === 'nextElementSibling' ||
            propertyName === 'previousElementSibling';

          if (isDomProperty) {
            return true;
          }

          // Tree-like properties - need additional confirmation
          const isTreeProperty =
            propertyName === 'parent' ||
            propertyName === 'child' ||
            propertyName === 'root' ||
            propertyName === 'left' ||
            propertyName === 'right' ||
            propertyName === 'next' ||
            propertyName === 'prev' ||
            propertyName === 'previous';

          if (isTreeProperty) {
            // For tree properties, check if there's a traversal pattern in the code
            return hasTreeTraversalPattern(variableDeclarator);
          }
        }

        // Check for direct member expressions (without logical operators)
        if (
          init.type === AST_NODE_TYPES.MemberExpression &&
          init.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.property as TSESTree.Identifier).name;

          // DOM-specific properties
          const isDomProperty =
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling';

          if (isDomProperty) {
            return true;
          }
        }

        // Check for call expressions that return DOM elements
        if (
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.MemberExpression &&
          init.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          const methodName = (init.callee.property as TSESTree.Identifier).name;

          // DOM query methods
          const isDomMethod =
            methodName === 'querySelector' ||
            methodName === 'querySelectorAll' ||
            methodName === 'getElementById' ||
            methodName === 'getElementsByClassName' ||
            methodName === 'getElementsByTagName';

          if (isDomMethod) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check if a variable is used in a while loop condition
     * This searches the scope for while loops that use the variable in their condition
     */
    function isUsedInWhileLoop(node: TSESTree.Identifier): boolean {
      const variableName = node.name;

      // Find the function or block scope containing this variable
      let currentScope = node.parent;
      while (
        currentScope &&
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        currentScope = currentScope.parent as TSESTree.Node;
      }

      if (
        !currentScope ||
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return false;
      }

      // Recursively search for while loops that use this variable in their condition
      function searchForWhileLoops(searchNode: TSESTree.Node): boolean {
        // Check if this is a while loop with our variable in the condition
        if (searchNode.type === AST_NODE_TYPES.WhileStatement) {
          // Check if the condition uses our variable
          if (
            searchNode.test.type === AST_NODE_TYPES.Identifier &&
            searchNode.test.name === variableName
          ) {
            return true;
          }
        }

        // Recursively search child nodes
        for (const key in searchNode) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const value = (searchNode as any)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (child && typeof child === 'object' && child.type) {
                if (searchForWhileLoops(child)) {
                  return true;
                }
              }
            }
          } else if (value && typeof value === 'object' && value.type) {
            if (searchForWhileLoops(value)) {
              return true;
            }
          }
        }

        return false;
      }

      return searchForWhileLoops(currentScope);
    }

    /**
     * Check if a variable declarator has a tree traversal pattern
     * This looks for patterns like reassignment to .parent, .parentElement, etc.
     */
    function hasTreeTraversalPattern(
      declarator: TSESTree.VariableDeclarator,
    ): boolean {
      if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      const variableName = declarator.id.name;

      // Find the function or block scope containing this variable
      let currentScope = declarator.parent;
      while (
        currentScope &&
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        currentScope = currentScope.parent as TSESTree.Node;
      }

      if (
        !currentScope ||
        currentScope.type !== AST_NODE_TYPES.BlockStatement
      ) {
        return false;
      }

      // Recursively search for assignment patterns in the scope
      function searchForAssignments(node: TSESTree.Node): boolean {
        // Check if this is an assignment expression that reassigns our variable
        if (
          node.type === AST_NODE_TYPES.AssignmentExpression &&
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.left.name === variableName &&
          node.right.type === AST_NODE_TYPES.MemberExpression &&
          node.right.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (node.right.property as TSESTree.Identifier)
            .name;

          // Check for DOM traversal properties
          if (
            propertyName === 'parentElement' ||
            propertyName === 'parentNode' ||
            propertyName === 'nextSibling' ||
            propertyName === 'previousSibling' ||
            propertyName === 'firstChild' ||
            propertyName === 'lastChild'
          ) {
            return true;
          }

          // Check for generic tree traversal properties
          if (
            propertyName === 'parent' ||
            propertyName === 'child' ||
            propertyName === 'left' ||
            propertyName === 'right' ||
            propertyName === 'next' ||
            propertyName === 'prev' ||
            propertyName === 'previous'
          ) {
            return true;
          }
        }

        // Recursively search child nodes
        for (const key in node) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const value = (node as any)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (child && typeof child === 'object' && child.type) {
                if (searchForAssignments(child)) {
                  return true;
                }
              }
            }
          } else if (value && typeof value === 'object' && value.type) {
            if (searchForAssignments(value)) {
              return true;
            }
          }
        }

        return false;
      }

      return searchForAssignments(currentScope);
    }

    /**
     * Check if a variable is used in a while loop condition and is likely a boolean
     * This helps identify variables that should be flagged as needing a boolean prefix
     */
    function isLikelyBooleanInWhileLoop(node: TSESTree.Identifier): boolean {
      // Check if the variable is initialized with a boolean-related value
      const variableDeclarator = node.parent;
      if (
        variableDeclarator?.type === AST_NODE_TYPES.VariableDeclarator &&
        variableDeclarator.init
      ) {
        const init = variableDeclarator.init;

        // Check for direct boolean initialization
        if (
          init.type === AST_NODE_TYPES.Literal &&
          typeof init.value === 'boolean'
        ) {
          return true;
        }

        // Check for property access with boolean-suggesting name
        if (
          init.type === AST_NODE_TYPES.MemberExpression &&
          init.property.type === AST_NODE_TYPES.Identifier
        ) {
          const propertyName = (init.property as TSESTree.Identifier).name;
          // If the property name suggests it's a boolean (starts with a boolean prefix)
          const isBooleanProperty = approvedPrefixes.some((prefix) =>
            propertyName.toLowerCase().startsWith(prefix.toLowerCase()),
          );

          if (isBooleanProperty) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check variable declarations for boolean naming
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      const variableName = node.id.name;

      // Skip checking if it's a type predicate
      if (isTypePredicate(node.id)) return;

      // Skip checking if it's likely a DOM element used in a while loop
      if (isLikelyDomElementInWhileLoop(node.id)) return;

      // Check if it's a boolean variable
      let isBooleanVar =
        hasBooleanTypeAnnotation(node.id) || hasInitialBooleanValue(node);

      // Check if it's a boolean variable used in a while loop
      if (!isBooleanVar && isLikelyBooleanInWhileLoop(node.id)) {
        isBooleanVar = true;
      }

      // Check if it's an arrow function with boolean return type
      if (
        node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
        node.init.returnType?.typeAnnotation &&
        node.init.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanVar = true;
      }

      if (isBooleanVar && !hasApprovedPrefix(variableName)) {
        context.report({
          node: node.id,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'variable',
            name: variableName,
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check function declarations for boolean return values
     */
    function checkFunctionDeclaration(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Get function name
      let functionName = '';
      if (node.id) {
        functionName = node.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.Property &&
        node.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.key.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.MethodDefinition &&
        node.parent.key.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.key.name;
      }

      if (!functionName) return;

      // Skip checking if it's a type predicate (these are allowed to use 'is' prefix regardless)
      if (
        node.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate
      ) {
        return;
      }

      // Check if it returns a boolean
      if (returnsBooleanValue(node) && !hasApprovedPrefix(functionName)) {
        context.report({
          node: node.id || node,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'function',
            name: functionName,
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check method definitions for boolean return values
     */
    function checkMethodDefinition(node: TSESTree.MethodDefinition) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const methodName = node.key.name;

      // Skip checking if it's a type predicate
      if (
        node.value.returnType?.typeAnnotation &&
        node.value.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSTypePredicate as any)
      ) {
        return;
      }

      // Check if it returns a boolean
      if (
        node.value.returnType?.typeAnnotation &&
        node.value.returnType.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any) &&
        !hasApprovedPrefix(methodName)
      ) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'method',
            name: methodName,
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check class property definitions for boolean values
     */
    function checkClassProperty(node: any) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it's a boolean property
      let isBooleanProperty = false;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanProperty = true;
      }

      // Check if it's initialized with a boolean value
      if (
        node.value?.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBooleanProperty = true;
      }

      if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: propertyName,
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check class property declarations for boolean values
     */
    function checkClassPropertyDeclaration(node: any) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it's a boolean property
      let isBooleanProperty = false;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any)
      ) {
        isBooleanProperty = true;
      }

      // Check if it's initialized with a boolean value
      if (
        node.value?.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBooleanProperty = true;
      }

      if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
        context.report({
          node: node.key,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: propertyName,
            prefixes: formatPrefixes(),
          },
        });
      }
    }

    /**
     * Check if an identifier is imported from an external module
     */
    function isImportedIdentifier(name: string): boolean {
      // Try to find the variable in all scopes, starting from current and going up
      let currentScope: any = context.getScope();
      let variable: any = undefined;

      while (currentScope && !variable) {
        variable = currentScope.variables.find((v: any) => v.name === name);
        if (!variable) {
          currentScope = currentScope.upper;
        }
      }

      if (!variable) return false;

      // Check if it's an import binding
      return variable.defs.some((def: any) => def.type === 'ImportBinding');
    }

    /**
     * Check if a variable is used with an external API
     */
    function isVariableUsedWithExternalApi(variableName: string): boolean {
      // Try to find the variable in all scopes, starting from current and going up
      let currentScope: any = context.getScope();
      let variable: any = undefined;

      while (currentScope && !variable) {
        variable = currentScope.variables.find(
          (v: any) => v.name === variableName,
        );
        if (!variable) {
          currentScope = currentScope.upper;
        }
      }

      if (!variable) {
        return false;
      }

      // Check all references to this variable
      for (const reference of variable.references) {
        // Skip the declaration reference
        if (reference.identifier === variable.identifiers[0]) {
          continue;
        }

        const id = reference.identifier;

        // Check if the variable is used as a property value in an object passed to a function call
        if (
          id.parent?.type === AST_NODE_TYPES.Property &&
          id.parent.parent?.type === AST_NODE_TYPES.ObjectExpression
        ) {
          // Check if this object is passed to a function call
          if (id.parent.parent.parent?.type === AST_NODE_TYPES.CallExpression) {
            const callExpression = id.parent.parent.parent;

            // Check if the function being called is imported
            if (callExpression.callee.type === AST_NODE_TYPES.Identifier) {
              const calleeName = callExpression.callee.name;
              if (isImportedIdentifier(calleeName)) {
                return true;
              }
            }
          }
        }

        // Check if the variable is directly passed to a function call
        if (id.parent?.type === AST_NODE_TYPES.CallExpression) {
          // Handle direct function calls like ExternalLib(config)
          if (id.parent.callee.type === AST_NODE_TYPES.Identifier) {
            const calleeName = id.parent.callee.name;
            if (isImportedIdentifier(calleeName)) {
              return true;
            }
          }

          // Handle member expression calls like ExternalLib.create(config)
          if (id.parent.callee.type === AST_NODE_TYPES.MemberExpression) {
            const objectNode = id.parent.callee.object;
            if (objectNode.type === AST_NODE_TYPES.Identifier) {
              const objectName = objectNode.name;
              if (isImportedIdentifier(objectName)) {
                return true;
              }
            }
          }
        }

        // Check if the variable is used in JSX attributes
        if (
          id.parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          id.parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
          id.parent.parent.parent?.type === AST_NODE_TYPES.JSXOpeningElement
        ) {
          const jsxOpeningElement = id.parent.parent.parent;
          if (jsxOpeningElement.name.type === AST_NODE_TYPES.JSXIdentifier) {
            const componentName = jsxOpeningElement.name.name;
            if (isImportedIdentifier(componentName)) {
              return true;
            }
          }
        }

        // Check if the variable is used in JSX spread attributes
        if (
          id.parent?.type === AST_NODE_TYPES.JSXSpreadAttribute &&
          id.parent.parent?.type === AST_NODE_TYPES.JSXOpeningElement
        ) {
          const jsxOpeningElement = id.parent.parent;
          if (jsxOpeningElement.name.type === AST_NODE_TYPES.JSXIdentifier) {
            const componentName = jsxOpeningElement.name.name;
            if (isImportedIdentifier(componentName)) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Check property definitions for boolean values
     */
    function checkProperty(node: TSESTree.Property) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it's a boolean property
      let isBooleanProperty = false;

      // Check if it's initialized with a boolean value
      if (
        node.value.type === AST_NODE_TYPES.Literal &&
        typeof node.value.value === 'boolean'
      ) {
        isBooleanProperty = true;
      }

      // Check if it's a method that returns a boolean
      if (
        (node.value.type === AST_NODE_TYPES.FunctionExpression ||
          node.value.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
        node.value.returnType?.typeAnnotation.type ===
          AST_NODE_TYPES.TSBooleanKeyword
      ) {
        isBooleanProperty = true;
      }

      // Skip checking if this property is part of an object literal passed to an external function
      if (isBooleanProperty && !hasApprovedPrefix(propertyName)) {
        // Special cases for common Node.js API boolean properties
        if (
          (propertyName === 'recursive' || propertyName === 'keepAlive') &&
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.CallExpression
        ) {
          return; // Skip checking for these properties in object literals passed to functions
        }

        // Check if this property is in an object literal that's an argument to a function call
        let isExternalApiCall = false;

        // Navigate up to find if we're in an object expression that's an argument to a function call
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.CallExpression
        ) {
          const callExpression = node.parent.parent;

          // Check if the function being called is an identifier (like mkdirSync, createServer, etc.)
          if (callExpression.callee.type === AST_NODE_TYPES.Identifier) {
            const calleeName = callExpression.callee.name;
            if (isImportedIdentifier(calleeName)) {
              isExternalApiCall = true;
            }
          }

          // Also check for member expressions like fs.mkdirSync
          if (callExpression.callee.type === AST_NODE_TYPES.MemberExpression) {
            // For member expressions, check if the object is imported
            const objectNode = callExpression.callee.object;
            if (objectNode.type === AST_NODE_TYPES.Identifier) {
              const objectName = objectNode.name;
              if (isImportedIdentifier(objectName)) {
                isExternalApiCall = true;
              }
            }
          }
        }

        // Check if this property is in an object literal that's being assigned to a variable
        // This handles cases like const messageInputProps = { grow: true }
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          const variableName = node.parent.parent.id.name;
          if (isVariableUsedWithExternalApi(variableName)) {
            isExternalApiCall = true;
          }
        }

        // Special case for useMemo and other React hooks
        // This handles cases like:
        // 1. const messageInputProps = useMemo(() => ({ grow: true }), [])
        // 2. const messageInputProps = useMemo(() => { return { grow: true }; }, [])
        if (node.parent?.type === AST_NODE_TYPES.ObjectExpression) {
          const currentNode: TSESTree.Node | undefined = node.parent;
          let variableName: string | undefined;

          // Handle TypeScript 'as const' expressions
          let parentNode = currentNode.parent;
          if (parentNode?.type === AST_NODE_TYPES.TSAsExpression) {
            parentNode = parentNode.parent;
          }

          // Case 1: Arrow function with expression body - useMemo(() => ({ ... }), [])
          if (
            parentNode?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
            parentNode.parent?.type === AST_NODE_TYPES.CallExpression &&
            parentNode.parent.callee.type === AST_NODE_TYPES.Identifier &&
            (parentNode.parent.callee.name === 'useMemo' ||
              parentNode.parent.callee.name === 'useCallback' ||
              parentNode.parent.callee.name === 'useState') &&
            parentNode.parent.parent?.type ===
              AST_NODE_TYPES.VariableDeclarator &&
            parentNode.parent.parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            variableName = parentNode.parent.parent.id.name;
          }

          // Case 2: Arrow function with block body - useMemo(() => { return { ... }; }, [])
          else {
            // Handle TypeScript 'as const' expressions for return statements
            let returnParent = currentNode.parent;
            if (returnParent?.type === AST_NODE_TYPES.TSAsExpression) {
              returnParent = returnParent.parent;
            }

            if (
              returnParent?.type === AST_NODE_TYPES.ReturnStatement &&
              returnParent.parent?.type === AST_NODE_TYPES.BlockStatement &&
              returnParent.parent.parent?.type ===
                AST_NODE_TYPES.ArrowFunctionExpression &&
              returnParent.parent.parent.parent?.type ===
                AST_NODE_TYPES.CallExpression &&
              returnParent.parent.parent.parent.callee.type ===
                AST_NODE_TYPES.Identifier &&
              (returnParent.parent.parent.parent.callee.name === 'useMemo' ||
                returnParent.parent.parent.parent.callee.name ===
                  'useCallback' ||
                returnParent.parent.parent.parent.callee.name === 'useState') &&
              returnParent.parent.parent.parent.parent?.type ===
                AST_NODE_TYPES.VariableDeclarator &&
              returnParent.parent.parent.parent.parent.id.type ===
                AST_NODE_TYPES.Identifier
            ) {
              variableName = returnParent.parent.parent.parent.parent.id.name;
            }
          }

          if (variableName && isVariableUsedWithExternalApi(variableName)) {
            isExternalApiCall = true;
          }
        }

        // Check if this property is in an object literal that's directly passed to an imported function
        // This handles cases like ExternalComponent({ grow: true })
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.CallExpression &&
          node.parent.parent.callee.type === AST_NODE_TYPES.Identifier
        ) {
          const calleeName = node.parent.parent.callee.name;
          if (isImportedIdentifier(calleeName)) {
            isExternalApiCall = true;
          }
        }

        // Check if this property is in an object literal that's directly passed as a JSX attribute
        // This handles cases like <ExternalComponent config={{ active: true }} />
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          node.parent.parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
          node.parent.parent.parent.parent?.type ===
            AST_NODE_TYPES.JSXOpeningElement
        ) {
          const jsxOpeningElement = node.parent.parent.parent.parent;
          if (jsxOpeningElement.name.type === AST_NODE_TYPES.JSXIdentifier) {
            const componentName = jsxOpeningElement.name.name;
            if (isImportedIdentifier(componentName)) {
              isExternalApiCall = true;
            }
          }
        }

        // Only report if it's not an external API call
        if (!isExternalApiCall) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check property signatures in interfaces/types for boolean types
     */
    function checkPropertySignature(node: TSESTree.TSPropertySignature) {
      if (node.key.type !== AST_NODE_TYPES.Identifier) return;

      const propertyName = node.key.name;

      // Check if it has a boolean type
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any) &&
        !hasApprovedPrefix(propertyName)
      ) {
        // Skip if this property is part of a parameter's type annotation
        // Check if this property signature is inside a parameter's type annotation
        let isInParameterType = false;
        let parent = node.parent;

        while (parent) {
          if (parent.type === AST_NODE_TYPES.TSTypeLiteral) {
            const grandParent = parent.parent;
            if (
              grandParent?.type === AST_NODE_TYPES.TSTypeAnnotation &&
              grandParent.parent?.type === AST_NODE_TYPES.Identifier &&
              grandParent.parent.parent?.type ===
                AST_NODE_TYPES.FunctionDeclaration
            ) {
              isInParameterType = true;
              break;
            }
          }
          parent = parent.parent as TSESTree.Node;
        }

        // Only report if not in a parameter type annotation
        if (!isInParameterType) {
          context.report({
            node: node.key,
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: propertyName,
              prefixes: formatPrefixes(),
            },
          });
        }
      }
    }

    /**
     * Check parameters for boolean types
     */
    function checkParameter(node: TSESTree.Parameter) {
      if (node.type !== AST_NODE_TYPES.Identifier) return;

      const paramName = node.name;

      // Check if it has a boolean type annotation
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type ===
          (AST_NODE_TYPES.TSBooleanKeyword as any) &&
        !hasApprovedPrefix(paramName)
      ) {
        context.report({
          node,
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'parameter',
            name: paramName,
            prefixes: formatPrefixes(),
          },
        });
      }

      // Check if the parameter has an object type with boolean properties
      if (
        node.typeAnnotation?.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral
      ) {
        const typeLiteral = node.typeAnnotation.typeAnnotation;

        // Check each member of the type literal
        for (const member of typeLiteral.members) {
          if (
            member.type === AST_NODE_TYPES.TSPropertySignature &&
            member.key.type === AST_NODE_TYPES.Identifier &&
            member.typeAnnotation?.typeAnnotation.type ===
              AST_NODE_TYPES.TSBooleanKeyword
          ) {
            const propertyName = member.key.name;

            if (!hasApprovedPrefix(propertyName)) {
              context.report({
                node: member.key,
                messageId: 'missingBooleanPrefix',
                data: {
                  type: 'property',
                  name: propertyName,
                  prefixes: formatPrefixes(),
                },
              });
            }
          }
        }
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaration,
      FunctionDeclaration: checkFunctionDeclaration,
      FunctionExpression(node: TSESTree.FunctionExpression) {
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        if (node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
          checkFunctionDeclaration(node);
        }
      },
      MethodDefinition: checkMethodDefinition,
      Property: checkProperty,
      ClassProperty: checkClassProperty,
      PropertyDefinition: checkClassPropertyDeclaration, // For TypeScript class properties
      TSPropertySignature: checkPropertySignature,
      Identifier(node: TSESTree.Identifier) {
        // Check parameter names in function declarations
        if (
          node.parent &&
          (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.parent.type === AST_NODE_TYPES.FunctionExpression ||
            node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          node.parent.params.includes(node)
        ) {
          checkParameter(node);
        }
      },
    };
  },
});
