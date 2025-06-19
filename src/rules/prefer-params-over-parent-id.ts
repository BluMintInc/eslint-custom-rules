/**
 * @fileoverview Enforce the use of event.params over directly accessing parent IDs through the reference chain
 * @author BluMint
 */

import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferParams' | 'preferParamsWithSuggestion';

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
        'Enforce the use of event.params over directly accessing parent IDs through the reference chain (.ref.parent.id)',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferParams:
        'Avoid accessing parent IDs through .ref.parent.id. Use the corresponding property from event.params instead for better type safety and maintainability.',
      preferParamsWithSuggestion:
        'Avoid accessing parent IDs through .ref.parent.id. Use the corresponding property from event.params instead. Consider using: {{ suggestion }}',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track functions that are handler types
    const handlerFunctions = new Set<TSESTree.Node>();

    // Track parameter names available in params object
    const parameterMappings = new Map<TSESTree.Node, string[]>();

    function isHandlerFunction(
      node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
    ): boolean {
      // Simple approach: check if the function is in a context that suggests it's a handler
      // Look for type annotations in the source code text
      const sourceCode = context.getSourceCode();

      // Find the function in the source and look for handler type annotations nearby
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (current.type === AST_NODE_TYPES.VariableDeclarator) {
          // Check if there's a type annotation
          const nodeText = sourceCode.getText(current);
          for (const handlerType of HANDLER_TYPES) {
            if (nodeText.includes(handlerType)) {
              return true;
            }
          }
        }

        if (current.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          const nodeText = sourceCode.getText(current);
          for (const handlerType of HANDLER_TYPES) {
            if (nodeText.includes(handlerType)) {
              return true;
            }
          }
        }

        current = current.parent as TSESTree.Node;
      }
      return false;
    }

    function extractParameterNames(
      node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
    ): string[] {
      // Simple approach: look for common path type patterns in the source
      const sourceCode = context.getSourceCode();
      let current: TSESTree.Node | undefined = node;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.VariableDeclarator ||
          current.type === AST_NODE_TYPES.ExportNamedDeclaration
        ) {
          const nodeText = sourceCode.getText(current);
          return extractParamsFromText(nodeText);
        }
        current = current.parent as TSESTree.Node;
      }
      return [];
    }

    function extractParamsFromText(text: string): string[] {
      // Extract parameter names from common path type patterns
      const commonMappings: Record<string, string[]> = {
        OverwolfUpdatePath: ['userId'],
        UserProfilePath: ['userId'],
        UserPath: ['userId'],
        GamePath: ['gameId'],
        TournamentPath: ['gameId', 'tournamentId'],
        RoundPath: ['gameId', 'tournamentId', 'roundId'],
        Path: ['userId'], // Generic fallback
      };

      for (const [pathType, params] of Object.entries(commonMappings)) {
        if (text.includes(pathType)) {
          return params;
        }
      }

      return ['userId']; // Default fallback
    }

    function isParentIdAccess(node: TSESTree.MemberExpression): {
      isParentId: boolean;
      depth: number;
    } {
      // Check for patterns like:
      // - .ref.parent.id
      // - .ref.parent.parent.id
      // - change.after.ref.parent.id
      // - change.before?.ref?.parent?.id

      if (
        node.property.type === AST_NODE_TYPES.Identifier &&
        node.property.name === 'id'
      ) {
        let current = node.object;
        let parentDepth = 0;
        let foundRef = false;

        // Count parent accesses and look for ref
        while (current.type === AST_NODE_TYPES.MemberExpression) {
          if (
            current.property.type === AST_NODE_TYPES.Identifier &&
            current.property.name === 'parent'
          ) {
            parentDepth++;
            current = current.object;
          } else if (
            current.property.type === AST_NODE_TYPES.Identifier &&
            current.property.name === 'ref'
          ) {
            foundRef = true;
            current = current.object;
          } else {
            current = current.object;
          }
        }

        // Check if we found at least one parent and a ref
        if (parentDepth > 0 && foundRef) {
          return { isParentId: true, depth: parentDepth };
        }
      }

      return { isParentId: false, depth: 0 };
    }

    function isOptionalParentIdAccess(node: TSESTree.ChainExpression): {
      isParentId: boolean;
      depth: number;
    } {
      if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
        return isParentIdAccess(node.expression);
      }
      return { isParentId: false, depth: 0 };
    }

    function generateSuggestion(paramNames: string[], depth: number): string {
      if (paramNames.length >= depth) {
        const paramName = paramNames[depth - 1];
        return `params.${paramName}`;
      }
      return 'params.{parameterName}';
    }

    return {
      'FunctionExpression, ArrowFunctionExpression'(
        node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      ) {
        if (isHandlerFunction(node)) {
          handlerFunctions.add(node);
          const paramNames = extractParameterNames(node);
          parameterMappings.set(node, paramNames);
        }
      },

      MemberExpression(node: TSESTree.MemberExpression) {
        // Skip if this MemberExpression is inside a ChainExpression (to avoid duplicate reporting)
        if (node.parent?.type === AST_NODE_TYPES.ChainExpression) {
          return;
        }

        // Check if we're inside a handler function
        let current: TSESTree.Node | undefined = node;
        let handlerFunction: TSESTree.Node | undefined;

        while (current) {
          if (handlerFunctions.has(current)) {
            handlerFunction = current;
            break;
          }
          current = current.parent as TSESTree.Node;
        }

        if (!handlerFunction) return;

        const { isParentId, depth } = isParentIdAccess(node);
        if (isParentId) {
          const paramNames = parameterMappings.get(handlerFunction) || [];
          const suggestion = generateSuggestion(paramNames, depth);

          context.report({
            node,
            messageId:
              paramNames.length > 0
                ? 'preferParamsWithSuggestion'
                : 'preferParams',
            data: { suggestion },
          });
        }
      },

      ChainExpression(node: TSESTree.ChainExpression) {
        // Handle optional chaining like change.after?.ref?.parent?.id
        // Only report on ChainExpression, not the inner MemberExpression to avoid duplicates
        let current: TSESTree.Node | undefined = node;
        let handlerFunction: TSESTree.Node | undefined;

        while (current) {
          if (handlerFunctions.has(current)) {
            handlerFunction = current;
            break;
          }
          current = current.parent as TSESTree.Node;
        }

        if (!handlerFunction) return;

        const { isParentId, depth } = isOptionalParentIdAccess(node);
        if (isParentId) {
          const paramNames = parameterMappings.get(handlerFunction) || [];
          const suggestion = generateSuggestion(paramNames, depth);

          context.report({
            node,
            messageId:
              paramNames.length > 0
                ? 'preferParamsWithSuggestion'
                : 'preferParams',
            data: { suggestion },
          });
        }
      },

      // Note: We don't need a separate VariableDeclarator handler since MemberExpression
      // will catch the .ref.parent.id access regardless of context
    };
  },
});
