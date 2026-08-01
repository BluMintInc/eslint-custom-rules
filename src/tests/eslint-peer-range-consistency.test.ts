import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { satisfies } from 'semver';

/**
 * The published `peerDependencies.eslint` range is a promise about which ESLint
 * majors this plugin runs on. It was `>=7` while 33 rules called
 * `context.getScope()` and friends, which ESLint 9 removed — so a consumer
 * installed cleanly and then every lint run aborted with
 * `TypeError: context.getScope is not a function` (#1540).
 *
 * The whole suite passes on ESLint 8 whether or not the rules are v9-safe, so
 * nothing else can catch this. This guard ties the two together: the range may
 * only admit a major once no source still calls the APIs that major removed.
 * Migrating the call sites is what unlocks widening the range.
 */

const SRC = join(__dirname, '..');
const PKG = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as { peerDependencies?: Record<string, string> };

/** Rule-context methods ESLint 9 removed, with their SourceCode replacements. */
const REMOVED_IN_V9 = [
  'getScope',
  'getDeclaredVariables',
  'getAncestors',
  'markVariableAsUsed',
  'getSource',
  'getSourceLines',
  'getAllComments',
  'getNodeByRangeIndex',
] as const;

const CALL_PATTERN = new RegExp(
  `context\\.(${REMOVED_IN_V9.join('|')})\\(`,
  'g',
);

const declaredRange = PKG.peerDependencies?.eslint;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFilesUnder(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

const sourceFiles = [
  ...tsFilesUnder(join(SRC, 'rules')),
  ...tsFilesUnder(join(SRC, 'utils')),
];

const offenders = sourceFiles
  .map((file) => {
    const matches = [
      ...new Set(
        [...readFileSync(file, 'utf8').matchAll(CALL_PATTERN)].map((m) => m[1]),
      ),
    ];
    return { file: file.slice(SRC.length + 1), matches };
  })
  .filter((entry) => entry.matches.length > 0);

describe('eslint peer range must match the context APIs the source uses', () => {
  it('scans a meaningful number of source files', () => {
    // Without this floor a broken glob would empty `offenders` and the range
    // assertion below would pass while proving nothing.
    expect(sourceFiles.length).toBeGreaterThan(150);
  });

  it('declares an eslint peer range', () => {
    expect(typeof declaredRange).toBe('string');
  });

  it('does not advertise an ESLint major whose removed APIs the source calls', () => {
    const range = declaredRange ?? '';
    const admitsV9 = satisfies('9.0.0', range, {
      includePrerelease: true,
    });
    if (!admitsV9 || offenders.length === 0) {
      expect(true).toBe(true);
      return;
    }
    const detail = offenders
      .map(
        (o) =>
          `  ${o.file}: ${o.matches.map((m) => `context.${m}()`).join(', ')}`,
      )
      .join('\n');
    expect(
      `peerDependencies.eslint is "${range}", which admits ESLint 9, but ${offenders.length} source file(s) still call APIs ESLint 9 removed:\n${detail}\n` +
        '  Either migrate these to the SourceCode equivalents (sourceCode.getScope(node), ...) or keep the range below 9.',
    ).toBe('');
  });

  it('detects the mismatch it is meant to catch (positive control)', () => {
    // Proves the range check can go red: the historical ">=7" plus today's
    // call sites is exactly the #1540 defect.
    const admitsV9 = satisfies('9.0.0', '>=7', {
      includePrerelease: true,
    });
    expect(admitsV9 && offenders.length > 0).toBe(true);
  });
});
