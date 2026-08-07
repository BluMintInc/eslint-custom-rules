import { Linter } from 'eslint';
import {
  FALLBACK_FILENAMES,
  FixtureCase,
  defaultFilenameFor,
  harvestFixtureCorpus,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

/**
 * A fixer that imports or reuses a module-scope name and emits a reference to it
 * at the report site is broken when an inner scope between the two already binds
 * that name: the emitted reference silently resolves to the inner binding.
 *
 * Nothing else catches this. The name is bound, so a stranding check passes; the
 * module scope still holds one declaration, so a collision check passes; and
 * TypeScript accepts a well-typed reference to a real binding, so there is no
 * diagnostic. Issues #1455 and #1456 were both this shape — #1455 silently
 * changed a destructuring default's value, and #1456 silently changed a router
 * key.
 *
 * This guard injects a shadowing binding into the function enclosing each report
 * site and requires that no fixer's emitted reference resolves to it. Declining
 * the fix (reporting without fixing) satisfies it; so does emitting a reference
 * that still resolves to the module-scope binding.
 *
 * The corpus is the suite's OWN `RuleTester` cases, captured by
 * `harvestFixtureCorpus` with their `options`, `filename` and `parserOptions`
 * attached. Text-parsing the test files for string literals — what this guard
 * did until #1732 — dropped every case a suite assembles by interpolation and
 * stripped the configuration from the ones it kept, which is how a rule could
 * be listed among 69 with no trigger while nothing of it had been probed.
 */

/**
 * Anchoring on the fix range does not work: ESLint merges an
 * `insertTextBefore(program.body[0], import…)` with the call-site replacement
 * into a single fix spanning from offset 0, so the innermost function enclosing
 * that range is the whole file for exactly the import-inserting rules this guard
 * exists to check. Report locations are used instead.
 */

type Parsed = {
  ast: Record<string, unknown>;
  scopeManager: Record<string, unknown>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

/**
 * A case's options must reach the fix pass; an option-gated fixer is otherwise
 * unreachable, and applying them to only one pass would manufacture a finding.
 */
const cfgFor = (rule: string, testCase: FixtureCase): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: { [PREFIX + rule]: severityWithOptions(testCase) },
  } as Linter.Config);

// A standalone parse throws on valid input unless given the full option set.
const parse = (text: string, filePath: string): Parsed | null => {
  try {
    return tsParser.parseForESLint(text, {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      filePath,
    });
  } catch {
    return null;
  }
};

const applyFix = (text: string, fix: { range: number[]; text: string }) =>
  text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

const fixesOf = (msg: any) => {
  const out: Array<{ range: number[]; text: string }> = [];
  if (msg.fix) out.push(msg.fix);
  for (const s of msg.suggestions || []) if (s.fix) out.push(s.fix);
  return out;
};

const walkAst = (node: any, visit: (n: any) => void) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'parent') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walkAst(c, visit));
    else if (v && typeof v === 'object' && typeof v.type === 'string') {
      walkAst(v, visit);
    }
  }
};

const moduleScope = (sm: any) =>
  sm.globalScope.childScopes.find((s: any) => s.type === 'module') ||
  sm.globalScope;

const innermostScopeAt = (sm: any, pos: number) => {
  let best: any = null;
  const visit = (scope: any) => {
    const r = scope.block && scope.block.range;
    if (r && pos >= r[0] && pos <= r[1]) {
      if (!best || r[1] - r[0] < best.block.range[1] - best.block.range[0]) {
        best = scope;
      }
    }
    scope.childScopes.forEach(visit);
  };
  visit(sm.globalScope);
  return best || sm.globalScope;
};

/**
 * Resolution walks the scope chain by position rather than reading
 * `reference.resolved`, so a JSX component name resolves exactly like a plain
 * identifier. JSX substitution is a large share of the import-inserting fixers.
 */
const resolveAt = (sm: any, name: string, pos: number) => {
  let scope = innermostScopeAt(sm, pos);
  while (scope) {
    const v = scope.variables.find((x: any) => x.name === name);
    if (v) return v;
    scope = scope.upper;
  }
  return null;
};

