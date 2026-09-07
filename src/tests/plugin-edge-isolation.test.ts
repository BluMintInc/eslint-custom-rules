import fs from 'node:fs';
import path from 'node:path';

/**
 * Holds jest's relatedness graph to one shape: nothing under `src/` names the
 * plugin barrel with a literal specifier, and `src/utils/loadPlugin.ts` reaches
 * it through a computed path instead.
 *
 * `--findRelatedTests` walks the import graph transitively and jest builds that
 * graph by regex over source text, so a single literal specifier for the barrel
 * makes every whole-corpus guard related to every rule: one rule change selected
 * 61 suites, seventeen of them 8 to 22 minutes each, and the run filled a shared
 * box. A computed path records no edge while loading the same module from the
 * same registry, so the property is invisible at every other gate — the sweep
 * survives only while something fails when the next literal arrives.
 *
 * The oracle is jest's own extractor rather than a regex of this file's, so the
 * spellings that count here are exactly the spellings that create an edge.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const RULES_DIR = path.join(SRC_DIR, 'rules');
const TESTS_DIR = path.join(SRC_DIR, 'tests');
const BARREL_MODULE = path.join(SRC_DIR, 'index');
const LOADER_FILE = path.join(SRC_DIR, 'utils', 'loadPlugin.ts');

/**
 * Loaded by absolute path: `jest-haste-map`'s `exports` map does not publish
 * this deep path, so a bare specifier is refused at resolution. The path is
 * joined from `__dirname` because `node_modules` is a symlink into the primary
 * checkout in every agent worktree.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires -- a computed path cannot be spelled as an import
const { extractor } = require(path.join(
  REPO_ROOT,
  'node_modules',
  'jest-haste-map',
  'build',
  'lib',
  'dependencyExtractor.js',
)) as { extractor: { extract: (code: string) => Set<string> } };

const SOURCE_EXTENSIONS = /\.tsx?$/;

const collectSources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    return SOURCE_EXTENSIONS.test(entry.name) ? [full] : [];
  });

const withoutExtension = (file: string) =>
  file.replace(/\.(tsx?|jsx?|json)$/, '');

/**
 * Where a specifier lands, or null for a package specifier. A directory
 * specifier is kept as the directory: `'..'` from `src/tests` resolves to
 * `src`, which is the barrel by another spelling.
 */
const targetOf = (fromFile: string, specifier: string) =>
  specifier.startsWith('.')
    ? withoutExtension(path.resolve(path.dirname(fromFile), specifier))
    : null;

/** Both spellings of the barrel: the file itself, and the directory holding it. */
const isBarrel = (target: string | null) =>
  target === BARREL_MODULE || target === SRC_DIR;

/**
 * The extractor reports specifiers without positions, so the line is recovered
 * by scanning for the quoted text. A specifier the scan cannot find still
 * reports, at line 0, rather than being dropped.
 */
const lineOf = (source: string, specifier: string) => {
  const quoted = [`'${specifier}'`, `"${specifier}"`, `\`${specifier}\``];
  const index = source
    .split('\n')
    .findIndex((line) => quoted.some((form) => line.includes(form)));
  return index + 1;
};

const barrelEdgesIn = (file: string) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...extractor.extract(source)]
    .filter((specifier) => isBarrel(targetOf(file, specifier)))
    .map(
      (specifier) =>
        `${path.relative(REPO_ROOT, file)}:${lineOf(
          source,
          specifier,
        )} names the barrel as ${specifier}`,
    );
};

const ruleNames = fs
  .readdirSync(RULES_DIR)
  .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
  .map((entry) => entry.replace(/\.ts$/, ''));

describe('plugin edge isolation', () => {
  it('records no literal barrel specifier outside the loader', () => {
    const scanned = collectSources(SRC_DIR).filter(
      (file) => file !== LOADER_FILE && file !== `${BARREL_MODULE}.ts`,
    );

    expect(scanned.length).toBeGreaterThan(400); // measured 633
    expect(scanned.flatMap(barrelEdgesIn)).toEqual([]);
  });

  it('leaves the loader free of the specifier it exists to replace', () => {
    expect(barrelEdgesIn(LOADER_FILE)).toEqual([]);
  });

  /**
   * The edge that must SURVIVE. Breaking the barrel edge is worthless if it also
   * severs a rule from its own suite, which is the one relatedness edge the stop
   * hook depends on.
   */
  it('keeps every rule related to its own suite', () => {
    const severed = ruleNames.flatMap((rule) => {
      const suite = path.join(TESTS_DIR, `${rule}.test.ts`);
      if (!fs.existsSync(suite)) return [`${rule}: no suite at ${suite}`];
      const target = path.join(RULES_DIR, rule);
      const related = [
        ...extractor.extract(fs.readFileSync(suite, 'utf8')),
      ].some((specifier) => targetOf(suite, specifier) === target);
      return related ? [] : [`${rule}: its suite names no specifier for it`];
    });

    expect(ruleNames.length).toBeGreaterThan(150); // measured 195
    expect(severed).toEqual([]);
  });
});
