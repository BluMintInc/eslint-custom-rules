import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
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
  /** The arrow whose parameter list the annotation sits in. */
  arrow: TSESTree.ArrowFunctionExpression;
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

/**
 * Prettier lays an arrow function out against its print width, so a stripped
 * annotation changes what the formatter does with the parameter list around it:
 * a list broken one-per-line only because the annotation overflowed collapses
 * once it is gone, and the body then breaks instead if the collapsed line is
 * still too long. A fix that deletes the annotation and leaves the old layout
 * behind is rewritten the moment prettier runs, and agora runs prettier and
 * `eslint --fix` over the same tree, so the diff never settles (#2130).
 * Matching the default width keeps the fix canonical.
 */
const PRINT_WIDTH = 80;
const INDENT = '  ';

/**
 * One rewrite standing in for every strip an arrow's parameter list takes,
 * laid out the way prettier prints the stripped result.
 */
type Relayout = { range: TextRange; text: string };

/**
 * Bodies prettier moves onto their own line beneath `=>` when the arrow no
 * longer fits, printed flat there if they fit. Everything prettier instead hugs
 * against the arrow — arrays, objects, blocks, JSX, arrow chains — or wraps in
 * parentheses in one layout but not the other — conditionals, sequences,
 * assignments — is left out, so an unhandled body keeps the plain strip.
 */
const BREAKS_AFTER_ARROW = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.UnaryExpression,
]);

function overlaps(a: TextRange, b: TextRange): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function isNumericElement(element: TSESTree.Node): boolean {
  if (element.type === AST_NODE_TYPES.Literal) {
    return typeof element.value === 'number';
  }
  return (
    element.type === AST_NODE_TYPES.UnaryExpression &&
    (element.operator === '-' || element.operator === '+') &&
    isNumericElement(element.argument)
  );
}

/**
 * Lays one arrow's parameter list out the way prettier prints it once the
 * given annotations are gone, or `null` where the plain strip already is that
 * layout — or where the answer cannot be read off the source with confidence.
 */
class ArrowRelayoutPlanner {
  private readonly text: string;

  private readonly comments: TSESTree.Comment[];

  constructor(
    private readonly sourceCode: TSESLint.SourceCode,
    private readonly arrow: TSESTree.ArrowFunctionExpression,
    private readonly removals: readonly TextRange[],
  ) {
    this.text = sourceCode.getText();
    this.comments = sourceCode.getAllComments();
  }

  plan(): Relayout | null {
    const { sourceCode, arrow } = this;
    const firstParam = arrow.params[0];
    const lastParam = arrow.params[arrow.params.length - 1];
    if (!firstParam || !lastParam) return null;

    const openParen = sourceCode.getTokenBefore(firstParam);
    if (openParen?.value !== '(') return null;
    let closeParen = sourceCode.getTokenAfter(lastParam);
    while (closeParen?.value === ',') {
      closeParen = sourceCode.getTokenAfter(closeParen);
    }
    if (closeParen?.value !== ')') return null;

    const arrowToken = sourceCode.getTokenAfter(arrow.returnType ?? closeParen);
    if (arrowToken?.value !== '=>') return null;
    const firstBodyToken = sourceCode.getTokenAfter(arrowToken);
    if (!firstBodyToken) return null;
    // Text between the list and the body is carried verbatim, so a comment
    // there would ride onto a line prettier lays out around it differently.
    if (this.hasCommentBetween(closeParen.range[1], firstBodyToken.range[0])) {
      return null;
    }

    const flat = this.flatParameterList(openParen, closeParen);
    if (flat === null) return null;

    const openLine = openParen.loc.start.line;
    const closeLine = closeParen.loc.start.line;
    const openLineText = sourceCode.lines[openLine - 1];
    const head = openLineText.slice(0, openParen.loc.end.column);
    const indent = /^[ \t]*/.exec(openLineText)?.[0] ?? '';
    const collapsed = `(${flat})`;
    const between = this.text.slice(closeParen.range[1], arrowToken.range[1]);
    const lastToken = sourceCode.getLastToken(arrow);
    if (!lastToken) return null;

    if (openLine === closeLine) {
      return this.joinBodyBelow(
        head,
        flat,
        between,
        openParen,
        arrowToken,
        firstBodyToken,
        lastToken,
      );
    }
    if (firstBodyToken.loc.start.line !== closeLine) return null;

    const listRange: TextRange = [openParen.range[0], closeParen.range[1]];
    if (lastToken.loc.end.line === closeLine) {
      const closingTail = this.weighedLine(closeLine).slice(
        closeParen.loc.start.column,
      );
      if (`${head}${flat}${closingTail}`.length <= PRINT_WIDTH) {
        return { range: listRange, text: collapsed };
      }
      if (firstBodyToken.range[0] !== arrow.body.range[0]) return null;
      if (arrow.body.type === AST_NODE_TYPES.ArrayExpression) {
        return this.hugArray(head, flat, indent, openParen, closeParen);
      }
      if (BREAKS_AFTER_ARROW.has(arrow.body.type)) {
        return this.breakAfterArrow(
          head,
          flat,
          between,
          indent,
          openParen,
          closeParen,
          arrowToken,
        );
      }
      return null;
    }

    const opener = this.lastTokenOnLine(closeParen, closeLine);
    if (!this.opensPreservedBody(opener, firstBodyToken)) return null;
    const header = `${head}${flat}${this.text.slice(
      closeParen.range[0],
      opener.range[1],
    )}`;
    return header.length <= PRINT_WIDTH
      ? { range: listRange, text: collapsed }
      : null;
  }

