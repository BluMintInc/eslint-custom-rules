import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ClaudeCodePreToolUseInput } from '../preToolUseInput';
import { performGateContainmentGuard } from './performGateContainmentGuard';

/**
 * The binding between the guard's rules table and the documents an agent reads
 * before it types anything.
 *
 * A deny is legitimate only while no document in this repo prescribes the
 * spelling it refuses. An agent following its own repo's docs into a deny has
 * no route left, and reads the deny as a harness defect rather than as policy.
 * Nothing else in the repo grades the markdown under `.claude`, so without this
 * the sweep that met the bar decays on the next documentation change.
 */
const DOCS_ROOT = join(__dirname, '..', '..', '..', '.claude');

/** Trees under `.claude` that are not documentation an agent reads as
 * instruction: scratch output, and the sibling checkouts a worktree layout
 * parks here, whose own copies of these files are graded in their own tree. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'tmp',
  'worktrees',
  'node_modules',
]);

/**
 * The heads this guard has rules for. A command starting with anything else
 * cannot be denied, so scanning it would only add noise — and a head added to
 * `resolveToolInvocation` or to `resolveInvocationHead` is added here in the
 * same edit.
 *
 * A TOOL head is only half the set, and the missing half is a whole rules-table
 * row. Every spelling that strips the governor begins with a token no tool
 * registry carries, so grading tool heads alone filters row two out before
 * anything is graded, and a document prescribing
 * `env -u BLUMINT_GOVERNOR_CLI npm run test:related` — the exact workaround this
 * guard exists to delete — passes in silence. The wrappers are here for the
 * same reason one step earlier: `resolveInvocationHead` walks past them onto the
 * head that is denied, so `time npx jest` is a deny under a head no tool
 * registry carries either.
 */
const GRADED_HEADS: ReadonlySet<string> = new Set([
  'npm',
  'npx',
  'node',
  'yarn',
  'pnpm',
  'bunx',
  'env',
  'unset',
  'export',
  'timeout',
  'nice',
  'sudo',
  'xargs',
  'time',
  'stdbuf',
  'script',
]);

/** The other half of row two's head set: a `NAME=value` prefix, which is a
 * head shape rather than a name. */
const ASSIGNMENT_PREFIX = /^[A-Z_a-z]\w*=/;

/**
 * The sites that may carry a denied spelling because they DESCRIBE the deny
 * rather than prescribe the command: the two documents that state the rule, and
 * the one sentence in each other document telling the reader this command is
 * CI's alone.
 *
 * Keyed on the FILE as well as the command, never on the command alone. A
 * bare-string exemption covers the spelling everywhere at once, so the next
 * document to prescribe `npm run test:ci` in earnest inherits the exemption the
 * rules table needed — measured: with the string form, reintroducing exactly
 * that line into `jest/SKILL.md` passed this suite.
 *
 * A pair that goes stale fails rather than widening quietly; see the control
 * below.
 */
const DESCRIBED_AS_DENIED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  /** The rules table itself, which owes every denied spelling verbatim. */
  [
    'skills/claude-hooks/SKILL.md',
    new Set([
      'npm test',
      'npm run test',
      'npm run test:ci',
      'npm t',
      'npm --silent test',
      'npm run -s test',
    ]),
  ],
  /** §2b, which tells the maintainer loop the whole suite has no local
   * spelling and names each one it is refused. */
  [
    'skills/repo-maintenance/SKILL.md',
    new Set([
      'npm test',
      'npm run test',
      'npm run test:ci',
      'npm t',
      'npm --silent test',
    ]),
  ],
  /** Each of these names `npm run test:ci` once, as the command CI's
   * `test-report.yml` runs and the only surface that runs the whole suite. */
  ['CLAUDE.md', new Set(['npm test', 'npm run test:ci'])],
  ['skills/jest/SKILL.md', new Set(['npm test', 'npm run test:ci'])],
  ['skills/task-completion-standards/SKILL.md', new Set(['npm test'])],
  ['agents/fix-build-test.md', new Set(['npm test', 'npm run test:ci'])],
]);

const isDescribed = ({ file, command }: { file: string; command: string }) => {
  return DESCRIBED_AS_DENIED.get(file)?.has(command) === true;
};