/**
 * An identifier in a non-reference position must not count as a use, or the
 * before/after differential cancels out. `JSON.stringify(x)` -> `stringify(x)`
 * is the case that matters: the property token counts before the fix and
 * disappears after it, exactly masking the reference the fix introduced.
 */
const isReferencePosition = (node: any, parent: any): boolean => {
  if (!parent) return true;
  const p = parent;
  if (p.type === 'MemberExpression' && p.property === node && !p.computed) {
    return false;
  }
  if (p.type === 'JSXMemberExpression' && p.property === node) return false;
  if (p.type === 'JSXAttribute' && p.name === node) return false;
  if (p.type === 'Property' && p.key === node && !p.computed && !p.shorthand) {
    return false;
  }
  if (
    (p.type === 'MethodDefinition' ||
      p.type === 'PropertyDefinition' ||
      p.type === 'TSPropertySignature' ||
      p.type === 'TSMethodSignature') &&
    p.key === node &&
    !p.computed
  ) {
    return false;
  }
  if (p.type === 'TSQualifiedName' && p.right === node) return false;
  return true;
};

/**
 * TypeScript resolves type and value positions in separate namespaces, so a
 * `const X` shadow cannot capture `Record<X, …>`. Counting type references made
 * `prefer-map-over-conditional-dispatch` look broken 22 times over while its
 * emitted type annotation resolved exactly as intended. `typeof X` is the
 * exception: it reads the value namespace from inside a type.
 */
const TYPE_CONTEXTS = new Set([
  'TSTypeReference',
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSInterfaceHeritage',
  'TSClassImplements',
]);

const isTypePosition = (ancestors: any[]): boolean => {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'TSTypeQuery') return false;
    if (TYPE_CONTEXTS.has(a.type)) return true;
  }
  return false;
};

const eachRefSite = (ast: any, cb: (n: any) => void) => {
  const importRanges: number[][] = [];
  walkAst(ast, (n) => {
    if (n.type === 'ImportDeclaration') importRanges.push(n.range);
  });
  const ancestors: any[] = [];
  const visit = (node: any, parent: any) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const inImport = importRanges.some(
        ([a, b]) => node.range[0] >= a && node.range[1] <= b,
      );
      if (
        !inImport &&
        isReferencePosition(node, parent) &&
        !isTypePosition(ancestors)
      ) {
        cb(node);
      }
    }
    ancestors.push(node);
    for (const k of Object.keys(node)) {
      if (k === 'parent') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node));
      else if (v && typeof v === 'object' && typeof v.type === 'string') {
        visit(v, node);
      }
    }
    ancestors.pop();
  };
  visit(ast, null);
};

const nameCounts = (ast: any) => {
  const m = new Map<string, number>();
  eachRefSite(ast, (n) => m.set(n.name, (m.get(n.name) || 0) + 1));
  return m;
};

/**
 * Uses of `name` resolving to anything other than the module-scope binding.
 *
 * Deliberately not keyed on the injected declaration's offset: the fixer inserts
 * its import above that declaration, shifting it, so any absolute position taken
 * from the pre-fix text is stale in the patched text.
 */
const capturedCount = (parsed: Parsed, name: string) => {
  const modVar = moduleScope(parsed.scopeManager as any).variables.find(
    (v: any) => v.name === name,
  );
  let n = 0;
  eachRefSite(parsed.ast, (site: any) => {
    if (site.name !== name) return;
    const v = resolveAt(parsed.scopeManager as any, name, site.range[0]);
    if (v && v !== modVar) n++;
  });
  return n;
};

const FN_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const enclosingFunctionBody = (ast: any, pos: number) => {
  let best: any = null;
  walkAst(ast, (n) => {
    if (!FN_TYPES.has(n.type)) return;
    if (!n.body || n.body.type !== 'BlockStatement') return;
    const [a, b] = n.range;
    if (pos >= a && pos <= b) {
      if (!best || b - a < best.range[1] - best.range[0]) best = n;
    }
  });
  return best ? best.body : null;
};

const offsetOf = (text: string, line: number, column: number) => {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    off += lines[i].length + 1;
  }
  return off + (column - 1);
};

