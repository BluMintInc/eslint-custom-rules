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
  LANGUAGE_BY_TESTER,
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

/**
 * The surface member a default export contributes. Spelled as a reserved word
 * so it cannot collide with a declared identifier in the same set.
 */
const DEFAULT_MEMBER = 'default';

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
       * A default export is a surface member like any other, and `default` is
       * the name an importer actually binds against — `import X from './m'`
       * resolves through it whatever the declaration is called internally.
       *
       * Carrying the DECLARATION's name instead would be wrong in both
       * directions: `export default function foo() {}` offers no named `foo`
       * to importers, and a fixer that renames it to `bar` breaks nobody, so a
       * name-keyed member would report a removal that is not one.
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

/**
 * Cases discarded because they did not PARSE, kept apart from the ones that
 * simply declare nothing exportable. Folding the two together is what let 163
 * fixtures leave this corpus unnoticed: both return `null` from the injector,
 * and only the second is a legitimate skip (#1984).
 */
const parseFailures: string[] = [];

/**
 * Splice `export ` before each top-level declaration that lacks it, then
 * re-parse: an injection that does not parse is discarded rather than counted,
 * so a malformed splice cannot masquerade as a rule that declined.
 */
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
 * The second surface shape: a DEFAULT export.
 *
 * `injectExports` only ever splices `export ` before a declaration, so nothing
 * it builds offers one, and the `default` member is otherwise reachable only
 * through the surfaces the corpus happens to write by hand. A module may hold
 * at most one default export, so rather than rewriting a declaration this
 * appends a single `export default <name>;` naming a binding already declared:
 * valid wherever the base injection is, and it leaves every existing
 * declaration byte-identical, so a finding here is about the default export and
 * not about a perturbed declaration.
 */
const DEFAULT_EXPORTABLE = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
]);

const injectDefaultExport = (code: string, jsx: boolean): string | null => {
  const ast = parse(code, jsx);
  if (!ast) {
    return null;
  }
  const body = ast.body as any[];
  // A second default export is a syntax error, so a fixture that already has
  // one is left to the base arm rather than corrupted here.
  if (body.some((node) => node.type === 'ExportDefaultDeclaration')) {
    return null;
  }
  let name: string | null = null;
  for (const node of body) {
    const declaration =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (!declaration || declaration.declare) {
      continue;
    }
    // Only a VALUE binding can be default-exported; `export default` of a type
    // alias or an interface does not parse.
    if (!DEFAULT_EXPORTABLE.has(declaration.type)) {
      continue;
    }
    if (declaration.type === 'VariableDeclaration') {
      const id = declaration.declarations[0]?.id;
      if (id?.type === 'Identifier') {
        name = id.name;
        break;
      }
    } else if (declaration.id?.name) {
      name = declaration.id.name;
      break;
    }
  }
  if (!name) {
    return null;
  }
  const augmented = `${code}\nexport default ${name};\n`;
  return parse(augmented, jsx) ? augmented : null;
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
/**
 * Deletes a default export outright — the shape the `default` surface member
 * exists to catch. Without it, a member that no fixer ever removes reads
 * exactly like a member the corpus proves safe.
 */
const CONTROL_DEFAULT_ID = `${PREFIX}control-default-deleter`;
const controlDefaultDeleter: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { drop: 'Drop the default export.' },
  },
  create(context) {
    return {
      ExportDefaultDeclaration(node: any) {
        context.report({
          node,
          messageId: 'drop',
          fix: (fixer) => fixer.remove(node),
        });
      },
    };
  },
};

/**
 * The negative half: rewrites the default export's OPERAND without removing the
 * export. The surface is unchanged, so a detector that flagged every rewrite of
 * a default export would fail here.
 */
