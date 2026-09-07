/**
 * Substitutes a literal `;` for every raw newline in a Bash payload, so
 * `shell-quote` sees the invocation boundary a newline is.
 *
 * `shell-quote` does not tokenize a bare newline as an operator at all — it is
 * swallowed exactly like whitespace, so `npm run build\nnpx jest` and
 * `npm run build npx jest` tokenize identically, with no trace of where the
 * boundary was. Splitting the raw string on `\n` before tokenizing is unsafe on
 * its own: an unterminated quote spanning two physical lines degrades to
 * space-split tokens with no error. Substituting first delegates the
 * quote-awareness to `shell-quote` itself — an unquoted newline becomes an
 * unquoted `;`, and one inside a quoted value becomes a literal `;` character
 * inside that same token, a content substitution rather than a lost boundary.
 *
 * **A backslash-newline is a line CONTINUATION**, which bash joins into one
 * command, so substituting it would leave an escaped `;` standing where the
 * next token belongs. Continuations are therefore joined in the same pass, and
 * the backslash run's PARITY decides which case a match is: an odd run ends in
 * a real escape (the pair is removed), while an even run is literal backslashes
 * followed by a genuine newline, which stays a boundary. Reading `\\⏎` as a
 * continuation would swallow the boundary this function exists to preserve, one
 * character over.
 */
export function injectNewlineSeparators(command: string) {
  return command.replace(
    /(\\*)(?:\r\n|\r|\n)/g,
    (_match: string, backslashes: string) => {
      if (backslashes.length % 2 === 1) {
        return backslashes.slice(1);
      }
      return `${backslashes};`;
    },
  );
}
