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

const checkTypeAnnotationForHandler = (
  typeNode: TSESTree.TypeNode,
): boolean => {
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    return HANDLER_TYPES.has(typeNode.typeName.name);
  }
  return false;
};

const findTypeAnnotationInContext = (
  node: TSESTree.Node,
): TSESTree.TSTypeAnnotation | undefined => {
  if (
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier &&
    node.parent.id.typeAnnotation
  ) {
    return node.parent.id.typeAnnotation;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    node.parent.left.type === AST_NODE_TYPES.Identifier &&
    node.parent.left.typeAnnotation
  ) {
    return node.parent.left.typeAnnotation;
  }

  if (
    node.parent?.type === AST_NODE_TYPES.Property &&
    node.parent.value === node
  ) {
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
};

const isFirebaseChangeHandler = (node: TSESTree.Node): boolean => {
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
};

const isParentIdAccess = (node: TSESTree.MemberExpression): {
  isMatch: boolean;
  depth: number;
} => {
  if (
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== 'id'
  ) {
    return { isMatch: false, depth: 0 };
  }

  const chain: string[] = [];
  let current = node.object;

  while (current && current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.property.type !== AST_NODE_TYPES.Identifier) {
      return { isMatch: false, depth: 0 };
    }
    chain.unshift(current.property.name);
    current = current.object;
  }

  if (chain.length < 2) {
    return { isMatch: false, depth: 0 };
  }

  const refIndex = chain.indexOf('ref');
  if (refIndex === -1) {
    return { isMatch: false, depth: 0 };
  }

  const parentSegment = chain.slice(refIndex + 1);
  if (parentSegment.length === 0) {
    return { isMatch: false, depth: 0 };
  }

  const invalidParent = parentSegment.some((segment) => segment !== 'parent');
  if (invalidParent) {
    return { isMatch: false, depth: 0 };
  }

  const depth = parentSegment.length;
  return { isMatch: depth > 0, depth };
};

const getParentParamName = (depth: number) => {
  if (depth === 1) {
    return 'userId';
  }
  if (depth === 2) {
    return 'parentId';
  }
  return `parent${depth}Id`;
};

const findHandlerFunction = (
  node: TSESTree.Node,
  handlerFunctions: Set<TSESTree.Node>,
): TSESTree.Node | null => {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (handlerFunctions.has(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const hasOptionalChaining = (node: TSESTree.MemberExpression): boolean => {
  let current: TSESTree.Node = node;
  while (current && current.type === AST_NODE_TYPES.MemberExpression) {
    if (current.optional) {
      return true;
    }
    current = current.object;
  }
  return false;
};

const isParamsInScope = (handlerNode: TSESTree.Node): boolean => {
  if (
    handlerNode.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    handlerNode.type === AST_NODE_TYPES.FunctionExpression ||
    handlerNode.type === AST_NODE_TYPES.FunctionDeclaration
  ) {
    const firstParam = handlerNode.params[0];
    if (!firstParam) return false;

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
};

export const preferParamsOverParentId = createRule<[], MessageIds>({
  name: 'prefer-params-over-parent-id',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer handler params for parent IDs instead of traversing ref.parent.id so Firebase triggers stay aligned with path templates and type-safe.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferParams:
        'Accessing parent IDs through `ref.parent.id` bypasses the handler params and breaks when collection nesting changes. Use the params object for stable, typed IDs instead (destructure `const { params: { {{paramName}} } } = event` or read `params.{{paramName}}`).',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track functions that are Firebase change handlers
    const handlerFunctions = new Set<TSESTree.Node>();

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
          const handlerNode = findHandlerFunction(node, handlerFunctions);

          if (handlerNode) {
            const hasOptional = hasOptionalChaining(node);
            const paramsInScope = isParamsInScope(handlerNode);
            // Suggest different parameter names based on depth
            // Note: These conventions may vary by data model; adjust if needed
            const paramSuggestion = getParentParamName(parentAccess.depth);

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
