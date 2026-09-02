import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from '@typescript-eslint/typescript-estree';

/**
 * A guard floor must not drift far below the measurement it was cut against.
 *
 * Every corpus guard here asserts `toBeGreaterThan(N)` so that a sweep which
 * quietly collapsed fails instead of passing smaller. That only works while `N`
 * tracks the population: a floor left at 5,500 against an actual 8,141 is what
 * let #1984 hide 106 fatal-parse cases, and it hid at only 1.5x slack. Three
 * manual sweeps have re-cut drifted floors since (a 275-guard census, then 47
 * re-cuts in #2250, 8 of them at 9x or worse and one at 41.8x). Nothing
 * prevented the fourth.
 *
 * WHY THIS SHAPE, AND NOT THE OBVIOUS ONE. Intercepting `expect` at runtime to
 * compare each floor against the value actually received was evaluated in #2250
 * and rejected: received values live inside jest WORKER processes, so a
 * cross-file verdict needs `globalTeardown` aggregating per-worker artifacts,
 * and every scoped run — `npx jest src/tests/one.test.ts`, and critically the
 * stop hook's `--findRelatedTests` — sees a partial population. A gate that
 * fails on missing data breaks every scoped run; one that ignores missing data
 * never fires outside a full run. This gate is static instead: it reads the
 * source, needs no run to have happened, and returns the same verdict under
 * every invocation.
 *
 * WHAT IT CANNOT SEE, stated plainly. It compares a floor against its OWN
 * annotation, so it catches a floor that drifted from what its author measured
 * — not one whose measurement has since moved with the corpus. Closing that
 * would require the runtime channel above. What it converts is silent drift
 * into a mechanically-checkable claim, which is where the three manual sweeps
 * each had to start.
 *
 * SCOPE: annotated floors are gated; unannotated ones are COUNTED and printed
 * as a migration backlog rather than failed, so the gate starts green and
 * cannot block unrelated work (#2256). The annotated population is ratcheted so
 * the backlog can only shrink — an annotation cannot be deleted to dodge the
 * comparison.
 */

const TESTS = __dirname;

const MATCHERS = new Set(['toBeGreaterThan', 'toBeGreaterThanOrEqual']);

/**
 * Floors below this are not ratio-tested. At a measurement of 2 a floor of 1 is
 * "2x under" and means nothing — the slack is one observation, not drift. The
 * two sites this exempts (`DISCOUNT_DROP_FLOOR`, twice) are deliberate floors of
 * 1 on populations measured at 2.
 */
const RATIO_MIN_MAGNITUDE = 10;

/**
 * How far under its own annotation a floor may sit. #1984 hid at 1.5x, which is
 * the aspiration once the backlog is migrated; 2 is what the annotated
 * population supports today (its worst ratio-tested site is 1.23x).
 */
const MAX_SLACK = 2;

type FloorSite = {
  line: number;
  floor: number;
  measured: number | null;
  /** `inline`, or `const:NAME` when the matcher was handed a named floor. */
  kind: string;
};

const toNumber = (raw: string) => Number(raw.replace(/[,_]/g, ''));

/**
 * A version stamp: a `v` prefix, or three-plus dotted numeric groups.
 *
 * Both discriminators are load-bearing and neither may be relaxed to a single
 * optional-`v` dot pair. That spelling matches a plain `d.dd`, so a
 * ratio-valued annotation was consumed whole as a stamp: `measured 0.98` parsed
 * to null and its floor was counted as unannotated — a site quietly outside
 * this gate's scope rather than a finding, which is the exact evasion the
 * ratchet exists to close (#2294).
 */
const VERSION_STAMP = /\bv\d+(?:\.\d+)*\b|\b\d+\.\d+(?:\.\d+)+\b/g;

/**
 * The measurement a comment claims, or null. A share or a ratio is a
 * measurement too, so the number read back may be fractional.
 *
 * Version stamps are stripped first. `Measured at 1.20.198: 23,824 considered`
 * otherwise yields `1` — the guard would then read every version-stamped
 * citation as a floor drifted a thousandfold, which is a fabricated finding
 * rather than a strict one.
 */
