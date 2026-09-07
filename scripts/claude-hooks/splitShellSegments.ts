import type { ParseEntry } from 'shell-quote';

/**
 * The invocation-splitting operator set, enumerated rather than inferred. `;`,
 * `||`, `|` and `&` are ordinary statement separators an agent's Bash payload
 * carries routinely, and treating only `&&` as a boundary would misread
 * `npm run build; npx jest` as one invocation, hiding the second from every
 * downstream rule.
 */
const SPLIT_OPERATORS = new Set(['&&', '||', ';', '|', '&']);

/**
 * Redirection operators, which bind a target word to the command they sit in
 * rather than starting a new one. Modelling them is what keeps
 * `npx jest 2>/dev/null` — a routine shape — from being declared unmodelled and
 * failing the whole command open.
 *
 * Exported because `stripGovernorEnvironment` walks the same raw token stream
 * and must model the same grammar: a redirect it read as unmodelled would fail
 * open on the very command this splitter reads fine, and `2>&1 | tail` is the
 * suffix an agent appends to nearly every long command.
 */
export const REDIRECT_OPERATORS: ReadonlySet<string> = new Set([
  '>',
  '>>',
  '<',
  '<<',
  '<<<',
  '>&',
  '<&',
]);

/**
 * A leading file descriptor, which `shell-quote` emits as an ordinary word
 * BEFORE the operator (`2>/dev/null` becomes `["2",{op:'>'},"/dev/null"]`).
 * Restricted to a single digit, the only spelling bash resolves without an
 * `exec`-opened descriptor, so an ordinary numeric argument that merely happens
 * to precede a redirect is left in place.
 */
export const FILE_DESCRIPTOR_PATTERN = /^\d$/;

/**
 * Splits a `shell-quote`-tokenized command into invocation segments, and
 * refuses everything else — GLOBALLY, for the whole command rather than per
 * segment. This function cannot know which segment a rule will care about, so
 * an operator it cannot model safely (`;;`, `(`, `)`, and `shell-quote`'s
 * `{op:'glob',…}` shape) makes the entire parse untrustworthy: two adjacent
 * unmodelled operators could just as easily be hiding another invocation as
 * not, and there is no way to tell from here.
 *
 * Redirections BIND rather than split: the operator, its target word and any
 * leading file-descriptor token are consumed, leaving the command they decorate
 * intact inside its segment. The target must be a WORD — an operator standing
 * where a target belongs (`>|`, which lexes as `{op:'>'}` then `{op:'|'}`) is
 * refused exactly like any other unmodelled operator.
 *
 * Both outcomes carry an explicit `kind`, so the caller narrows on a
 * discriminant rather than sniffing for a property the other arm happens not to
 * have.
 */
export function splitShellSegments(tokens: readonly ParseEntry[]) {
  const segments: (readonly ParseEntry[])[] = [];
  let current: ParseEntry[] = [];

  /**
   * Set the moment a redirection operator is consumed, cleared by the word that
   * follows it. A flag rather than an index lookahead: the target is always the
   * very next entry, so the state the loop needs is one bit, and carrying it
   * forward keeps the truncated-redirect case detectable after the loop ends.
   */
  let isAwaitingRedirectTarget = false;

  for (const token of tokens) {
    if (isAwaitingRedirectTarget && typeof token !== 'string') {
      return { kind: 'unmodelled', reason: 'redirect-target' } as const;
    }
    if (isAwaitingRedirectTarget) {
      isAwaitingRedirectTarget = false;
      continue;
    }
    if (typeof token === 'string') {
      current.push(token);
      continue;
    }
    if (!('op' in token)) {
      /** `{comment:…}` — passes through into its segment; whether a comment is
       * fatal is a question only the rule reading that segment can answer. */
      current.push(token);
      continue;
    }
    if (REDIRECT_OPERATORS.has(token.op)) {
      discardTrailingFileDescriptor(current);
      isAwaitingRedirectTarget = true;
      continue;
    }
    if (!SPLIT_OPERATORS.has(token.op)) {
      return { kind: 'unmodelled', reason: `operator:${token.op}` } as const;
    }
    segments.push(current);
    current = [];
  }

  if (isAwaitingRedirectTarget) {
    return { kind: 'unmodelled', reason: 'redirect-target' } as const;
  }

  segments.push(current);
  return { kind: 'segments', segments } as const;
}

/**
 * Removes the file-descriptor word a redirection was written against, if the
 * segment ends in one. `shell-quote` reports adjacency nowhere — `cmd 2>f` and
 * `cmd 2 >f` tokenize identically — so the single-digit shape is the whole
 * signal. Leaving it in place would offer a bare `2` to the operand walks
 * downstream.
 */
function discardTrailingFileDescriptor(current: ParseEntry[]) {
  const last = current[current.length - 1];
  if (typeof last === 'string' && FILE_DESCRIPTOR_PATTERN.test(last)) {
    current.pop();
  }
}
