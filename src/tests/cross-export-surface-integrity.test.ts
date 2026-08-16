/**
 * No fixer removes a name from a module's export surface — asked of every
 * fixer over every fixture ANY rule reports on, not only over its own.
 *
 * `export-surface-integrity.test.ts` owns this oracle and pairs each fixer with
 * the fixtures written FOR that rule. That pairing is blind by construction: a
 * rule's own suite is the set of shapes its author already had in mind, and the
 * shapes that break a fixer are the ones nobody wrote for it. Re-pairing an
 * oracle by "which rule REPORTS on this fixture" has found five real bugs while
 * the own-corpus guard stayed green — #2013-#2015 (tsc over `--fix`) and
 * #2023-#2024 (comment fidelity over `--fix`).
 *
 * This is the highest-stakes cell of that matrix. A removed export is a
 * cross-file contract broken by a single-file transform, and every other
 * cross-paired oracle is blind to it: single-file `tsc` sees nothing wrong with
 * a module that stopped exporting a name, a parse succeeds, the fix converges,
 * and no comment moved. The agora `fix: true` sweep found 0 defects over 8,705
 * files in the same run this axis found 18 corrupting ones (#1700).
 *
 * The pairing: inject `export ` onto every top-level declaration (or keep the
 * fixture's own surface when it already exports everything), screen that text
 * once with every rule the plugin ships, and run each REPORTING fixable rule's
 * fixer ALONE. Solo, not composed — the claim is about ONE rule's fixer, so a
 * removal has to be attributable to it.
 *
 * Measured clean at v1.20.158: 0 unbaselined removals over ~28k cross pairs and
 * ~7.6k cross rewrites. The value is the gate, not the result — a hand-run
 * probe's silence and a genuinely clean corpus are indistinguishable from the
 * outside, and the gap between them fills with shipped bugs.
 */
import { Linter, Rule } from 'eslint';
import { parse as tsParse } from '@typescript-eslint/typescript-estree';
import {
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  ruleNameByIdentity,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';
import type { FixtureBucket } from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The surface reader, injector and parse helper are copied VERBATIM from
 * `export-surface-integrity.test.ts`; read that file for why each binding form
 * is enumerated and why an injection that does not parse is discarded rather
 * than counted.
 */
const parse = (code: string, jsx: boolean) => {
  try {
    return tsParse(code, {
      jsx,
      range: true,
      loc: false,
      errorOnUnknownASTType: false,
    });
  } catch {
    return null;
  }
};

const exportedNames = (code: string, jsx: boolean): Set<string> | null => {
  const ast = parse(code, jsx);
  if (!ast) {
    return null;
  }
  const names = new Set<string>();
  const addPattern = (id: any): void => {
    if (!id) {
      return;
    }
    if (id.type === 'Identifier') {
      names.add(id.name);
    } else if (id.type === 'ObjectPattern') {
      id.properties.forEach((property: any) =>
        addPattern(property.value || property.argument),
      );
    } else if (id.type === 'ArrayPattern') {
      id.elements.forEach((element: any) => element && addPattern(element));
    }
  };
  for (const node of ast.body as any[]) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const declaration = node.declaration;
        if (declaration.type === 'VariableDeclaration') {
          declaration.declarations.forEach((one: any) => addPattern(one.id));
        } else if (declaration.id?.name) {
          names.add(declaration.id.name);
        }
      }
      for (const specifier of node.specifiers || []) {
        const exported: any = specifier.exported;
        names.add(exported.type === 'Literal' ? exported.value : exported.name);
      }
    } else if (node.type === 'ExportAllDeclaration' && node.exported) {
      const exported: any = node.exported;
      names.add(exported.name || exported.value);
    }
  }
  return names;
};

const EXPORTABLE = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
]);

/** Cases discarded because they did not PARSE, asserted empty below. */
const parseFailures: string[] = [];

const injectExports = (code: string, jsx: boolean): string | null => {
  const ast = parse(code, jsx);
  if (!ast) {
    parseFailures.push(`${jsx ? 'tsx' : 'ts'}: ${code.slice(0, 60)}`);
    return null;
  }
  const starts = (ast.body as any[])
    .filter((node) => EXPORTABLE.has(node.type) && !node.declare)
    .map((node) => node.range[0]);
  if (!starts.length) {
    return null;
  }
  const injected = starts
    .sort((a, b) => b - a)
    .reduce(
      (text, start) => `${text.slice(0, start)}export ${text.slice(start)}`,
      code,
    );
  return parse(injected, jsx) ? injected : null;
};

