import { formatBacktickedList } from '../formatBacktickedList';
import type { WindowsTmpOffense } from './findWindowsTmpChildReads';

const DOCTRINE_REFERENCE =
  'See .claude/skills/shell-portability/SKILL.md: the path a CHILD resolves for itself.' as const;

/**
 * The positions that are CORRECT as written. Stated in the deny because the
 * expensive misreading of this rule is the over-correction: an agent told its
 * `/tmp` is broken rewrites the redirect too, and the redirect is the half MSYS
 * resolves properly.
 */
const BENIGN_POSITIONS =
  'A `/tmp` path bash resolves (`> /tmp/x`, `cat /tmp/x`) or hands to a child in ARGV (`jq … /tmp/x.json`) is correct as written — do not change those.' as const;

const REQUIRE_PREFIX =
  "Move the WRITE as well as this read: a read pointed at a sink nothing wrote fails the same way with a different message. Keep the `./` on a `require` — a bare `require('.claude/tmp/…')` is a bare specifier and answers `MODULE_NOT_FOUND` on every platform; `readFileSync` takes either." as const;

/** A rooted `/tmp` carrying no segment after the root — a `process.chdir`, a
 * `readdirSync`. */
const ROOT_TMP_DIRECTORY = '/tmp' as const;

/**
 * A `chdir` performs neither the write nor the read the capture remedy
 * choreographs, and has no filename to move, so that remedy would publish two
 * operations the command never performs beneath a path it never used.
 */
const DIRECTORY_REMEDY =
  'Point this command at a repo-local directory both processes resolve, then retry:\n\n  mkdir -p .claude/tmp/<scope>\n  # then re-run this command against ./.claude/tmp/<scope> rather than /tmp' as const;

/**
 * The deny text an agent reads off the tool result. Remedy first and cause
 * second, on the opaque-delivery floor every guard in this directory writes to.
 *
 * No pasteable command, deliberately: the fix spans two commands — the one that
 * WROTE the capture and this one that reads it — and the guard sees only the
 * read, so a rewritten read published here would point at a sink nothing ever
 * wrote. The remedy opens with the `mkdir -p`, because the prescribed directory
 * does not exist in a fresh worktree and the redirect's `rc=1` then reads as a
 * tool failure.
 *
 * agora redacts every path it quotes here, through a secret registry rooted in
 * its backend. This port quotes them plainly: the only strings it echoes are
 * `/tmp` paths its own regex matched, which carry no credential shape, and
 * porting a 400-line registry that imports test-account credentials to redact
 * them would cost more than it protects.
 */
export function buildWindowsTmpDenyReason(offense: WindowsTmpOffense) {
  const [first, ...rest] = offense.paths;
  if (first === undefined) {
    /** A deny naming no path is unfollowable, so this fails loudly rather than
     * publishing one. `findWindowsTmpChildReads` reports an offense only for a
     * line carrying a rooted `/tmp`, so reaching here means that invariant
     * broke and the message would be worthless either way. */
    throw new Error('a windows-tmp deny must name at least one path');
  }
  const arePlural = rest.length > 0;
  const listed = formatBacktickedList(first, rest);
  const isDirectory = first === ROOT_TMP_DIRECTORY;
  return [
    isDirectory ? DIRECTORY_REMEDY : buildCaptureRemedy(first),
    `${listed} ${
      arePlural ? 'sit' : 'sits'
    } inside a code string the child parses for ITSELF, so neither bash nor MSYS2's argv conversion ever resolves ${
      arePlural ? 'them' : 'it'
    }: the child resolves the literal against the current drive as \`C:\\tmp\\…\` and dies \`ENOENT\` — or \`MODULE_NOT_FOUND\`, which accuses the module resolver instead — one command after a write that plainly succeeded, naming a path you never typed.`,
    ...(isDirectory ? [] : [REQUIRE_PREFIX]),
    BENIGN_POSITIONS,
    DOCTRINE_REFERENCE,
  ].join('\n\n');
}

function buildCaptureRemedy(first: string) {
  const file = resolveFileName(first);
  return `Move the capture to a repo-local sink both processes resolve, then retry:\n\n  mkdir -p .claude/tmp/<scope>\n  # write it to .claude/tmp/<scope>/${file} rather than ${first}\n  # then re-run this command reading ./.claude/tmp/<scope>/${file}`;
}

/**
 * The last segment of a POSIX literal lifted out of a command string. Not
 * `node:path`'s `basename`, which follows the HOST's separator conventions —
 * and the one platform this guard runs on is the one whose host rules differ.
 */
function resolveFileName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}
