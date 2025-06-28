/**
 * @fileoverview Enforce the use of event.params over .ref.parent.id in Firebase change handlers
 * @author BluMint
 */

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferParams';

const HANDLER_TYPES = new Set([
  'DocumentChangeHandler',
  'DocumentChangeHandlerTransaction',
  'RealtimeDbChangeHandler',
  'RealtimeDbChangeHandlerTransaction',
]);

export const preferParamsOverParentId = createRule<[], MessageIds>({
  name: 'prefer-params-over-parent-id',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of event.params over .ref.parent.id in Firebase change handlers',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferParams:
        'Avoid using .ref.parent.id to access parent document IDs. Use the params object from the event instead: `const { params: { {{paramName}} } } = event;`',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track functions that are Firebase change handlers
    const handlerFunctions = new Set<TSESTree.Node>();

    function findTypeAnnotationInContext(
      node: TSESTree.Node,
    ): TSESTree.TSTypeAnnotation | undefined {
      // Check variable declarator type annotation
      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier &&
        node.parent.id.typeAnnotation
      ) {
        return node.parent.id.typeAnnotation;
      }

      // Check assignment expression with type annotation
      if (
        node.parent?.type === AST_NODE_TYPES.AssignmentExpression &&
        node.parent.left.type === AST_NODE_TYPES.Identifier &&
        node.parent.left.typeAnnotation
      ) {
        return node.parent.left.typeAnnotation;
      }

      // Check property definition type annotation
      if (
        node.parent?.type === AST_NODE_TYPES.Property &&
        node.parent.value === node
      ) {
        // Look up the tree for type annotation
        let current = node.parent.parent;
        while (current) {
          if (
            current.type === AST_NODE_TYPES.VariableDeclarator &&
            current.id.type === AST_NODE_TYPES.Identifier &&
            current.id.typeAnnotation
          ) {
            return current.id.typeAnnotation;
          }
          current = current.parent;
        }
      }

      return undefined;
    }

    function isFirebaseChangeHandler(node: TSESTree.Node): boolean {
      if (
        node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        node.type !== AST_NODE_TYPES.FunctionExpression &&
        node.type !== AST_NODE_TYPES.FunctionDeclaration
      ) {
        return false;
      }

      const typeAnnotation = findTypeAnnotationInContext(node);
      if (!typeAnnotation) {
        return false;
      }

      return checkTypeAnnotationForHandler(typeAnnotation.typeAnnotation);
    }

    function checkTypeAnnotationForHandler(
      typeNode: TSESTree.TypeNode,
    ): boolean {
      if (
        typeNode.type === AST_NODE_TYPES.TSTypeReference &&
        typeNode.typeName.type === AST_NODE_TYPES.Identifier
      ) {
        return HANDLER_TYPES.has(typeNode.typeName.name);
      }
      return false;
    }

    function isParentIdAccess(node: TSESTree.MemberExpression): {
      isMatch: boolean;
      depth: number;
    } {
      // Check if this is a .ref.parent[.parent...].id pattern
      if (
        node.property.type !== AST_NODE_TYPES.Identifier ||
        node.property.name !== 'id'
      ) {
        return { isMatch: false, depth: 0 };
      }

      let current = node.object;
      let foundParent = false;
      let foundRef = false;
      let depth = 0;

      // Traverse up the member expression chain
      while (current && current.type === AST_NODE_TYPES.MemberExpression) {
        if (current.property.type === AST_NODE_TYPES.Identifier) {
          if (current.property.name === 'parent') {
            foundParent = true;
            depth++;
          } else if (current.property.name === 'ref' && foundParent) {
            foundRef = true;
            break;
          } else if (current.property.name !== 'parent') {
            // If we encounter a property that's not 'parent' or 'ref', this isn't our pattern
            break;
          }
        }
        current = current.object;
      }

      return { isMatch: foundRef && foundParent, depth };
    }

    function findHandlerFunction(node: TSESTree.Node): TSESTree.Node | null {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (handlerFunctions.has(current)) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function hasOptionalChaining(node: TSESTree.MemberExpression): boolean {
      let current: TSESTree.Node = node;
      while (current && current.type === AST_NODE_TYPES.MemberExpression) {
        if (current.optional) {
          return true;
        }
        current = current.object;
      }
      return false;
    }

    function isParamsInScope(handlerNode: TSESTree.Node): boolean {
      // Check if params is destructured from the event parameter
      if (
        handlerNode.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        handlerNode.type === AST_NODE_TYPES.FunctionExpression ||
        handlerNode.type === AST_NODE_TYPES.FunctionDeclaration
      ) {
        const firstParam = handlerNode.params[0];
        if (!firstParam) return false;

        // Check for destructuring pattern: ({ params }) or ({ data, params })
        if (firstParam.type === AST_NODE_TYPES.ObjectPattern) {
          return firstParam.properties.some((prop) => {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'params'
            ) {
              return true;
            }
            return false;
          });
        }

        // Check for variable declarations inside the function that destructure params
        if (
          handlerNode.body &&
          handlerNode.body.type === AST_NODE_TYPES.BlockStatement
        ) {
          for (const statement of handlerNode.body.body) {
            if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
              for (const declarator of statement.declarations) {
                if (
                  declarator.id.type === AST_NODE_TYPES.ObjectPattern &&
                  declarator.init &&
                  declarator.init.type === AST_NODE_TYPES.Identifier
                ) {
                  // Check if destructuring from event parameter
                  const eventParamName =
                    firstParam.type === AST_NODE_TYPES.Identifier
                      ? firstParam.name
                      : 'event';
                  if (declarator.init.name === eventParamName) {
                    return declarator.id.properties.some((prop) => {
                      if (
                        prop.type === AST_NODE_TYPES.Property &&
                        prop.key.type === AST_NODE_TYPES.Identifier &&
                        prop.key.name === 'params'
                      ) {
                        return true;
                      }
                      return false;
                    });
                  }
                }
              }
            }
          }
        }
      }
      return false;
    }

    return {
      // Track Firebase change handler functions
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
        node:
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression,
      ): void {
        if (isFirebaseChangeHandler(node)) {
          handlerFunctions.add(node);
        }
      },

      // Detect .ref.parent.id patterns
      MemberExpression(node: TSESTree.MemberExpression): void {
        const parentAccess = isParentIdAccess(node);
        if (parentAccess.isMatch) {
          const handlerNode = findHandlerFunction(node);

          if (handlerNode) {
            const hasOptional = hasOptionalChaining(node);
            const paramsInScope = isParamsInScope(handlerNode);
            // Suggest different parameter names based on depth
            const paramSuggestion =
              parentAccess.depth === 1 ? 'userId' : 'parentId';

            context.report({
              node,
              messageId: 'preferParams',
              data: {
                paramName: paramSuggestion,
              },
              fix: paramsInScope
                ? (fixer) => {
                    const replacement = hasOptional
                      ? `params?.${paramSuggestion}`
                      : `params.${paramSuggestion}`;
                    return fixer.replaceText(node, replacement);
                  }
                : undefined,
            });
          }
        }
      },
    };
  },
});