  /**
   * A body prettier keeps broken whatever the header's width, so only the
   * parameter list answers to the collapse: a block, or an object literal the
   * author broke after its brace, which prettier preserves as written.
   */
  private opensPreservedBody(
    opener: TSESTree.Token,
    firstBodyToken: TSESTree.Token,
  ): boolean {
    const { arrow, sourceCode } = this;
    if (arrow.body.type === AST_NODE_TYPES.BlockStatement) {
      return opener === firstBodyToken && opener.value === '{';
    }
    if (
      arrow.body.type !== AST_NODE_TYPES.ObjectExpression ||
      firstBodyToken.value !== '(' ||
      arrow.body.properties.length === 0
    ) {
      return false;
    }
    const brace = sourceCode.getFirstToken(arrow.body);
    return (
      brace === opener &&
      brace.value === '{' &&
      arrow.body.properties[0].loc.start.line > brace.loc.end.line
    );
  }

  /**
   * Parameters already on one line, with a body that sat beneath the arrow only
   * because the annotated header left it no room: rejoin the two once the
   * whole statement fits.
   */
  private joinBodyBelow(
    head: string,
    flat: string,
    between: string,
    openParen: TSESTree.Token,
    arrowToken: TSESTree.Token,
    firstBodyToken: TSESTree.Token,
    lastToken: TSESTree.Token,
  ): Relayout | null {
    const bodyLine = firstBodyToken.loc.start.line;
    if (
      bodyLine !== arrowToken.loc.end.line + 1 ||
      lastToken.loc.end.line !== bodyLine ||
      this.text.slice(arrowToken.range[1], firstBodyToken.range[0]).trim() !==
        ''
    ) {
      return null;
    }
    const bodyText = this.weighedLine(bodyLine).slice(
      firstBodyToken.loc.start.column,
    );
    if (`${head}${flat}${between} ${bodyText}`.length > PRINT_WIDTH) {
      return null;
    }
    return {
      range: [openParen.range[0], firstBodyToken.range[0]],
      text: `(${flat})${between} `,
    };
  }

