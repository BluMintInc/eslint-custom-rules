import { AST_TOKEN_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * Resolves whether a report location is suppressed by an inline ESLint disable
 * directive, from inside the rule itself.
 *
 * A rule that adds a shared edit — typically an `import` statement — by
 * attaching it to a single violation's fix makes that violation the file's
 * import carrier. ESLint calls `fix()` eagerly, while inline disable directives
 * are applied afterwards: a suppressed report takes its fix down with it. If the
 * carrier is suppressed, the surviving violations still emit their rewritten
 * code and the file ends up referencing an identifier that was never imported.
 * Resolving suppression up front lets the carrier slot fall to the first
 * violation that actually survives.
 *
 * The parsing below mirrors ESLint's own directive handling
 * (`lib/linter/apply-disable-directives.js`).
 */
const DIRECTIVE_PATTERN =
  /^(eslint-disable(?:-next-line|-line)?|eslint-enable)(?:\s|$)/;

/** ESLint separates a directive from its justification with ` -- `. */
const JUSTIFICATION_SEPARATOR = /\s-{2,}\s/;

type DirectiveKind =
  | 'disable'
  | 'enable'
  | 'disable-line'
  | 'disable-next-line';

export type Directive = {
  kind: DirectiveKind;
  /** `null` when the directive names no rule, which targets every rule. */
  rules: Set<string> | null;
  /**
   * For block directives, the comment's own position; for line-scoped ones,
   * the single source line the directive covers.
   */
  line: number;
  column: number;
};

function parseDirective(comment: TSESTree.Comment): Directive | null {
  const justification = JUSTIFICATION_SEPARATOR.exec(comment.value);
  const directivePart = (
    justification ? comment.value.slice(0, justification.index) : comment.value
  ).trim();

  const match = DIRECTIVE_PATTERN.exec(directivePart);
  if (!match) {
    return null;
  }
  const token = match[1];
  const kind = token.slice('eslint-'.length) as DirectiveKind;
  const isLineScoped = kind === 'disable-line' || kind === 'disable-next-line';

  // `eslint-disable`/`eslint-enable` are honoured only in block comments, and
  // a multi-line `eslint-disable-line` is rejected outright — both per ESLint.
  if (!isLineScoped && comment.type !== AST_TOKEN_TYPES.Block) {
    return null;
  }
  if (
    kind === 'disable-line' &&
    comment.loc.start.line !== comment.loc.end.line
  ) {
    return null;
  }

  const ruleList = directivePart.slice(token.length).trim();
  const rules =
    ruleList === ''
      ? null
      : new Set(
          ruleList
            .split(',')
            .map((rule) => rule.trim())
            .filter((rule) => rule !== ''),
        );

  // A multi-line `eslint-disable-next-line` targets the line after the comment
  // ends, not after it starts.
  const line =
    kind === 'disable-next-line'
      ? comment.loc.end.line + 1
      : comment.loc.start.line;

  return { kind, rules, line, column: comment.loc.start.column };
}

/**
 * Parses every disable/enable directive in a file, ordered by position so the
 * block-scoped pass can walk them as a timeline.
 */
export function parseDisableDirectives(
  comments: readonly TSESTree.Comment[],
): Directive[] {
  return comments
    .map(parseDirective)
    .filter((directive): directive is Directive => directive !== null)
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

function targetsRule(directive: Directive, ruleId: string): boolean {
  return directive.rules === null || directive.rules.has(ruleId);
}

/**
 * ESLint evaluates line-scoped directives in a pass of their own, so the
 * implicit re-enable that follows an `eslint-disable-next-line` cannot punch a
 * hole in a surrounding block disable. This mirrors that separation.
 */
function isBlockSuppressed(
  directives: readonly Directive[],
  ruleId: string,
  loc: TSESTree.Position,
): boolean {
  let globalDisabled = false;
  let ruleDisabled = false;
  // An `eslint-enable <rule>` carves a single rule out of a bare disable.
  let ruleReEnabled = false;

  for (const directive of directives) {
    if (directive.kind !== 'disable' && directive.kind !== 'enable') {
      continue;
    }
    const isBefore =
      directive.line < loc.line ||
      (directive.line === loc.line && directive.column <= loc.column);
    if (!isBefore) {
      break;
    }
    const isBare = directive.rules === null;
    if (!isBare && !targetsRule(directive, ruleId)) {
      continue;
    }

    if (directive.kind === 'disable') {
      if (isBare) {
        globalDisabled = true;
        ruleDisabled = false;
        ruleReEnabled = false;
      } else if (globalDisabled) {
        ruleReEnabled = false;
      } else {
        ruleDisabled = true;
      }
      continue;
    }
    if (isBare) {
      globalDisabled = false;
      ruleDisabled = false;
      ruleReEnabled = false;
    } else if (globalDisabled) {
      ruleReEnabled = true;
    } else {
      ruleDisabled = false;
    }
  }

  return ruleDisabled || (globalDisabled && !ruleReEnabled);
}

/**
 * Whether `ruleId` is disabled at `loc` by the already-parsed `directives`.
 */
export function isSuppressed(
  directives: readonly Directive[],
  ruleId: string,
  loc: TSESTree.Position,
): boolean {
  const lineSuppressed = directives.some(
    (directive) =>
      (directive.kind === 'disable-line' ||
        directive.kind === 'disable-next-line') &&
      directive.line === loc.line &&
      targetsRule(directive, ruleId),
  );
  return lineSuppressed || isBlockSuppressed(directives, ruleId, loc);
}

/**
 * Anything a rule already has in hand when it reports: a raw position, or any
 * node/token/comment carrying a `loc`. Rules reporting on expressions or JSX
 * elements pass the node as readily as ones reporting on method definitions.
 */
export type SuppressionTarget =
  | TSESTree.Position
  | { readonly loc: TSESTree.SourceLocation };

export type SuppressionChecker = (target: SuppressionTarget) => boolean;

function positionOf(target: SuppressionTarget): TSESTree.Position {
  return 'loc' in target ? target.loc.start : target;
}

/**
 * Builds a suppression predicate over a fixed set of comments. Exposed for
 * direct testing and for callers that hold comments rather than a rule context;
 * rules should prefer {@link createSuppressionChecker}.
 */
export function createSuppressionCheckerFor(
  comments: readonly TSESTree.Comment[],
  ruleId: string,
): SuppressionChecker {
  const directives = parseDisableDirectives(comments);
  return (target) => isSuppressed(directives, ruleId, positionOf(target));
}

/**
 * Builds a per-file suppression predicate for the rule that owns `context`.
 * Intended for a rule's `fix()` callback, which must decline to fix a report
 * ESLint is about to discard.
 *
 * The file's comments are parsed once, on first use, and reused for every
 * subsequent call — a rule asks this per violation.
 *
 * `context.id` is exactly the name a disable directive must spell, whether the
 * rule runs bare (as under `RuleTester`) or under its plugin prefix, so the
 * match never hardcodes a prefix.
 */
export function createSuppressionChecker<
  TMessageIds extends string,
  TOptions extends readonly unknown[],
>(
  context: Readonly<TSESLint.RuleContext<TMessageIds, TOptions>>,
): SuppressionChecker {
  let checker: SuppressionChecker | null = null;
  return (target) => {
    if (checker === null) {
      checker = createSuppressionCheckerFor(
        context.getSourceCode().getAllComments(),
        context.id,
      );
    }
    return checker(target);
  };
}