const CONTROL_DEFAULT_SAFE_ID = `${PREFIX}control-default-keeper`;
const controlDefaultKeeper: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { wrap: 'Wrap the default export.' },
  },
  create(context) {
    return {
      ExportDefaultDeclaration(node: any) {
        if (node.declaration?.type !== 'Identifier') {
          return;
        }
        const id = node.declaration;
        context.report({
          node: id,
          messageId: 'wrap',
          fix: (fixer) => fixer.replaceText(id, `memo(${id.name})`),
        });
      },
    };
  },
};

linter.defineRule(CONTROL_DEFAULT_ID, controlDefaultDeleter);
linter.defineRule(CONTROL_DEFAULT_SAFE_ID, controlDefaultKeeper);

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

type Channel = 'fix' | 'suggestion' | 'default';
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
): {
  removed: string[];
  rewritten: boolean;
  /**
   * Whether the surface under test carried a default export at all. Counted so
   * the `default` member cannot report a clean it never earned: a member that
   * no probed surface contains reads exactly like a member nothing removes.
   */
  hadDefault: boolean;
} | null => {
  let result;
  try {
    result = linter.verifyAndFix(code, configFor(ruleId, jsx, options), {
      filename,
    });
  } catch {
    return null;
  }
  if (result.output === code) {
    return { removed: [], rewritten: false, hadDefault: false };
  }
  const before = exportedNames(code, jsx);
  const after = exportedNames(result.output, jsx);
  if (!before || !after) {
    return null;
  }
  return {
    removed: [...before].filter((name) => !after.has(name)),
    rewritten: true,
    hadDefault: before.has(DEFAULT_MEMBER),
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
  'enforce-firestore-set-merge :: default':
    'the SAME two cases as the fix-channel entry above, re-reached because appending `export default <name>;` leaves the destructured dynamic import untouched and the callee substitution still rebinds it. Measured: both findings remove `updateDoc`/`modifyDoc` from `export const { doc, updateDoc } = await import(...)`, never the `default` member itself, and no other rule reports on this arm across 3,871 default-bearing surfaces.',
};

/**
 * `<rule>` for the fix channel, `<rule> :: suggestion` and `<rule> :: default`
 * for the others. Each arm carries its OWN key so one arm's justification can
 * never silently cover another's regression — a rule-global entry un-gates
 * every arm the rule participates in at once (#1839).
 */
const removalKey = (removal: Removal) => {
  if (removal.channel === 'fix') {
    return removal.rule;
  }
  return `${removal.rule} :: ${removal.channel}`;
};

/**
 * Through the memoized accessor: the suggestion corpus below reads the adapted
 * view of this same harvest, and a second raw harvest in one module registry
 * returns zero suites, which would empty whichever corpus asked for it second.
 */
const harvested = harvestOnce();

const removals: Removal[] = [];
/** Suites skipped for parsing another language, asserted by name below. */
const nonTsExcluded = new Set<string>();
let considered = 0;
let injected = 0;
/**
 * Perturbation accounting. `injectExports` rewrites the fixture before the
 * fixer is asked anything, so a fixer that declines the EXPORTED text may
 * simply be declining the injection — several rules withhold a rename on an
 * exported binding, because renaming one breaks every importer. Asking the
 * same fixer the same question about the fixture AS WRITTEN separates "this
 * fixer has nothing to say here" from "the perturbation is what silenced it",
 * and counts the coverage this guard's own scaffolding costs it.
 *
 * The companion arm — whether a report lands INSIDE an injected `export `
 * token — is gated in `cross-export-surface-integrity.test.ts`, which screens
 * these same injected texts with every rule the plugin ships. The reports this
 * file sees are a subset of that population, so the gate there covers both.
 */
let perturbationFixLost = 0;
const perturbationFixLostByRule = new Map<string, number>();
let rewritten = 0;
/** Rewritten surfaces that carried a default export; see `hadDefault`. */
let defaultBearing = 0;
/** The default-injection arm, scored separately from the base arm. */
let defaultInjected = 0;
let defaultRewritten = 0;
const defaultRemovals: Removal[] = [];
const defaultRulesExercised = new Set<string>();
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
  const language = LANGUAGE_BY_TESTER[suite.tester] ?? 'ts';
  /**
   * `export ` spliced before a declaration is a TypeScript construct, so the
   * JSON and Markdown fixtures have no export surface to injure and are
   * excluded BY NAME rather than dropped in silence. Handing them to the TS
   * parser instead — which `jsx = tester !== 'ruleTesterTs'` did — makes every
   * one a fatal parse that `injectExports` returns `null` for, indistinguishable
   * from a fixture that simply declares nothing exportable (#1984).
   */
  if (language !== 'ts') {
    nonTsExcluded.add(`${ruleName} (${suite.tester})`);
    continue;
  }
  const ruleId = PREFIX + ruleName;

  for (const kind of ['valid', 'invalid'] as const) {
    for (const raw of suite[kind]) {
      const testCase: any = typeof raw === 'string' ? { code: raw } : raw;
      if (!testCase || typeof testCase.code !== 'string') {
        continue;
      }
      considered++;
      /**
       * JSX-ness is a property of the CODE, not of the tester that declared it:
       * 106 valid cases hold JSX under `ruleTesterTs`, and a non-JSX parse of
       * one is fatal. `defaultFilenameFor` picks the extension the code parses
       * under, and the flag is read back off it so the two cannot disagree.
       */
      const filename =
        testCase.filename ||
        defaultFilenameFor({
          code: testCase.code,
          tester: suite.tester,
          language,
        } as never);
      const jsx = filename.endsWith('x');
      /**
       * `injectExports` returns `null` both for a fixture that declares nothing
       * exportable AND for one that already exports everything it declares.
       * The second is the more interesting input, not a skip: it is where a
       * fixer meets a real export surface, and it is what the corpus wrote
       * for the rules that key on exported-ness. The suggestion arm below has
       * always fallen back to the raw surface; the fix arm dropped it, which
       * left ~2,000 already-exported cases out of the fix loop unasserted.
       */
      const exported =
        injectExports(testCase.code, jsx) ??
        (exportedNames(testCase.code, jsx)?.size ? testCase.code : null);
      if (!exported) {
        continue;
      }
      injected++;
      const outcome = removalFor(
        ruleId,
        exported,
        jsx,
        filename,
        testCase.options,
      );
      if (!outcome || !outcome.rewritten) {
        // Only meaningful where the injection actually changed the text: an
        // already-exporting fixture IS its own bare form.
        if (exported !== testCase.code) {
          const bare = removalFor(
            ruleId,
            testCase.code,
            jsx,
            filename,
            testCase.options,
          );
          if (bare && bare.rewritten) {
            perturbationFixLost++;
            perturbationFixLostByRule.set(
              ruleName,
              (perturbationFixLostByRule.get(ruleName) || 0) + 1,
            );
          }
        }
        continue;
      }
      rewritten++;
      if (outcome.hadDefault) {
        defaultBearing++;
      }
      rulesExercised.add(ruleName);
      if (outcome.removed.length) {
        removals.push({
          rule: ruleName,
          channel: 'fix',
          removed: outcome.removed,
          origin: `${suite.file}:${kind}`,
        });
      }

      /**
       * The same question asked of a surface that offers a DEFAULT export.
       * Driven only where the base arm already showed the rule rewrites, so
       * the arm costs one extra lint per acting fixer rather than one per
       * fixture.
       */
      const withDefault = injectDefaultExport(exported, jsx);
      if (!withDefault) {
        continue;
      }
      defaultInjected++;
      const defaultOutcome = removalFor(
        ruleId,
        withDefault,
        jsx,
        filename,
        testCase.options,
      );
      if (!defaultOutcome || !defaultOutcome.rewritten) {
        continue;
      }
      defaultRewritten++;
      defaultRulesExercised.add(ruleName);
      if (defaultOutcome.removed.length) {
        const defaultRemoval: Removal = {
          rule: ruleName,
          channel: 'default',
          removed: defaultOutcome.removed,
          origin: `${suite.file}:${kind} [default-injected]`,
        };
        defaultRemovals.push(defaultRemoval);
        // Judged by the same assertion as every other arm; `defaultRemovals`
        // is kept only so the arm's own reach can be floored below.
        removals.push(defaultRemoval);
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
    if (testCase.language !== 'ts') {
      nonTsExcluded.add(`${ruleName} (${testCase.tester})`);
      continue;
    }
    // Read off the filename this case is linted under, so the parse flag and
    // the path cannot disagree about whether the fixture holds JSX.
    const jsx = defaultFilenameFor(testCase).endsWith('x');
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

console.log(
  `[export-surface-integrity] fix channel: ${considered} considered / ` +
    `${injected} carrying an export surface / ${rewritten} rewritten across ` +
    `${rulesExercised.size} rules`,
);
console.log(
  `[export-surface-integrity] perturbation: ${perturbationFixLost} fix(es) lost ` +
    `to the injection across ${perturbationFixLostByRule.size} rule(s) ` +
    `${JSON.stringify([...perturbationFixLostByRule].sort((a, b) => b[1] - a[1]))}`,
);

/**
 * The rules whose fixer rewrites a fixture AS WRITTEN but declines it once
 * `injectExports` has exported every declaration. Each consults exportedness
 * in its own source, and the injection flips that input.
 *
 * Demonstrated on `global-const-style`: the rename is withheld on an exported
 * binding, because renaming one breaks every importer.
 *
 *   const myConfigValue = { a: 1 };        -> const MY_CONFIG_VALUE = { a: 1 } as const;
 *   export const myConfigValue = { a: 1 }; -> export const myConfigValue = { a: 1 } as const;
 *
 * That is the sharpest edge of the perturbation: a rename is the likeliest way
 * for a fixer to drop a name from the export surface, which is the defect this
 * file exists to catch, and the injection withholds it. The guard needs a
 * surface to break and so cannot stop perturbing — the answer is to MEASURE
 * the cost and gate it, rather than leave it behind a `rewritten` total that
 * only ever registers a rule contributing NOWHERE.
 *
 * Two-way audited: a rule that starts losing fixes fails, and a listed rule
 * that stops losing them fails too.
 */
const PERTURBATION_FIX_LOST = new Set([
  'global-const-style',
  'no-unnecessary-verb-suffix',
  'enforce-centralized-mock-firestore',
  'consistent-callback-naming',
  'enforce-exported-function-types',
  'enforce-react-type-naming',
  'no-unnecessary-destructuring-rename',
  'enforce-timestamp-now',
  'vertically-group-related-functions',
  'prefer-type-over-interface',
  'enforce-firestore-set-merge',
]);

describe('injectExports is gated as a perturbation, not trusted as a read', () => {
  it('names every rule whose fixer the injection silences', () => {
    expect(
      [...perturbationFixLostByRule.keys()].filter(
        (name) => !PERTURBATION_FIX_LOST.has(name),
      ),
    ).toEqual([]);
  });

  it('carries no stale fix-loss entry', () => {
    expect(
      [...PERTURBATION_FIX_LOST].filter(
        (name) => !perturbationFixLostByRule.has(name),
      ),
    ).toEqual([]);
  });

  /**
   * The ceiling sits just above the measured cost so a change that widens the
   * blind spot registers; the floor sits just under it so a harness that
   * stopped perturbing — and therefore stopped measuring anything — fails
   * rather than reading clean.
   */
  it('holds the perturbation cost to its measured size', () => {
    expect(perturbationFixLost).toBeLessThanOrEqual(350); // measured 287
    expect(perturbationFixLost).toBeGreaterThanOrEqual(220); // measured 287
    expect(perturbationFixLostByRule.size).toBeGreaterThanOrEqual(8); // measured 11
  });
});

describe('the export-surface guard is load-bearing', () => {
  /**
   * The `default` member's own reach. `injectDefaultExport` is what makes it
   * more than the handful of surfaces the corpus writes by hand: 27 rewritten
   * surfaces carried a default export before this arm, against 3,871 after.
   * Floors sit just under the measured values.
   */
  it('drives a DEFAULT export surface through most acting fixers', () => {
    expect(defaultInjected).toBeGreaterThanOrEqual(3600);
    expect(defaultRewritten).toBeGreaterThanOrEqual(3600);
    expect(defaultRulesExercised.size).toBeGreaterThanOrEqual(74);
    // The hand-written surfaces are counted too, so the arm cannot be credited
    // for reach the corpus already had.
    expect(defaultBearing).toBeGreaterThanOrEqual(20);
  });

  it('detects a DELETED default export (positive control)', () => {
    const planted =
      'export const handler = () => {};\nexport default handler;\n';
    const outcome = removalFor(
      CONTROL_DEFAULT_ID,
      planted,
      false,
      'file.ts',
      undefined,
    );
    expect(outcome?.rewritten).toBe(true);
    expect(outcome?.removed).toEqual(['default']);
  });

  it('stays silent on a default export that is only rewritten (negative)', () => {
    const planted =
      'export const handler = () => {};\nexport default handler;\n';
    const outcome = removalFor(
      CONTROL_DEFAULT_SAFE_ID,
      planted,
      false,
      'file.ts',
      undefined,
    );
    // It must REWRITE and still remove nothing, or it would pass by declining.
    expect(outcome?.rewritten).toBe(true);
    expect(outcome?.removed).toEqual([]);
  });

  it('reads a defaulted destructuring element as an exported name', () => {
    const surface = exportedNames(
      'export const [first = 1, ...rest] = pair;\n',
      false,
    );
    expect([...(surface ?? [])].sort()).toEqual(['first', 'rest']);
  });

  it('harvests the suite without executing or losing it', () => {
    expect(harvested.failures.length).toBeLessThanOrEqual(3);
    expect(harvested.filesLoaded).toBeGreaterThan(200);
    expect(harvested.suites.length).toBeGreaterThan(250);
  });

  it('injects exports into a large corpus and actually rewrites it', () => {
    // Floors, not equalities: fixtures move. A silent collapse of any of these
    // to zero is how this gate would pass while asserting nothing. Measured
    // 8,200 considered / 7,593 carrying an export surface / 3,147 rewritten
    // across 79 rules, once the fix arm stopped dropping fixtures that already
    // export everything they declare (5,815 / 2,384 / 50 before that). The
    // floors sit just under the measurement: left far below, a floor absorbs
    // exactly the corpus loss this gate exists to notice.
    expect(considered).toBeGreaterThan(8000);
    expect(injected).toBeGreaterThan(7300);
    expect(rewritten).toBeGreaterThan(2900);
    expect(rulesExercised.size).toBeGreaterThan(75);
  });

  it('discards no case to a parse it chose wrong', () => {
    /**
     * A fixture that never parsed is not a fixture the rule declined on, but
     * both leave this corpus the same way. Deriving JSX-ness from the TESTER
     * rather than the CODE discarded 163 cases here; asserting ZERO is what
     * makes the next one a failure rather than a rounding error.
     */
    expect(parseFailures.slice(0, 5)).toEqual([]);
  });

  it('excludes the non-TS testers by name, not by a silent misparse', () => {
    /**
     * `export ` is a TypeScript splice, so a JSON or Markdown fixture has no
     * export surface to injure — but it must be excluded deliberately. Fed to
     * the TS parser as `.tsx`, each was a fatal parse counted as "nothing to
     * inject". Naming them keeps the exclusion reviewable.
     */
    expect([...nonTsExcluded].sort()).toEqual([
      'enforce-typescript-markdown-code-blocks (ruleTesterMarkdown)',
      'no-unpinned-dependencies (ruleTesterJson)',
      // A TypeScript rule's own robustness fixture, asserting it stays silent
      // when handed a `package.json`. Listed rather than filtered out: an
      // exclusion is only reviewable if every member is named.
      'prefer-nullish-coalescing-boolean-props (ruleTesterJson)',
    ]);
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
