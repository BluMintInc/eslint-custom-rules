import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    ignoreCallExpressions?: boolean;
    ignoreSymbol?: boolean;
    tsOnly?: boolean;
  },
];

type MessageIds = 'uselessUseMemo';

const NON_DETERMINISTIC_FUNCTIONS = new Set([
  'Date.now',
  'Math.random',
  'crypto.getRandomValues',
  'performance.now',
  'Math.floor',
  'Math.ceil',
  'Math.round',
]);

const SIDE_EFFECT_FUNCTIONS = new Set([
  'console.log',
  'console.error',
  'console.warn',
  'console.info',
  'alert',
  'confirm',
  'prompt',
]);

export const noUselessUseMemoprimitives = createRule<Options, MessageIds>({
  name: 'no-useless-usememo-primitives',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow unnecessary useMemo calls when the memoized callback returns a pass-by-value type',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          ignoreCallExpressions: {
            type: 'boolean',
            default: true,
          },
          ignoreSymbol: {
            type: 'boolean',
            default: true,
          },
          tsOnly: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      uselessUseMemo:
        'useMemo is unnecessary for primitive values. Consider removing useMemo and using the expression directly.',
    },
  },
  defaultOptions: [
    {
      ignoreCallExpressions: true,
      ignoreSymbol: true,
      tsOnly: false,
    },
  ],
  create(context) {
    const options = {
      ignoreCallExpressions: true,
      ignoreSymbol: true,
      tsOnly: false,
      ...context.options[0],
    };
    const sourceCode = context.getSourceCode();
    const parserServices = sourceCode.parserServices;
    const hasTypeInfo = parserServices && parserServices.program;

    // If tsOnly is true and we don't have type info, skip
    if (options.tsOnly && !hasTypeInfo) {
      return {};
    }

    /**
     * Checks if a function call is non-deterministic or has side effects
     */
    function hasNonDeterministicOrSideEffects(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        const callee = node.callee;

        // Check for direct function calls like Math.random()
        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          const objectName = callee.object.type === AST_NODE_TYPES.Identifier
            ? callee.object.name
            : '';
          const propertyName = callee.property.type === AST_NODE_TYPES.Identifier
            ? callee.property.name
            : '';
          const fullName = `${objectName}.${propertyName}`;

          if (NON_DETERMINISTIC_FUNCTIONS.has(fullName) || SIDE_EFFECT_FUNCTIONS.has(fullName)) {
            return true;
          }
        }

        // Check for new Date(), new expressions are generally non-deterministic
        if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'Date') {
          return true;
        }

        // Check arguments recursively
        return node.arguments.some(arg => hasNonDeterministicOrSideEffects(arg));
      }

      if (node.type === AST_NODE_TYPES.NewExpression) {
        // New Date() and similar constructors
        if (node.callee.type === AST_NODE_TYPES.Identifier &&
            (node.callee.name === 'Date' || node.callee.name === 'Error')) {
          return true;
        }
        return node.arguments?.some(arg => hasNonDeterministicOrSideEffects(arg)) || false;
      }

      // Recursively check child nodes
      for (const key in node) {
        if (key === 'parent' || key === 'range' || key === 'loc') continue;
        const value = (node as any)[key];

        if (Array.isArray(value)) {
          if (value.some(item => item && typeof item === 'object' && 'type' in item &&
                              hasNonDeterministicOrSideEffects(item))) {
            return true;
          }
        } else if (value && typeof value === 'object' && 'type' in value) {
          if (hasNonDeterministicOrSideEffects(value)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Checks if the callback contains function calls when ignoreCallExpressions is true
     */
    function containsCallExpressions(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression ||
          node.type === AST_NODE_TYPES.NewExpression) {
        return true;
      }

      // Recursively check child nodes
      for (const key in node) {
        if (key === 'parent' || key === 'range' || key === 'loc') continue;
        const value = (node as any)[key];

        if (Array.isArray(value)) {
          if (value.some(item => item && typeof item === 'object' && 'type' in item &&
                              containsCallExpressions(item))) {
            return true;
          }
        } else if (value && typeof value === 'object' && 'type' in value) {
          if (containsCallExpressions(value)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Checks if a TypeScript type is a primitive type
     */
    function isPrimitiveType(node: TSESTree.Node): boolean {
      if (!hasTypeInfo) {
        return false;
      }

      try {
        const checker = parserServices.program.getTypeChecker();
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
        const type = checker.getTypeAtLocation(tsNode);

        // Import TypeScript to access TypeFlags
        const ts = require('typescript');

        // Check for primitive type flags
        const primitiveFlags =
          ts.TypeFlags.String |
          ts.TypeFlags.Number |
          ts.TypeFlags.Boolean |
          ts.TypeFlags.BooleanLiteral |
          ts.TypeFlags.StringLiteral |
          ts.TypeFlags.NumberLiteral |
          ts.TypeFlags.BigInt |
          ts.TypeFlags.BigIntLiteral |
          ts.TypeFlags.Null |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Void;

        // Add symbol flags if not ignoring them
        let symbolFlags = 0;
        if (!options.ignoreSymbol) {
          symbolFlags = ts.TypeFlags.ESSymbol | ts.TypeFlags.UniqueESSymbol;
        }

        const allPrimitiveFlags = primitiveFlags | symbolFlags;

        // Check if the type is a primitive
        if (type.flags & allPrimitiveFlags) {
          return true;
        }

        // Check union types - if all members are primitives, consider it primitive
        if (type.flags & ts.TypeFlags.Union) {
          const unionType = type as any;
          if (unionType.types) {
            return unionType.types.every((memberType: any) => {
              return memberType.flags & allPrimitiveFlags;
            });
          }
        }

        // If the type is 'any' or 'unknown', fall back to AST analysis
        if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
          return isPrimitiveByAST(node);
        }

        return false;
      } catch (error) {
        // If type checking fails, fall back to AST analysis
        return isPrimitiveByAST(node);
      }
    }

    /**
     * Checks if an AST node represents a primitive value using heuristics
     */
    function isPrimitiveByAST(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.Literal:
          // String, number, boolean, null literals
          return typeof node.value === 'string' ||
                 typeof node.value === 'number' ||
                 typeof node.value === 'boolean' ||
                 node.value === null;

        case AST_NODE_TYPES.TemplateLiteral:
          // Template literals result in strings
          return true;

        case AST_NODE_TYPES.BinaryExpression:
          // Arithmetic and comparison operations typically return primitives
          const arithmeticOps = ['+', '-', '*', '/', '%', '**'];
          const comparisonOps = ['==', '!=', '===', '!==', '<', '>', '<=', '>='];
          return arithmeticOps.includes(node.operator) || comparisonOps.includes(node.operator);

        case AST_NODE_TYPES.LogicalExpression:
          // Logical operations typically return primitives (boolean or one of the operands)
          // For && and ||, assume they return primitives if we're in a context where primitives are expected
          return true;

        case AST_NODE_TYPES.UnaryExpression:
          // Unary operations often return primitives
          const unaryOps = ['!', '-', '+', '~', 'typeof'];
          return unaryOps.includes(node.operator);

        case AST_NODE_TYPES.ConditionalExpression:
          // Ternary expressions - if both branches are primitives or we can't determine, assume primitive
          const consequentIsPrimitive = isPrimitiveByAST(node.consequent);
          const alternateIsPrimitive = isPrimitiveByAST(node.alternate);

          // If both are clearly primitives, return true
          if (consequentIsPrimitive && alternateIsPrimitive) {
            return true;
          }

          // If both are identifiers or member expressions, assume they could be primitives
          const consequentIsIdentifierLike = node.consequent.type === AST_NODE_TYPES.Identifier ||
                                           node.consequent.type === AST_NODE_TYPES.MemberExpression;
          const alternateIsIdentifierLike = node.alternate.type === AST_NODE_TYPES.Identifier ||
                                          node.alternate.type === AST_NODE_TYPES.MemberExpression;

          if (consequentIsIdentifierLike && alternateIsIdentifierLike) {
            return true;
          }

          // Mixed case - be conservative
          return consequentIsPrimitive || alternateIsPrimitive;

        case AST_NODE_TYPES.Identifier:
          // For identifiers, we can't determine the type from AST alone
          // In the context of useMemo, assume they could be primitives
          return true;

        case AST_NODE_TYPES.MemberExpression:
          // Member expressions like obj.prop, arr.length - could be primitives
          // Common primitive-returning properties
          if (node.property.type === AST_NODE_TYPES.Identifier) {
            const primitiveProps = ['length', 'size', 'width', 'height', 'id', 'name', 'value', 'text', 'innerHTML', 'textContent'];
            if (primitiveProps.includes(node.property.name)) {
              return true;
            }
          }
          // For other member expressions, assume they could be primitives
          return true;

        case AST_NODE_TYPES.CallExpression:
          // Handle specific function calls that return primitives
          if (node.callee.type === AST_NODE_TYPES.Identifier) {
            // Direct function calls like Symbol(), String(), Number(), Boolean()
            const primitiveFunctions = ['Symbol', 'String', 'Number', 'Boolean'];
            if (primitiveFunctions.includes(node.callee.name)) {
              return true;
            }
          } else if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
            // Method calls that return primitives
            if (node.callee.property.type === AST_NODE_TYPES.Identifier) {
              const primitiveMethods = [
                'toString', 'toUpperCase', 'toLowerCase', 'trim', 'slice', 'substring',
                'charAt', 'charCodeAt', 'indexOf', 'lastIndexOf', 'search', 'replace',
                'split', 'match', 'localeCompare', 'valueOf', 'toFixed', 'toPrecision',
                'toExponential', 'getTime', 'getFullYear', 'getMonth', 'getDate',
                'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds'
              ];
              if (primitiveMethods.includes(node.callee.property.name)) {
                return true;
              }
            }
          }
          return false;

        default:
          return false;
      }
    }

    /**
     * Gets the return expression from a callback function
     */
    function getReturnExpression(callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): TSESTree.Node | null {
      if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
        // Block body - look for return statement
        if (callback.body.body.length === 1 &&
            callback.body.body[0].type === AST_NODE_TYPES.ReturnStatement) {
          return callback.body.body[0].argument;
        }
        return null; // Multiple statements or no return
      } else {
        // Expression body - implicit return
        return callback.body;
      }
    }

    /**
     * Checks if the useMemo callback returns a primitive
     */
    function callbackReturnsPrimitive(callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
      const returnExpr = getReturnExpression(callback);
      if (!returnExpr) {
        return false;
      }

      // Check for non-deterministic or side effects first
      if (hasNonDeterministicOrSideEffects(returnExpr)) {
        return false;
      }

      // If ignoreCallExpressions is true and there are call expressions, skip
      if (options.ignoreCallExpressions && containsCallExpressions(returnExpr)) {
        return false;
      }

      // Use TypeScript type checking if available
      if (hasTypeInfo) {
        return isPrimitiveType(returnExpr);
      }

      // Fall back to AST heuristics
      return isPrimitiveByAST(returnExpr);
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a useMemo call
        if (node.callee.type !== AST_NODE_TYPES.Identifier ||
            node.callee.name !== 'useMemo' ||
            node.arguments.length === 0) {
          return;
        }

        const callback = node.arguments[0];

        // Check if the first argument is a function
        if (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            callback.type !== AST_NODE_TYPES.FunctionExpression) {
          return;
        }

        // Check if the callback returns a primitive
        if (callbackReturnsPrimitive(callback)) {
          const returnExpr = getReturnExpression(callback);
          if (returnExpr) {
            context.report({
              node,
              messageId: 'uselessUseMemo',
              fix(fixer) {
                const sourceCode = context.getSourceCode();
                let replacementText;

                // For arrow functions with expression body, use the body directly
                if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
                  replacementText = sourceCode.getText(callback.body);
                } else {
                  // For block body, get the return expression
                  replacementText = sourceCode.getText(returnExpr);
                }

                return fixer.replaceText(node, replacementText);
              },
            });
          }
        }
      },
    };
  },
});

export default noUselessUseMemoprimitives;
