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

/**
 * The surface member a default export contributes. Spelled as a reserved word
 * so it cannot collide with a declared identifier in the same set.
 */
const DEFAULT_MEMBER = 'default';

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
    } else if (id.type === 'AssignmentPattern') {
      // `export const [a = 1] = pair` binds `a`. Without this the defaulted
      // element contributes no name and its removal reads clean.
      addPattern(id.left);
    } else if (id.type === 'RestElement') {
      addPattern(id.argument);
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
    } else if (node.type === 'ExportDefaultDeclaration') {
      /**
       * `default` is the name an importer binds against. Carrying the
       * DECLARATION's name instead would be wrong both ways: a default-exported
       * `function foo` offers no named `foo`, and renaming it internally breaks
       * nobody, so a name-keyed member would report a removal that is not one.
       */
      names.add(DEFAULT_MEMBER);
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
 * The spans the injected `export ` tokens occupy IN THE INJECTED TEXT. The
 * i-th declaration (ascending) is preceded by i earlier insertions of 7
 * characters each, because `injectExports` splices from the last offset
 * backwards and so leaves every earlier offset untouched.
 *
 * A report landing inside one of these spans is a report about this guard's
 * own scaffolding rather than about the fixture, which is the second of the
 * two ways a perturbation has to be gated.
 */
const scaffoldSpans = (code: string, jsx: boolean): [number, number][] => {
  const ast = parse(code, jsx);
  if (!ast) return [];
  return (ast.body as any[])
    .filter((node) => EXPORTABLE.has(node.type) && !node.declare)
    .map((node) => node.range[0])
    .sort((a: number, b: number) => a - b)
    .map((start: number, index: number) => [
      start + 7 * index,
      start + 7 * (index + 1),
    ]);
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
 * EMPTY, and kept as the place an exclusion must be written.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so the rule reports and
 * deletes deps a consumer's CI would leave alone (#1621). That rationale is
 * about which dependencies get REPORTED. What this guard asks is what the fixer
 * then WRITES, which is range arithmetic and entirely syntactic — so the
 * exclusion was broader than its own reason, and no oracle had ever been
 * pointed at the hole it left. Three defects came out of it once one was:
 * #2208, a removal span anchored on a neighbouring element that swallowed the
 * comment between them; #2209 and #2210, a removal that stranded its binding.
 *
 * Dropping the name is MEASURED, not asserted: with the rule composed here the
 * suite is green, and it is driven non-vacuously rather than merely admitted.
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as the thing this guard asks about.
 *
 * An entry here is one NAME rather than all 16 rules mentioning
 * `getParserServices` — discounting one measured divergence never justified
 * unprobing fifteen others (#1879) — and never belongs in
 * `silentWithoutProgramRuleNames`, which means "reports nothing here", nor at
 * rule-global scope, which un-gates every other arm at once (#1839).
 */
const DIVERGENT_WITHOUT_PROGRAM = new Set([]);

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
  /**
   * Perturbation accounting. `injectExports` rewrites the fixture before the
   * screen runs, and the participating fixer set is read off the PERTURBED
   * text, so a rule the injection silences leaves the sweep without being
   * counted anywhere. These four measure that cost in both directions.
   */
  bareScreenFatal: 0,
  bareScreenThrew: 0,
  /** Fixable rule reports on the fixture but not once it is exported. */
  perturbationSilenced: 0,
  /** Fixable rule reports ONLY once exported: a pair the injection invented. */
  perturbationAdmitted: 0,
  /** Fixer declines the exported text but rewrites the fixture as written. */
  perturbationFixLost: 0,
  bareFixThrew: 0,
  /** A report lying ENTIRELY inside an injected `export ` token. */
  scaffoldReports: 0,
  /** A report merely ANCHORED at one: the declaration's own new start. */
  scaffoldAnchored: 0,
};

/** Per-rule ledgers for the three perturbation effects, so a move names names. */
const silencedByRule = new Map<string, number>();
const admittedByRule = new Map<string, number>();
const fixLostByRule = new Map<string, number>();
const bump = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) || 0) + 1);

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

    /**
     * The same screen over the UNPERTURBED fixture. Only meaningful where the
     * text actually changed: an own-surface fixture IS its own bare text, so
     * running it again would cost a lint per fixture to compare a set with
     * itself.
     */
    let reportingBare = reporting;
    if (surface.injected) {
      let bare: Linter.LintMessage[] | null = null;
      try {
        bare = linter.verify(
          source,
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
        stats.bareScreenThrew++;
      }
      if (bare && bare.some((message) => message.fatal)) {
        stats.bareScreenFatal++;
        bare = null;
      }
      if (bare) {
        reportingBare = new Set(
          bare
            .map((message) => message.ruleId)
            .filter((id): id is string => id !== null && id.startsWith(PREFIX))
            .map((id) => id.slice(PREFIX.length)),
        );
        for (const name of reportingBare) {
          if (!reporting.has(name) && isFixable(name)) {
            stats.perturbationSilenced++;
            bump(silencedByRule, name);
          }
        }
        for (const name of reporting) {
          if (!reportingBare.has(name) && isFixable(name)) {
            stats.perturbationAdmitted++;
            bump(admittedByRule, name);
          }
        }
      }
      const spans = scaffoldSpans(source, jsx);
      /**
       * A `Linter` message carries `line`/`column`, never `range`, so the
       * offset has to be rebuilt from the text being linted. Reading a
       * `range` that is always `undefined` skips every message and reports a
       * clean zero — the arm has to resolve a real offset or it asserts
       * nothing.
       */
      const lineStarts = [0];
      for (let at = 0; at < exported.length; at++) {
        if (exported[at] === '\n') lineStarts.push(at + 1);
      }
      for (const message of screened) {
        const id = message.ruleId;
        if (!id || !id.startsWith(PREFIX)) continue;
        const lineStart = lineStarts[message.line - 1];
        if (lineStart === undefined) continue;
        const at = lineStart + message.column - 1;
        const endLineStart =
          message.endLine === undefined
            ? undefined
            : lineStarts[message.endLine - 1];
        /**
         * A report with no end position is a whole-FILE report — several rules
         * anchor one at 1:1 — and coincides with the first injected span
         * whenever the first declaration starts the file. Treating its start as
         * its end makes containment trivially true and counted 4,106 such
         * reports as contamination. Only a report with a real extent can be
         * said to lie inside the scaffolding.
         */
        const end =
          endLineStart === undefined || message.endColumn === undefined
            ? null
            : endLineStart + message.endColumn - 1;
        /**
         * Anchoring at the injected offset is NOT contamination on its own:
         * `export ` is spliced onto the front of a declaration, so a report
         * about that declaration legitimately begins where the keyword now
         * does. What would be contamination is a report lying ENTIRELY inside
         * the 7 characters this guard wrote, which names nothing the fixture
         * contains. Both are counted; only the second is gated.
         */
        if (spans.some(([from, to]) => at >= from && at < to)) {
          stats.scaffoldAnchored++;
          if (
            end !== null &&
            end > at &&
            spans.some(([from, to]) => at >= from && end <= to)
          ) {
            stats.scaffoldReports++;
          }
        }
      }
    }

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
      if (result.output === exported) {
        /**
         * The fixer declined the exported text. Asking the same fixer the same
         * question about the fixture AS WRITTEN separates "this fixer has
         * nothing to say here" from "the injected `export ` is what silenced
         * it" — the second is coverage this guard never gets, and counting it
         * is what keeps the blind spot from widening unobserved.
         */
        if (surface.injected) {
          try {
            const bareFix = linter.verifyAndFix(
              source,
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
            if (bareFix.output !== source) {
              stats.perturbationFixLost++;
              bump(fixLostByRule, fixer);
            }
          } catch {
            stats.bareFixThrew++;
          }
        }
        continue;
      }
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

/**
 * Fixable rules that contribute NO rewrite to this sweep, each with the reason
 * measured. Audited both ways exactly like `CROSS_EXPORT_SURFACE_BASELINE`: an
 * unlisted non-contributor fails, and a listed rule that starts contributing
 * fails too, so an entry cannot rot into a shield.
 *
 * Without it the only gate on participation is `stats.fixers.size` against a
 * floor, which leaves several rules of headroom before a dropout registers at
 * all and names none of them when it finally does. A rule that regressed into
 * silence would then be indistinguishable from one that was never reachable.
 *
 * Measured: neither entry is excluded by `silentWithoutProgramRuleNames` or
 * `DIVERGENT_WITHOUT_PROGRAM`, so each silence is a property of the fixture
 * corpus available to the screen, not of the screen itself.
 *
 * `use-custom-link` and `enforce-exported-function-types` previously sat here
 * too. Each fixture corpus now carries a case exercising the rule's fixer
 * without tripping the reason that used to withhold it — a default-only
 * `next/link` import beside a declaration the module already exports for
 * `use-custom-link` (its own carve-out fixtures, all multi-specifier imports,
 * still decline), and a `declare type` props type for
 * `enforce-exported-function-types`, which `findExportableTypeDeclaration`
 * matches by AST type and name and which this guard's `injectExports` leaves
 * alone because it filters on `!node.declare`. Both now contribute a rewrite
 * that removes nothing, so both retired from this ledger rather than staying
 * as a stale non-contribution entry the two-way audit below would reject.
 */
const NON_CONTRIBUTING_FIXERS: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'Markdown-only: every fixture is a .md file, and this sweep keeps only `language === "ts"` because a Markdown fixture has no declaration to receive an injected export.',
  'no-unpinned-dependencies':
    'JSON-only (package.json), dropped by the same TS-only filter, for the same reason.',
};

/** Every fixable rule the plugin ships, by the guard's own fixability test. */
const fixableRuleNames = Object.keys(plugin.rules).filter(isFixable);

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
const FIXTURE_FLOOR = 22500; // measured 23865
const SURFACE_FLOOR = 20000; // measured 21513 (17572 injected + 3941 own)
const PAIR_FLOOR = 37000; // measured 39345
const CROSS_PAIR_FLOOR = 31500; // measured 33747
const REWRITE_FLOOR = 12400; // measured 13299
const CROSS_REWRITE_FLOOR = 8500; // measured 9166
const FIXER_FLOOR = 76; // measured 80
const CROSS_FIXER_FLOOR = 53; // measured 57
/**
 * Owners whose fixtures reached the screen. This is the denominator of the whole
 * cross pairing: the pair floors above are satisfiable by a corpus that collapsed
 * onto a handful of prolific suites, and this is the only counter that says the
 * sweep still walks the whole rule set.
 */
const OWNER_FLOOR = 185;
/**
 * Ceilings, cut CLOSE: each is a case this guard does NOT judge, so a harness
 * regression shows up as a jump. A ceiling parked far above its measurement is
 * the #1984 failure verbatim.
 */
// measured 108 — the CommonMark fence fixtures on
// `enforce-typescript-markdown-code-blocks` from #2213, including its CRLF and
// code-span cases, dominate the non-TS population. These cases are judged
// instead by `lang-fix-closure`, the core-equivalent oracle for their
// languages.
const NON_TS_CEILING = 130;
const NO_SURFACE_CEILING = 2550; // measured 2352
const UNPARSEABLE_OUTPUT_CEILING = 5; // measured 1

console.log(
  [
    "cross export-surface integrity: each rule's --fix over EVERY rule's fixtures",
    `  fixtures: ${stats.fixtures} TypeScript (${stats.nonTypeScriptDropped} other), ${stats.injected} injected + ${stats.ownSurface} own surface, ${stats.noSurface} with no surface`,
    `  screen: ${stats.screenFatal} fatal, ${stats.screenThrew} threw`,
    `  pairs: ${stats.pairs} (${stats.crossPairs} cross), rewrites ${stats.rewrites} (${stats.crossRewrites} cross), ${stats.fixThrew} threw, ${stats.unparseableOutput} unparseable outputs`,
    `  owners walked: ${stats.owners.size}`,
    `  fixers: ${stats.fixers.size} rewrote (${stats.crossFixers.size} cross-rule)`,
    `  perturbation: ${stats.perturbationSilenced} silenced, ${stats.perturbationAdmitted} admitted, ${stats.perturbationFixLost} fix-lost, ${stats.scaffoldReports} inside scaffolding (${stats.scaffoldAnchored} anchored at it) (bare screen: ${stats.bareScreenFatal} fatal, ${stats.bareScreenThrew} threw, ${stats.bareFixThrew} fix threw)`,
    `  perturbation by rule: silenced ${JSON.stringify(
      [...silencedByRule].sort((a, b) => b[1] - a[1]),
    )}`,
    `  perturbation by rule: admitted ${JSON.stringify(
      [...admittedByRule].sort((a, b) => b[1] - a[1]),
    )}`,
    `  perturbation by rule: fix-lost ${JSON.stringify(
      [...fixLostByRule].sort((a, b) => b[1] - a[1]),
    )}`,
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

describe('every fixable rule either rewrites or is named', () => {
  const silentFixers = fixableRuleNames.filter(
    (name) => !stats.fixers.has(name),
  );

  it('names every fixable rule that contributes no rewrite', () => {
    expect(
      silentFixers.filter((name) => !(name in NON_CONTRIBUTING_FIXERS)),
    ).toEqual([]);
  });

  it('carries no stale non-contribution entry', () => {
    expect(
      Object.keys(NON_CONTRIBUTING_FIXERS).filter((name) =>
        stats.fixers.has(name),
      ),
    ).toEqual([]);
  });

  /**
   * Non-vacuity: the ledger is only meaningful while the population it
   * partitions is the whole fixable set and most of it is on the rewriting
   * side. A collapse to a handful of contributors would satisfy both arms
   * above while measuring nothing.
   */
  it('partitions the whole fixable set (non-vacuity)', () => {
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(78); // measured 84
    expect(silentFixers.length + stats.fixers.size).toBe(
      fixableRuleNames.length,
    );
    expect(silentFixers.length).toBeLessThanOrEqual(8);
  });
});

/**
 * The rules whose fixer rewrites the fixture AS WRITTEN but declines it once
 * `injectExports` has exported every declaration. Each consults exportedness
 * in its own source, and the injection flips that input corpus-wide.
 *
 * The shape, demonstrated on `global-const-style`: a rename is withheld on an
 * exported binding, because renaming one breaks every importer.
 *
 *   const myConfigValue = { a: 1 };        -> const MY_CONFIG_VALUE = { a: 1 } as const;
 *   export const myConfigValue = { a: 1 }; -> export const myConfigValue = { a: 1 } as const;
 *
 * That matters here more than anywhere else: a rename is the likeliest way for
 * a fixer to drop a name from the export surface, which is the defect this
 * whole file exists to catch, and the perturbation withholds it. The guard
 * cannot stop perturbing — it needs a surface to break — so the honest answer
 * is to MEASURE the cost and gate it, rather than let it drift unobserved
 * behind `stats.fixers.size`, which only ever registers a rule that
 * contributes NOWHERE.
 *
 * Two-way audited like every other ledger here: a rule that starts losing
 * fixes fails, and a listed rule that stops losing them fails too.
 */
const PERTURBATION_FIX_LOST = new Set([
  'global-const-style',
  'consistent-callback-naming',
  'no-unnecessary-verb-suffix',
  'enforce-centralized-mock-firestore',
  'enforce-react-type-naming',
  'no-unnecessary-destructuring-rename',
  'prefer-type-over-interface',
  'enforce-exported-function-types',
  'enforce-firestore-set-merge',
]);

describe('injectExports is gated as a perturbation, not trusted as a read', () => {
  /**
   * The second of the two neutrality gates. A report multiset can match while
   * the SUBJECT has moved onto the scaffolding, so matching counts is not
   * enough on its own: this asks WHERE each report lands and refuses any that
   * sits inside an injected `export ` token.
   */
  it('lands no report inside an injected `export ` span', () => {
    expect(stats.scaffoldReports).toBe(0);
  });

  it('names every rule whose fixer the injection silences', () => {
    expect(
      [...fixLostByRule.keys()].filter(
        (name) => !PERTURBATION_FIX_LOST.has(name),
      ),
    ).toEqual([]);
  });

  it('carries no stale fix-loss entry', () => {
    expect(
      [...PERTURBATION_FIX_LOST].filter((name) => !fixLostByRule.has(name)),
    ).toEqual([]);
  });

  /**
   * Ceilings sit just above the measured cost, so a change that widens the
   * blind spot registers instead of being absorbed. Floors sit just under it,
   * so a harness that stopped perturbing — and therefore stopped measuring
   * anything — fails rather than reading clean.
   */
  it('holds the perturbation cost to its measured size', () => {
    expect(stats.perturbationFixLost).toBeLessThanOrEqual(1700); // measured 1492
    expect(stats.perturbationSilenced).toBeLessThanOrEqual(400); // measured 332
    expect(stats.perturbationAdmitted).toBeLessThanOrEqual(220); // measured 166
  });

  it('actually perturbs (non-vacuity)', () => {
    expect(stats.perturbationFixLost).toBeGreaterThanOrEqual(1200); // measured 1492
    expect(stats.perturbationSilenced).toBeGreaterThanOrEqual(250); // measured 332
    expect(stats.perturbationAdmitted).toBeGreaterThanOrEqual(120); // measured 166
    expect(stats.injected).toBeGreaterThanOrEqual(15000); // measured 17572
    /**
     * The anchored count is what proves the containment test is discriminating
     * rather than never reached: reports DO land at the injected offset in
     * bulk, and none of them lies inside the token.
     */
    expect(stats.scaffoldAnchored).toBeGreaterThanOrEqual(3500); // measured 4445
  });

  /**
   * The differential is only attributable to the injection while the bare arm
   * is as healthy as the perturbed one. A fatal parse or a throw there would
   * silently subtract cases from the comparison.
   */
  it('loses no case to the bare arm', () => {
    expect(stats.bareScreenFatal).toBe(0);
    expect(stats.bareScreenThrew).toBe(0);
    expect(stats.bareFixThrew).toBe(0);
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
    // Added by #2249, which found this counter written and read by nothing.
    // The diagnostic above and this assertion are what closed that gap.
    expect(stats.owners.size).toBeGreaterThanOrEqual(OWNER_FLOOR);
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

  /**
   * The reader's two newest members, pinned directly. Both are reachable here
   * only through fixtures that write the shape by hand, so a corpus floor would
   * be thin enough to rot; asserting the reader itself keeps the branches from
   * silently going dead — a member the reader never produces cannot be removed,
   * and reads exactly like a member nothing removes.
   */
  it('reads a default export as the `default` surface member', () => {
    expect([
      ...(exportedNames(
        'const handler = () => {};\nexport default handler;\n',
        false,
      ) ?? []),
    ]).toEqual(['default']);
    // The declaration's own name is NOT a surface member: an importer binds
    // `default`, and renaming `foo` internally breaks no importer.
    expect([
      ...(exportedNames('export default function foo() {}\n', false) ?? []),
    ]).toEqual(['default']);
  });

  it('reads a defaulted destructuring element as an exported name', () => {
    expect(
      [
        ...(exportedNames(
          'export const [first = 1, ...rest] = pair;\n',
          false,
        ) ?? []),
      ].sort(),
    ).toEqual(['first', 'rest']);
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
