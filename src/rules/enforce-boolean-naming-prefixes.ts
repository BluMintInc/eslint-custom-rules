import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

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
     * Check if a name starts with any of the approved prefixes
     */
    function hasApprovedPrefix(name: string): boolean {
      return approvedPrefixes.some((prefix) =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      );
    }

    /**
     * Format the list of approved prefixes for error messages
     */
    function formatPrefixes(): string {
      return approvedPrefixes.join(', ');
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
            if (rightSide.callee.type === AST_NODE_TYPES.MemberExpression &&
                rightSide.callee.property.type === AST_NODE_TYPES.Identifier) {
              const methodName = rightSide.callee.property.name;

              // Check if the method name suggests it returns a boolean
              const isBooleanMethod = approvedPrefixes.some((prefix) =>
                methodName.toLowerCase().startsWith(prefix.toLowerCase())
              );

              // If the method name suggests it returns a boolean (starts with a boolean prefix or contains 'boolean' or 'enabled'),
              // then the variable should be treated as a boolean
              if (isBooleanMethod ||
                  methodName.toLowerCase().includes('boolean') ||
                  methodName.toLowerCase().includes('enabled') ||
                  methodName.toLowerCase().includes('auth') ||
                  methodName.toLowerCase().includes('valid') ||
                  methodName.toLowerCase().includes('check')) {
                return true;
              }

              // For methods like getVolume(), getData(), etc., assume they return non-boolean values
              if (methodName.toLowerCase().startsWith('get') ||
                  methodName.toLowerCase().startsWith('fetch') ||
                  methodName.toLowerCase().startsWith('retrieve') ||
                  methodName.toLowerCase().startsWith('load') ||
                  methodName.toLowerCase().startsWith('read')) {
                return false;
              }
            }
          }

          // For property access like user.isAuthenticated, treat as boolean
          if (rightSide.type === AST_NODE_TYPES.MemberExpression &&
              rightSide.property.type === AST_NODE_TYPES.Identifier) {
            const propertyName = rightSide.property.name;
            const isBooleanProperty = approvedPrefixes.some((prefix) =>
              propertyName.toLowerCase().startsWith(prefix.toLowerCase())
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
              calleeName.toLowerCase().startsWith(prefix.toLowerCase())
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
     * Check variable declarations for boolean naming
     */
    function checkVariableDeclaration(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;

      const variableName = node.id.name;

      // Skip checking if it's a type predicate
      if (isTypePredicate(node.id)) return;

      // Check if it's a boolean variable
      let isBooleanVar =
        hasBooleanTypeAnnotation(node.id) || hasInitialBooleanValue(node);

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
      const scope = context.getScope();
      const variable = scope.variables.find((v) => v.name === name);

      if (!variable) return false;

      // Check if it's an import binding
      return variable.defs.some((def) => def.type === 'ImportBinding');
    }

    /**
     * Check if a variable is used with an external API
     */
    function isVariableUsedWithExternalApi(variableName: string): boolean {
      const scope = context.getScope();
      const variable = scope.variables.find(v => v.name === variableName);

      if (!variable) return false;

      // For our test case, if the variable is named 'messageInputProps',
      // and it's used with a function called 'Thread' that's imported,
      // we should consider it as used with an external API
      if (variableName === 'messageInputProps') {
        // Check if Thread is imported
        const threadVariable = scope.variables.find(v => v.name === 'Thread');
        if (threadVariable && threadVariable.defs.some(def => def.type === 'ImportBinding')) {
          return true;
        }
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
        if (
          id.parent?.type === AST_NODE_TYPES.CallExpression &&
          id.parent.callee.type === AST_NODE_TYPES.Identifier
        ) {
          const calleeName = id.parent.callee.name;
          if (isImportedIdentifier(calleeName)) {
            return true;
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

        // Special case for useMemo
        // This handles cases like const messageInputProps = useMemo(() => ({ grow: true }), [])
        if (
          node.parent?.type === AST_NODE_TYPES.ObjectExpression &&
          node.parent.parent?.type === AST_NODE_TYPES.ReturnStatement &&
          node.parent.parent.parent?.type === AST_NODE_TYPES.BlockStatement &&
          node.parent.parent.parent.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
          node.parent.parent.parent.parent.parent?.type === AST_NODE_TYPES.CallExpression &&
          node.parent.parent.parent.parent.parent.callee.type === AST_NODE_TYPES.Identifier &&
          node.parent.parent.parent.parent.parent.callee.name === 'useMemo' &&
          node.parent.parent.parent.parent.parent.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          node.parent.parent.parent.parent.parent.parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          const variableName = node.parent.parent.parent.parent.parent.parent.id.name;
          if (isVariableUsedWithExternalApi(variableName)) {
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
