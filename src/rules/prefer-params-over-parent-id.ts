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

const getQualifiedNameIdentifier = (
  typeName: TSESTree.EntityName,
): string | null => {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return typeName.name;
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.right.type === AST_NODE_TYPES.Identifier
  ) {
    return typeName.right.name;
  }
  return null;
};

const checkTypeAnnotationForHandler = (
  typeNode: TSESTree.TypeNode,
): boolean => {
  switch (typeNode.type) {
    case AST_NODE_TYPES.TSTypeReference: {
      const typeIdentifier = getQualifiedNameIdentifier(typeNode.typeName);
      return typeIdentifier ? HANDLER_TYPES.has(typeIdentifier) : false;
    }
    case AST_NODE_TYPES.TSUnionType:
      return typeNode.types.some(checkTypeAnnotationForHandler);
    case AST_NODE_TYPES.TSIntersectionType:
      return typeNode.types.some(checkTypeAnnotationForHandler);
    default:
      return false;
  }
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

const isParentIdAccess = (
  node: TSESTree.MemberExpression,
): {
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

  const refIndex = chain.lastIndexOf('ref');
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
  handlerNodes: Set<TSESTree.Node>,
): TSESTree.Node | null => {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (handlerNodes.has(current)) {
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

const findParamsIdentifier = (
  pattern: TSESTree.ObjectPattern,
): string | null => {
  for (const prop of pattern.properties) {
    if (
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      prop.key.name === 'params' &&
      prop.value.type === AST_NODE_TYPES.Identifier
    ) {
      return prop.value.name;
    }
  }
  return null;
};

const getParamsIdentifierInScope = (
  handlerNode: TSESTree.Node,
): string | null => {
  if (
    handlerNode.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    handlerNode.type !== AST_NODE_TYPES.FunctionExpression &&
    handlerNode.type !== AST_NODE_TYPES.FunctionDeclaration
  ) {
    return null;
  }

  const firstParam = handlerNode.params[0];
  if (!firstParam) {
    return null;
  }

  if (firstParam.type === AST_NODE_TYPES.ObjectPattern) {
    const identifier = findParamsIdentifier(firstParam);
    if (identifier) {
      return identifier;
    }
  }

  if (
    handlerNode.body &&
    handlerNode.body.type === AST_NODE_TYPES.BlockStatement
  ) {
    const eventParamName =
      firstParam.type === AST_NODE_TYPES.Identifier ? firstParam.name : 'event';
    for (const statement of handlerNode.body.body) {
      if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
        continue;
      }
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type !== AST_NODE_TYPES.ObjectPattern ||
          !declarator.init ||
          declarator.init.type !== AST_NODE_TYPES.Identifier ||
          declarator.init.name !== eventParamName
        ) {
          continue;
        }
        const identifier = findParamsIdentifier(declarator.id);
        if (identifier) {
          return identifier;
        }
      }
    }
  }

  return null;
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
      preferParams: [
        "What's wrong: This code reads an ID via `ref.parent...id` instead of using the trigger's params.",
        '',
        'Why it matters: Walking `ref.parent` ties the handler to the current path depth; when collections change, it can yield the wrong ID (or a collection name) and bypasses the typed params the trigger provides.',
        '',
        'How to fix: Read the ID from `params.{{paramName}}` (or destructure `const { params } = event` and then access `params.{{paramName}}`).',
      ].join('\n'),
    },
  },
  defaultOptions: [],
  create(context) {
    // Track functions that are Firebase change handlers
    const handlerNodes = new Set<TSESTree.Node>();

    return {
      // Track Firebase change handler functions
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
        node:
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression,
      ): void {
        if (isFirebaseChangeHandler(node)) {
          handlerNodes.add(node);
        }
      },

      // Detect .ref.parent.id patterns
      MemberExpression(node: TSESTree.MemberExpression): void {
        const parentAccess = isParentIdAccess(node);
        if (parentAccess.isMatch) {
          const handlerNode = findHandlerFunction(node, handlerNodes);

          if (handlerNode) {
            const isFunctionLikeNode =
              handlerNode.type === AST_NODE_TYPES.FunctionDeclaration ||
              handlerNode.type === AST_NODE_TYPES.FunctionExpression ||
              handlerNode.type === AST_NODE_TYPES.ArrowFunctionExpression;
            const hasOptional = hasOptionalChaining(node);
            const paramsIdentifier = isFunctionLikeNode
              ? getParamsIdentifierInScope(handlerNode)
              : null;

            if (!paramsIdentifier) {
              context.report({
                node,
                messageId: 'preferParams',
                data: {
                  paramName: getParentParamName(parentAccess.depth),
                },
              });
              return;
            }

            const paramsTarget = paramsIdentifier;
            // Suggest different parameter names based on depth
            // Note: These conventions may vary by data model; adjust if needed
            const paramSuggestion = getParentParamName(parentAccess.depth);

            context.report({
              node,
              messageId: 'preferParams',
              data: {
                paramName: paramSuggestion,
              },
              fix: (fixer) => {
                const replacement = hasOptional
                  ? `${paramsTarget}?.${paramSuggestion}`
                  : `${paramsTarget}.${paramSuggestion}`;
                return fixer.replaceText(node, replacement);
              },
            });
          }
        }
      },
    };
  },
});