/** A fenced code block's delimiter, whichever language it names. */
const FENCE = /^\s*```/;

/** An inline code span, the other place a document spells a command. */
const INLINE_CODE = /`([^`\n]+)`/g;

const markdownFiles = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : markdownFiles(path);
    }
    return entry.name.endsWith('.md') ? [path] : [];
  });
};

/**
 * One document's command-shaped text, from both carriers: a fenced block's
 * lines, and every inline code span outside one. A comment line inside a fence
 * is prose, and a `$`/`>` prompt marker is not part of the command.
 */
const readCommands = (source: string) => {
  const commands: string[] = [];
  let isFenced = false;
  for (const line of source.split('\n')) {
    if (FENCE.test(line)) {
      isFenced = !isFenced;
      continue;
    }
    if (isFenced) {
      const command = line.trim().replace(/^[$>]\s+/, '');
      if (command.length > 0 && !command.startsWith('#')) {
        commands.push(command);
      }
      continue;
    }
    for (const [, span] of line.matchAll(INLINE_CODE)) {
      commands.push(span.trim());
    }
  }
  return commands;
};

const isGraded = (command: string) => {
  const [head] = command.split(/\s+/);
  if (head === undefined) {
    return false;
  }
  return GRADED_HEADS.has(head) || ASSIGNMENT_PREFIX.test(head);
};

const buildInput = (command: string): ClaudeCodePreToolUseInput => {
  return {
    session_id: 'documented-commands',
    transcript_path: '/dev/null',
    cwd: DOCS_ROOT,
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  } as unknown as ClaudeCodePreToolUseInput;
};

const isDenied = (command: string) => {
  return (
    performGateContainmentGuard(buildInput(command)).hookSpecificOutput !==
    undefined
  );
};

const documented = markdownFiles(DOCS_ROOT).flatMap((path) => {
  return readCommands(readFileSync(path, 'utf-8'))
    .filter(isGraded)
    .map((command) => {
      return { file: relative(DOCS_ROOT, path).split(sep).join('/'), command };
    });
});

describe('the commands this repo documents', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /**
   * The floor, so a walk that stops finding documents passes forever while
   * asserting nothing — the vacuity failure every guard in this repo is
   * required to rule out.
   */
  it('finds the documented commands at all', () => {
    expect(documented.length).toBeGreaterThan(140); // measured 159
    expect(new Set(documented.map(({ file }) => file)).size).toBeGreaterThan(9); // measured 13
  });

  it('prescribes nothing the guard denies', () => {
    expect(
      documented.filter((entry) => {
        return !isDescribed(entry) && isDenied(entry.command);
      }),
    ).toEqual([]);
  });

  /**
   * The exemption's own control, in both directions. An entry naming a command
   * the guard allows exempts something nobody needed exempted; an entry naming
   * a site that no longer carries it is a stale pair that would go on covering
   * a spelling reintroduced there later.
   */
  it.each(
    [...DESCRIBED_AS_DENIED].flatMap(([file, commands]) => {
      return [...commands].map((command) => {
        return [file, command] as const;
      });
    }),
  )('exempts %s’s %p only while it is denied and present', (file, command) => {
    expect(isDenied(command)).toBe(true);
    expect(documented).toContainEqual({ file, command });
  });

  /**
   * The positive control: the sweep has to be able to SEE a denied spelling in
   * a document, or "nothing denied" means only that the scan missed it.
   */
  it.each([
    ['a fenced block', '```bash\nnpm run test:ci\n```'],
    ['an inline span', 'Run `npm test` to check your work.'],
    /** Row two, whose every spelling begins with a token no tool registry
     * carries: without a case per ROW the sweep can grade half the table while
     * reporting a clean run over the other half. */
    [
      'a governor strip',
      '```bash\nunset CI && npx jest src/tests/x.test.ts\n```',
    ],
    [
      'an env unset',
      'Never `env -u BLUMINT_GOVERNOR_CLI npm run test:related`.',
    ],
    [
      'a worker override',
      'Never `BLUMINT_MAX_WORKERS=13 npm run test:related -- src/rules/x.ts`.',
    ],
  ])('reads a denied spelling out of %s', (_label, source) => {
    expect(readCommands(source).filter(isGraded).filter(isDenied)).toHaveLength(
      1,
    );
  });
});
