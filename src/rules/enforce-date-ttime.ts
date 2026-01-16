import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceDateTTime';

export const enforceDateTTime = createRule<[], MessageIds>({
  name: 'enforce-date-ttime',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that any generic type parameter named TTime is explicitly set to Date in frontend code',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceDateTTime:
        'TTime must be Date in frontend code. Pass Date explicitly.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = (context as any).sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices;
    const checker = parserServices?.program?.getTypeChecker();

    if (!parserServices || !checker) {
      return {};
    }

    /**
     * Finds the index of the TTime parameter in the given symbol's declarations.
     */
    function findTTimeParameterIndex(symbol: ts.Symbol): number | undefined {
      const declarations = symbol.getDeclarations();
      if (!declarations) return undefined;

      for (const declaration of declarations) {
        if (
          ts.isTypeAliasDeclaration(declaration) ||
          ts.isInterfaceDeclaration(declaration) ||
          ts.isClassDeclaration(declaration)
        ) {
          if (declaration.typeParameters) {
            const index = declaration.typeParameters.findIndex(
              (tp) => tp.name.text === 'TTime',
            );
            if (index !== -1) return index;
          }
        }
      }

      return undefined;
    }

    /**
     * Checks if a type node is exactly "Date".
     */
    function isExactDate(node: TSESTree.TypeNode): boolean {
      if (
        node.type === AST_NODE_TYPES.TSTypeReference &&
        node.typeName.type === AST_NODE_TYPES.Identifier &&
        node.typeName.name === 'Date' &&
        (!node.typeParameters || node.typeParameters.params.length === 0)
      ) {
        return true;
      }
      return false;
    }

    return {
      TSTypeReference(node) {
        if (node.typeName.type !== AST_NODE_TYPES.Identifier) return;

        // Skip the "Date" type itself
        if (node.typeName.name === 'Date') return;

        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(
          node,
        ) as ts.TypeReferenceNode;

        const symbol = checker.getSymbolAtLocation(tsNode.typeName);
        if (!symbol) return;

        const tTimeIndex = findTTimeParameterIndex(symbol);
        if (tTimeIndex === undefined) return;

        const typeArgs = node.typeParameters?.params || [];
        const tTimeArg = typeArgs[tTimeIndex];

        if (!tTimeArg) {
          // TTime is omitted
          context.report({
            node,
            messageId: 'enforceDateTTime',
            fix(fixer) {
              if (node.typeParameters) {
                // Already has type parameters, but not enough to cover TTime
                const lastParam =
                  node.typeParameters.params[
                    node.typeParameters.params.length - 1
                  ];
                // Check if we can just append ", Date"
                // We can only do this safely if all parameters between existing ones and TTime have defaults.
                // For simplicity and safety, we only fix if tTimeIndex is the next one or if it's already provided.
                if (tTimeIndex === node.typeParameters.params.length) {
                  return fixer.insertTextAfter(lastParam, ', Date');
                }
              } else if (tTimeIndex === 0) {
                // No type parameters and TTime is the first one
                return fixer.insertTextAfter(node.typeName, '<Date>');
              }
              return null;
            },
          });
        } else if (!isExactDate(tTimeArg)) {
          // TTime is provided but is not exactly Date
          context.report({
            node: tTimeArg,
            messageId: 'enforceDateTTime',
            fix(fixer) {
              return fixer.replaceText(tTimeArg, 'Date');
            },
          });
        }
      },
    };
  },
});