/**
 * `injectExports` returns `null` both for a fixture that declares nothing
 * exportable AND for one that already exports everything it declares. The
 * second is the more interesting input, not a skip: it is where a fixer meets
 * a real export surface. Fall back to it, and count the two apart.
 */
const surfaceOf = (
  code: string,
  jsx: boolean,
): { code: string; injected: boolean } | null => {
  const injected = injectExports(code, jsx);
  if (injected) return { code: injected, injected: true };
  return exportedNames(code, jsx)?.size ? { code, injected: false } : null;
};

const linter = new Linter();
defineCorpusParsers(linter);
for (const [rule, name] of ruleNameByIdentity) {
  linter.defineRule(`${PREFIX}${name}`, rule as never);
}

/**
 * Planted culprit for the positive control: renames every camelCase exported
 * const to SCREAMING_SNAKE. Not keyed to a shipped rule — every live instance
 * of this class is something the suite exists to eliminate, so a control tied
 * to one would go vacuous exactly when the plugin is healthiest.
 */
const CONTROL_ID = `${PREFIX}control-cross-export-renamer`;
const controlExportRenamer: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { rename: 'Rename "{{name}}".' },
  },
  create(context) {
    return {
      VariableDeclarator(node: any) {
        const declaration = node.parent;
        if (
          declaration?.type !== 'VariableDeclaration' ||
          declaration.parent?.type !== 'ExportNamedDeclaration' ||
          node.id.type !== 'Identifier' ||
          !/^[a-z][A-Za-z0-9]*$/.test(node.id.name)
        ) {
          return;
        }
        const id = node.id;
        const renamed = id.name
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .toUpperCase();
        context.report({
          node: id,
          messageId: 'rename',
          data: { name: id.name },
          fix: (fixer) => fixer.replaceText(id, renamed),
        });
      },
    };
  },
};
linter.defineRule(CONTROL_ID, controlExportRenamer);

/**
 * The negative control: rewrites the INITIALIZER of an exported const and keeps
 * the name. Pins the polarity — a guard where every rewrite flagged would mean
 * nothing.
 */
