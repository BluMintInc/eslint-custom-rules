import { TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type MessageIds = 'harnessCoupled';

/**
 * Recognizes ESLint disable directives (block or line) by their leading
 * keyword. `eslint-enable` deliberately does not match: it carries no
 * justification to classify.
 */
const DIRECTIVE_PREFIX = /^eslint-disable(?:-next-line|-line)?\b/;

/**
 * Unconditional harness terms — always flag. Each describes the Claude Code
 * CLI development harness and has no code-level meaning in a suppression
 * reason. When several co-occur, the one appearing FIRST in the justification
 * text is reported (see `findHarnessTerm`), so "claude session ... cwd" reports
 * `claude`, not `cwd`.
 */
const UNCONDITIONAL_MATCHERS: readonly { term: string; pattern: RegExp }[] = [
  // Word-boundary start, suffix/compound tolerant: worktree, worktrees,
  // worktree-cwd, cross-worktree, worktree-hook.
  { term: 'worktree', pattern: /\bworktree/ },
  // Word-boundary token, plural/possessive tolerant: cwd, cwds, cwd's.
  { term: 'cwd', pattern: /\bcwd(?:'?s)?\b/ },
  // Word-boundary start: claude, claude's, claude-code, claude code.
  { term: 'claude', pattern: /\bclaude/ },
  // The Claude Code Stop hook compound: stop-hook / stop hook / stop_hook,
  // plus near-adjacent forms with at most one intervening word ("stop lint
  // hook"). Distant incidental co-occurrence of "stop" and "hook" does not
  // match, keeping bare React-hook justifications safe.
  { term: 'stop-hook', pattern: /\bstop[-_ ]+(?:\w+[-_ ]+)?hook/ },
];

/**
 * Conditional session compound. `session` (auth session) is legitimate
 * code-level vocabulary, so it only flags in the unambiguous harness compounds
 * `agent session` / `claude session`. When it co-occurs with an unconditional
 * term, that term reports instead — so in practice only `agent session`
 * surfaces `session` as the matched term.
 */
const SESSION_MATCHER = {
  term: 'session',
  pattern: /\b(?:agent|claude)[-_ ]+sessions?\b/,
} as const;

function isDirectiveComment(comment: TSESTree.Comment): boolean {
  return DIRECTIVE_PREFIX.test(comment.value.trim());
}

/**
 * Pointer phrasing by which a directive DEFERS its rationale to an adjacent
 * comment: "see above", "per the note below", "as noted in the comment".
 * Up to two intervening words ("the note", "the preceding") are tolerated so
 * natural phrasings still register as deferrals.
 */
const DEFERRAL_PATTERN =
  /\b(?:see|per|as)\s+(?:\w+\s+){0,2}(?:above|below|note|comment|preceding)\b/i;

/**
 * A directive defers to its preceding comment only when its own `--` text is a
 * mere pointer to that comment ("see above") or carries no substantive words at
 * all (a bare "^" gesture). This is the discriminating signal for #1296's
 * split-justification support: a directive that already states a substantive,
 * self-contained reason owns its rationale outright, so an unrelated docblock or
 * line comment that merely sits above it — documenting the declaration, not the
 * suppression — must never contribute its incidental harness keywords (#1312).
 */
function defersToPreceding(justification: string): boolean {
  const text = justification.trim();
  if (DEFERRAL_PATTERN.test(text)) {
    return true;
  }
  return text.replace(/[^a-z]/gi, '') === '';
}

/**
 * Isolates the justification text of a directive comment: everything after the
 * first `--` separator, spanning every line of a multi-line block body. The
 * directive keyword and the comma-separated rule-name list both precede the
 * `--` (and never contain `--`), so slicing past it strips them in one step.
 * Returns `null` when there is no `--` — a bare disable with no justification
 * is out of scope.
 */
function extractJustification(comment: TSESTree.Comment): string | null {
  const separatorIndex = comment.value.indexOf('--');
  if (separatorIndex === -1) {
    return null;
  }
  return comment.value.slice(separatorIndex + 2);
}

function findHarnessTerm(text: string): string | null {
  const lowered = text.toLowerCase();
  let earliest: { term: string; index: number } | null = null;
  for (const { term, pattern } of UNCONDITIONAL_MATCHERS) {
    const match = pattern.exec(lowered);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { term, index: match.index };
    }
  }
  if (earliest !== null) {
    return earliest.term;
  }
  // Only reached when no unconditional term is present: an isolated harness
  // session compound.
  if (SESSION_MATCHER.pattern.test(lowered)) {
    return SESSION_MATCHER.term;
  }
  return null;
}

export const noHarnessCoupledDisables = createRule<[], MessageIds>({
  name: 'no-harness-coupled-disables',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow eslint-disable justifications that reference the agent development harness (worktree, cwd, stop-hook, claude) instead of the code’s own semantics.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      harnessCoupled:
        "This eslint-disable justification references the development harness ('{{matchedTerm}}'), not the code's own semantics. Harness quirks (how the stop hook invokes lint, cwd resolution, worktree path mapping) belong in harness config — fix the hook, not the source. See the harness docs referenced in the disable-directive hygiene section of the repo's linting skill doc. If this disable is NOT harness-related and the word is a false match (e.g. 'hook' meaning a React hook), rephrase the justification to describe the code-level reason instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const comments = sourceCode.getAllComments();

    return {
      Program() {
        comments.forEach((comment, index) => {
          if (!isDirectiveComment(comment)) {
            return;
          }

          const justification = extractJustification(comment);
          // No `--` separator, or nothing but whitespace after it: a bare
          // disable carries no justification to classify (out of scope).
          if (justification === null || justification.trim() === '') {
            return;
          }

          // Split-justification style: an immediately-adjacent preceding
          // non-directive comment (no intervening blank line or code) is part
          // of the directive's rationale ONLY when the directive defers to it.
          // Without the deferral gate, an unrelated docblock above the
          // declaration bleeds its incidental harness words into a directive
          // that already carries a self-contained code-level reason (#1312).
          let scanned = justification;
          const previous = comments[index - 1];
          if (
            previous &&
            !isDirectiveComment(previous) &&
            comment.loc.start.line - previous.loc.end.line <= 1 &&
            defersToPreceding(justification)
          ) {
            scanned = `${previous.value}\n${scanned}`;
          }

          const matchedTerm = findHarnessTerm(scanned);
          if (matchedTerm === null) {
            return;
          }

          context.report({
            loc: comment.loc,
            messageId: 'harnessCoupled',
            data: { matchedTerm },
          });
        });
      },
    };
  },
});