type Trigger = {
  testCase: FixtureCase;
  filename: string;
  name: string;
  injectAt: number;
};

/** What the run establishes about a rule, before any shadow is injected. */
type Reach = {
  reported: number;
  actionable: number;
  enclosed: number;
  triggers: Trigger[];
};

const triggersFor = (
  rule: string,
  probes: Array<{ testCase: FixtureCase; filename: string }>,
): Reach => {
  const reach: Reach = {
    reported: 0,
    actionable: 0,
    enclosed: 0,
    triggers: [],
  };
  for (const { testCase, filename } of probes) {
    const code = testCase.code;
    let msgs;
    try {
      msgs = linter.verify(code, cfgFor(rule, testCase), { filename });
    } catch {
      continue;
    }
    const mine = msgs.filter((m: any) => m.ruleId === PREFIX + rule);
    if (mine.length) reach.reported++;
    const actionable = mine.filter((m: any) => fixesOf(m).length);
    if (!actionable.length) continue;
    reach.actionable++;
    const beforeParsed = parse(code, filename);
    if (!beforeParsed) continue;
    const beforeCounts = nameCounts(beforeParsed.ast);
    for (const m of actionable) {
      const site = offsetOf(code, m.line, m.column);
      const body = enclosingFunctionBody(beforeParsed.ast, site);
      if (!body) continue; // reported at module level: no inner scope to shadow
      reach.enclosed++;
      for (const fix of fixesOf(m)) {
        const patchedParsed = parse(applyFix(code, fix), filename);
        if (!patchedParsed) continue;
        const modAfter = moduleScope(
          patchedParsed.scopeManager as any,
        ).variables.map((v: any) => v.name);
        for (const [name, n] of nameCounts(patchedParsed.ast)) {
          if (n <= (beforeCounts.get(name) || 0)) continue;
          // Only a name the module scope binds can be mis-resolved by a shadow.
          if (!modAfter.includes(name)) continue;
          reach.triggers.push({
            testCase,
            filename,
            name,
            injectAt: body.range[0] + 1,
          });
        }
      }
    }
  }
  return reach;
};

type Capture = {
  name: string;
  detail: string;
  origin: string;
  patched: string;
};

