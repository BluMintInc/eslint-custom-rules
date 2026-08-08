/**
 * A fixer must not remove a name from a module's EXPORT SURFACE.
 *
 * An exported name is a cross-file contract. A single-file fixer cannot reach
 * the importers, so renaming or deleting an exported binding leaves every
 * importing file broken — TS2724/TS2305, an unresolved JSX element, a
 * `jest.mock` factory key that no longer matches.
 *
 * Nothing else in the suite can see this. Every shipped fixer probe validates
 * the fixed file against ITSELF: it still parses, its references still resolve,
 * it converges, it keeps its comments, it type-checks. All of those pass on a
 * renamed export, because the damage is entirely in other files. The agora
 * `fix: true` sweep returned 0 findings over 8,705 files in the same run that
 * this axis found 18 corrupting ones (#1700).
 *
 * Method, per fixture:
 *   1. INJECT — splice `export ` before every top-level declaration that lacks
 *      it. Fixtures are written without exports, so without this step the axis
 *      has no corpus at all.
 *   2. Run the rule's OWN `--fix` over the exported form, and — for a rule that
 *      offers suggestions — apply each suggestion ALONE to that same form.
 *      `--fix` never applies a suggestion, so a channel probed only through
 *      `verifyAndFix` leaves every suggestion transform unexamined (#1733), and
 *      accepting one is exactly as destructive to an importer.
 *   3. Diff the set of exported names. Anything in `before \ after` is a
 *      cross-file break.
 *
 * Corpus: the suite's own fixtures, harvested without executing them (see
 * `harvestRuleTesterCases`). A corpus sweep of real consumer code answers "did
 * this happen here"; injecting into the fixtures answers "can this rule do it
 * at all", which is the question a regression gate needs.
 */
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  defaultFilenameFor,
  harvestFixtureCorpus,
  harvestOnce,
  silentWithoutProgramRuleNames,
  suggestionEditsOf,
  suggestionRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * Rules are resolved from the harvested suite by OBJECT IDENTITY, never from
 * the display name passed to `run`: ~100 of the suites pass a name that is not
 * a rule name, and name-keyed matching silently drops every one of them.
 */
const nameByRule = new Map<unknown, string>(
  Object.entries(plugin.rules).map(([name, rule]) => [rule, name]),
);

const parseOptions = (jsx: boolean) => ({
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: { jsx },
  loc: true,
  range: true,
  tokens: true,
  comment: true,
});

const parse = (code: string, jsx: boolean) => {
  try {
    return tsParser.parse(code, parseOptions(jsx));
  } catch {
    return null;
  }
};

/** The names this module offers its importers. */
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

/**
 * Splice `export ` before each top-level declaration that lacks it, then
 * re-parse: an injection that does not parse is discarded rather than counted,
 * so a malformed splice cannot masquerade as a rule that declined.
 */