  /**
   * An array body prettier hugs against the arrow: the bracket stays on the
   * header line and the elements break one per line beneath it. Only an array
   * whose elements prettier prints flat is rebuilt — an element that is itself
   * an object or array, or an all-numeric list, gets a layout of its own.
   */
  private hugArray(
    head: string,
    flat: string,
    indent: string,
    openParen: TSESTree.Token,
    closeParen: TSESTree.Token,
  ): Relayout | null {
    const body = this.arrow.body as TSESTree.ArrayExpression;
    const elements = body.elements;
    if (elements.length === 0) return null;
    const present: TSESTree.Node[] = [];
    for (const element of elements) {
      if (!element) return null;
      present.push(element);
    }
    if (
      present.some(
        (element) =>
          element.type === AST_NODE_TYPES.ObjectExpression ||
          element.type === AST_NODE_TYPES.ArrayExpression ||
          element.loc.start.line !== element.loc.end.line,
      ) ||
      present.every(isNumericElement)
    ) {
      return null;
    }
    // A comment between elements belongs to no element and would not survive
    // the rebuild; one inside an element rides along with its text.
    const stray = this.comments.some(
      (comment) =>
        comment.range[0] >= body.range[0] &&
        comment.range[1] <= body.range[1] &&
        !present.some(
          (element) =>
            element.range[0] <= comment.range[0] &&
            comment.range[1] <= element.range[1],
        ),
    );
    if (stray) return null;

    const opener = this.text.slice(closeParen.range[1], body.range[0] + 1);
    if (`${head}${flat})${opener}`.length > PRINT_WIDTH) return null;
    const lines = present.map(
      (element) => `${indent}${INDENT}${this.sourceCode.getText(element)},`,
    );
    if (lines.some((line) => line.length > PRINT_WIDTH)) return null;
    return {
      range: [openParen.range[0], body.range[1]],
      text: `(${flat})${opener}\n${lines.join('\n')}\n${indent}]`,
    };
  }

  /**
   * A body prettier drops beneath the arrow, indented one step, once the
   * header no longer leaves it room on the line. Emitted only where the body
   * fits flat down there: past that prettier breaks inside it.
   */
  private breakAfterArrow(
    head: string,
    flat: string,
    between: string,
    indent: string,
    openParen: TSESTree.Token,
    closeParen: TSESTree.Token,
    arrowToken: TSESTree.Token,
  ): Relayout | null {
    const { body } = this.arrow;
    if (`${head}${flat})${between}`.length > PRINT_WIDTH) return null;
    const bodyText = this.weighedLine(closeParen.loc.start.line).slice(
      body.loc.start.column,
    );
    if (`${indent}${INDENT}${bodyText}`.length > PRINT_WIDTH) return null;
    if (this.text.slice(arrowToken.range[1], body.range[0]).trim() !== '') {
      return null;
    }
    return {
      range: [openParen.range[0], body.range[0]],
      text: `(${flat})${between}\n${indent}${INDENT}`,
    };
  }

  /**
   * The parameters rendered on one line with the annotations gone, or `null`
   * where prettier would keep the list broken: a line comment, a comment
   * spanning lines, or one on a line of its own inside the parentheses forces
   * its break. A block comment sharing a line with a parameter is carried onto
   * that parameter the way prettier attaches it — after the parameter it
   * follows, otherwise before the one it precedes.
   */
  private flatParameterList(
    openParen: TSESTree.Token,
    closeParen: TSESTree.Token,
  ): string | null {
    const { arrow, sourceCode } = this;
    const params = arrow.params;
    const leading = params.map(() => [] as string[]);
    const trailing = params.map(() => [] as string[]);

    for (const comment of this.comments) {
      if (
        comment.range[0] < openParen.range[1] ||
        comment.range[1] > closeParen.range[0] ||
        this.removals.some(
          (removal) =>
            removal[0] <= comment.range[0] && comment.range[1] <= removal[1],
        )
      ) {
        continue;
      }
      const commentText = sourceCode.getText(comment);
      if (
        comment.type !== AST_TOKEN_TYPES.Block ||
        commentText.includes('\n')
      ) {
        return null;
      }
      // A block comment alone on its line is one prettier prints on a line of
      // its own, which holds the list open; one sharing its line with code is
      // printed inline and travels with the parameter it annotates.
      const lineText = sourceCode.lines[comment.loc.start.line - 1];
      const aloneOnLine =
        lineText.slice(0, comment.loc.start.column).trim() === '' &&
        lineText.slice(comment.loc.end.column).trim() === '';
      if (aloneOnLine) return null;
      if (
        params.some(
          (param) =>
            param.range[0] <= comment.range[0] &&
            comment.range[1] <= param.range[1],
        )
      ) {
        continue;
      }
      let preceding = -1;
      params.forEach((param, index) => {
        if (param.range[1] <= comment.range[0]) preceding = index;
      });
      if (
        preceding !== -1 &&
        params[preceding].loc.end.line === comment.loc.start.line
      ) {
        trailing[preceding].push(commentText);
        continue;
      }
      const following = params.findIndex(
        (param) => param.range[0] >= comment.range[1],
      );
      if (following === -1) return null;
      leading[following].push(commentText);
    }

    const rendered = params.map((param, index) =>
      [
        ...leading[index],
        this.textWithout([param.range[0], param.range[1]]),
        ...trailing[index],
      ].join(' '),
    );
    if (rendered.some((text) => text.includes('\n'))) return null;
    return rendered.join(', ');
  }