const capturesFor = (rule: string, triggers: Trigger[]) => {
  const captures: Capture[] = [];
  let probed = 0;
  const seen = new Set<string>();
  for (const t of triggers) {
    const key = `${t.name}::${t.injectAt}::${t.testCase.code.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const code = t.testCase.code;
    const decl = `const ${t.name} = undefined as unknown as never;\n`;
    const injected =
      code.slice(0, t.injectAt) + '\n' + decl + code.slice(t.injectAt);

    const beforeParsed = parse(injected, t.filename);
    if (!beforeParsed) continue;
    // The injected declaration must actually shadow, not land in module scope.
    const injectedVar = resolveAt(
      beforeParsed.scopeManager as any,
      t.name,
      t.injectAt + 2,
    );
    if (!injectedVar) continue;
    if (
      moduleScope(beforeParsed.scopeManager as any).variables.includes(
        injectedVar,
      )
    ) {
      continue;
    }

    probed++;
    const before = capturedCount(beforeParsed, t.name);

    let msgs;
    try {
      msgs = linter.verify(injected, cfgFor(rule, t.testCase), {
        filename: t.filename,
      });
    } catch {
      continue;
    }
    for (const m of msgs.filter((x: any) => x.ruleId === PREFIX + rule)) {
      for (const fix of fixesOf(m)) {
        const patched = applyFix(injected, fix);
        const afterParsed = parse(patched, t.filename);
        if (!afterParsed) continue;
        const after = capturedCount(afterParsed, t.name);
        if (after > before) {
          captures.push({
            name: t.name,
            detail: `${before} -> ${after} uses of '${t.name}' resolve to the inner shadow`,
            origin: `src/tests/${t.testCase.origin} as ${t.filename}`,
            patched,
          });
        }
      }
    }
  }
  return { captures, probed };
};

const corpus = harvestFixtureCorpus();

const transformingRules = Object.keys(plugin.rules)
  .filter((r) => {
    const meta = plugin.rules[r].meta || {};
    return Boolean(meta.fixable) || Boolean(meta.hasSuggestions);
  })
  .sort();

type RuleResult = {
  cases: number;
  reach: Reach;
  probed: number;
  captures: Capture[];
};

const results = new Map<string, RuleResult>();

for (const rule of transformingRules) {
  const cases = corpus.byRule.get(rule) || [];
  let reach = triggersFor(
    rule,
    cases.map((testCase) => ({
      testCase,
      filename: defaultFilenameFor(testCase),
    })),
  );
  /**
   * Second chance only for a rule that reported NOTHING. Once a rule reports,
   * the path it was probed under is not what decides whether its fix emits a
   * reference, so re-probing the whole corpus under seven invented filenames
   * would multiply the cost of the pass without changing an outcome — but a
   * rule that never reported at all may simply have been handed a path it
   * rejects, and that would be a false reason.
   */
  if (reach.reported === 0 && cases.length) {
    reach = triggersFor(
      rule,
      cases.flatMap((testCase) =>
        testCase.filename
          ? []
          : FALLBACK_FILENAMES.map((filename) => ({ testCase, filename })),
      ),
    );
  }
  const { captures, probed } = capturesFor(rule, reach.triggers);
  results.set(rule, { cases: cases.length, reach, probed, captures });
}

const totalProbed = [...results.values()].reduce((a, r) => a + r.probed, 0);
const totalTriggers = [...results.values()].reduce(
  (a, r) => a + r.reach.triggers.length,
  0,
);
const rulesProbed = [...results.values()].filter((r) => r.probed > 0).length;

/**
 * Why a rule's transforms were never put in front of a shadow. Derived from the
 * run rather than asserted by hand, so an entry cannot claim a reason the
 * corpus contradicts — and the reasons are deliberately distinct, because
 * "emits no reference to a module-bound name" (the expected, healthy answer for
 * a reordering or deleting fixer) and "never reports at all" (a broken corpus)
 * are the two facts a single bucket would conflate.
 */
const REASONS = {
  noFixtures: 'declares no fixture this TypeScript harness can lint',
  // Held for a rule that measurably produces nothing here. The old wording
  // ("is type-aware, and a bare Linter has no program") was a premise, not a
  // measurement, and a false one: the parser builds an isolated program and all
  // 16 checker-touching rules report over their own fixtures (#1859).
  undrivable:
    'is measurably silent under this harness, so it reports nothing here',
  neverReports: 'never reports on any of its own fixtures',
  noTransform: 'reports on its own fixtures but offers no fix or suggestion',
  noEnclosingBlock:
    'reports only where no function block encloses the site, so no shadow can stand',
  noModuleBoundReference:
    'emits no new reference to a module-scope-bound name, so no shadow can capture one',
  shadowNeverLanded:
    'emits such a reference, but the injected declaration never shadowed it',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

/** Only meaningful for a rule with no probe; the branches narrow toward one. */
const unprobedReasonFor = (rule: string): Reason => {
  const { cases, reach } = results.get(rule)!;
  if (cases === 0) return REASONS.noFixtures;
  // Undrivability outranks the report counts: a rule that produces nothing at
  // all here says nothing about itself, so its counts are not evidence.
  if (reach.actionable === 0) {
    if (silentWithoutProgramRuleNames.has(rule)) return REASONS.undrivable;
    return reach.reported === 0 ? REASONS.neverReports : REASONS.noTransform;
  }
  if (reach.enclosed === 0) return REASONS.noEnclosingBlock;
  if (reach.triggers.length === 0) return REASONS.noModuleBoundReference;
  // Triggers existed, so the injection step is the only thing left that can
  // have dropped them.
  return REASONS.shadowNeverLanded;
};

const observedUnprobed = Object.fromEntries(
  transformingRules
    .filter((rule) => results.get(rule)!.probed === 0)
    .map((rule) => [rule, unprobedReasonFor(rule)]),
);

/**
 * Every transforming rule this corpus never puts in front of a shadow, with the
 * reason the run produces for it.
 *
 * Most entries are `noModuleBoundReference`, and that is the healthy answer: a
 * fixer that reorders members, deletes a wrapper, renames in place or rewrites
 * an import specifier emits no reference at all, so there is nothing for an
 * inner binding to capture. The list exists because the ALTERNATIVE readings —
 * a rule that stopped reporting, a corpus that stopped carrying its triggers —
 * are indistinguishable from that one until each rule is named with its reason.
 */
const UNPROBED_RULES: Record<string, Reason> = {
  // Fixtures no TypeScript parser can lint: markdown and JSON testers.
  'enforce-typescript-markdown-code-blocks': REASONS.noFixtures,
  'no-unpinned-dependencies': REASONS.noFixtures,

  // Reports here but offers no transform. Its 105 fixtures declare
  // `parserOptions.project` against the repo tsconfig, which the corpus strips;
  // the isolated program that remains types the returned expression as `any`,
  // so the classification is indeterminate and the fixer never runs (#1859).
  'no-usememo-for-pass-by-value': REASONS.noTransform,

  // Every report sits outside a function block — at module or class level,
  // or in a concise arrow body — so there is nowhere to declare a shadow.
  'enforce-date-ttime': REASONS.noEnclosingBlock,
  'enforce-dynamic-firebase-imports': REASONS.noEnclosingBlock,
  'enforce-firestore-rules-get-access': REASONS.noEnclosingBlock,
  'enforce-m3-sentence-case': REASONS.noEnclosingBlock,
  'enforce-memoize-getters': REASONS.noEnclosingBlock,
  'enforce-mui-rounded-icons': REASONS.noEnclosingBlock,
  'enforce-snapshot-state-narrowing': REASONS.noEnclosingBlock,
  'enforce-unique-cursor-headers': REASONS.noEnclosingBlock,
  'global-const-style': REASONS.noEnclosingBlock,
  'jsdoc-above-field': REASONS.noEnclosingBlock,
  'no-unnecessary-destructuring': REASONS.noEnclosingBlock,
  'no-useless-usememo-primitives': REASONS.noEnclosingBlock,
  'omit-index-html': REASONS.noEnclosingBlock,
  'prefer-block-comments-for-declarations': REASONS.noEnclosingBlock,
  'prefer-clone-deep': REASONS.noEnclosingBlock,
  'prefer-fragment-component': REASONS.noEnclosingBlock,
  'prefer-fragment-shorthand': REASONS.noEnclosingBlock,
  'prefer-getter-over-parameterless-method': REASONS.noEnclosingBlock,
  'prefer-next-dynamic': REASONS.noEnclosingBlock,
  'require-memoize-jsx-returners': REASONS.noEnclosingBlock,
  'sync-onwrite-name-func': REASONS.noEnclosingBlock,
  'use-custom-link': REASONS.noEnclosingBlock,
  'use-custom-memo': REASONS.noEnclosingBlock,
  'use-custom-router': REASONS.noEnclosingBlock,

  // The healthy majority: these fixers reorder, rename in place, delete a
  // wrapper or rewrite an import specifier, and emit no reference at all.
  'class-methods-read-top-to-bottom': REASONS.noModuleBoundReference,
  'consistent-callback-naming': REASONS.noModuleBoundReference,
  'enforce-centralized-mock-firestore': REASONS.noModuleBoundReference,
  'enforce-early-destructuring': REASONS.noModuleBoundReference,
  'enforce-empty-object-check': REASONS.noModuleBoundReference,
  'enforce-exported-function-types': REASONS.noModuleBoundReference,
  'enforce-fieldpath-syntax-in-docsetter': REASONS.noModuleBoundReference,
  'enforce-id-capitalization': REASONS.noModuleBoundReference,
  'enforce-object-literal-as-const': REASONS.noModuleBoundReference,
  'enforce-props-argument-name': REASONS.noModuleBoundReference,
  'enforce-props-naming-consistency': REASONS.noModuleBoundReference,
  'enforce-react-type-naming': REASONS.noModuleBoundReference,
  'ensure-pointer-events-none': REASONS.noModuleBoundReference,
  'flatten-push-calls': REASONS.noModuleBoundReference,
  'key-only-outermost-element': REASONS.noModuleBoundReference,
  'logical-top-to-bottom-grouping': REASONS.noModuleBoundReference,
  'no-class-instance-destructuring': REASONS.noModuleBoundReference,
  // Reaches inside a function block once the parent gate spans every statement
  // list, but the fix only strips braces, so it emits no reference to capture.
  'no-curly-brackets-around-commented-properties':
    REASONS.noModuleBoundReference,
  'no-direct-function-state': REASONS.noModuleBoundReference,
  'no-empty-dependency-use-callbacks': REASONS.noModuleBoundReference,
  'no-entire-object-hook-deps': REASONS.noModuleBoundReference,
  'no-excessive-parent-chain': REASONS.noModuleBoundReference,
  'no-explicit-return-type': REASONS.noModuleBoundReference,
  'no-firestore-jest-mock': REASONS.noModuleBoundReference,
  'no-redundant-annotation-assertion': REASONS.noModuleBoundReference,
  'no-redundant-param-types': REASONS.noModuleBoundReference,
  'no-redundant-usecallback-wrapper': REASONS.noModuleBoundReference,
  'no-unnecessary-destructuring-rename': REASONS.noModuleBoundReference,
  'no-unused-usestate': REASONS.noModuleBoundReference,
  'no-useless-fragment': REASONS.noModuleBoundReference,
  'parallelize-async-operations': REASONS.noModuleBoundReference,
  'prefer-destructuring-no-class': REASONS.noModuleBoundReference,
  'prefer-document-flattening': REASONS.noModuleBoundReference,
  'prefer-nullish-coalescing-boolean-props': REASONS.noModuleBoundReference,
  'prefer-params-over-parent-id': REASONS.noModuleBoundReference,
  'prefer-spread-over-reassembly': REASONS.noModuleBoundReference,
  'prefer-sx-prop-over-system-props': REASONS.noModuleBoundReference,
  'prefer-type-over-interface': REASONS.noModuleBoundReference,
  'prefer-union-from-const-array': REASONS.noModuleBoundReference,
  'prefer-url-tostring-over-tojson': REASONS.noModuleBoundReference,
  'require-hooks-default-params': REASONS.noModuleBoundReference,
  'vertically-group-related-functions': REASONS.noModuleBoundReference,
};

const reportOf = (captures: Capture[]) =>
  captures
    .map(
      (c) => `${c.detail}\n${c.origin}\n--- patched output ---\n${c.patched}`,
    )
    .join('\n\n');

console.log(
  [
    `[fixer-shadow-capture] ${rulesProbed} of ${transformingRules.length} ` +
      `transforming rules probed; ${totalProbed} shadow injections from ` +
      `${totalTriggers} emitted references`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  unprobed (${
      Object.keys(observedUnprobed).length
    }), each with its reason:`,
    ...Object.entries(observedUnprobed).map(
      ([rule, reason]) => `    ${rule}: ${reason}`,
    ),
  ].join('\n'),
);