const injectExports = (code: string, jsx: boolean): string | null => {
  const ast = parse(code, jsx);
  if (!ast) {
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

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * Stand-in culprit for the positive control: renames every camelCase exported
 * const to SCREAMING_SNAKE, i.e. destroys an export name outright.
 *
 * The control cannot key on a shipped rule. Every live instance of this class
 * is something the suite exists to eliminate, so a control tied to one would go
 * vacuous exactly when the plugin is healthiest. This double is defined here
 * and never enters the swept rule set.
 */
const CONTROL_ID = `${PREFIX}control-export-renamer`;
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
        // Converging on the first pass matters: `verifyAndFix` re-lints its own
        // output, and a double that kept reporting would spin the control.
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
 * The same double offered through `suggest`, and its opposite.
 *
 * The suggestion channel needs both polarities from rules that cannot go quiet,
 * for the same reason the fix channel's double is planted rather than borrowed
 * from a shipped rule.
 */
const CONTROL_SUGGESTION_ID = `${PREFIX}control-export-renamer-suggestion`;
const CONTROL_SAFE_SUGGESTION_ID = `${PREFIX}control-initializer-suggestion`;

const suggestingDouble = (
  trigger: RegExp,
  edit: (id: any, node: any, fixer: any) => unknown,
): Rule.RuleModule => ({
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    schema: [],
    messages: { report: 'Rewrite "{{name}}".', suggest: 'Rewrite it.' },
  },
  create(context) {
    return {
      VariableDeclarator(node: any) {
        const declaration = node.parent;
        if (
          declaration?.type !== 'VariableDeclaration' ||
          declaration.parent?.type !== 'ExportNamedDeclaration' ||
          node.id.type !== 'Identifier' ||
          !trigger.test(node.id.name)
        ) {
          return;
        }
        context.report({
          node: node.id,
          messageId: 'report',
          data: { name: node.id.name },
          suggest: [
            {
              messageId: 'suggest',
              fix: (fixer) => edit(node.id, node, fixer) as never,
            },
          ],
        });
      },
    };
  },
});

linter.defineRule(
  CONTROL_SUGGESTION_ID,
  suggestingDouble(/^retry/, (id, _node, fixer) =>
    fixer.replaceText(
      id,
      id.name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
    ),
  ),
);
linter.defineRule(
  CONTROL_SAFE_SUGGESTION_ID,
  suggestingDouble(/^keep/, (_id, node, fixer) =>
    fixer.replaceText(node.init, '{ attempts: 5 }'),
  ),
);

const configFor = (ruleId: string, jsx: boolean, options: unknown) =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    },
    rules: {
      [ruleId]: Array.isArray(options) ? ['error', ...options] : 'error',
    },
  } as never);

type Channel = 'fix' | 'suggestion';
type Removal = {
  rule: string;
  channel: Channel;
  removed: string[];
  origin: string;
};

const removalFor = (
  ruleId: string,
  code: string,
  jsx: boolean,
  filename: string,
  options: unknown,
): { removed: string[]; rewritten: boolean } | null => {
  let result;
  try {
    result = linter.verifyAndFix(code, configFor(ruleId, jsx, options), {
      filename,
    });
  } catch {
    return null;
  }
  if (result.output === code) {
    return { removed: [], rewritten: false };
  }
  const before = exportedNames(code, jsx);
  const after = exportedNames(result.output, jsx);
  if (!before || !after) {
    return null;
  }
  return {
    removed: [...before].filter((name) => !after.has(name)),
    rewritten: true,
  };
};

/**
 * The same diff over the suggestion channel: each suggestion applied ALONE to
 * the exported form, never composed with a sibling and never fed back through a
 * fix loop, since neither is a state a user accepting one suggestion reaches.
 */
const suggestionRemovalsFor = (
  ruleId: string,
  code: string,
  jsx: boolean,
  filename: string,
  options: unknown,
): { applied: number; removals: { removed: string[]; desc: string }[] } => {
  let messages;
  try {
    messages = linter.verify(code, configFor(ruleId, jsx, options), {
      filename,
    });
  } catch {
    return { applied: 0, removals: [] };
  }
  if (messages.some((message) => message.fatal)) {
    return { applied: 0, removals: [] };
  }
  const before = exportedNames(code, jsx);
  if (!before) {
    return { applied: 0, removals: [] };
  }

  const removals: { removed: string[]; desc: string }[] = [];
  let applied = 0;
  for (const edit of suggestionEditsOf(code, messages, ruleId)) {
    applied++;
    const after = exportedNames(edit.output, jsx);
    // Unparseable output is `fixer-convergence`'s axis, not this one.
    if (!after) {
      continue;
    }
    const removed = [...before].filter((name) => !after.has(name));
    if (removed.length) {
      removals.push({ removed, desc: edit.desc });
    }
  }
  return { applied, removals };
};

/**
 * Groups that remove an export name and are NOT defects, each with the reason.
 * Keyed by rule for the `--fix` channel and `<rule> :: suggestion` for the
 * suggestion channel, so one channel's justification can never silently cover
 * the other's regression.
 *
 * Two-way audited below: an unlisted group fails, and a listed group that stops
 * reproducing also fails, so an entry cannot rot into a shield for the next
 * regression. Prefer fixing over listing — #1700, #1701, #1702 and #1703 were
 * each fixed rather than baselined.
 */
