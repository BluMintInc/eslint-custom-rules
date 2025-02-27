import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import * as ts from 'typescript';

export const noObjectValuesOnStrings: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
      const sourceCode = context.getSourceCode();
      const parserServices = sourceCode.parserServices;

      // If TypeScript parser services are not available, return an empty object
      if (
        !parserServices ||
        !parserServices.program ||
        !parserServices.esTreeNodeToTSNodeMap
      ) {
        return {};
      }

      const checker = parserServices.program.getTypeChecker();

      /**
       * Checks if a type is or contains a string type
       */
      function isOrContainsStringType(type: ts.Type): boolean {
        // Check if it's a string type
        if (type.flags & ts.TypeFlags.String || type.flags & ts.TypeFlags.StringLiteral) {
          return true;
        }

        // Check if it's a union type that contains string
        if (type.isUnion()) {
          return type.types.some(t => isOrContainsStringType(t));
        }

        // Check if it's an intersection type that contains string
        if (type.isIntersection()) {
          return type.types.some(t => isOrContainsStringType(t));
        }

        return false;
      }

      /**
       * Checks if a node is a call to Object.values()
       */
      function isObjectValuesCall(node: TSESTree.CallExpression): boolean {
        return (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'Object' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'values' &&
          node.arguments.length > 0
        );
      }

      /**
       * Checks if a node is a string literal or template literal
       */
      function isStringLiteral(node: TSESTree.Node): boolean {
        return (
          (node.type === AST_NODE_TYPES.Literal && typeof (node as TSESTree.Literal).value === 'string') ||
          node.type === AST_NODE_TYPES.TemplateLiteral
        );
      }

      /**
       * Checks if a node is likely to produce a string value based on AST patterns
       */
      function isLikelyStringExpression(node: TSESTree.Node): boolean {
        // Check for string concatenation
        if (
          node.type === AST_NODE_TYPES.BinaryExpression &&
          node.operator === '+' &&
          (isStringLiteral(node.left) || isStringLiteral(node.right))
        ) {
          return true;
        }

        // Check for method calls on strings like .toUpperCase(), .toLowerCase(), etc.
        if (
          node.type === AST_NODE_TYPES.CallExpression &&
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          (isStringLiteral(node.callee.object) ||
            (node.callee.object.type === AST_NODE_TYPES.Identifier &&
              node.callee.property.type === AST_NODE_TYPES.Identifier &&
              ['toString', 'toUpperCase', 'toLowerCase', 'trim', 'substring', 'slice', 'charAt', 'concat', 'replace', 'replaceAll', 'padStart', 'padEnd'].includes(node.callee.property.name)))
        ) {
          return true;
        }

        // Check for common string-producing functions
        if (
          node.type === AST_NODE_TYPES.CallExpression &&
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          ['join', 'toString'].includes(node.callee.property.name)
        ) {
          return true;
        }

        // Check for JSON.stringify
        if (
          node.type === AST_NODE_TYPES.CallExpression &&
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.object.name === 'JSON' &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'stringify'
        ) {
          return true;
        }

        return false;
      }

      /**
       * Checks if a type could be a string by examining its properties and structure
       */
      function couldBeString(type: ts.Type): boolean {
        // Check if it's a string type directly
        if (isOrContainsStringType(type)) {
          return true;
        }

        // Check if it's a type parameter that could be a string
        if (type.flags & ts.TypeFlags.TypeParameter) {
          // Type parameters without constraints could be anything, including strings
          const constraint = (type as ts.TypeParameter).getConstraint?.();
          if (!constraint) {
            return true;
          }
          // Check if the constraint allows string
          return couldBeString(constraint);
        }

        return false;
      }

      /**
       * Checks if a function declaration has a string parameter
       */
      function hasFunctionStringParameter(node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
        for (const param of node.params) {
          // Handle simple identifier parameters
          if (param.type === AST_NODE_TYPES.Identifier) {
            try {
              const tsNode = parserServices.esTreeNodeToTSNodeMap.get(param);
              const type = checker.getTypeAtLocation(tsNode);
              if (couldBeString(type)) {
                return true;
              }
            } catch (error) {
              // Ignore errors in type checking
            }
          }

          // Handle object pattern parameters
          if (param.type === AST_NODE_TYPES.ObjectPattern) {
            for (const property of param.properties) {
              if (property.type === AST_NODE_TYPES.Property && property.value.type === AST_NODE_TYPES.Identifier) {
                try {
                  const tsNode = parserServices.esTreeNodeToTSNodeMap.get(property.value);
                  const type = checker.getTypeAtLocation(tsNode);
                  if (couldBeString(type)) {
                    return true;
                  }
                } catch (error) {
                  // Ignore errors in type checking
                }
              }
            }
          }
        }
        return false;
      }

      return {
        // Handle Object.values() calls
        CallExpression(node: TSESTree.CallExpression) {
          // Check if the call is Object.values()
          if (isObjectValuesCall(node)) {
            const argument = node.arguments[0];

            // Quick check for string literals and template literals
            if (isStringLiteral(argument)) {
              context.report({
                node,
                messageId: 'unexpected',
              });
              return;
            }

            // Check for expressions that are likely to produce strings
            if (isLikelyStringExpression(argument)) {
              context.report({
                node,
                messageId: 'unexpected',
              });
              return;
            }

            try {
              // Use TypeScript's type checker to determine if the argument could be a string
              const tsNode = parserServices.esTreeNodeToTSNodeMap.get(argument);
              const type = checker.getTypeAtLocation(tsNode);

              // Special handling for function calls
              if (argument.type === AST_NODE_TYPES.CallExpression) {
                const signature = checker.getResolvedSignature(parserServices.esTreeNodeToTSNodeMap.get(argument));
                if (signature) {
                  const returnType = checker.getReturnTypeOfSignature(signature);
                  if (couldBeString(returnType)) {
                    context.report({
                      node,
                      messageId: 'unexpected',
                    });
                    return;
                  }
                }
              }

              // Special handling for conditional expressions
              if (argument.type === AST_NODE_TYPES.ConditionalExpression) {
                const consequentType = checker.getTypeAtLocation(
                  parserServices.esTreeNodeToTSNodeMap.get(argument.consequent)
                );
                const alternateType = checker.getTypeAtLocation(
                  parserServices.esTreeNodeToTSNodeMap.get(argument.alternate)
                );

                if (couldBeString(consequentType) || couldBeString(alternateType)) {
                  context.report({
                    node,
                    messageId: 'unexpected',
                  });
                  return;
                }
              }

              // Check if the type is or contains string
              if (couldBeString(type)) {
                context.report({
                  node,
                  messageId: 'unexpected',
                });
                return;
              }
            } catch (error) {
              // If there's an error in type checking, fall back to AST-based checks
              // This is a safety measure to prevent the rule from crashing
            }
          }
        },

        // Handle function declarations that use Object.values on parameters
        'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
          node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
        ) {
          // Find all Object.values calls in the function body
          const objectValuesCalls: TSESTree.CallExpression[] = [];

          // For function declarations and expressions
          if (node.body && node.body.type === AST_NODE_TYPES.BlockStatement) {
            sourceCode.ast.body.forEach(function findObjectValuesCalls(statement) {
              if (statement.type === AST_NODE_TYPES.ExpressionStatement &&
                  statement.expression.type === AST_NODE_TYPES.CallExpression &&
                  isObjectValuesCall(statement.expression)) {
                objectValuesCalls.push(statement.expression);
              }
            });
          }
          // For arrow functions with expression bodies
          else if (node.body && node.body.type === AST_NODE_TYPES.CallExpression &&
                   isObjectValuesCall(node.body)) {
            objectValuesCalls.push(node.body);
          }

          // If we found Object.values calls and the function has string parameters, report errors
          if (objectValuesCalls.length > 0 && hasFunctionStringParameter(node)) {
            for (const call of objectValuesCalls) {
              // Check if the argument is a parameter
              const argument = call.arguments[0];
              if (argument.type === AST_NODE_TYPES.Identifier) {
                // Check if this identifier is one of the function parameters
                const paramNames = node.params
                  .filter(p => p.type === AST_NODE_TYPES.Identifier)
                  .map(p => (p as TSESTree.Identifier).name);

                if (paramNames.includes(argument.name)) {
                  context.report({
                    node: call,
                    messageId: 'unexpected',
                  });
                }
              }
            }
          }
        },
      };
    },

    name: 'no-object-values-on-strings',
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow Object.values() on strings as it treats strings as arrays of characters, which is likely unintended behavior.',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'Object.values() should not be used on strings. It treats strings as arrays of characters, which is likely unintended. Use Object.values() only on objects.',
      },
    },
    defaultOptions: [],
  });