export const measuredIn = (text: string): number | null => {
  const after = /\bmeasured\b(.*)$/is.exec(text);
  if (!after) return null;
  const withoutVersions = after[1].replace(VERSION_STAMP, ' ');
  const number = /\d[\d,_]*(?:\.\d+)?/.exec(withoutVersions);
  return number ? toNumber(number[0]) : null;
};

type AnyNode = Record<string, unknown> & { type: string };

const isNode = (value: unknown): value is AnyNode =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as { type?: unknown }).type === 'string';

const walk = (node: unknown, visit: (node: AnyNode) => void) => {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isNode(node)) return;
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent') continue;
    walk(child, visit);
  }
};

const lineOf = (node: AnyNode): number =>
  (node.loc as { start: { line: number } } | undefined)?.start.line ?? 0;

/** A numeric literal's value, unwrapping the unary minus a negative carries. */
const numericValue = (node: unknown): number | null => {
  if (!isNode(node)) return null;
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return node.value;
  }
  return null;
};

/**
 * Every literal guard floor in a source, found by AST rather than by text.
 *
 * Matching the AST is what makes this guard immune to its own controls: those
 * are STRINGS here, so a stale floor written inside one is not a call
 * expression and cannot be scraped back out of this file as a real site
 * (#2256). A line-based scan reports its own fixtures.
 */
export const floorSitesIn = (code: string): FloorSite[] => {
  const ast = parse(code, { loc: true, comment: true, range: true });
  const comments = (ast.comments || []) as {
    value: string;
    loc: { start: { line: number } };
  }[];
  const measuredByLine = new Map<number, number>();
  for (const comment of comments) {
    const measured = measuredIn(comment.value);
    if (measured !== null) measuredByLine.set(comment.loc.start.line, measured);
  }

  /** Module-scope numeric consts, so a named floor resolves to its literal. */
  const namedFloors = new Map<string, { value: number; line: number }>();
  walk(ast as unknown, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    const id = node.id as AnyNode | undefined;
    if (!isNode(id) || id.type !== 'Identifier') return;
    const value = numericValue(node.init);
    if (value === null) return;
    namedFloors.set(id.name as string, { value, line: lineOf(node) });
  });

  const sites: FloorSite[] = [];
  walk(ast as unknown, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee as AnyNode | undefined;
    if (!isNode(callee) || callee.type !== 'MemberExpression') return;
    const property = callee.property as AnyNode | undefined;
    if (
      !isNode(property) ||
      property.type !== 'Identifier' ||
      !MATCHERS.has(property.name as string)
    ) {
      return;
    }
    const args = node.arguments as unknown[];
    if (!Array.isArray(args) || args.length !== 1) return;
    const [arg] = args;

    const literal = numericValue(arg);
    if (literal !== null) {
      // A floor of 0 is a presence check; there is no ratio to read off it.
      if (literal === 0) return;
      const line = lineOf(arg as AnyNode);
      sites.push({
        line,
        floor: literal,
        measured: measuredByLine.get(line) ?? null,
        kind: 'inline',
      });
      return;
    }

    if (!isNode(arg) || arg.type !== 'Identifier') return;
    const named = namedFloors.get(arg.name as string);
    if (!named || named.value === 0) return;
    sites.push({
      line: named.line,
      floor: named.value,
      measured: measuredByLine.get(named.line) ?? null,
      kind: `const:${arg.name}`,
    });
  });
  return sites;
};

/**
 * Recursive. A non-recursive scan exempts by construction whatever sits in a
 * subdirectory, which is how `rule-options-safety` stayed invisible to
 * `fixture-corpus-accounting` (#2245).
 */
const suiteFilesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return suiteFilesUnder(full);
      return entry.name.endsWith('.test.ts') ? [full] : [];
    });

const testFiles = suiteFilesUnder(TESTS);

type Scanned = FloorSite & { file: string };