export const EXPORT_SURFACE_BASELINE: Record<string, string> = {
  'enforce-firestore-set-merge':
    'the transform substitutes the imported callee (updateDoc -> setDoc), so rebinding the name is intrinsic to it. Reachable only through the injected shape `export const { doc, updateDoc } = await import(...)` — exporting a destructured dynamic import is not a form real code writes, and the rule is silent on every non-exported spelling.',
};

/** `<rule>` for the fix channel, `<rule> :: suggestion` for the other. */
const removalKey = (removal: Removal) =>
  removal.channel === 'fix' ? removal.rule : `${removal.rule} :: suggestion`;

/**
 * Through the memoized accessor: the suggestion corpus below reads the adapted
 * view of this same harvest, and a second raw harvest in one module registry
 * returns zero suites, which would empty whichever corpus asked for it second.
 */
const harvested = harvestOnce();

const removals: Removal[] = [];
let considered = 0;
let injected = 0;
let rewritten = 0;
const rulesExercised = new Set<string>();

/**
 * The only exclusion is `silentWithoutProgramRuleNames` — rules MEASURED to
 * report nothing under this harness, and so able to contribute only a false
 * clean. It is deliberately not "every rule that mentions `getParserServices`":
 * that premise was measured false (all 16 report — #1859), because
 * `@typescript-eslint/parser` returns an isolated single-file program even with
 * no `project`, so the `if (!services?.program) return;` guard rules use never
 * fires. Dropping all 16 leaves their fixers unprobed along this axis, which is
 * how #1877 hid two shipping fixers that destroyed comments.
 */
for (const suite of harvested.suites) {
  const ruleName = nameByRule.get(suite.rule);
  if (!ruleName || silentWithoutProgramRuleNames.has(ruleName)) {
    continue;
  }
  const rule = plugin.rules[ruleName] as { meta?: { fixable?: unknown } };
  if (!rule?.meta?.fixable) {
    continue;
  }
  const jsx = suite.tester !== 'ruleTesterTs';
  const ruleId = PREFIX + ruleName;

  for (const kind of ['valid', 'invalid'] as const) {
    for (const raw of suite[kind]) {
      const testCase: any = typeof raw === 'string' ? { code: raw } : raw;
      if (!testCase || typeof testCase.code !== 'string') {
        continue;
      }
      considered++;
      const exported = injectExports(testCase.code, jsx);
      if (!exported) {
        continue;
      }
      injected++;
      const outcome = removalFor(
        ruleId,
        exported,
        jsx,
        testCase.filename || (jsx ? 'file.tsx' : 'file.ts'),
        testCase.options,
      );
      if (!outcome || !outcome.rewritten) {
        continue;
      }
      rewritten++;
      rulesExercised.add(ruleName);
      if (outcome.removed.length) {
        removals.push({
          rule: ruleName,
          channel: 'fix',
          removed: outcome.removed,
          origin: `${suite.file}:${kind}`,
        });
      }
    }
  }
}

/**
 * The suggestion channel gets its own pass over its own corpus: only one of the
 * seven suggestion-bearing rules is `meta.fixable`, so six of them never enter
 * the loop above and the fix channel's corpus cannot stand in for this one.
 */
const corpus = harvestFixtureCorpus();
const suggestionApplied = new Map<string, number>(
  suggestionRuleNames.map((rule) => [rule, 0]),
);
let suggestionSubstrates = 0;