describe('fixers must not emit a reference an inner shadow captures', () => {
  /**
   * Coverage floor. Most transforming rules never emit a reference to a
   * module-bound name inside a function — they reorder, rename, delete, rewrite
   * an import specifier in place, or emit an ambient like `Promise.all` — so a
   * low rule count is expected and is not the signal. What must not happen is
   * the extractor breaking and degrading every assertion below to a vacuous
   * pass.
   */
  it('exercises a meaningful number of transforming rules', () => {
    expect(transformingRules.length).toBeGreaterThan(80);
    // Exact, not a floor: every unprobed rule is named below with the reason
    // the run produced for it, so slack here would only hide a rule going dark.
    expect(rulesProbed).toBe(
      transformingRules.length - Object.keys(UNPROBED_RULES).length,
    );
    expect(totalProbed).toBeGreaterThanOrEqual(400);
    expect(corpus.failures).toEqual([]);
  });

  /**
   * Every transforming rule is either probed or listed with the reason the run
   * itself produced, enforced BOTH ways: a rule that stops being probed must be
   * added consciously, and an entry whose reason stops holding must be deleted.
   * Without this the per-rule assertion below is `expect('').toBe('')` for 69
   * of the 90 rules and says nothing at all (#1732).
   */
  it('accounts for every transforming rule, unprobed ones by reason', () => {
    expect(observedUnprobed).toEqual(UNPROBED_RULES);
  });

  it.each(transformingRules)('%s', (rule) => {
    const { captures, probed } = results.get(rule)!;
    const problems: string[] = [];
    if (probed === 0 && !(rule in UNPROBED_RULES)) {
      problems.push(
        `no transform of this rule was put in front of a shadow ` +
          `(${unprobedReasonFor(
            rule,
          )}). Restore a triggering fixture, or add the ` +
          `rule to UNPROBED_RULES with that reason.`,
      );
    }
    // A capture means the fix must decline instead; see #1455 / #1456.
    if (captures.length) problems.push(reportOf(captures));
    expect(problems.join('\n\n')).toBe('');
  });
});

