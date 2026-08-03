import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';

type MessageIds = 'redundantParamType';

type ParamNode =
  | TSESTree.Identifier
  | TSESTree.RestElement
  | TSESTree.ObjectPattern
  | TSESTree.ArrayPattern
  | TSESTree.AssignmentPattern;

/** A redundant parameter annotation found during traversal, held until `Program:exit`. */
type CandidateSite = {
  param: ParamNode;
  /** The slice this site's fix deletes. */
  removal: TextRange;
  /** The parameter as written, rendered into the message. */
  paramText: string;
};

/**
 * The annotation a parameter carries, or `undefined` when it has none. A
 * parameter with a default value holds its annotation on the pattern it assigns
 * to, and only an identifier pattern is read there: a destructured parameter
 * with a default keeps its annotation.
 */
function annotationOf(param: ParamNode): TSESTree.TSTypeAnnotation | undefined {
  if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    return param.left.type === AST_NODE_TYPES.Identifier
      ? param.left.typeAnnotation
      : undefined;
  }
  return param.typeAnnotation;
}

/**
 * The slice a fix deletes to drop `typeAnnotation`. An optional marker goes with
 * it: contextual typing supplies a parameter's optionality along with its type,
 * so a `?` left behind keeps half of the duplication the rule exists to remove.
 */
function annotationRemovalRange(
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: { getText(): string },
): TextRange {
  const [typeStart, typeEnd] = typeAnnotation.range;
  const hasQuestionMark =
    typeStart > 0 && sourceCode.getText().charAt(typeStart - 1) === '?';
  return [hasQuestionMark ? typeStart - 1 : typeStart, typeEnd];
}

function hasRedundantTypeAnnotation(
  node: TSESTree.ArrowFunctionExpression,
): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Check variable declarations
  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  // Check class property assignments
  if (
    parent.type === AST_NODE_TYPES.PropertyDefinition &&
    parent.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  // Check assignments
  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier &&
    parent.left.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  return false;
}

export const noRedundantParamTypes = createRule<[], MessageIds>({
  name: 'no-redundant-param-types',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow redundant parameter type annotations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantParamType:
        'Parameter "{{paramText}}" repeats a type that the contextual function type already provides. Duplicate annotations drift out of sync and obscure the single source of truth for the signature. Remove the inline parameter annotation and rely on the variable or property type so the function stays aligned.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * An annotation is stripped together with any import it was the only
     * consumer of. The two are one fix: applying either half alone leaves the
     * file worse than applying neither — a stripped annotation with its import
     * left behind fails `no-unused-vars`, and since this rule's own report is
     * resolved by the fix, nothing re-reports the debt.
     *
     * Reporting is therefore deferred to `Program:exit`: an import is unbound
     * only once no reference to it survives the fix, and a file where two
     * annotations name the same imported type strips both in a single pass.
     * Judging each removal alone sees the sibling annotation still standing,
     * concludes the binding is alive, and leaves the import stranded with no
     * later pass to notice.
     */
    const sites: CandidateSite[] = [];

    /**
     * Suppression is applied to reports after a rule emits them, so a suppressed
     * site keeps its annotation while losing its fix. Counting its removal
     * toward orphanhood would unbind an import the surviving text still spells,
     * trading an unused import for a dangling type.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The strips that actually ship. A site is excluded when its report will be
     * suppressed, or when its own removal orphans something the helper cannot
     * rewrite — a local alias, an interface, a type parameter. Deleting a
     * declaration is a materially riskier edit than dropping an import
     * specifier, and the author is better placed to decide whether the type
     * should go or be used elsewhere.
     *
     * Screening individually before batching keeps one unfixable site from
     * vetoing the rest: orphanhood grows monotonically with the removed set, so
     * a site that cannot be planned alone can only ever poison the batch.
     */
    function selectFixableSites(): CandidateSite[] {
      return sites.filter(
        (site) =>
          !isReportSuppressed(site.param) &&
          planOrphanedImportRemoval(sourceCode, [site.removal]) !== null,
      );
    }

    return {
      'Program:exit'() {
        if (sites.length === 0) return;

        const fixable = selectFixableSites();
        const removals = fixable.map((site) => site.removal);
        // One plan over every surviving strip: an import referenced solely by
        // annotations that all go in this pass is orphaned by their union, even
        // though no single one of them orphans it.
        const importRanges =
          removals.length > 0
            ? planOrphanedImportRemoval(sourceCode, removals)
            : null;

        // The whole batch ships as one fix, so no strip can land without the
        // others that the import's orphanhood was judged against. The rest
        // report without a fixer; the carrier's pass already resolves them.
        //
        // No plan at all means no binding can be unbound safely, so every
        // annotation stays: reports without a fixer are the lesser damage.
        const carrier = importRanges ? fixable[0] : undefined;

        for (const site of sites) {
          context.report({
            node: site.param,
            messageId: 'redundantParamType',
            data: { paramText: site.paramText },
            fix:
              site === carrier && importRanges
                ? (fixer: TSESLint.RuleFixer) => [
                    ...removals.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                    ...importRanges.map((range) =>
                      fixer.removeRange([range[0], range[1]]),
                    ),
                  ]
                : null,
          });
        }
      },
      ArrowFunctionExpression(node) {
        if (!hasRedundantTypeAnnotation(node)) return;

        (node.params as ParamNode[]).forEach((param) => {
          const typeAnnotation = annotationOf(param);
          if (!typeAnnotation) return;

          sites.push({
            param,
            removal: annotationRemovalRange(typeAnnotation, sourceCode),
            paramText: sourceCode.getText(param).replace(/\s+/g, ' ').trim(),
          });
        });
      },
    };
  },
});
