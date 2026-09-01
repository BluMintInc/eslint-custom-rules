import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval } from '../utils/importRemoval';

type MessageIds = 'enforceDateTTime';

/**
 * A violation found during traversal, held until `Program:exit`.
 *
 * `omitted` supplies TTime that was left out, an insertion that deletes nothing
 * and so can orphan nothing. `nonDate` overwrites an argument, taking every name
 * it mentions with it, and is the only kind that joins the import batch. Both
 * kinds defer so reports stay in traversal order regardless of which kind a file
 * mixes.
 */
type CandidateSite = {
  kind: 'omitted' | 'nonDate';
  reportNode: TSESTree.Node;
  reference: TSESTree.TSTypeReference;
  typeName: string;
  tTimeIndex: number;
};

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
    const sourceCode = context.getSourceCode();
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

    /**
     * Reporting is deferred to `Program:exit` because an import is unbound only
     * once no reference to it survives the fix, and a file where two arguments
     * name the same imported alias overwrites both in a single pass. Judging
     * each rewrite alone sees the sibling argument still standing, concludes the
     * binding is alive, and leaves the import stranded with no later pass to
     * notice — this rule's own reports are resolved by the fix, so nothing
     * re-reports the debt.
     */
    const sites: CandidateSite[] = [];

    /**
     * Suppression is applied to reports after a rule emits them, so a suppressed
     * site keeps its argument while losing its fix. Counting its range toward
     * orphanhood would unbind an import the surviving text still spells, trading
     * an unused import for a dangling type.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * Supplies a TTime that was left out entirely. Declines whenever the
     * argument cannot be appended positionally — a gap before TTime would need
     * every intervening parameter spelled out, and this rule does not invent
     * them.
     */
    function fixOmittedArgument(
      site: CandidateSite,
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix | null {
      const { reference, tTimeIndex } = site;

      if (reference.typeParameters) {
        const { params } = reference.typeParameters;
        if (tTimeIndex === params.length) {
          return fixer.insertTextAfter(params[params.length - 1], ', Date');
        }
        return null;
      }

      if (tTimeIndex === 0) {
        return fixer.insertTextAfter(reference.typeName, '<Date>');
      }

      return null;
    }

    /**
     * The rewrites that actually ship. A site is excluded when its report will
     * be suppressed, or when its own range holds the last reference to something
     * the helper cannot rewrite — a locally declared alias, or the enclosing
     * declaration's own type parameter. Deleting a declaration is a materially
     * riskier edit than dropping an import specifier, and a type parameter left
     * unread by its own body fails `no-unused-vars` and `noUnusedParameters`
     * exactly as an orphaned alias does, on top of turning a pass-through
     * generic into one whose argument no longer means anything.
     *
     * Screening individually before batching keeps one unfixable site from
     * vetoing the rest: orphanhood grows monotonically with the overwritten set,
     * so a site that cannot be planned alone can only ever poison the batch.
     */
    function selectRewritableSites(): CandidateSite[] {
      return sites.filter(
        (site) =>
          site.kind === 'nonDate' &&
          !isReportSuppressed(site.reportNode) &&
          planOrphanedImportRemoval(sourceCode, [site.reportNode.range]) !==
            null,
      );
    }

    return {
      'Program:exit'() {
        if (sites.length === 0) return;

        const rewrites = selectRewritableSites();
        const ranges = rewrites.map((site) => site.reportNode.range);
        // One plan over every surviving rewrite: an import referenced solely by
        // arguments that all go in this pass is orphaned by their union, even
        // though no single one of them orphans it.
        const importRanges =
          ranges.length > 0
            ? planOrphanedImportRemoval(sourceCode, ranges)
            : null;

        // The whole batch ships as one fix, so no rewrite can land without the
        // others that the import's orphanhood was judged against. The rest
        // report without a fixer; the carrier's pass already resolves them.
        const carrier = importRanges ? rewrites[0] : undefined;

        for (const site of sites) {
          if (site.kind === 'omitted') {
            context.report({
              node: site.reportNode,
              messageId: 'enforceDateTTime',
              data: { typeName: site.typeName },
              fix: (fixer) => fixOmittedArgument(site, fixer),
            });
            continue;
          }

          context.report({
            node: site.reportNode,
            messageId: 'enforceDateTTime',
            data: { typeName: site.typeName },
            fix:
              site === carrier && importRanges
                ? (fixer: TSESLint.RuleFixer) => [
                    ...rewrites.map((rewrite) =>
                      fixer.replaceText(rewrite.reportNode, 'Date'),
                    ),
                    ...importRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                  ]
                : null,
          });
        }
      },
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
          sites.push({
            kind: 'omitted',
            reportNode: node,
            reference: node,
            typeName,
            tTimeIndex,
          });
        } else if (!isExactDate(tTimeArg)) {
          sites.push({
            kind: 'nonDate',
            reportNode: tTimeArg,
            reference: node,
            typeName,
            tTimeIndex,
          });
        }
      },
    };
  },
});