const CONTROL_SAFE_ID = `${PREFIX}control-cross-initializer-rewriter`;
const controlInitializerRewriter: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { rewrite: 'Rewrite the initializer of "{{name}}".' },
  },
  create(context) {
    return {
      VariableDeclarator(node: any) {
        const declaration = node.parent;
        if (
          declaration?.type !== 'VariableDeclaration' ||
          declaration.parent?.type !== 'ExportNamedDeclaration' ||
          node.id.type !== 'Identifier' ||
          !node.init ||
          node.init.type !== 'Literal' ||
          node.init.raw === '0'
        ) {
          return;
        }
        context.report({
          node: node.init,
          messageId: 'rewrite',
          data: { name: node.id.name },
          fix: (fixer) => fixer.replaceText(node.init, '0'),
        });
      },
    };
  },
};
linter.defineRule(CONTROL_SAFE_ID, controlInitializerRewriter);

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A rule whose behaviour under a bare `Linter` diverges from production, named
 * individually rather than by dropping the whole `typeAwareRuleNames` set: a
 * rule-global exclusion un-gates every other arm the rule participates in
 * (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set(['no-entire-object-hook-deps']);

/**
 * The screening config: EVERY rule the plugin ships, not the recommended set.
 * A rule absent from `recommended` still ships a fixer a consumer can enable,
 * and a screen built from `configs.recommended` reaches it only on its own
 * fixtures — the own-corpus blindness this file exists to close.
 */
const SCREEN: Record<string, unknown> = {};
for (const name of ruleNameByIdentity.values()) {
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  SCREEN[`${PREFIX}${name}`] = 'error';
}

const isFixable = (name: string) =>
  Boolean(plugin.rules[name] && plugin.rules[name].meta?.fixable);

/**
 * Fixtures carry bare `eslint-disable-next-line rule-name` comments, because
 * `RuleTester` registers the rule under its bare name. Under a `Linter` the
 * rules are registered PREFIXED, so an unprefixed directive silences nothing.
 * Longest name first, so a shorter rule name that prefixes a longer one cannot
 * rewrite half of it.
 */
const BARE_RULE_NAMES = [...ruleNameByIdentity.values()].sort(
  (a, b) => b.length - a.length,
);
const DIRECTIVE =
  /(eslint-disable(?:-next-line|-line)?|eslint-enable)([^\n*]*)/g;
const prefixDirectives = (code: string) =>
  code.replace(DIRECTIVE, (_whole, keyword: string, tail: string) => {
    let rewritten = tail;
    for (const name of BARE_RULE_NAMES) {
      rewritten = rewritten.replace(
        new RegExp(`(^|[\\s,])${name}(?![\\w/-])`, 'g'),
        `$1${PREFIX}${name}`,
      );
    }
    return `${keyword}${rewritten}`;
  });

type Removal = {
  /** The rule whose fixer ran. */
  fixer: string;
  /** The rule whose suite the fixture belongs to. */
  owner: string;
  cross: boolean;
  removed: string[];
  origin: string;
  bucket: FixtureBucket;
  filename: string;
  before: string;
  after: string;
};

/**
 * Non-vacuity accounting. Every skip is counted and every counter is read by
 * an `expect` below; a counter nothing asserts discards cases in silence, which
 * is how 106 fatal parses went unnoticed in #1984.
 */
const stats = {
  fixtures: 0,
  nonTypeScriptDropped: 0,
  /** Declares nothing exportable and exports nothing: no surface to break. */
  noSurface: 0,
  injected: 0,
  ownSurface: 0,
  screenFatal: 0,
  screenThrew: 0,
  pairs: 0,
  crossPairs: 0,
  rewrites: 0,
  crossRewrites: 0,
  fixThrew: 0,
  /** The fixer's own output failing to parse — `fixer-convergence`'s axis. */
  unparseableOutput: 0,
  fixers: new Set<string>(),
  crossFixers: new Set<string>(),
  owners: new Set<string>(),
};

const removals: Removal[] = [];
const corpus = harvestFixtureCorpus();

for (const [owner, cases] of corpus.byRule) {
  stats.owners.add(owner);
  for (const testCase of cases) {
    /**
     * `export ` is a TypeScript splice; a JSON or Markdown fixture has no
     * declaration to receive it.
     */
    if (testCase.language !== 'ts') {
      stats.nonTypeScriptDropped++;
      continue;
    }
    stats.fixtures++;

    const filename = defaultFilenameFor(testCase);
    const source = prefixDirectives(testCase.code);
    /**
     * JSX-ness for the surface READER, resolved the way the linter resolves
     * it. A `.ts` path forces `ScriptKind.TS` whatever `ecmaFeatures.jsx`
     * says, so `<string>"a"` parses there and `<Foo />` does not; a `.js`
     * path with `ecmaFeatures.jsx` on is the reverse. Try the extension's
     * mode first and fall to the other only when it does not parse — a text
     * the linter accepted parses under exactly one of the two.
     */
    const jsxByExtension = filename.endsWith('x');
    const jsx = parse(source, jsxByExtension)
      ? jsxByExtension
      : !jsxByExtension;
    const surface = surfaceOf(source, jsx);
    if (!surface) {
      stats.noSurface++;
      continue;
    }
    if (surface.injected) stats.injected++;
    else stats.ownSurface++;
    const exported = surface.code;

    const parsing = {
      parser: parserKeyFor(testCase),
      parserOptions: parserOptionsFor(testCase),
    };
    /**
     * A fixture's `options` belong to its OWNER. Handing them to a different
     * rule configures it with a schema it never declared, so only the owner's
     * entry carries them; every other rule runs bare.
     */
    const ownerId = `${PREFIX}${owner}`;
    let screened: Linter.LintMessage[];
    try {
      screened = linter.verify(
        exported,
        {
          ...parsing,
          rules: {
            ...SCREEN,
            ...(DIVERGENT_WITHOUT_PROGRAM.has(owner)
              ? {}
              : { [ownerId]: severityWithOptions(testCase) }),
          },
        } as unknown as Linter.Config,
        filename,
      );
    } catch {
      stats.screenThrew++;
      continue;
    }
    /**
     * A fatal parse produces no `ruleId`, so it is indistinguishable from
     * every rule staying silent — counted, then asserted, never dropped.
     */
    if (screened.some((message) => message.fatal)) {
      stats.screenFatal++;
      continue;
    }

    const reporting = new Set(
      screened
        .map((message) => message.ruleId)
        .filter((id): id is string => id !== null && id.startsWith(PREFIX))
        .map((id) => id.slice(PREFIX.length)),
    );

    for (const fixer of reporting) {
      if (DIVERGENT_WITHOUT_PROGRAM.has(fixer)) continue;
      if (!isFixable(fixer)) continue;
      const cross = fixer !== owner;
      stats.pairs++;
      if (cross) stats.crossPairs++;

      let result;
      try {
        result = linter.verifyAndFix(
          exported,
          {
            ...parsing,
            rules: {
              [`${PREFIX}${fixer}`]: cross
                ? 'error'
                : severityWithOptions(testCase),
            },
          } as unknown as Linter.Config,
          filename,
        );
      } catch {
        stats.fixThrew++;
        continue;
      }
      if (result.output === exported) continue;
      stats.rewrites++;
      stats.fixers.add(fixer);
      if (cross) {
        stats.crossRewrites++;
        stats.crossFixers.add(fixer);
      }

      const before = exportedNames(exported, jsx);
      const after = exportedNames(result.output, jsx);
      if (!before || !after) {
        stats.unparseableOutput++;
        continue;
      }
      const removed = [...before].filter((name) => !after.has(name));
      if (removed.length) {
        removals.push({
          fixer,
          owner,
          cross,
          removed,
          origin: testCase.origin,
          bucket: testCase.bucket,
          filename,
          before: exported,
          after: result.output,
        });
      }
    }
  }
}

/**
 * Removals that are NOT defects, keyed `<fixer>` with the reason it is not one.
 * Same contract as `EXPORT_SURFACE_BASELINE` in the own-corpus guard: there is
 * no issue-link escape hatch here — a real defect must be FIXED, not listed.
 *
 * Two-way audited: an unlisted key fails, and a listed key that stops
 * reproducing also fails, so an entry cannot rot into a shield.
 */
const CROSS_EXPORT_SURFACE_BASELINE: Record<string, string> = {
  'enforce-firestore-set-merge':
    'the transform substitutes the imported callee (updateDoc -> setDoc), so rebinding the name is intrinsic to it. Reachable only through the injected shape `export const { doc, updateDoc } = await import(...)` — exporting a destructured dynamic import is not a form real code writes, and the rule is silent on every non-exported spelling. Reproduces only on its OWN fixtures.',
};

const removalsByFixer = new Map<string, Removal[]>();
for (const removal of removals) {
  const list = removalsByFixer.get(removal.fixer) || [];
  list.push(removal);
  removalsByFixer.set(removal.fixer, list);
}

const describe_ = (removal: Removal) =>
  [
    `${removal.fixer} removed [${removal.removed.join(', ')}] from a fixture ` +
      `owned by ${removal.owner}${removal.cross ? ' (CROSS)' : ''}`,
    `src/tests/${removal.origin} (${removal.bucket}) as ${removal.filename}`,
    '--- exported input ---',
    removal.before,
    '--- after --fix ---',
    removal.after,
  ].join('\n');

/**
 * Both controls run through the SAME pipeline as the corpus: a surface built
 * by `surfaceOf`, one solo `verifyAndFix`, one `exportedNames` diff.
 */
const runControl = (ruleId: string, code: string) => {
  const surface = surfaceOf(code, false);
  if (!surface) return { fired: false, removed: ['<no surface>'] };
  const result = linter.verifyAndFix(
    surface.code,
    {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { [ruleId]: 'error' },
    } as unknown as Linter.Config,
    'control.ts',
  );
  const before = exportedNames(surface.code, false) || new Set<string>();
  const after = exportedNames(result.output, false) || new Set<string>();
  return {
    fired: result.output !== surface.code,
    removed: [...before].filter((name) => !after.has(name)),
  };
};

/**
 * Floors sit JUST UNDER what this harness measures, so ordinary corpus churn
 * does not move them while a harness that lost most of the corpus does. Move a
 * floor only WITH the measurement it is cut from.
 */
const FIXTURE_FLOOR = 19500; // measured 20363
const SURFACE_FLOOR = 17500; // measured 18098 (14949 injected + 3149 own)
const PAIR_FLOOR = 31000; // measured 32841
const CROSS_PAIR_FLOOR = 27000; // measured 28491
const REWRITE_FLOOR = 10300; // measured 10938
const CROSS_REWRITE_FLOOR = 7400; // measured 7879
const FIXER_FLOOR = 75; // measured 79
const CROSS_FIXER_FLOOR = 52; // measured 56
/**
 * Ceilings, cut CLOSE: each is a case this guard does NOT judge, so a harness
 * regression shows up as a jump. A ceiling parked far above its measurement is
 * the #1984 failure verbatim.
 */
const NON_TS_CEILING = 60; // measured 40
const NO_SURFACE_CEILING = 2400; // measured 2265
const UNPARSEABLE_OUTPUT_CEILING = 5; // measured 1

console.log(
  [
    "cross export-surface integrity: each rule's --fix over EVERY rule's fixtures",
    `  fixtures: ${stats.fixtures} TypeScript (${stats.nonTypeScriptDropped} other), ${stats.injected} injected + ${stats.ownSurface} own surface, ${stats.noSurface} with no surface`,
    `  screen: ${stats.screenFatal} fatal, ${stats.screenThrew} threw`,
    `  pairs: ${stats.pairs} (${stats.crossPairs} cross), rewrites ${stats.rewrites} (${stats.crossRewrites} cross), ${stats.fixThrew} threw, ${stats.unparseableOutput} unparseable outputs`,
    `  fixers: ${stats.fixers.size} rewrote (${stats.crossFixers.size} cross-rule)`,
    `  removals: ${removals.length} (${
      removals.filter((removal) => removal.cross).length
    } cross) across ${removalsByFixer.size} fixer(s)`,
  ].join('\n'),
);

describe("no fixer removes an export name from ANY rule's fixture", () => {
  it('leaves every exported name intact outside the documented baseline', () => {
    const unlisted = [...removalsByFixer.entries()]
      .filter(([fixer]) => !(fixer in CROSS_EXPORT_SURFACE_BASELINE))
      .flatMap(([, list]) => list.map(describe_));
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(CROSS_EXPORT_SURFACE_BASELINE).filter(
      (fixer) => !removalsByFixer.has(fixer),
    );
    expect(stale).toEqual([]);
  });

  /**
   * The baseline entry is measured own-corpus only. A CROSS reproduction of it
   * would be a new reach the reason above does not cover, and must be judged
   * afresh rather than inherited (#1839).
   */
  it('reaches no baselined removal through a foreign fixture', () => {
    const crossBaselined = removals
      .filter(
        (removal) =>
          removal.cross && removal.fixer in CROSS_EXPORT_SURFACE_BASELINE,
      )
      .map(describe_);
    expect(crossBaselined).toEqual([]);
  });
});

describe('the cross-paired export-surface guard is load-bearing', () => {
  it('reaches fixers through OTHER rules’ fixtures', () => {
    expect(stats.fixtures).toBeGreaterThanOrEqual(FIXTURE_FLOOR);
    expect(stats.injected + stats.ownSurface).toBeGreaterThanOrEqual(
      SURFACE_FLOOR,
    );
    expect(stats.pairs).toBeGreaterThanOrEqual(PAIR_FLOOR);
    expect(stats.crossPairs).toBeGreaterThanOrEqual(CROSS_PAIR_FLOOR);
    expect(stats.rewrites).toBeGreaterThanOrEqual(REWRITE_FLOOR);
    expect(stats.crossRewrites).toBeGreaterThanOrEqual(CROSS_REWRITE_FLOOR);
    expect(stats.fixers.size).toBeGreaterThanOrEqual(FIXER_FLOOR);
    expect(stats.crossFixers.size).toBeGreaterThanOrEqual(CROSS_FIXER_FLOOR);
  });

  it('accounts for every case it does not judge', () => {
    expect(stats.nonTypeScriptDropped).toBeLessThanOrEqual(NON_TS_CEILING);
    expect(stats.noSurface).toBeLessThanOrEqual(NO_SURFACE_CEILING);
    expect(stats.unparseableOutput).toBeLessThanOrEqual(
      UNPARSEABLE_OUTPUT_CEILING,
    );
    expect(stats.screenFatal).toBe(0);
    expect(stats.screenThrew).toBe(0);
    expect(stats.fixThrew).toBe(0);
    expect(parseFailures.slice(0, 5)).toEqual([]);
  });

  it('detects a removed export name (positive control)', () => {
    const outcome = runControl(CONTROL_ID, 'const fooBar = 1;\n');
    expect(outcome.fired).toBe(true);
    expect(outcome.removed).toEqual(['fooBar']);
  });

  it('stays silent on a rewrite that keeps the name (negative control)', () => {
    const outcome = runControl(CONTROL_SAFE_ID, 'const fooBar = 1;\n');
    expect(outcome.fired).toBe(true);
    expect(outcome.removed).toEqual([]);
  });
});
