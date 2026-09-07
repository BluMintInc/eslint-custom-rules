/** A URL's `//` disqualifies the `a:b` shape — MSYS2 leaves schemes alone, and
 * a `https://…` remote is the routine argument that would otherwise match. */
const URL_SCHEME_SEPARATOR = '://' as const;

/**
 * The two argv shapes MSYS2's argument conversion rewrites, expressed as
 * predicates over a single lexed token.
 *
 * They deliberately model the CONVERSION's trigger and not the harness's
 * doctrine: the doctrine's test is "is this argument a path on this machine's
 * filesystem?", which no text match can answer. What is decidable is the shape,
 * and the guard that consumes these predicates pairs each shape with a command
 * family whose argument at that position is known never to be a local path.
 */

/**
 * Whether a token would be rewritten by MSYS2's **path-list** heuristic — the
 * `a:b` shape that turns `origin/develop:.claude/x` into
 * `origin\develop;.claude\x`.
 *
 * **The `/` requirement is the load-bearing clause**, and it is what the field
 * evidence supports: every mangled argv carried slashes, while `database:get` —
 * an `a:b` token with no slash in either half, typed on the same boxes — is
 * reported working. It is also what keeps three routine shapes out of the
 * guard: a `--format=%H:%s` value (excluded again by the leading `-`), a
 * colon-shaped subcommand, and a bare `HEAD:file.ts`.
 *
 * A single character before the colon is a Windows drive letter (`C:/Users/…`),
 * which is already the native form MSYS2 leaves alone.
 */
export function isPathListShaped(token: string) {
  if (token.startsWith('-') || !token.includes('/')) {
    return false;
  }
  if (token.includes(URL_SCHEME_SEPARATOR)) {
    return false;
  }
  const colonIndex = token.indexOf(':');
  return colonIndex > 1 && colonIndex < token.length - 1;
}

/**
 * The POSIX-absolute value a token carries, or `undefined` — MSYS2's
 * **leading-slash** heuristic, which rewrites `/foo/bar` into
 * `C:/Program Files/Git/foo/bar`.
 *
 * The `=`-joined arm (`--git-dir=/abs`) matters only to the conflict scan: a
 * blanket `MSYS_NO_PATHCONV=1` suppresses conversion for the whole argv, so an
 * absolute path hiding inside an option value breaks exactly as a bare operand
 * would, and reporting only the bare spelling would hand back a prefix that
 * silently breaks the other half.
 */
export function resolvePosixAbsoluteValue(token: string) {
  if (token.startsWith('/')) {
    return token;
  }
  const equalsIndex = token.indexOf('=');
  if (!token.startsWith('-') || equalsIndex <= 0) {
    return;
  }
  const value = token.slice(equalsIndex + 1);
  return value.startsWith('/') ? value : undefined;
}