/**
 * Planted fixers of both polarities, run through the same `triggersFor` /
 * `capturesFor` the shipped rules go through.
 *
 * Every shipped rule is clean on this axis, so without a planted defect the
 * detector is only ever observed returning nothing — and a harness that stopped
 * detecting anything at all would read exactly the same way. The negative
 * control is what keeps the positive one honest: it emits the SAME reference to
 * the SAME module-bound name, but at module level where the injected shadow
 * cannot reach it, so a detector that simply flagged every emitted name would
 * fail it.
 */
const IMPORT_HELPER = "import { helper } from './helpers';\n";

const controlRule = (emitAtModuleLevel: boolean) => ({
  meta: {
    type: 'problem' as const,
    fixable: 'code' as const,
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'render') return;
        const program = context.getSourceCode().ast;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) => [
            fixer.insertTextBefore(program.body[0], IMPORT_HELPER),
            emitAtModuleLevel
              ? fixer.insertTextAfter(
                  program.body[program.body.length - 1],
                  '\nexport const alias = helper;\n',
                )
              : fixer.replaceText(node.callee, 'helper'),
          ],
        });
      },
    };
  },
});

const SHADOW_CONTROLS = [
  {
    name: 'control-shadow-captured',
    expectCaptures: 1,
    rule: controlRule(false),
  },
  {
    name: 'control-shadow-uncaptured',
    expectCaptures: 0,
    rule: controlRule(true),
  },
];

