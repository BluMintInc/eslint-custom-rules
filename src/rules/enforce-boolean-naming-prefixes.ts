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

        // Check for logical expressions (&&, ||)
        if (
          node.init.type === AST_NODE_TYPES.LogicalExpression &&
          ['&&', '||'].includes(node.init.operator)
        ) {
          return true;
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
