import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';
import { planOrphanedImportRemoval } from '../utils/importRemoval';

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
        '{{typeName}} leaves TTime unspecified or not Date → Firestore Frontend Hooks convert Timestamp to Date on the client, so non-Date TTime misrepresents runtime values and forces defensive conversions → Set the TTime argument to Date explicitly (e.g., {{typeName}}<..., Date, ...>).',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode =
      (context as typeof context & { sourceCode?: TSESLint.SourceCode })
        .sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode?.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker();

    if (!parserServices || !checker) {
      return {};
    }

    const tTimeIndexCache = new WeakMap<ts.Symbol, number | undefined>();

    /**
     * Finds the index of the TTime parameter in the given symbol's declarations.
     */
    function findTTimeParameterIndex(symbol: ts.Symbol): number | undefined {
      if (tTimeIndexCache.has(symbol)) {
        return tTimeIndexCache.get(symbol);
      }

      const declarations = symbol.getDeclarations();
      if (!declarations) {
        tTimeIndexCache.set(symbol, undefined);
        return undefined;
      }

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
            if (index !== -1) {
              tTimeIndexCache.set(symbol, index);
              return index;
            }
          }
        }
      }

      tTimeIndexCache.set(symbol, undefined);
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
        const typeNameNode =
          node.typeName.type === AST_NODE_TYPES.TSQualifiedName
            ? node.typeName.right
            : node.typeName;

        if (typeNameNode.type !== AST_NODE_TYPES.Identifier) return;

        // Skip the "Date" type itself
        if (typeNameNode.name === 'Date') return;

        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(
          node,
        ) as ts.TypeReferenceNode;

        const symbol = checker.getSymbolAtLocation(tsNode.typeName);
        if (!symbol) return;

        const resolvedSymbol =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;

        const tTimeIndex = findTTimeParameterIndex(resolvedSymbol);
        if (tTimeIndex === undefined) return;

        const typeArgs = node.typeParameters?.params || [];
        const tTimeArg = typeArgs[tTimeIndex];
        const typeName = sourceCode.getText(node.typeName);

        if (!tTimeArg) {
          // TTime is omitted
          context.report({
            node,
            messageId: 'enforceDateTTime',
            data: { typeName },
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
          // TTime is provided but is not exactly Date. Overwriting the argument
          // deletes every name it mentions, so the rewrite and the unbinding of
          // whatever it was the last reference to are one fix: applying either
          // half alone leaves the file worse than applying neither, and since
          // this rule's own report is resolved by the fix, nothing re-reports
          // the debt an orphaned declaration becomes.
          //
          // Orphanhood is judged against this one argument's own range and the
          // file as it stands, never against what the rest of the `--fix` run
          // might also overwrite. A sibling argument naming the same alias may
          // be `eslint-disable`d — which a rule cannot see, since suppression is
          // applied to reports after they are emitted — so an edit assuming its
          // sibling will also go unbinds an import the survivor still
          // references, trading an unused import for a dangling type. Judging
          // one edit at a time is suppression-safe by construction.
          const importRanges = planOrphanedImportRemoval(sourceCode, [
            tTimeArg.range,
          ]);

          context.report({
            node: tTimeArg,
            messageId: 'enforceDateTTime',
            data: { typeName },
            // No plan means the argument holds the last reference to something
            // the helper cannot rewrite — a locally declared alias, or the
            // enclosing declaration's own type parameter — so the argument
            // stays as written: the report without a fixer is the lesser
            // damage. Deleting a declaration is a materially riskier edit than
            // dropping an import specifier, and a type parameter left unread by
            // its own body fails `no-unused-vars` and `noUnusedParameters`
            // exactly as an orphaned alias does, on top of turning a
            // pass-through generic into one whose argument no longer means
            // anything.
            ...(importRanges
              ? {
                  fix: (fixer: TSESLint.RuleFixer) => [
                    fixer.replaceText(tTimeArg, 'Date'),
                    ...importRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                  ],
                }
              : {}),
          });
        }
      },
    };
  },
});
