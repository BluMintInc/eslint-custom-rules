/**
 * Re-emits lexed tokens as a command line an agent can paste back.
 *
 * `shell-quote`'s own `quote()` is deliberately not used here: it escapes a
 * colon (`origin/develop:.claude/x` → `origin/develop\:.claude/x`), which is
 * correct bash and unreadable prose — and this guard's entire message is about
 * a colon, so publishing a retry whose colon is backslash-escaped invites the
 * reader to wonder whether the escape is part of the fix.
 *
 * The safe-character set is the conventional one (`shlex.quote`'s): a token
 * made only of these needs no quoting in any POSIX shell, and everything else
 * is single-quoted with embedded single quotes spliced.
 */
const SHELL_SAFE_TOKEN_PATTERN = /^[\w%+,./:=@-]+$/;

export function formatShellSegment(tokens: readonly string[]) {
  return tokens
    .map((token) => {
      return quoteShellToken(token);
    })
    .join(' ');
}

export function quoteShellToken(token: string) {
  if (SHELL_SAFE_TOKEN_PATTERN.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", `'\\''`)}'`;
}