  /** The source of `range` with every removal inside it cut out. */
  private textWithout(range: TextRange): string {
    const inside = this.removals
      .filter((removal) => removal[0] >= range[0] && removal[1] <= range[1])
      .sort((a, b) => a[0] - b[0]);
    let cursor = range[0];
    let out = '';
    for (const removal of inside) {
      out += this.text.slice(cursor, removal[0]);
      cursor = removal[1];
    }
    return out + this.text.slice(cursor, range[1]);
  }

  /**
   * A line as prettier weighs it against the print width: cut before a
   * trailing line comment, which prettier prints as a suffix that never
   * counts, and kept through a block comment, which occupies its columns.
   */
  private weighedLine(line: number): string {
    const text = this.sourceCode.lines[line - 1];
    const lineComment = this.comments.find(
      (comment) =>
        comment.type === AST_TOKEN_TYPES.Line &&
        comment.loc.start.line === line,
    );
    return (
      lineComment ? text.slice(0, lineComment.loc.start.column) : text
    ).trimEnd();
  }

  private lastTokenOnLine(from: TSESTree.Token, line: number): TSESTree.Token {
    let token = from;
    for (;;) {
      const next = this.sourceCode.getTokenAfter(token);
      if (!next || next.loc.start.line !== line) return token;
      token = next;
    }
  }

  private hasCommentBetween(start: number, end: number): boolean {
    return this.comments.some(
      (comment) => comment.range[0] >= start && comment.range[1] <= end,
    );
  }
}

/**
 * One layout per arrow whose list is stripped, standing in for that arrow's
 * removals. A plan is dropped when another edit of the same fix lands inside
 * its span — a nested arrow's strip, an import — since one fix cannot write a
 * byte twice.
 */
function planRelayouts(
  sourceCode: TSESLint.SourceCode,
  fixable: readonly CandidateSite[],
  importRanges: readonly TextRange[],
): { plans: Relayout[]; relaid: Set<CandidateSite> } {
  const byArrow = new Map<TSESTree.ArrowFunctionExpression, CandidateSite[]>();
  for (const site of fixable) {
    const group = byArrow.get(site.arrow);
    if (group) {
      group.push(site);
    } else {
      byArrow.set(site.arrow, [site]);
    }
  }

  const plans: Relayout[] = [];
  const relaid = new Set<CandidateSite>();
  for (const [arrow, group] of byArrow) {
    const plan = new ArrowRelayoutPlanner(
      sourceCode,
      arrow,
      group.map((site) => site.removal),
    ).plan();
    if (!plan) continue;
    const foreign = [
      ...fixable
        .filter((site) => !group.includes(site))
        .map((site) => site.removal),
      ...importRanges,
    ].some((range) => overlaps(range, plan.range));
    if (foreign) continue;
    plans.push(plan);
    group.forEach((site) => relaid.add(site));
  }
  return { plans, relaid };
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
        // Each stripped list is re-laid out as one edit where prettier would
        // change its shape; the strips it stands in for are not emitted again.
        const relayouts = importRanges
          ? planRelayouts(sourceCode, fixable, importRanges)
          : { plans: [], relaid: new Set<CandidateSite>() };

        for (const site of sites) {
          context.report({
            node: site.param,
            messageId: 'redundantParamType',
            data: { paramText: site.paramText },
            fix:
              site === carrier && importRanges
                ? (fixer: TSESLint.RuleFixer) => [
                    ...relayouts.plans.map((plan) =>
                      fixer.replaceTextRange(
                        [plan.range[0], plan.range[1]],
                        plan.text,
                      ),
                    ),
                    ...fixable
                      .filter((other) => !relayouts.relaid.has(other))
                      .map((other) =>
                        fixer.removeRange([other.removal[0], other.removal[1]]),
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
            arrow: node,
            param,
            removal: annotationRemovalRange(typeAnnotation, sourceCode),
            paramText: sourceCode.getText(param).replace(/\s+/g, ' ').trim(),
          });
        });
      },
    };
  },
});