for (const control of SHADOW_CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

const CONTROL_CASE: FixtureCase = {
  code: 'export function run() {\n  return render();\n}\n',
  tester: 'ruleTesterTs',
  origin: 'planted control',
  bucket: 'valid',
};

describe('the shadow-capture detector is load-bearing', () => {
  it.each(SHADOW_CONTROLS.map((c) => [c.name, c.expectCaptures] as const))(
    'control %s yields %s capture(s)',
    (name, expectCaptures) => {
      const reach = triggersFor(name, [
        { testCase: CONTROL_CASE, filename: 'file.ts' },
      ]);
      // A control whose fix never emitted a module-bound reference would never
      // reach the injection step, and its zero would prove nothing.
      expect(reach.triggers.length).toBeGreaterThan(0);
      const { captures, probed } = capturesFor(name, reach.triggers);
      expect(probed).toBeGreaterThan(0);
      expect(captures.length).toBe(expectCaptures);
    },
  );

  /**
   * The corpus must carry the configuration each case was written for; a
   * bare-snippet corpus cannot reach an option-gated or path-gated fixer.
   */
  it('carries options and filenames from the fixtures themselves', () => {
    const cases = [...corpus.byRule.values()].flat();
    expect(cases.filter((c) => c.options).length).toBeGreaterThanOrEqual(250);
    expect(cases.filter((c) => c.filename).length).toBeGreaterThanOrEqual(1000);
    expect(
      (corpus.byRule.get('no-usememo-for-pass-by-value') || []).length,
    ).toBeGreaterThanOrEqual(60);
  });
});