for (const ruleName of suggestionRuleNames) {
  const ruleId = PREFIX + ruleName;
  for (const testCase of corpus.byRule.get(ruleName) || []) {
    const jsx = testCase.tester !== 'ruleTesterTs';
    /**
     * Injection manufactures an export surface; a fixture that already has one
     * needs none. Without the second half this channel would be empty for the
     * rules whose fixtures export everything they declare — measured: 1 of
     * `enforce-dynamic-firebase-imports`'s 97 cases is injectable and 42 already
     * export, and 110 of `no-excessive-parent-chain`'s 112 already export.
     * (Injection, when it applies, subsumes the raw surface: it only prepends
     * `export ` to declarations that lack it.)
     */
    const exported =
      injectExports(testCase.code, jsx) ??
      (exportedNames(testCase.code, jsx)?.size ? testCase.code : null);
    if (!exported) {
      continue;
    }
    suggestionSubstrates++;
    const outcome = suggestionRemovalsFor(
      ruleId,
      exported,
      jsx,
      defaultFilenameFor(testCase),
      testCase.options,
    );
    suggestionApplied.set(
      ruleName,
      (suggestionApplied.get(ruleName) || 0) + outcome.applied,
    );
    for (const removal of outcome.removals) {
      removals.push({
        rule: ruleName,
        channel: 'suggestion',
        removed: removal.removed,
        origin: `${testCase.origin}:${testCase.bucket} "${removal.desc}"`,
      });
    }
  }
}

const totalSuggestionsApplied = [...suggestionApplied.values()].reduce(
  (total, count) => total + count,
  0,
);

/**
 * Printed per rule, not merely asserted in aggregate: a rule that applied no
 * suggestion was not tested on this channel, and a total hides that.
 */
console.log(
  [
    `[export-surface-integrity] suggestion channel: ${totalSuggestionsApplied} ` +
      `suggestion(s) applied over ${suggestionSubstrates} case(s) carrying an ` +
      `export surface`,
    ...suggestionRuleNames.map(
      (rule) => `    ${rule}: ${suggestionApplied.get(rule) || 0} applied`,
    ),
  ].join('\n'),
);

const offendingKeys = new Set(removals.map(removalKey));

describe('no fixer removes a name from the export surface', () => {
  it('leaves every exported name intact outside the documented baseline', () => {
    const unlisted = removals.filter(
      (removal) => !(removalKey(removal) in EXPORT_SURFACE_BASELINE),
    );
    const detail = unlisted
      .slice(0, 12)
      .map(
        (removal) =>
          `  ${removalKey(removal)} drops [${removal.removed.join(', ')}] (${
            removal.origin
          })`,
      )
      .join('\n');
    expect(
      unlisted.length === 0
        ? ''
        : `${unlisted.length} export name(s) removed by --fix or by an ` +
            `accepted suggestion:\n${detail}\n\n` +
            'An exported name is a cross-file contract a single-file transform ' +
            'cannot rewrite. Withhold it and keep the report, or add the entry to ' +
            'EXPORT_SURFACE_BASELINE with the reason it is not a defect.',
    ).toBe('');
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(EXPORT_SURFACE_BASELINE).filter(
      (key) => !offendingKeys.has(key),
    );
    expect(stale).toEqual([]);
  });
});

