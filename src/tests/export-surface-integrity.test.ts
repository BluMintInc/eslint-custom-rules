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
 *   2. Run the rule's OWN `--fix` over the exported form.
 *   3. Diff the set of exported names. Anything in `before \ after` is a
 *      cross-file break.
 *
 * Corpus: the suite's own fixtures, harvested without executing them (see
 * `harvestRuleTesterCases`). A corpus sweep of real consumer code answers "did
 * this happen here"; injecting into the fixtures answers "can this rule do it
 * at all", which is the question a regression gate needs.
 */
import fs from 'fs';
import path from 'path';
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

/**
 * Type-aware rules are excluded: this harness has no `parserOptions.project`,
 * so without a program they report nothing and would manufacture a false clean
 * rather than a finding.
 */
const typeAwareNames = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /getParserServices|getTypeChecker/.test(
        fs.readFileSync(path.join(RULES_DIR, file), 'utf8'),
      ),
    )
    .map((file) => path.basename(file, '.ts')),
);

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

type Removal = { rule: string; removed: string[]; origin: string };

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
 * Groups that remove an export name and are NOT defects, each with the reason.
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

const harvested = harvestRuleTesterCases();

const removals: Removal[] = [];
let considered = 0;
let injected = 0;
let rewritten = 0;
const rulesExercised = new Set<string>();

for (const suite of harvested.suites) {
  const ruleName = nameByRule.get(suite.rule);
  if (!ruleName || typeAwareNames.has(ruleName)) {
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
          removed: outcome.removed,
          origin: `${suite.file}:${kind}`,
        });
      }
    }
  }
}

const offendingRules = new Set(removals.map((removal) => removal.rule));

describe('no fixer removes a name from the export surface', () => {
  it('leaves every exported name intact outside the documented baseline', () => {
    const unlisted = removals.filter(
      (removal) => !(removal.rule in EXPORT_SURFACE_BASELINE),
    );
    const detail = unlisted
      .slice(0, 12)
      .map(
        (removal) =>
          `  ${removal.rule} drops [${removal.removed.join(', ')}] (${
            removal.origin
          })`,
      )
      .join('\n');
    expect(
      unlisted.length === 0
        ? ''
        : `${unlisted.length} export name(s) removed by --fix:\n${detail}\n\n` +
            'An exported name is a cross-file contract a single-file fixer cannot ' +
            'rewrite. Withhold the fix and keep the report, or add the rule to ' +
            'EXPORT_SURFACE_BASELINE with the reason it is not a defect.',
    ).toBe('');
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(EXPORT_SURFACE_BASELINE).filter(
      (rule) => !offendingRules.has(rule),
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
