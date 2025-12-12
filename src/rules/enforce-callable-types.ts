import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds =
  | 'missingPropsType'
  | 'missingResponseType'
  | 'unusedPropsType'
  | 'unusedResponseType';

export const enforceCallableTypes = createRule<Options, MessageIds>({
  name: 'enforce-callable-types',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce Props and Response type exports in callable functions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingPropsType:
        'Callable functions must export a Props type to describe the request payload. Without Props the callable accepts any data and loses compile-time validation; export `type Props = { ... }` and use it in `CallableRequest<Props>` so request.data stays typed.',
      missingResponseType:
        'Callable functions must export a Response type to document what the function returns. Without Response the callable can return any shape and break clients; export `type Response = ...` and return that shape from the handler.',
      unusedPropsType:
        'Props is exported but never used in the onCall handler. An unused Props type lets the request payload drift from the code that reads it; annotate the handler parameter as `CallableRequest<Props>` or remove Props if the callable does not accept data.',
      unusedResponseType:
        'Response is exported but never used in the callable return type. Without applying Response, the callable can return any payload and clients lose a stable contract; return Response (or Promise<Response>) from the handler or remove the unused type.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();

    // Only apply to .f.ts files in the callable directory, but ignore scripts directory
    if (
      !filename.endsWith('.f.ts') ||
      !filename.includes('/callable/') ||
      filename.includes('/callable/scripts/')
    ) {
      return {};
    }

    let hasPropsExport = false;
    let hasResponseExport = false;
    let hasCallableFunction = false;
    let propsTypeUsed = false;
    let responseTypeUsed = false;

    return {
      // Check for type exports
      ExportNamedDeclaration(node) {
        if (node.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          const typeName = node.declaration.id.name;
          if (typeName === 'Props') {
            hasPropsExport = true;
          } else if (typeName === 'Response') {
            hasResponseExport = true;
          }
        }
        const isTypeExport =
          node.exportKind === 'type' || node.declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration;
        for (const specifier of node.specifiers ?? []) {
          const specIsTypeExport =
            isTypeExport || specifier.exportKind === 'type';
          if (!specIsTypeExport) continue;

          const exportedName =
            specifier.exported.type === AST_NODE_TYPES.Identifier
              ? specifier.exported.name
              : specifier.local.type === AST_NODE_TYPES.Identifier
                ? specifier.local.name
                : undefined;

          if (exportedName === 'Props') {
            hasPropsExport = true;
          } else if (exportedName === 'Response') {
            hasResponseExport = true;
          }
        }
      },

      // Check for onCall usage
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'onCall'
        ) {
          hasCallableFunction = true;
        }
      },

      // Check for type usage in function parameters and return types
      TSTypeReference(node) {
        if (node.typeName.type === AST_NODE_TYPES.Identifier) {
          if (node.typeName.name === 'Props') {
            propsTypeUsed = true;
          } else if (node.typeName.name === 'Response') {
            responseTypeUsed = true;
          }
        }
      },

      'Program:exit'() {
        if (!hasCallableFunction) {
          return;
        }

        if (!hasPropsExport) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingPropsType',
          });
        } else if (!propsTypeUsed) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'unusedPropsType',
          });
        }

        if (!hasResponseExport) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missingResponseType',
          });
        } else if (!responseTypeUsed) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'unusedResponseType',
          });
        }
      },
    };
  },
});