describe('the export-surface guard is load-bearing', () => {
  it('harvests the suite without executing or losing it', () => {
    expect(harvested.failures.length).toBeLessThanOrEqual(3);
    expect(harvested.filesLoaded).toBeGreaterThan(200);
    expect(harvested.suites.length).toBeGreaterThan(250);
  });

  it('injects exports into a large corpus and actually rewrites it', () => {
    // Floors, not equalities: fixtures move. A silent collapse of any of these
    // to zero is how this gate would pass while asserting nothing.
    expect(considered).toBeGreaterThan(4000);
    expect(injected).toBeGreaterThan(3000);
    expect(rewritten).toBeGreaterThan(1000);
    expect(rulesExercised.size).toBeGreaterThan(50);
  });

  it('detects a removed export name (positive control)', () => {
    const planted = 'export const retryConfig = { attempts: 3 };\n';
    const outcome = removalFor(
      CONTROL_ID,
      planted,
      false,
      'file.ts',
      undefined,
    );
    expect(outcome?.rewritten).toBe(true);
    expect(outcome?.removed).toEqual(['retryConfig']);
  });

  /**
   * Per-rule floor for the suggestion channel. A rule that applied no
   * suggestion was never tested on it, and an aggregate would let one prolific
   * rule cover for a rule that stopped emitting entirely.
   */
  it('applies at least one suggestion from every suggestion-bearing rule', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(7);
    // None of the seven is type-aware, so each is reachable under this bare
    // Linter and none has a reason to be exempt.
    expect(
      suggestionRuleNames.filter(
        (rule) => (suggestionApplied.get(rule) || 0) < 1,
      ),
    ).toEqual([]);
    expect(totalSuggestionsApplied).toBeGreaterThanOrEqual(200);
    expect(suggestionSubstrates).toBeGreaterThanOrEqual(500);
  });

  it('detects an export name removed by a SUGGESTION (positive control)', () => {
    // `--fix` never applies a suggestion, so the sweep above is blind to this
    // transform however destructive it is.
    const planted = 'export const retryConfig = { attempts: 3 };\n';
    const outcome = suggestionRemovalsFor(
      CONTROL_SUGGESTION_ID,
      planted,
      false,
      'file.ts',
      undefined,
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.removals.map((removal) => removal.removed)).toEqual([
      ['retryConfig'],
    ]);
  });

  it('stays silent on a suggestion that keeps the name (negative control)', () => {
    // Same pipeline, same trigger, a suggestion that rewrites the INITIALIZER
    // and leaves the binding alone. A green corpus means nothing if the
    // detector fires on every rewrite it is handed.
    const planted = 'export const keepConfig = { attempts: 3 };\n';
    const outcome = suggestionRemovalsFor(
      CONTROL_SAFE_SUGGESTION_ID,
      planted,
      false,
      'file.ts',
      undefined,
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.removals).toEqual([]);
  });

  it('stays silent when a rule declines the exported rename (negative control)', () => {
    // `global-const-style` reports this and withholds only the rename (#1700),
    // so the `as const` fix still lands and the export name survives. A
    // predicate that keyed on "the file changed" would flag it.
    const planted = 'export const retryConfig = { attempts: 3 };\n';
    const outcome = removalFor(
      `${PREFIX}global-const-style`,
      planted,
      false,
      'file.ts',
      undefined,
    );
    expect(outcome?.rewritten).toBe(true);
    expect(outcome?.removed).toEqual([]);
  });

  it('reads the export surface through every binding form', () => {
    // The differ decides what counts as "exported", so a gap here silently
    // narrows the whole gate. A destructuring pattern exports its LOCAL names
    // (`renamed`, not `original`), and an aliased specifier exports the
    // `exported` half — get either backwards and a real removal reads as clean,
    // or every aliased export reads as a removal.
    const surface = (code: string) =>
      [...(exportedNames(code, false) ?? [])].sort();

    expect(surface('export const { original: renamed } = source;')).toEqual([
      'renamed',
    ]);
    expect(surface('export const [first, second] = pair;')).toEqual([
      'first',
      'second',
    ]);
    expect(
      surface('const local = 1;\nexport { local as publicName };'),
    ).toEqual(['publicName']);
    expect(surface('export function handler() {}')).toEqual(['handler']);
    expect(
      surface('export const { outer: { inner: leaf } } = source;'),
    ).toEqual(['leaf']);
    // A non-exported declaration contributes nothing, or the differ would
    // report a removal every time a fixer renamed a private binding.
    expect(surface('const privateOnly = 1;')).toEqual([]);
  });

  it('injects exports into a declaration that lacks them', () => {
    // Step 1 of the method. If this silently returned the input unchanged the
    // whole sweep would run against a corpus with no exports in it and pass.
    const injectedCode = injectExports(
      'const value = 1;\nfunction go() {}',
      false,
    );
    expect(injectedCode).toContain('export const value');
    expect(injectedCode).toContain('export function go');
    // A snippet with no top-level declaration yields nothing to export.
    expect(injectExports('callSomething();', false)).toBeNull();
  });
});
