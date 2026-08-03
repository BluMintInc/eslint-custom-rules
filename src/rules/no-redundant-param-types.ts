import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';

type MessageIds = 'redundantParamType';

type ParamNode =
  | TSESTree.Identifier
  | TSESTree.RestElement
  | TSESTree.ObjectPattern
  | TSESTree.ArrayPattern
  | TSESTree.AssignmentPattern;

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
     * Reports a parameter annotation, taking with it any import it was the only
     * consumer of. The two are one fix: applying either half alone leaves the
     * file worse than applying neither — a stripped annotation with its import
     * left behind fails `no-unused-vars`, and since this rule's own report is
     * resolved by the fix, nothing re-reports the debt.
     *
     * Orphanhood is judged against this one annotation's own removal and the
     * file as it stands, never against what the rest of the `--fix` run might
     * also delete. A sibling annotation naming the same type may be
     * `eslint-disable`d — which a rule cannot see, since suppression is applied
     * to reports after they are emitted — so an edit that assumes its sibling
     * will also go deletes an import the surviving annotation still references,
     * trading an unused import for a dangling type. Judging one edit at a time
     * is suppression-safe by construction: a suppressed report's fix never
     * applies, so it can never have been depended on.
     *
     * The cost is that a type shared by several strippable annotations is not
     * unbound in a single pass; each pass removes the annotations it can see,
     * and only a pass that leaves the binding with no reference at all removes
     * the import.
     */
    function reportParam(
      param: ParamNode,
      typeAnnotation: TSESTree.TSTypeAnnotation,
    ): void {
      const removal = annotationRemovalRange(typeAnnotation, sourceCode);
      const importRanges = planOrphanedImportRemoval(sourceCode, [removal]);

      context.report({
        node: param,
        messageId: 'redundantParamType',
        data: {
          paramText: sourceCode.getText(param).replace(/\s+/g, ' ').trim(),
        },
        // No plan means no binding can be unbound safely, so the annotation
        // stays too: the report without a fixer is the lesser damage.
        ...(importRanges
          ? {
              fix: (fixer: TSESLint.RuleFixer) => [
                fixer.removeRange([removal[0], removal[1]]),
                ...importRanges.map((range) =>
                  fixer.removeRange([range[0], range[1]]),
                ),
              ],
            }
          : {}),
      });
    }

    return {
      ArrowFunctionExpression(node) {
        if (!hasRedundantTypeAnnotation(node)) return;

        (node.params as ParamNode[]).forEach((param) => {
          const typeAnnotation = annotationOf(param);
          if (typeAnnotation) {
            reportParam(param, typeAnnotation);
          }
        });
      },
    };
  },
});
