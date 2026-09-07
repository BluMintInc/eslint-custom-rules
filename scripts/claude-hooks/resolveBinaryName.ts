import { basename } from 'node:path';

/**
 * Suffixes a launcher spelling appends to a program's own name — the Windows
 * executable extensions a PATH lookup or a `.bin` shim surfaces, and the script
 * extensions a `node <entry>` invocation carries.
 *
 * Case-insensitive because Windows paths are: `git.EXE` reaches a guard exactly
 * as `git.exe` does, and a guard that normalizes one and not the other has a
 * hole nothing reports.
 */
const BINARY_SUFFIX_PATTERN = /\.(?:js|cjs|mjs|exe|cmd|bat)$/iu;

/**
 * The program a token names, with directory and launcher suffix removed, so
 * every spelling an agent types resolves to one name: a bare name on `PATH`,
 * `node_modules/.bin/jest`, an absolute path, a `.js` entry, a Windows `.cmd`
 * shim.
 *
 * Shared by every guard here rather than re-derived per guard, so three
 * matchers cannot end up with three notions of what a suffix is — a divergence
 * that is invisible from inside any one of them.
 */
export function resolveBinaryName(token: string) {
  return basename(token).replace(BINARY_SUFFIX_PATTERN, '');
}