const scanned: Scanned[] = [];
const unparsed: string[] = [];
for (const file of testFiles) {
  const short = file.slice(TESTS.length + 1);
  try {
    for (const site of floorSitesIn(readFileSync(file, 'utf8'))) {
      scanned.push({ ...site, file: short });
    }
  } catch (error) {
    unparsed.push(
      `${short}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/** The same site reached through two matchers is one floor, not two. */
const dedup = new Map<string, Scanned>();
for (const site of scanned) dedup.set(`${site.file}:${site.line}`, site);
const sites = [...dedup.values()];

const annotated = sites.filter((site) => site.measured !== null);
const unannotated = sites.filter((site) => site.measured === null);

const ANNOTATED_FLOOR = 500; // measured 563
const FILE_FLOOR = 345; // measured 356
const SITE_FLOOR = 530; // measured 569

describe('a guard floor must not drift below its own measurement', () => {
  it('scans every suite, and a file it cannot parse is not silence', () => {
    // A file that fails to parse contributes no floors, which reads exactly
    // like a file with none unless the skip is asserted.
    expect(unparsed).toEqual([]);
    expect(testFiles.length).toBeGreaterThanOrEqual(FILE_FLOOR);
    expect(sites.length).toBeGreaterThanOrEqual(SITE_FLOOR);
  });

  /**
   * The ratchet. Annotations are what this gate compares against, so an
   * annotation deleted is a site silently removed from its scope — the one
   * evasion a static gate has. Floored just under the measured population so
   * the backlog can only shrink.
   */
  it('keeps the annotated population from shrinking', () => {
    expect(annotated.length).toBeGreaterThanOrEqual(ANNOTATED_FLOOR);
  });

  it('no annotated floor sits further than the slack under its measurement', () => {
    const drifted = annotated
      .filter(
        (site) =>
          (site.measured as number) >= RATIO_MIN_MAGNITUDE &&
          (site.measured as number) / site.floor > MAX_SLACK,
      )
      .map(
        (site) =>
          `  ${site.file}:${site.line} [${site.kind}] floor=${site.floor} ` +
          `measured=${site.measured} (${(
            (site.measured as number) / site.floor
          ).toFixed(1)}x under)`,
      );
    expect(
      drifted.length === 0
        ? ''
        : `${drifted.length} floor(s) sit more than ${MAX_SLACK}x under the measurement ` +
            `recorded beside them. Re-cut each to just under its measured value, or\n` +
            `update the annotation if the population genuinely moved:\n${drifted.join(
              '\n',
            )}`,
    ).toBe('');
  });

  /**
   * An annotation BELOW its own floor cannot describe a passing assertion: the
   * floor would reject the very population it was cut from. It means one of the
   * two numbers is a typo, and neither can be trusted.
   */
  it('no annotation sits below the floor it annotates', () => {
    const incoherent = annotated
      .filter((site) => (site.measured as number) < site.floor)
      .map(
        (site) =>
          `  ${site.file}:${site.line} floor=${site.floor} measured=${site.measured}`,
      );
    expect(incoherent).toEqual([]);
  });

  it('reports the migration backlog without failing on it', () => {
    const byFile = new Map<string, number>();
    for (const site of unannotated) {
      byFile.set(site.file, (byFile.get(site.file) || 0) + 1);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[guard-floor-annotation] files=${testFiles.length} floors=${sites.length} ` +
        `annotated=${annotated.length} unannotated=${unannotated.length} ` +
        `filesWithBacklog=${byFile.size} maxSlack=${MAX_SLACK}x`,
    );
    // The backlog is real and this arm is not a no-op: if it ever reaches zero
    // the ratchet above becomes the whole gate and `MAX_SLACK` can be tightened
    // to the 1.5x #1984 hid at.
    expect(unannotated.length).toBeGreaterThan(0);
    expect(annotated.length + unannotated.length).toBe(sites.length);
  });

  it('catches a floor drifted from its annotation (positive control)', () => {
    const found = floorSitesIn(
      [
        'it("x", () => {',
        '  expect(n).toBeGreaterThan(500); // measured 8141',
        '});',
      ].join('\n'),
    );
    expect(found).toHaveLength(1);
    expect(found[0].floor).toBe(500);
    expect(found[0].measured).toBe(8141);
    expect((found[0].measured as number) / found[0].floor).toBeGreaterThan(
      MAX_SLACK,
    );

    // Through a named floor too — most of this repo's floors are declared as a
    // module constant and only referenced at the assertion.
    const named = floorSitesIn(
      [
        'const PAIR_FLOOR = 5500; // measured 8,141',
        'it("x", () => { expect(n).toBeGreaterThanOrEqual(PAIR_FLOOR); });',
      ].join('\n'),
    );
    expect(named).toHaveLength(1);
    expect(named[0].kind).toBe('const:PAIR_FLOOR');
    expect(named[0].floor).toBe(5500);
    expect(named[0].measured).toBe(8141);
  });

  /**
   * A share or a ratio is a floor like any other, and `0.98` is not a version.
   * Read as one it parsed to null, and the site it annotated was filed as
   * backlog instead of gated — indistinguishable from never having been
   * annotated at all (#2294).
   */
  it('reads a ratio-valued measurement (positive control)', () => {
    expect(measuredIn('measured 0.98')).toBe(0.98);

    const ratio = floorSitesIn(
      'expect(share).toBeGreaterThanOrEqual(0.95); // measured 0.98',
    );
    expect(ratio).toHaveLength(1);
    expect(ratio[0].floor).toBe(0.95);
    expect(ratio[0].measured).toBe(0.98);
    expect((ratio[0].measured as number) / ratio[0].floor).toBeLessThan(
      MAX_SLACK,
    );
  });

  it('passes a freshly cut floor and ignores what it should (negative controls)', () => {
    // Without these the arm above would pass just as well by flagging
    // everything, and the migration it demands would be unsatisfiable.
    const fresh = floorSitesIn(
      'expect(n).toBeGreaterThan(8000); // measured 8141;',
    );
    expect(fresh).toHaveLength(1);
    expect((fresh[0].measured as number) / fresh[0].floor).toBeLessThan(
      MAX_SLACK,
    );

    // A presence check carries no ratio.
    expect(
      floorSitesIn('expect(n).toBeGreaterThan(0); // measured 8141'),
    ).toEqual([]);

    // An unannotated floor is backlog, not a failure.
    const bare = floorSitesIn('expect(n).toBeGreaterThan(500);');
    expect(bare).toHaveLength(1);
    expect(bare[0].measured).toBeNull();

    // A version stamp is not a measurement. Read naively this yields 1 and
    // reports a 23,824x drift on a perfectly good floor.
    expect(measuredIn('Measured at 1.20.198: 23,824 considered')).toBe(23824);
    expect(measuredIn('measured at v1.20.192')).toBeNull();
    expect(measuredIn('a comment with no claim in it')).toBeNull();

    // Narrowing the stamp pattern enough to admit `0.98` must not readmit the
    // fabricated finding above, in either spelling a citation is written in.
    expect(measuredIn('measured 181 at v1.20.190')).toBe(181);
    expect(measuredIn('measured 181 (1.20.190)')).toBe(181);

    // A comment on a DIFFERENT line does not annotate the floor: the block
    // comments above an assertion block name several populations at once, and
    // attaching the first of them to whichever floor follows would invent a
    // measurement the author never made for it.
    const detached = floorSitesIn(
      ['// measured 8141', 'expect(n).toBeGreaterThan(500);'].join('\n'),
    );
    expect(detached).toHaveLength(1);
    expect(detached[0].measured).toBeNull();

    // Matching by AST, a stale floor written inside a STRING is not a site —
    // which is what lets this file hold the positive control above.
    expect(
      floorSitesIn(
        'const sample = "expect(n).toBeGreaterThan(1); // measured 999";',
      ),
    ).toEqual([]);
  });
});
