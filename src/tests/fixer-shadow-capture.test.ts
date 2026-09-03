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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts = require('typescript');

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
 *
 * A fixture written flat has no function block to shadow into, so a rule whose
 * corpus happens to be flat asks this guard nothing. `runNested` below wraps
 * each such fixture and re-asks, which is what distinguishes a rule that CANNOT
 * pose the question from a corpus that merely does not (#1998).
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
 * Bare type-position names — the namespace `nameCounts` deliberately excludes.
 * Keyed on the nodes that reference a type by bare name rather than on ancestor
 * positions: every measured emitter prints a lone identifier (`Record<Status,
 * …>`), which is always the `typeName` of a `TSTypeReference`, and a qualified
 * name (`Ns.Status`) resolves through its left-most segment only, a shape
 * nothing here emits.
 *
 * Heritage clauses count as references too, because this map is read as a
 * DIFFERENTIAL: `prefer-type-over-interface` rewrites `interface A extends B`
 * into `type A = B & …`, which respells a reference already in a type position
 * instead of emitting a new one. Counting only `TSTypeReference` reads that
 * respelling as a rise and enrolls a rule that copies verbatim source text
 * (`sourceCode.getText(clause)`) into a census meant for printed names — 38
 * unprobeable sites, and a spurious FALL for any rewrite in the other
 * direction, which would mask a real emission of the same name.
 */
const TYPE_REF_NODES = new Set(['TSInterfaceHeritage', 'TSClassImplements']);

const typeNameCounts = (ast: any) => {
  const m = new Map<string, number>();
  const bump = (name: string) => m.set(name, (m.get(name) || 0) + 1);
  walkAst(ast, (n) => {
    if (
      n.type === 'TSTypeReference' &&
      n.typeName &&
      n.typeName.type === 'Identifier'
    ) {
      bump(n.typeName.name);
    } else if (
      TYPE_REF_NODES.has(n.type) &&
      n.expression &&
      n.expression.type === 'Identifier'
    ) {
      bump(n.expression.name);
    }
  });
  return m;
};

/** Every identifier that DECLARES a binding, at any depth. */
const declarationIdentifiers = (sm: any) => {
  const ids = new Set<any>();
  const visit = (scope: any) => {
    for (const v of scope.variables)
      for (const id of v.identifiers) ids.add(id);
    scope.childScopes.forEach(visit);
  };
  visit(sm.globalScope);
  return ids;
};

/**
 * Uses of `name` resolving to anything other than the module-scope binding.
 *
 * Deliberately not keyed on the injected declaration's offset: the fixer inserts
 * its import above that declaration, shifting it, so any absolute position taken
 * from the pre-fix text is stale in the patched text.
 *
 * Two exclusions keep this counting the documented harm rather than everything
 * that shares a name. Both were needed to clear a false capture on
 * `no-unnecessary-verb-suffix`, whose fixture declares an inner shadow on
 * purpose (#1998):
 *
 * * **No module-scope binding of `name` means no harm is defined.** The harm is
 *   an emitted reference resolving to an inner binding INSTEAD of the
 *   module-scope one; with nothing at module scope there is no intended target
 *   to miss, and counting every resolving use then charges the fixer for
 *   bindings the fixture already had.
 * * **A declaration is not a use.** Counting binding identifiers makes the
 *   probe's own injected declaration read as a captured reference to itself.
 */
const capturedCount = (parsed: Parsed, name: string) => {
  const sm = parsed.scopeManager as any;
  const modVar = moduleScope(sm).variables.find((v: any) => v.name === name);
  if (!modVar) return 0;
  const declarations = declarationIdentifiers(sm);
  let n = 0;
  eachRefSite(parsed.ast, (site: any) => {
    if (site.name !== name || declarations.has(site)) return;
    const v = resolveAt(sm, name, site.range[0]);
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
  /**
   * Fix-emitted bare type-position names the module scope binds. The value
   * probe cannot see these — `isTypePosition` excludes them by design, since
   * the namespaces are separate and a `const` shadow cannot capture
   * `Record<X, …>` — so this census is the type arm's whole corpus, and it is
   * how the arm stays scoped by MEASUREMENT rather than by a rule-name list.
   * Sites are counted even where no function block encloses the report, so a
   * flat corpus cannot hide an emitter from the census.
   */
  typeSites: number;
  typeTriggers: Trigger[];
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
    typeSites: 0,
    typeTriggers: [],
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
    const beforeTypeCounts = typeNameCounts(beforeParsed.ast);
    for (const m of actionable) {
      const site = offsetOf(code, m.line, m.column);
      const body = enclosingFunctionBody(beforeParsed.ast, site);
      // A module-level report leaves no inner scope for either shadow, but
      // type SITES are still censused there — see `Reach.typeSites`.
      if (body) reach.enclosed++;
      for (const fix of fixesOf(m)) {
        const patchedParsed = parse(applyFix(code, fix), filename);
        if (!patchedParsed) continue;
        const modAfter = moduleScope(
          patchedParsed.scopeManager as any,
        ).variables.map((v: any) => v.name);
        if (body) {
          for (const [name, n] of nameCounts(patchedParsed.ast)) {
            if (n <= (beforeCounts.get(name) || 0)) continue;
            // Only a name the module scope binds can be mis-resolved by a
            // shadow.
            if (!modAfter.includes(name)) continue;
            reach.triggers.push({
              testCase,
              filename,
              name,
              injectAt: body.range[0] + 1,
            });
          }
        }
        for (const [name, n] of typeNameCounts(patchedParsed.ast)) {
          if (n <= (beforeTypeCounts.get(name) || 0)) continue;
          if (!modAfter.includes(name)) continue;
          reach.typeSites++;
          if (body) {
            reach.typeTriggers.push({
              testCase,
              filename,
              name,
              injectAt: body.range[0] + 1,
            });
          }
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

/**
 * Where every deduped trigger ends up. The buckets are exhaustive and disjoint,
 * and an identity below asserts as much, because a drop channel no counter names
 * is a probe that vanishes indistinguishably from a fixer that declined — the
 * shape a bare `probed` total certifies away (#1861).
 */
type ValueProbe = {
  /** Deduped triggers entering the loop; the denominator of the identity. */
  considered: number;
  /** Triggers a dedup key collapses onto an earlier, identical probe. */
  duplicates: number;
  unparsableInjection: number;
  shadowNeverLanded: number;
  verifyErrors: number;
  /**
   * The rule reports nothing at all once the shadow stands in front of it. The
   * probe is unattributable rather than clean: a fixer that never ran cannot
   * demonstrate that what it emits resolves anywhere.
   */
  silentUnderShadow: number;
  droppedReportOnInjection: number;
  droppedNonNeutral: number;
  droppedInvalid: number;
  droppedUnvalidatable: number;
  /** Probes the first shadow spelling could not carry; see `SHADOW_TYPES`. */
  rescuedByAlternateShadow: number;
  /** Injections standing in front of a rule that survived every control. */
  probed: number;
  /** Of those, the ones where the rule reports but offers no fix at all. */
  declinedUnderShadow: number;
  /** Of those, the ones where at least one fix survives the shadow. */
  fixingUnderShadow: number;
  /** A patched text that does not parse abandons the capture check. */
  unparsablePatch: number;
  /** Fixer outputs actually compared against the pre-fix capture count. */
  examinedFixes: number;
  captures: Capture[];
};

const newValueProbe = (): ValueProbe => ({
  considered: 0,
  duplicates: 0,
  unparsableInjection: 0,
  shadowNeverLanded: 0,
  verifyErrors: 0,
  silentUnderShadow: 0,
  droppedReportOnInjection: 0,
  droppedNonNeutral: 0,
  droppedInvalid: 0,
  droppedUnvalidatable: 0,
  rescuedByAlternateShadow: 0,
  probed: 0,
  declinedUnderShadow: 0,
  fixingUnderShadow: 0,
  unparsablePatch: 0,
  examinedFixes: 0,
  captures: [],
});

const VALUE_PROBE_COUNTERS = Object.keys(newValueProbe()).filter(
  (k) => k !== 'captures',
) as Array<Exclude<keyof ValueProbe, 'captures'>>;

const mergeValueProbes = (parts: ValueProbe[]): ValueProbe => {
  const out = newValueProbe();
  for (const part of parts) {
    for (const k of VALUE_PROBE_COUNTERS) out[k] += part[k];
    out.captures.push(...part.captures);
  }
  return out;
};

/** The channels a trigger can leave by without ever facing a fixer. */
type ValueDrop =
  | 'unparsableInjection'
  | 'shadowNeverLanded'
  | 'verifyErrors'
  | 'silentUnderShadow'
  | 'droppedReportOnInjection'
  | 'droppedNonNeutral'
  | 'droppedInvalid'
  | 'droppedUnvalidatable';

type ShadowAttempt =
  | {
      ok: true;
      injected: string;
      inserted: string;
      parsed: Parsed;
      reports: any[];
    }
  | { ok: false; reason: ValueDrop };

/**
 * The shadow's own type is a rule input, and one fixed spelling is not valid
 * for every fixture — the value-namespace counterpart of the wrapper's `async`
 * modifier, chosen per fixture by the same differential that judges it.
 *
 * `never` is assignable to every expected type, so it cannot widen what any
 * surrounding annotation sees, but it carries no call and no construct
 * signature. Measured: the differential rejects it on 84 injections, 39 for
 * TS2349 (the region CALLS the shadowed name) and 45 for TS2604 (the region
 * uses it as a JSX component), and the permissive spelling carries all 84.
 *
 * The order is conservative-first rather than either-way. Measured with the
 * permissive spelling leading, it carries all 1,455 and rescues nothing, so
 * over THIS corpus the fallback runs one way — but a wildcard stub is not
 * measured safe on shapes the corpus does not contain, and preferring the
 * narrowest spelling that validates keeps a rule reading the shadow through
 * the checker from being handed a type that answers every question.
 */
const SHADOW_TYPES = ['never', 'any'];

const capturesFor = (rule: string, triggers: Trigger[]): ValueProbe => {
  const out = newValueProbe();
  const seen = new Set<string>();
  /** Base subjects are re-read once per fixture, not once per trigger. */
  const baseSubjectCache = new Map<string, string | null>();

  const baseSubjectsOf = (t: Trigger): string | null => {
    const key = `${t.filename}::${t.testCase.code}`;
    if (baseSubjectCache.has(key)) return baseSubjectCache.get(key)!;
    const msgs = verifyOf(rule, t.testCase, t.filename);
    const subjects = msgs
      ? msgs
          .filter((m: any) => m.ruleId === PREFIX + rule)
          .map((m: any) => offsetOf(t.testCase.code, m.line, m.column))
          .sort((a: number, b: number) => a - b)
      : null;
    const value = subjects ? subjects.join(',') : null;
    baseSubjectCache.set(key, value);
    return value;
  };

  const tryShadow = (t: Trigger, shadowType: string): ShadowAttempt => {
    const code = t.testCase.code;
    const inserted = `\nconst ${t.name} = undefined as unknown as ${shadowType};\n`;
    const injected =
      code.slice(0, t.injectAt) + inserted + code.slice(t.injectAt);

    const parsed = parse(injected, t.filename);
    if (!parsed) return { ok: false, reason: 'unparsableInjection' };
    // The injected declaration must actually shadow, not land in module scope.
    const injectedVar = resolveAt(
      parsed.scopeManager as any,
      t.name,
      t.injectAt + 2,
    );
    if (
      !injectedVar ||
      moduleScope(parsed.scopeManager as any).variables.includes(injectedVar)
    ) {
      return { ok: false, reason: 'shadowNeverLanded' };
    }

    const baseSubjects = baseSubjectsOf(t);
    const injMsgs = verifyOf(
      rule,
      { ...t.testCase, code: injected },
      t.filename,
    );
    if (baseSubjects === null || !injMsgs) {
      return { ok: false, reason: 'verifyErrors' };
    }
    const reports = injMsgs.filter((m: any) => m.ruleId === PREFIX + rule);
    if (!reports.length) return { ok: false, reason: 'silentUnderShadow' };

    // Neutrality, gated two ways. First: no report may land inside the
    // injected span — a rule reporting on the probe's own scaffolding would be
    // answering about a subject the fixture never contained.
    const injOffsets = reports.map((m: any) =>
      offsetOf(injected, m.line, m.column),
    );
    if (
      injOffsets.some(
        (off) => off >= t.injectAt && off < t.injectAt + inserted.length,
      )
    ) {
      return { ok: false, reason: 'droppedReportOnInjection' };
    }
    // Second: the same SUBJECTS, compared by injection-adjusted offset.
    // MessageIds are deliberately NOT compared — declining the fix under the
    // shadow is the reaction this guard exists to demand, and the decline
    // swaps the messageId while reporting the same node. A subject appearing
    // or vanishing is what makes the probe unattributable.
    const adjusted = baseSubjects
      .split(',')
      .filter((s) => s.length)
      .map((s) => Number(s))
      .map((off) => (off >= t.injectAt ? off + inserted.length : off))
      .sort((a, b) => a - b)
      .join(',');
    if (adjusted !== [...injOffsets].sort((a, b) => a - b).join(',')) {
      return { ok: false, reason: 'droppedNonNeutral' };
    }

    // Validity as a DIFFERENTIAL: the injected variant may introduce no
    // diagnostic CODE the fixture does not already carry. A declaration
    // colliding with a same-block binding is the case this drops.
    const introduced = introducedDiagnostics(code, injected, t.filename);
    if (introduced === null) {
      return { ok: false, reason: 'droppedUnvalidatable' };
    }
    if (introduced.length) return { ok: false, reason: 'droppedInvalid' };

    return { ok: true, injected, inserted, parsed, reports };
  };

  for (const t of triggers) {
    // The whole fixture, not a prefix of it: under the nesting perturbation
    // below every wrapped variant opens with the same import block and wrapper
    // head, so a truncated key collapses distinct fixtures into one probe.
    const key = `${t.name}::${t.injectAt}::${t.testCase.code}`;
    if (seen.has(key)) {
      out.duplicates++;
      continue;
    }
    seen.add(key);
    out.considered++;

    let landed: Extract<ShadowAttempt, { ok: true }> | null = null;
    let firstReason: ValueDrop | null = null;
    let rejected = 0;
    for (const shadowType of SHADOW_TYPES) {
      const attempt = tryShadow(t, shadowType);
      if (attempt.ok) {
        landed = attempt;
        break;
      }
      if (!firstReason) firstReason = attempt.reason;
      rejected++;
    }
    if (!landed) {
      // The conservative spelling's reason describes the fixture; the
      // permissive one only ever adds reach.
      out[firstReason!]++;
      continue;
    }
    if (rejected) out.rescuedByAlternateShadow++;

    out.probed++;
    const before = capturedCount(landed.parsed, t.name);
    let fixes = 0;
    for (const m of landed.reports) {
      for (const fix of fixesOf(m)) {
        fixes++;
        const patched = applyFix(landed.injected, fix);
        const afterParsed = parse(patched, t.filename);
        if (!afterParsed) {
          out.unparsablePatch++;
          continue;
        }
        out.examinedFixes++;
        const after = capturedCount(afterParsed, t.name);
        if (after > before) {
          out.captures.push({
            name: t.name,
            detail: `${before} -> ${after} uses of '${t.name}' resolve to the inner shadow`,
            origin: `src/tests/${t.testCase.origin} as ${t.filename}`,
            patched,
          });
        }
      }
    }
    if (fixes) out.fixingUnderShadow++;
    else out.declinedUnderShadow++;
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * The nesting perturbation.
 *
 * A rule whose every report sits at module level is parked above with no shadow
 * put in front of it. That was read as a property of the RULE; for most of the
 * class it is a property of its FIXTURES, which happen to be written flat. This
 * arm settles which is which by wrapping each fixture's body in a function and
 * re-asking. It moved 13 of 21 parked rules off that reason and put 5 of them in
 * front of a real shadow (#1998). All 5 decline correctly.
 *
 * One measured behaviour is deliberately NOT failed here, because it is not a
 * capture. Under a shadow `enforce-mui-rounded-icons` declines only HALF its
 * fix: it still rewrites the module path but drops the identifier rename, so
 * `import NotificationsActiveOutlined from '…/NotificationsActiveRounded'`
 * survives — valid, and misleadingly named, but nothing it emits resolves to
 * the shadow, which is the only question this guard answers.
 * ------------------------------------------------------------------ */

const WRAPPER_NAMES = ['ProbeShell', 'probeBody'];

/**
 * The wrapper's own block, whichever variant produced it.
 *
 * The report-anchored arm cannot reach an import-keyed rule: its report sits on
 * an `ImportDeclaration`, which the wrap deliberately leaves at module level, so
 * `enclosingFunctionBody` is null even though the FIX rewrites call sites inside
 * the wrapper. Standing the shadow in the wrapper block instead is what reaches
 * `enforce-mui-rounded-icons`.
 */
const wrapperBodyOf = (ast: any): any => {
  for (const stmt of ast.body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    const d = stmt.declarations[0];
    if (!d || !d.id || d.id.name !== 'ProbeShell' || !d.init) continue;
    if (d.init.type === 'ArrowFunctionExpression') {
      return d.init.body && d.init.body.type === 'BlockStatement'
        ? d.init.body
        : null;
    }
    if (d.init.type === 'ClassExpression') {
      const m = d.init.body.body[0];
      return m && m.value && m.value.body ? m.value.body : null;
    }
  }
  return null;
};

/**
 * Same extraction as `triggersFor`, anchoring every shadow in the wrapper.
 * Value-namespace only: the type census belongs to the flat pass, whose sites
 * are counted with or without an enclosing block, so a wrapper cannot add an
 * emitter the census would otherwise miss.
 */
const wrapperTriggersFor = (
  rule: string,
  probes: Array<{ testCase: FixtureCase; filename: string }>,
): Reach => {
  const reach: Reach = {
    reported: 0,
    actionable: 0,
    enclosed: 0,
    triggers: [],
    typeSites: 0,
    typeTriggers: [],
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
    const body = wrapperBodyOf(beforeParsed.ast);
    if (!body) continue;
    reach.enclosed++;
    const beforeCounts = nameCounts(beforeParsed.ast);
    for (const m of actionable) {
      for (const fix of fixesOf(m)) {
        const patchedParsed = parse(applyFix(code, fix), filename);
        if (!patchedParsed) continue;
        const modAfter = moduleScope(
          patchedParsed.scopeManager as any,
        ).variables.map((v: any) => v.name);
        for (const [name, n] of nameCounts(patchedParsed.ast)) {
          if (n <= (beforeCounts.get(name) || 0)) continue;
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

/**
 * `await` belonging to the region itself, not to a function nested in it.
 *
 * The wrapper's own modifier is a rule input, and neither spelling is safe as a
 * default: a plain wrapper puts top-level `await` where `await` is not an
 * operator, while a blanket `async` one cannot be a React component, which
 * silences every component-keyed rule. Choosing per fixture is what keeps the
 * arm from manufacturing findings out of its own scaffolding.
 */
const regionNeedsAsync = (nodes: any[]): boolean => {
  let found = false;
  const visit = (n: any) => {
    if (!n || typeof n.type !== 'string' || found) return;
    if (n.type === 'AwaitExpression') {
      found = true;
      return;
    }
    if (n.type === 'ForOfStatement' && n.await) {
      found = true;
      return;
    }
    if (FN_TYPES.has(n.type)) return;
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object' && typeof v.type === 'string') {
        visit(v);
      }
    }
  };
  nodes.forEach(visit);
  return found;
};

/** Top-level forms illegal inside a function body (TS1184 / TS1235). */
const isUnmovable = (node: any): boolean => {
  if (node.declare === true) return true;
  if (
    node.type === 'ExportDefaultDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'TSExportAssignment' ||
    node.type === 'TSImportEqualsDeclaration' ||
    node.type === 'TSModuleDeclaration'
  ) {
    return true;
  }
  if (node.type === 'ExportNamedDeclaration') {
    if (!node.declaration) return true;
    if (node.declaration.declare === true) return true;
  }
  return false;
};

type WrapVariant = 'arrow' | 'class';

type WrapResult =
  | {
      ok: true;
      flat: string;
      wrapped: string;
      /** Byte spans of the inserted scaffolding, so a report ON it is visible. */
      scaffolding: Array<[number, number]>;
    }
  | { ok: false; reason: string };

/**
 * Strips top-level `export ` (illegal in a function body), keeps imports at
 * module level, and moves the remaining REGION — sliced as one span, so the
 * comments between statements survive — into an enclosing block.
 *
 * `flat` is the export-stripped but still top-level text, and it is the control
 * the wrapped variant is compared against: that attributes a report change to
 * the nesting rather than to the keyword the wrap has to remove.
 */
const wrapFixture = (
  code: string,
  filename: string,
  variant: WrapVariant,
): WrapResult => {
  if (WRAPPER_NAMES.some((n) => code.includes(n))) {
    return { ok: false, reason: 'fixture already uses a wrapper name' };
  }
  const first = parse(code, filename);
  if (!first) return { ok: false, reason: 'fixture does not parse' };
  const body = (first.ast as any).body as any[];
  if (!body.length) return { ok: false, reason: 'empty fixture' };
  for (const node of body) {
    if (isUnmovable(node)) {
      return { ok: false, reason: `unmovable top-level ${node.type}` };
    }
  }

  // Reverse order so each removal leaves the earlier ranges valid.
  let flat = code;
  for (let i = body.length - 1; i >= 0; i--) {
    const node = body[i];
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue;
    flat = flat.slice(0, node.range[0]) + flat.slice(node.declaration.range[0]);
  }

  const stripped = parse(flat, filename);
  if (!stripped) return { ok: false, reason: 'export strip broke the parse' };
  const sbody = (stripped.ast as any).body as any[];
  let lastImportEnd = 0;
  let sawNonImport = false;
  for (const node of sbody) {
    if (node.type === 'ImportDeclaration') {
      // An import after other statements cannot be hoisted without reordering.
      if (sawNonImport) {
        return { ok: false, reason: 'import interleaved with statements' };
      }
      lastImportEnd = node.range[1];
    } else {
      sawNonImport = true;
    }
  }
  if (!sawNonImport)
    return { ok: false, reason: 'nothing but imports to wrap' };

  const head = flat.slice(0, lastImportEnd);
  const region = flat.slice(lastImportEnd);
  const asyncKeyword = regionNeedsAsync(
    sbody.filter((n) => n.type !== 'ImportDeclaration'),
  )
    ? 'async '
    : '';

  const prefix =
    variant === 'arrow'
      ? `\nconst ProbeShell = ${asyncKeyword}() => {\n`
      : `\nconst ProbeShell = class {\n  ${asyncKeyword}probeBody() {\n`;
  const suffix = variant === 'arrow' ? `\n};\n` : `\n  }\n};\n`;
  const wrapped = `${head}${prefix}${region}${suffix}`;

  return {
    ok: true,
    flat,
    wrapped,
    scaffolding: [
      [head.length, head.length + prefix.length],
      [wrapped.length - suffix.length, wrapped.length],
    ],
  };
};

const idsOf = (msgs: any[], rule: string) =>
  msgs
    .filter((m) => m.ruleId === PREFIX + rule)
    .map((m) => `${m.messageId || m.message}${m.fix ? '+fix' : ''}`)
    .sort();

const verifyOf = (rule: string, testCase: FixtureCase, filename: string) => {
  try {
    return linter.verify(testCase.code, cfgFor(rule, testCase), { filename });
  } catch {
    return null;
  }
};

/**
 * Validity as a DIFFERENTIAL checker run. A reparse does not see grammar errors
 * — `declare` in a body is TS1184, a namespace in one is TS1235, and both parse
 * — so the variant counts as valid only when it introduces no diagnostic CODE
 * the flat control already carries. An ABSOLUTE count is useless here: fixtures
 * are full of unresolved names (TS2304), which would reject every variant.
 */
const TS_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.Preserve,
  experimentalDecorators: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: true,
  /**
   * `noUnusedLocals`/`noUnusedParameters` are deliberately ABSENT, unlike the
   * other `ts.Program` options in this repo (#2234). This guard PERTURBS the
   * fixture — wrapping a region in a function is exactly what makes a binding
   * the enclosing scope used stop being read — so the flags reject the wrapped
   * variant as invalid rather than judging the rule. Measured: the invalid
   * count rose to 930 of 1330 dropped variants and the type arm probed 0 sites.
   */
};
const baseHost = ts.createCompilerHost(TS_OPTIONS, true);
/**
 * Parsing the ~200 lib files dominates every program below and
 * `createCompilerHost` does not cache across programs. A hand-rolled
 * `noLib`/`noResolve` host is not the alternative: it leaves the checker
 * without globals and THROWS rather than returning diagnostics, which would
 * read as clean.
 */
const libCache = new Map<string, any>();
const cachedLib = (f: string, ...rest: any[]) => {
  if (libCache.has(f)) return libCache.get(f);
  const sf = baseHost.getSourceFile(f, ...rest);
  libCache.set(f, sf);
  return sf;
};

/**
 * One checker-backed program over one probe text, on the shared lib-cached
 * host. Both the wrap-neutrality diagnostic differential and the type arm's
 * symbol resolution build through here, so the lib-parse cost is paid once for
 * the whole file. Programs are deliberately NOT cached: each holds its checker
 * alive, and the diagnostic pass alone builds thousands of them.
 */
const probeProgramFor = (text: string, filename: string) => {
  const name = filename.startsWith('/') ? filename : `/probe/${filename}`;
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.ES2022,
    true,
    name.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : name.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : name.endsWith('.js')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS,
  );
  const host = Object.create(baseHost);
  host.getSourceFile = (f: string, ...rest: any[]) =>
    f === name ? sourceFile : cachedLib(f, ...rest);
  host.fileExists = (f: string) => f === name || baseHost.fileExists(f);
  host.readFile = (f: string) => (f === name ? text : baseHost.readFile(f));
  const program = ts.createProgram({
    rootNames: [name],
    options: TS_OPTIONS,
    host,
  });
  if (program.getSourceFile(name) !== sourceFile) {
    throw new Error(`program lost the probe file ${name}`);
  }
  return { program, sourceFile };
};

const diagnosticCache = new Map<string, Map<number, number>>();

const diagnosticCodesFor = (
  text: string,
  filename: string,
): Map<number, number> => {
  const name = filename.startsWith('/') ? filename : `/probe/${filename}`;
  const key = `${name}\n${text}`;
  const cached = diagnosticCache.get(key);
  if (cached) return cached;
  const { program, sourceFile } = probeProgramFor(text, filename);
  const counts = new Map<number, number>();
  for (const d of [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ]) {
    counts.set(d.code, (counts.get(d.code) || 0) + 1);
  }
  diagnosticCache.set(key, counts);
  return counts;
};

/** Counted, never swallowed: an unvalidatable variant is not a valid one. */
let validationErrors = 0;

const introducedDiagnostics = (
  base: string,
  variant: string,
  filename: string,
): number[] | null => {
  try {
    const baseCodes = diagnosticCodesFor(base, filename);
    const variantCodes = diagnosticCodesFor(variant, filename);
    const introduced: number[] = [];
    for (const [code, n] of variantCodes) {
      if (n > (baseCodes.get(code) || 0)) introduced.push(code);
    }
    return introduced;
  } catch {
    validationErrors++;
    return null;
  }
};

/* ------------------------------------------------------------------ *
 * The type-namespace arm.
 *
 * The injection above is value-only and `nameCounts` excludes type positions —
 * both correct, since the namespaces are separate and counting type references
 * against a `const` shadow once made `prefer-map-over-conditional-dispatch`
 * look broken 22 times over. The consequence was that the TYPE namespace went
 * entirely unprobed, while exactly one rule prints checker-derived type names
 * into fixed code: `typeToString` results interpolated into an emitted
 * `Record<K, V>` annotation. A `type` alias standing between that annotation's
 * landing site and the declaration the checker printed captures the name
 * SILENTLY — `type X = string` is compatible-but-wider, so nothing diagnoses
 * the swap while the Record quietly stops gating exhaustiveness (#2229).
 *
 * This arm injects `type <name> = string;` at the same anchor the value arm
 * computes and resolves every emitted type reference by CHECKER SYMBOL
 * IDENTITY — the resolution TypeScript itself applies — rather than a
 * hand-rolled scope walk. Declining the fix under the shadow satisfies it,
 * which is exactly what the rule-side remedy for #2229 does (#2230).
 * ------------------------------------------------------------------ */

/**
 * The scope-manager variable declared by the identifier at `offset`. The
 * injected alias's own binding is the one identifier whose position is exact —
 * nothing has been fixed yet — so this is the type-namespace mirror of the
 * value arm's shadow-landed check.
 */
const variableDeclaredAt = (sm: any, name: string, offset: number) => {
  let found: any = null;
  const visit = (scope: any) => {
    for (const v of scope.variables) {
      if (v.name !== name) continue;
      if (v.identifiers.some((id: any) => id.range[0] === offset)) found = v;
    }
    scope.childScopes.forEach(visit);
  };
  visit(sm.globalScope);
  return found;
};

/**
 * References resolving, by symbol identity, to the type alias declared at
 * `aliasPos` in THIS text. Symbols are per program, so the alias is located in
 * the same program its uses are resolved in — a fixture's own inner
 * `type X = string;` is a different symbol and can never count.
 *
 * `null` is "could not resolve", never zero: the caller counts it at its own
 * skip, so an arithmetic slip in the alias position cannot read as clean.
 */
const typeCapturedCount = (
  text: string,
  filename: string,
  name: string,
  aliasPos: number,
): number | null => {
  let sourceFile: any;
  let checker: any;
  try {
    const built = probeProgramFor(text, filename);
    sourceFile = built.sourceFile;
    checker = built.program.getTypeChecker();
  } catch {
    return null;
  }
  let alias: any = null;
  const findAlias = (node: any) => {
    if (alias) return;
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === name &&
      node.getStart(sourceFile) === aliasPos
    ) {
      alias = node;
      return;
    }
    ts.forEachChild(node, findAlias);
  };
  findAlias(sourceFile);
  if (!alias) return null;
  const aliasSymbol = checker.getSymbolAtLocation(alias.name);
  if (!aliasSymbol) return null;
  let n = 0;
  /**
   * The bare identifier `node` references from a TYPE position, mirroring
   * `typeNameCounts` so both sides of this differential count the same
   * positions. A heritage clause is such a position for `interface A extends B`
   * and `class A implements B`; a class's own `extends` is NOT — that reads the
   * value namespace, and counting it would let a value binding answer a
   * type-namespace question.
   */
  const typeRefIdentifier = (node: any, parent: any) => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      return node.typeName;
    }
    if (
      !ts.isExpressionWithTypeArguments(node) ||
      !ts.isIdentifier(node.expression) ||
      !parent ||
      !ts.isHeritageClause(parent)
    ) {
      return null;
    }
    const onInterface =
      parent.parent && ts.isInterfaceDeclaration(parent.parent);
    return parent.token === ts.SyntaxKind.ImplementsKeyword || onInterface
      ? node.expression
      : null;
  };
  const visit = (node: any, parent: any) => {
    const ref = typeRefIdentifier(node, parent);
    if (
      ref &&
      ref.text === name &&
      checker.getSymbolAtLocation(ref) === aliasSymbol
    ) {
      n++;
    }
    ts.forEachChild(node, (child: any) => visit(child, node));
  };
  visit(sourceFile, null);
  return n;
};

type TypeProbe = {
  probed: number;
  captures: Capture[];
  /** Every skip by reason; each is read by an expect below, never just printed. */
  droppedUnparsable: number;
  droppedShadowNeverLanded: number;
  droppedReportOnInjection: number;
  droppedNonNeutral: number;
  droppedInvalid: number;
  droppedUnvalidatable: number;
  /** A fix whose range swallows the injected alias removes the shadow itself. */
  shadowOverwritten: number;
  /** Variants the checker could not resolve; counted, never swallowed. */
  checkerErrors: number;
};

const typeCapturesFor = (rule: string, triggers: Trigger[]): TypeProbe => {
  const out: TypeProbe = {
    probed: 0,
    captures: [],
    droppedUnparsable: 0,
    droppedShadowNeverLanded: 0,
    droppedReportOnInjection: 0,
    droppedNonNeutral: 0,
    droppedInvalid: 0,
    droppedUnvalidatable: 0,
    shadowOverwritten: 0,
    checkerErrors: 0,
  };
  const seen = new Set<string>();
  for (const t of triggers) {
    const key = `${t.name}::${t.injectAt}::${t.testCase.code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const code = t.testCase.code;
    const aliasText = `type ${t.name} = string;`;
    const inserted = `\n${aliasText}\n`;
    const injected =
      code.slice(0, t.injectAt) + inserted + code.slice(t.injectAt);
    const aliasPos = t.injectAt + 1;
    const aliasEnd = aliasPos + aliasText.length;

    const injParsed = parse(injected, t.filename);
    if (!injParsed) {
      out.droppedUnparsable++;
      continue;
    }
    // The injected alias must actually shadow, not land in module scope.
    const injectedVar = variableDeclaredAt(
      injParsed.scopeManager as any,
      t.name,
      aliasPos + 'type '.length,
    );
    if (
      !injectedVar ||
      moduleScope(injParsed.scopeManager as any).variables.includes(injectedVar)
    ) {
      out.droppedShadowNeverLanded++;
      continue;
    }

    const baseMsgs = verifyOf(rule, t.testCase, t.filename);
    const injMsgs = verifyOf(
      rule,
      { ...t.testCase, code: injected },
      t.filename,
    );
    if (!baseMsgs || !injMsgs) {
      out.droppedNonNeutral++;
      continue;
    }
    const mineInj = injMsgs.filter((m: any) => m.ruleId === PREFIX + rule);
    // Neutrality, gated two ways. First: no report may land inside the
    // injected span — a rule reporting on the probe's own scaffolding would be
    // answering about a subject the fixture never contained.
    if (
      mineInj.some((m: any) => {
        const off = offsetOf(injected, m.line, m.column);
        return off >= t.injectAt && off < t.injectAt + inserted.length;
      })
    ) {
      out.droppedReportOnInjection++;
      continue;
    }
    // Second: the same SUBJECTS, compared by injection-adjusted offset.
    // MessageIds are deliberately NOT compared — declining the fix under the
    // shadow is the reaction this guard exists to demand, and the decline
    // swaps the messageId while reporting the same node. A subject appearing
    // or vanishing is what makes the probe unattributable.
    const adjust = (off: number) =>
      off >= t.injectAt ? off + inserted.length : off;
    const baseSubjects = baseMsgs
      .filter((m: any) => m.ruleId === PREFIX + rule)
      .map((m: any) => adjust(offsetOf(code, m.line, m.column)))
      .sort((a: number, b: number) => a - b)
      .join(',');
    const injSubjects = mineInj
      .map((m: any) => offsetOf(injected, m.line, m.column))
      .sort((a: number, b: number) => a - b)
      .join(',');
    if (baseSubjects !== injSubjects) {
      out.droppedNonNeutral++;
      continue;
    }

    // Validity as a DIFFERENTIAL: the injected variant may introduce no
    // diagnostic CODE the fixture does not already carry. An alias duplicating
    // a same-scope declaration is the case this drops.
    const introduced = introducedDiagnostics(code, injected, t.filename);
    if (introduced === null) {
      out.droppedUnvalidatable++;
      continue;
    }
    if (introduced.length) {
      out.droppedInvalid++;
      continue;
    }

    out.probed++;
    // Lazy: under a declining rule no fix survives the shadow, and the
    // before-count's program build would be paid for nothing.
    let before: number | null | undefined;
    for (const m of mineInj) {
      for (const fix of fixesOf(m)) {
        if (before === undefined) {
          before = typeCapturedCount(injected, t.filename, t.name, aliasPos);
        }
        if (before === null) {
          out.checkerErrors++;
          continue;
        }
        const [a, b] = fix.range;
        if (a < aliasEnd && b > aliasPos) {
          out.shadowOverwritten++;
          continue;
        }
        // The alias's position in the patched text, shifted when the fix
        // lands entirely before it; keyed on the fix range rather than a
        // pre-fix offset, which would be stale (see `capturedCount`).
        const patchedAliasPos =
          b <= aliasPos ? aliasPos + fix.text.length - (b - a) : aliasPos;
        const patched = applyFix(injected, fix);
        const after = typeCapturedCount(
          patched,
          t.filename,
          t.name,
          patchedAliasPos,
        );
        if (after === null) {
          out.checkerErrors++;
          continue;
        }
        if (after > before) {
          out.captures.push({
            name: t.name,
            detail:
              `${before} -> ${after} type references to '${t.name}' ` +
              `resolve to the injected inner alias`,
            origin: `src/tests/${t.testCase.origin} as ${t.filename}`,
            patched,
          });
        }
      }
    }
  }
  return out;
};

type WrapCounters = {
  /** Fixtures the rule reports on flat; only those can move the enclosure count. */
  reporting: number;
  wrappable: number;
  droppedByExportStrip: number;
  droppedByWrap: number;
  droppedReportOnWrapper: number;
  droppedInvalid: number;
  droppedUnvalidatable: number;
  neutral: number;
  /** Reports on neutral wrapped variants that still anchor inside an import. */
  importAnchored: number;
};

type NestedVariant = WrapCounters & {
  reach: Reach;
  wrapperReach: Reach;
  value: ValueProbe;
};

const importRangesOf = (ast: any) => {
  const out: number[][] = [];
  walkAst(ast, (n) => {
    if (n.type === 'ImportDeclaration') out.push(n.range);
  });
  return out;
};

const runNestedVariant = (
  rule: string,
  variant: WrapVariant,
  cases: FixtureCase[],
): NestedVariant => {
  const out: NestedVariant = {
    reporting: 0,
    wrappable: 0,
    droppedByExportStrip: 0,
    droppedByWrap: 0,
    droppedReportOnWrapper: 0,
    droppedInvalid: 0,
    droppedUnvalidatable: 0,
    neutral: 0,
    importAnchored: 0,
    reach: {
      reported: 0,
      actionable: 0,
      enclosed: 0,
      triggers: [],
      typeSites: 0,
      typeTriggers: [],
    },
    wrapperReach: {
      reported: 0,
      actionable: 0,
      enclosed: 0,
      triggers: [],
      typeSites: 0,
      typeTriggers: [],
    },
    value: newValueProbe(),
  };
  const probes: Array<{ testCase: FixtureCase; filename: string }> = [];

  for (const testCase of cases) {
    const filename = defaultFilenameFor(testCase);
    const baseMsgs = verifyOf(rule, testCase, filename);
    if (!baseMsgs) continue;
    const baseIds = idsOf(baseMsgs, rule);
    if (!baseIds.length) continue;
    out.reporting++;

    const wrap = wrapFixture(testCase.code, filename, variant);
    if (!wrap.ok) continue;
    out.wrappable++;

    const flatCase: FixtureCase = { ...testCase, code: wrap.flat };
    const flatMsgs = verifyOf(rule, flatCase, filename);
    if (!flatMsgs || idsOf(flatMsgs, rule).join('|') !== baseIds.join('|')) {
      out.droppedByExportStrip++;
      continue;
    }

    const wrappedCase: FixtureCase = { ...testCase, code: wrap.wrapped };
    const wrappedMsgs = verifyOf(rule, wrappedCase, filename);
    if (
      !wrappedMsgs ||
      idsOf(wrappedMsgs, rule).join('|') !== baseIds.join('|')
    ) {
      out.droppedByWrap++;
      continue;
    }
    const mine = wrappedMsgs.filter((m: any) => m.ruleId === PREFIX + rule);
    /**
     * A matching messageId multiset is NOT neutrality. On 44 `global-const-style`
     * fixtures it matched exactly while the SUBJECT had swapped: the rule lost
     * its report on the fixture's own const (the wrap took it out of module
     * scope) and gained one renaming `ProbeShell` itself, one in and one out.
     * Both gates, or the control certifies its own contamination (#1998).
     */
    if (
      mine.some((m: any) => {
        const off = offsetOf(wrap.wrapped, m.line, m.column);
        return wrap.scaffolding.some(([a, b]) => off >= a && off < b);
      })
    ) {
      out.droppedReportOnWrapper++;
      continue;
    }

    const introduced = introducedDiagnostics(wrap.flat, wrap.wrapped, filename);
    // `null` is "could not validate", which is not "valid": counted at its own
    // skip so it can never read as zero from downstream.
    if (introduced === null) {
      out.droppedUnvalidatable++;
      continue;
    }
    if (introduced.length) {
      out.droppedInvalid++;
      continue;
    }

    out.neutral++;
    const wrappedParsed = parse(wrap.wrapped, filename);
    if (wrappedParsed) {
      const ranges = importRangesOf(wrappedParsed.ast);
      for (const m of mine) {
        const off = offsetOf(wrap.wrapped, m.line, m.column);
        if (ranges.some(([a, b]) => off >= a && off < b)) out.importAnchored++;
      }
    }
    probes.push({ testCase: wrappedCase, filename });
  }

  out.reach = triggersFor(rule, probes);
  out.wrapperReach = wrapperTriggersFor(rule, probes);
  out.value = mergeValueProbes([
    capturesFor(rule, out.reach.triggers),
    capturesFor(rule, out.wrapperReach.triggers),
  ]);
  return out;
};

const WRAP_VARIANTS: WrapVariant[] = ['arrow', 'class'];

type Nested = {
  byVariant: Record<string, NestedVariant>;
  wrappable: number;
  neutral: number;
  dropped: number;
  enclosed: number;
  importAnchored: number;
  triggers: number;
  value: ValueProbe;
};

const runNested = (rule: string, cases: FixtureCase[]): Nested => {
  const byVariant: Record<string, NestedVariant> = {};
  for (const variant of WRAP_VARIANTS) {
    byVariant[variant] = runNestedVariant(rule, variant, cases);
  }
  const all = Object.values(byVariant);
  const sum = (pick: (v: NestedVariant) => number) =>
    all.reduce((a, v) => a + pick(v), 0);
  return {
    byVariant,
    wrappable: sum((v) => v.wrappable),
    neutral: sum((v) => v.neutral),
    dropped: sum(
      (v) =>
        v.droppedByExportStrip +
        v.droppedByWrap +
        v.droppedReportOnWrapper +
        v.droppedInvalid +
        v.droppedUnvalidatable,
    ),
    enclosed: sum((v) => v.reach.enclosed),
    importAnchored: sum((v) => v.importAnchored),
    triggers: sum(
      (v) => v.reach.triggers.length + v.wrapperReach.triggers.length,
    ),
    value: mergeValueProbes(all.map((v) => v.value)),
  };
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
  /** Fixtures excluded for not being TypeScript, so the reason can say so. */
  nonTypeScript: number;
  reach: Reach;
  /** The flat pass and the nesting perturbation, merged bucket by bucket. */
  value: ValueProbe;
  probed: number;
  captures: Capture[];
  /** Only for a rule the flat pass parks with no enclosure; see `runNested`. */
  nested: Nested | null;
};

const results = new Map<string, RuleResult>();

for (const rule of transformingRules) {
  const declared = corpus.byRule.get(rule) || [];
  /**
   * TypeScript fixtures only. A shadow is a lexical binding injected into a
   * function block, and neither JSON nor Markdown has either, so a case in
   * those languages cannot pose this guard's question. Excluding them by
   * language rather than by parse failure is what keeps the answer honest:
   * several Markdown fixtures happen to be legal TypeScript (a fence is an
   * empty template literal), so leaving them in let them answer a scope
   * question by accident (#1860).
   */
  const cases = declared.filter((testCase) => testCase.language === 'ts');
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
  const flat = capturesFor(rule, reach.triggers);
  /**
   * The nesting perturbation runs for exactly the class it settles: a rule that
   * transforms something but whose every report sits outside any function
   * block. Scoping it that way is what keeps it derived rather than listed — a
   * rule that later falls into the class is perturbed without being named —
   * and holds the cost to the ~21 rules that can learn anything from it.
   */
  const nested =
    reach.actionable > 0 && reach.enclosed === 0
      ? runNested(rule, cases)
      : null;
  const value = mergeValueProbes(nested ? [flat, nested.value] : [flat]);
  results.set(rule, {
    cases: cases.length,
    nonTypeScript: declared.length - cases.length,
    reach,
    value,
    probed: value.probed,
    captures: value.captures,
    nested,
  });
}

/**
 * The type arm runs for every rule the census MEASURES emitting a bare
 * type-position name — no rule-name list decides membership. Sites come from
 * the flat pass (counted with or without an enclosing block), triggers from
 * the enclosed subset, and the qualifying set is asserted below so a second
 * emitter joins consciously rather than silently.
 */
type TypeArm = TypeProbe & { sites: number; enclosed: number };

const typeArmResults = new Map<string, TypeArm>();
for (const rule of transformingRules) {
  const { reach } = results.get(rule)!;
  if (reach.typeSites === 0) continue;
  typeArmResults.set(rule, {
    sites: reach.typeSites,
    enclosed: reach.typeTriggers.length,
    ...typeCapturesFor(rule, reach.typeTriggers),
  });
}
const typeArms = [...typeArmResults.values()];
const typeArmSum = (pick: (a: TypeArm) => number) =>
  typeArms.reduce((n, a) => n + pick(a), 0);

const valueTotals = mergeValueProbes([...results.values()].map((r) => r.value));
const totalProbed = valueTotals.probed;
const totalTriggers = [...results.values()].reduce(
  (a, r) => a + r.reach.triggers.length + (r.nested ? r.nested.triggers : 0),
  0,
);
const rulesProbed = [...results.values()].filter((r) => r.probed > 0).length;
/**
 * Rules whose green row rests on a fixer output actually compared, rather than
 * on an injection that merely landed in front of one. The two counts are
 * asserted EQUAL below: a rule the shadow silences everywhere would otherwise
 * pass this file while nothing of its fixer had been read (#1861).
 */
const rulesExamining = [...results.values()].filter(
  (r) => r.value.examinedFixes > 0,
).length;

/** Every deduped trigger leaves through exactly one of these. */
const valueDropTotal =
  valueTotals.unparsableInjection +
  valueTotals.shadowNeverLanded +
  valueTotals.verifyErrors +
  valueTotals.silentUnderShadow +
  valueTotals.droppedReportOnInjection +
  valueTotals.droppedNonNeutral +
  valueTotals.droppedInvalid +
  valueTotals.droppedUnvalidatable;

const nestedResults = [...results.values()]
  .map((r) => r.nested)
  .filter((n): n is Nested => n !== null);
const nestedVariants = nestedResults.flatMap((n) => Object.values(n.byVariant));
const nestSum = (pick: (n: Nested) => number) =>
  nestedResults.reduce((a, n) => a + pick(n), 0);
const nestedTotals = {
  rules: nestedResults.length,
  /**
   * The denominator every other nesting count is carved out of: a variant can
   * only be wrappable, neutral or dropped if the rule reported on the fixture
   * flat first. Kept at the top level so the population can be floored, since
   * a corpus that stops reporting drains every bucket below at once and each
   * of those reads as a quieter run rather than an empty one.
   */
  reporting: nestedVariants.reduce((a, v) => a + v.reporting, 0),
  neutral: nestSum((n) => n.neutral),
  dropped: nestSum((n) => n.dropped),
  /** Rules the wrap gives a function block at the report site. */
  enclosureGained: nestedResults.filter((n) => n.enclosed > 0).length,
  probedRules: nestedResults.filter((n) => n.value.probed > 0).length,
  droppedByExportStrip: nestedVariants.reduce(
    (a, v) => a + v.droppedByExportStrip,
    0,
  ),
  droppedByWrap: nestedVariants.reduce((a, v) => a + v.droppedByWrap, 0),
  droppedReportOnWrapper: nestedVariants.reduce(
    (a, v) => a + v.droppedReportOnWrapper,
    0,
  ),
  droppedInvalid: nestedVariants.reduce((a, v) => a + v.droppedInvalid, 0),
  droppedUnvalidatable: nestedVariants.reduce(
    (a, v) => a + v.droppedUnvalidatable,
    0,
  ),
};

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
  nonTypeScript:
    'declares only JSON or Markdown fixtures, which have no lexical scope for a shadow to stand in',
  // Held for a rule that measurably produces nothing here. The old wording
  // ("is type-aware, and a bare Linter has no program") was a premise, not a
  // measurement, and a false one: the parser builds an isolated program and all
  // 16 checker-touching rules report over their own fixtures (#1859).
  undrivable:
    'is measurably silent under this harness, so it reports nothing here',
  neverReports: 'never reports on any of its own fixtures',
  noTransform: 'reports on its own fixtures but offers no fix or suggestion',
  /**
   * The four below split a single `noEnclosingBlock` that had covered 21 rules
   * (#1998). "No function block encloses the report" is a fact about the
   * FIXTURES for most of that class — they are simply written flat — and the
   * nesting perturbation separates the two readings by wrapping each fixture and
   * re-asking. 14 of the 21 moved off it: 13 gain a block once nested, and
   * `enforce-mui-rounded-icons` is reached by the wrapper-anchored arm without
   * gaining one. Of the 7 that remain, only `enforce-unique-cursor-headers`
   * still answers with the original reason; the other 6 name a sharper
   * obstruction that the flat pass could not distinguish from it.
   */
  noWrappableBody:
    'reports on no fixture with a wrappable body — each is imports-only, or a top-level form illegal inside a function',
  moduleScopeKeyed:
    'is keyed on module scope, so wrapping its fixture changes its answer and no nested variant is neutral',
  importAnchoredReport:
    'anchors its report on an import, which stays at module level however its fixture is nested, so no shadow can stand',
  noEnclosingBlock:
    'reports outside every function block even once its fixture is nested, so no shadow can stand',
  noModuleBoundReference:
    'emits no new reference to a module-scope-bound name, so no shadow can capture one',
  /**
   * The four below are the injection's own rejections, split apart for the same
   * reason `noEnclosingBlock` was: they are four different measured facts, and
   * `shadowNeverLanded` — the one reason that existed — is FALSE for three of
   * them. The shadow does land; a control rejects what happens next.
   */
  shadowNeverLanded:
    'emits such a reference, but the injected declaration never shadowed it',
  silencedByShadow:
    'stops reporting entirely once a shadow stands in front of it, so no fixer output of its can be read there',
  reportsOnInjection:
    'reports on the injected declaration itself, so every probe of it would be about the scaffolding rather than the fixture',
  /**
   * The remaining injection controls, as one reason because each of their
   * counters is pinned at zero below — a rule reaching here means one of those
   * pins has already failed, and this exists so the reason stays total rather
   * than falling back on a claim the run contradicts.
   */
  shadowControlRejected:
    'emits such a reference, but a neutrality or validity control rejects every injection in front of it',
} as const;

type Reason = typeof REASONS[keyof typeof REASONS];

/**
 * The drop channel accounting for most of a rule's rejected injections, which
 * is the one describing it. Ties resolve to the earliest entry; the order runs
 * from the injection outward, so the earliest obstruction wins a tie rather
 * than a downstream consequence of it.
 */
const INJECTION_DROP_REASONS: Array<[ValueDrop, Reason]> = [
  ['unparsableInjection', REASONS.shadowControlRejected],
  ['shadowNeverLanded', REASONS.shadowNeverLanded],
  ['verifyErrors', REASONS.shadowControlRejected],
  ['silentUnderShadow', REASONS.silencedByShadow],
  ['droppedReportOnInjection', REASONS.reportsOnInjection],
  ['droppedNonNeutral', REASONS.shadowControlRejected],
  ['droppedInvalid', REASONS.shadowControlRejected],
  ['droppedUnvalidatable', REASONS.shadowControlRejected],
];

const injectionDropReasonFor = (value: ValueProbe): Reason => {
  let best = REASONS.shadowControlRejected as Reason;
  let most = -1;
  for (const [channel, reason] of INJECTION_DROP_REASONS) {
    if (value[channel] > most) {
      most = value[channel];
      best = reason;
    }
  }
  return best;
};

/** Only meaningful for a rule with no probe; the branches narrow toward one. */
const unprobedReasonFor = (rule: string): Reason => {
  const { cases, nonTypeScript, reach, nested, value } = results.get(rule)!;
  if (cases === 0) {
    return nonTypeScript > 0 ? REASONS.nonTypeScript : REASONS.noFixtures;
  }
  // Undrivability outranks the report counts: a rule that produces nothing at
  // all here says nothing about itself, so its counts are not evidence.
  if (reach.actionable === 0) {
    if (silentWithoutProgramRuleNames.has(rule)) return REASONS.undrivable;
    return reach.reported === 0 ? REASONS.neverReports : REASONS.noTransform;
  }
  // Flat, nothing encloses the report. The perturbation decides whether that is
  // the rule speaking or its fixtures, and each branch below is a distinct
  // measured obstruction rather than a restatement of the same one.
  if (reach.enclosed === 0 && nested) {
    if (nested.wrappable === 0) return REASONS.noWrappableBody;
    if (nested.neutral === 0) return REASONS.moduleScopeKeyed;
    if (nested.enclosed === 0) {
      return nested.importAnchored > 0
        ? REASONS.importAnchoredReport
        : REASONS.noEnclosingBlock;
    }
    if (nested.triggers === 0) return REASONS.noModuleBoundReference;
    return injectionDropReasonFor(nested.value);
  }
  if (reach.triggers.length === 0) return REASONS.noModuleBoundReference;
  // Triggers existed, so the injection step is the only thing left that can
  // have dropped them — and WHICH of its controls did is the answer, not the
  // one channel that happens to run first.
  return injectionDropReasonFor(value);
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
  /**
   * Their fixtures are Markdown documents and `package.json` bodies. Both rules
   * are probed here for what this guard can ask of them — nothing: a shadow is
   * an inner binding that re-resolves an emitted reference, and neither
   * language has a binding or a function block. Their fixers are exercised by
   * `fixer-convergence` and their messages by `message-render-integrity`.
   */
  'enforce-typescript-markdown-code-blocks': REASONS.nonTypeScript,
  'no-unpinned-dependencies': REASONS.nonTypeScript,

  // Its fixer RELOCATES text rather than emitting any: the memoized expression
  // moves out of the `useMemo` callback to the call's own position, one scope
  // outward. Moving a reference outward can only lose shadows, never acquire
  // one, and the callback declares nothing of its own in the shapes the fixer
  // accepts, so resolution is identical before and after (#1871).
  'no-usememo-for-pass-by-value': REASONS.noModuleBoundReference,

  /**
   * The four classes below were ONE entry, `noEnclosingBlock`, covering all 21
   * rules whose every report sits outside a function block. The nesting
   * perturbation settled what each was really saying (#1998): for 13 of them
   * the flatness belonged to the FIXTURES, which the wrap relocates, and 5 of
   * those then reach a real shadow and left this list entirely —
   * `enforce-mui-rounded-icons`, `enforce-snapshot-state-narrowing`,
   * `prefer-clone-deep`, `prefer-fragment-component` and `prefer-next-dynamic`,
   * each of which declines correctly under one.
   *
   * `enforce-memoize-getters` (#1947) and `require-memoize-jsx-returners`
   * (#1950) are absent for a different reason again: their corpora carry class
   * declarations nested in a function whose members are reported AND decorated,
   * so the flat pass already drives them for real.
   */

  /**
   * Their report anchors on an ImportDeclaration, which the wrap deliberately
   * leaves at module level, so nesting the fixture cannot enclose it.
   *
   * #1998 proposed closing this with a FIXTURE addition — a body for the
   * wrapper-anchored arm to reach. Reading the four fixers settles it instead:
   * none of them can pose this question at any fixture shape, so there is
   * nothing to close. `use-custom-link`, `use-custom-memo` and
   * `use-custom-router` rewrite only the ImportDeclaration and re-emit the
   * EXISTING local name (`localName`, `useRouter as <local>`, `buildImport` over
   * the surviving specifiers), so every use resolves exactly where it did and no
   * new reference exists to capture. `enforce-dynamic-firebase-imports` moves
   * the binding the other way — into a function body as
   * `const { … } = await import(…)` — so after its fix the name is not
   * module-scope-bound at all, which is the precondition for the harm.
   */
  'enforce-dynamic-firebase-imports': REASONS.importAnchoredReport,
  'use-custom-memo': REASONS.importAnchoredReport,
  'use-custom-router': REASONS.importAnchoredReport,

  // Reached this reason from `noWrappableBody` once #2272 gave it fixtures that
  // carry a body, which is the addition the block above predicted would "add
  // reach but not a question" — and does: the report still anchors on the
  // ImportDeclaration, so nesting cannot enclose it.
  'use-custom-link': REASONS.importAnchoredReport,

  // Keyed on module scope by design, so the wrap is not neutral for it at all:
  // every one of its wrapped variants is dropped by a neutrality gate, and a
  // finding taken from one would be about the probe rather than the rule.
  'global-const-style': REASONS.moduleScopeKeyed,
  'prefer-block-comments-for-declarations': REASONS.moduleScopeKeyed,

  // Genuinely anchor-free: `reportMissingHeader` reports at `line 1, column 0`
  // and the duplicate/split arms report on the file's leading comments, none of
  // which any wrapper can enclose. This is the one rule of the 21 for which the
  // original reason survives the perturbation unchanged.
  'enforce-unique-cursor-headers': REASONS.noEnclosingBlock,

  /**
   * The one the injection's own controls reject. It has a landing shadow and
   * nothing else, which is the row a `probed` total on its own scores green —
   * the injection lands, and no fixer output is read behind it (#2247).
   *
   * `enforce-centralized-mock-firestore` LEFT this class, and the departure was
   * measured before it was accepted: holding the widened rule fixed and
   * restoring only its pre-#2307 fixtures returns the count to 28, and the
   * fixtures alone carry it to 29. The corpus moved it, not the rule.
   * `reportsOnInjection` was always a fact about that corpus rather than about
   * the rule — the rule had exactly ONE trigger, and it named `mockFirestore`
   * inside `async function setupTests()`, so the injected
   * `const mockFirestore = …` at offset 45 stood AHEAD of the fixture's own
   * `const { mockFirestore: … } = await import(…)` at offset 55. This rule
   * reports once per file on the first subject it collects, so the shadow
   * standing first took the single report onto the scaffolding. #2307 adds a
   * trigger the controls accept, and the rule is driven by the arm below
   * instead — a stronger gate than the entry it replaces.
   *
   * `enforce-timestamp-now` is silenced by it. All 9 of its triggers name
   * `Timestamp`, and the rule keys on `Timestamp` resolving to the
   * `firebase-admin/firestore` import; a local `const Timestamp` makes it report
   * nothing at all, so its fixer never runs and there is no emitted reference to
   * resolve. A fixer that does not run cannot demonstrate anything about where
   * what it emits resolves.
   */
  'enforce-timestamp-now': REASONS.silencedByShadow,

  // Nested, their reports DO land in a function block, and the fix still emits
  // no reference for a shadow to capture — the same healthy answer as the
  // majority below, now measured rather than masked by a flat fixture.
  'enforce-date-ttime': REASONS.noModuleBoundReference,
  'enforce-firestore-rules-get-access': REASONS.noModuleBoundReference,
  'enforce-m3-sentence-case': REASONS.noModuleBoundReference,
  'jsdoc-above-field': REASONS.noModuleBoundReference,
  'no-unnecessary-destructuring': REASONS.noModuleBoundReference,
  'omit-index-html': REASONS.noModuleBoundReference,
  'prefer-fragment-shorthand': REASONS.noModuleBoundReference,
  'prefer-getter-over-parameterless-method': REASONS.noModuleBoundReference,
  'sync-onwrite-name-func': REASONS.noModuleBoundReference,

  // The healthy majority: these fixers reorder, rename in place, delete a
  // wrapper or rewrite an import specifier, and emit no reference at all.
  'class-methods-read-top-to-bottom': REASONS.noModuleBoundReference,
  // `consistent-callback-naming` is absent from this class deliberately
  // (#1948). Its rename emits the new name at every reference, so the reason
  // held only while no fixture paired a module-scope `handle*` declaration with
  // a reference inside the function body enclosing the report — the one place
  // this guard can stand a shadow. Its corpus carries a recursive function that
  // does, and the probe below drives the rule for real.
  //
  // `enforce-centralized-mock-firestore` left this class for the same reason
  // (#1967): its fixer injects a module-scope `mockFirestore` import and then
  // renames the call sites to it, so once a fixture destructured the mock under
  // a new name INSIDE a function, the reason stopped holding. It is absent from
  // this map entirely, having since left `reportsOnInjection` too (#2307).
  'enforce-early-destructuring': REASONS.noModuleBoundReference,
  'enforce-empty-object-check': REASONS.noModuleBoundReference,
  'enforce-exported-function-types': REASONS.noModuleBoundReference,
  'enforce-fieldpath-syntax-in-docsetter': REASONS.noModuleBoundReference,
  'enforce-id-capitalization': REASONS.noModuleBoundReference,
  'enforce-object-literal-as-const': REASONS.noModuleBoundReference,
  'enforce-props-argument-name': REASONS.noModuleBoundReference,
  'enforce-props-naming-consistency': REASONS.noModuleBoundReference,
  'enforce-react-type-naming': REASONS.noModuleBoundReference,
  // Its whole fix is the bare attribute `useFlexGap`, which names a JSX prop
  // rather than a binding: no scope resolves it, so no shadow can capture it.
  'enforce-use-flex-gap-on-wrap': REASONS.noModuleBoundReference,
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
  // Like no-usememo-for-pass-by-value above: the fixer relocates the memoized
  // expression out of the `useMemo` callback, one scope outward, emitting no
  // reference of its own. Its fixtures include reports inside function blocks
  // (the #1591/#1877 comment-carriage cases live in hook bodies), so the
  // enclosing-block reason does not describe it.
  'no-useless-usememo-primitives': REASONS.noModuleBoundReference,
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

/**
 * Probed rules the shadow never puts a fixer output in front of, because every
 * report of theirs arrives fix-less once it stands there. Derived from the run
 * and pinned, so a rule joining or leaving is a conscious edit.
 */
const DECLINE_ONLY_RULES = [
  'consistent-callback-naming',
  'enforce-assert-safe-object-key',
  'enforce-memoize-async',
  'enforce-memoize-getters',
  'enforce-microdiff',
  'enforce-safe-stringify',
  'enforce-snapshot-state-narrowing',
  'prefer-clone-deep',
  'prefer-fragment-component',
  'prefer-next-dynamic',
  'prefer-use-deep-compare-memo',
  'prefer-usecallback-over-usememo-for-functions',
  'require-image-optimized',
  'require-memoize-jsx-returners',
];

const declineOnlyRules = transformingRules.filter((rule) => {
  const { value } = results.get(rule)!;
  return value.probed > 0 && value.examinedFixes === 0;
});

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
    `  value arm: ${totalTriggers} triggers = ${valueTotals.duplicates} ` +
      `duplicate + ${valueTotals.considered} considered; considered = ` +
      `${valueTotals.probed} probed + ${valueDropTotal} dropped ` +
      `(unparsable-injection ${valueTotals.unparsableInjection}, ` +
      `never-landed ${valueTotals.shadowNeverLanded}, verify-errors ` +
      `${valueTotals.verifyErrors}, silent-under-shadow ` +
      `${valueTotals.silentUnderShadow}, on-injection ` +
      `${valueTotals.droppedReportOnInjection}, non-neutral ` +
      `${valueTotals.droppedNonNeutral}, invalid ` +
      `${valueTotals.droppedInvalid}, unvalidatable ` +
      `${valueTotals.droppedUnvalidatable}); probed = ` +
      `${valueTotals.fixingUnderShadow} fixing + ` +
      `${valueTotals.declinedUnderShadow} declining; ` +
      `${valueTotals.examinedFixes} fixes examined, ` +
      `${valueTotals.unparsablePatch} unparsable patches, ` +
      `${valueTotals.rescuedByAlternateShadow} rescued by the alternate ` +
      `shadow type; ${rulesExamining} of ${rulesProbed} probed rules examine ` +
      `a fix`,
    `  corpus: ${corpus.totalCases} cases from ${corpus.suitesUsed} suites, ` +
      `${corpus.filesLoaded} files loaded, ${corpus.failures.length} failed`,
    `  nesting perturbation: ${nestedTotals.rules} rules wrapped, ` +
      `${nestedTotals.enclosureGained} gain an enclosing block, ` +
      `${nestedTotals.probedRules} reach a shadow; ` +
      `${nestedTotals.neutral} variants neutral, ${nestedTotals.dropped} ` +
      `dropped (strip ${nestedTotals.droppedByExportStrip}, wrap ` +
      `${nestedTotals.droppedByWrap}, on-wrapper ` +
      `${nestedTotals.droppedReportOnWrapper}, invalid ` +
      `${nestedTotals.droppedInvalid}, unvalidatable ` +
      `${nestedTotals.droppedUnvalidatable}), ${validationErrors} ` +
      `validation errors`,
    `  type arm: ${typeArmResults.size} emitter(s) measured ` +
      `(${[...typeArmResults.keys()].join(', ')}); ` +
      `${typeArmSum((a) => a.sites)} emitted type-name sites, ` +
      `${typeArmSum((a) => a.enclosed)} enclosed, ` +
      `${typeArmSum((a) => a.probed)} probed; skips: unparsable ` +
      `${typeArmSum((a) => a.droppedUnparsable)}, never-landed ` +
      `${typeArmSum((a) => a.droppedShadowNeverLanded)}, on-injection ` +
      `${typeArmSum((a) => a.droppedReportOnInjection)}, non-neutral ` +
      `${typeArmSum((a) => a.droppedNonNeutral)}, invalid ` +
      `${typeArmSum((a) => a.droppedInvalid)}, unvalidatable ` +
      `${typeArmSum((a) => a.droppedUnvalidatable)}, overwritten ` +
      `${typeArmSum((a) => a.shadowOverwritten)}, checker-errors ` +
      `${typeArmSum((a) => a.checkerErrors)}`,
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
    expect(transformingRules.length).toBeGreaterThan(80); // measured 91
    // Exact, not a floor: every unprobed rule is named below with the reason
    // the run produced for it, so slack here would only hide a rule going dark.
    expect(rulesProbed).toBe(
      transformingRules.length - Object.keys(UNPROBED_RULES).length,
    );
    expect(totalProbed).toBeGreaterThanOrEqual(1300); // measured 1,456
    expect(corpus.failures).toEqual([]);
  });

  /**
   * What the injections actually did, as an accounting rather than a total.
   *
   * `totalProbed` counts SHADOWS STOOD, which is not work done: 1,302 of the
   * 1,456 end with the rule declining every fix, so a floor on it certifies
   * mostly that injections landed. `examinedFixes` is the count of fixer
   * outputs read back and resolved, and it is an order of magnitude smaller.
   * Both matter and neither substitutes for the other — a decline IS the
   * reaction this guard demands, so a corpus of declines is a real answer, but
   * it is not evidence that the resolver was ever exercised.
   *
   * The three identities are what make every counter load-bearing. A drop
   * channel nobody sums is a probe that vanishes indistinguishably from a
   * fixer that declined, which is the reading a bare total permits (#1861).
   */
  it('accounts for every emitted reference the value arm was handed', () => {
    // Dedup versus drops: the two ways a trigger can fail to become a probe,
    // and the pair a single "triggers minus probed" gap conflates.
    expect(valueTotals.duplicates + valueTotals.considered).toBe(totalTriggers);
    expect(valueTotals.probed + valueDropTotal).toBe(valueTotals.considered);
    expect(
      valueTotals.fixingUnderShadow + valueTotals.declinedUnderShadow,
    ).toBe(valueTotals.probed);

    expect(totalTriggers).toBeGreaterThanOrEqual(1520); // measured 1,582
    expect(valueTotals.considered).toBeGreaterThanOrEqual(1470); // measured 1,534
    expect(valueTotals.duplicates).toBeGreaterThanOrEqual(40); // measured 48

    // The floor that measures fixer outputs examined rather than injections
    // landed. It is the number the per-rule assertions below actually rest on.
    expect(valueTotals.examinedFixes).toBeGreaterThanOrEqual(160); // measured 167
    expect(valueTotals.fixingUnderShadow).toBeGreaterThanOrEqual(146); // measured 153

    // Channels measured at zero, pinned there. A patch that stops parsing or an
    // injection that stops verifying abandons the capture check silently, and
    // every consumer here filters by `ruleId`, so the abandonment reads exactly
    // like a fixer that emitted nothing (#1984).
    expect(valueTotals.unparsableInjection).toBe(0);
    expect(valueTotals.verifyErrors).toBe(0);
    expect(valueTotals.unparsablePatch).toBe(0);
    expect(valueTotals.droppedUnvalidatable).toBe(0);
    // Zero only BECAUSE the shadow spelling is chosen per fixture: the
    // conservative spelling is rejected 84 times and the permissive one carries
    // every one of them. The rescue floor beside it is what keeps this zero
    // from reading as "the differential never fires".
    expect(valueTotals.droppedInvalid).toBe(0);
    expect(valueTotals.rescuedByAlternateShadow).toBeGreaterThanOrEqual(80); // measured 84

    // Channels measured firing. A control that never drops anything is
    // indistinguishable from an absent one.
    expect(valueTotals.shadowNeverLanded).toBeGreaterThanOrEqual(66); // measured 69
    expect(valueTotals.silentUnderShadow).toBeGreaterThanOrEqual(1); // measured 9
    expect(valueTotals.droppedReportOnInjection).toBeGreaterThanOrEqual(1); // measured 1
  });

  /**
   * The probed rules whose every answer is a DECLINE, named rather than
   * counted. Declining under a shadow satisfies this guard, so these rows are
   * real answers — but no fixer output of theirs is ever read back, so a rule
   * sliding into this set is a rule whose row stops resting on a resolution.
   * Named apart from `UNPROBED_RULES` because the two facts are different:
   * those rules are never asked, these answer without emitting.
   */
  it('names the probed rules that answer only by declining', () => {
    expect(declineOnlyRules).toEqual(DECLINE_ONLY_RULES);
    expect(rulesExamining).toBe(rulesProbed - DECLINE_ONLY_RULES.length);
    expect(rulesExamining).toBeGreaterThanOrEqual(13); // measured 14
  });

  /**
   * The nesting perturbation's own non-vacuity. Its whole contribution is
   * REACH — it finds no defect today — so nothing downstream would notice it
   * degrading to zero wrapped fixtures, and the guard would go on passing while
   * asking 20 rules nothing at all.
   *
   * A rule leaves the wrapped set the moment one of its FLAT fixtures fixes
   * inside a function block, because the flat probe then reaches the shadow
   * on its own: `prefer-clone-deep` moved across when its `return {...} as
   * const` fixture gained a fix (#2032). Its 121 wrapped variants left with it
   * (1023 -> 902 neutral, 5 -> 4 rules reaching a shadow), which is why the
   * floors here track the population rather than pin a rule into it.
   *
   * Tracking it DOWN is the only direction that needs saying twice, because the
   * corpus otherwise only grows and a floor written under one measurement
   * drifts under every later one. These sat 20-33% below their own values —
   * `neutral` 900 against 1,118, `droppedByWrap` 190 against 273,
   * `droppedReportOnWrapper` 70 against 103, `droppedByExportStrip` 16 against
   * 24 — far enough that none of them can detect the collapse it exists to
   * detect. Each is re-cut just under the value measured, the spacing the type
   * arm's floors already carry (#2247).
   *
   * `enforce-firestore-rules-get-access` moved across the same way (#2052): its
   * wrap-at-print-width fixtures pin the indentation the fix emits, so several
   * of them place the rewritten literal inside a `function buildRules() { ... }`
   * and the flat probe reaches an enclosure without help. Leaving the wrapped
   * set is what a rule gaining flat reach is SUPPOSED to look like — the
   * perturbation exists only for rules the flat pass cannot reach — so the
   * floors below track the population down rather than pinning a rule into it.
   *
   * `prefer-next-dynamic` moved across for the same reason (#2100): its fix
   * derives the emitted call's indentation from the line the replaced node
   * starts on, so the fixtures pinning that landing depth declare the
   * declarator inside a `function Wrapper() { ... }` and an arrow body. Flat
   * reach went 12 actionable / 0 enclosed to 17 / 3, which empties the wrap's
   * contribution for it. Distinguishing the two ways out of the set matters:
   * a rule also leaves when `reach.actionable` falls to 0, and that one is a
   * regression wearing the same drop in these counts. This move was confirmed
   * to be the first kind — enclosed rose off 0 while actionable rose too.
   */
  it('the nesting perturbation reaches a shadow it could not reach flat', () => {
    expect(nestedTotals.rules).toBeGreaterThanOrEqual(18); // measured 18
    /**
     * The population every count below is carved out of, ASSERTED rather than
     * merely accumulated. `wrappable`, `neutral` and each dropped bucket are
     * subsets of the fixtures the rule reports on flat, so a corpus that stops
     * reporting drains all of them together and every one of those floors reads
     * as a quieter run rather than an empty one. Floored and then CLOSED
     * against the buckets it contains, which is what keeps the containment from
     * drifting silently: a variant leaving `reporting` without leaving a bucket
     * would be counted twice.
     */
    expect(nestedTotals.reporting).toBeGreaterThanOrEqual(1700); // measured 1,786
    expect(nestedTotals.reporting).toBeGreaterThanOrEqual(
      nestedTotals.neutral + nestedTotals.dropped,
    );
    expect(nestedTotals.enclosureGained).toBeGreaterThanOrEqual(10); // measured 10
    expect(nestedTotals.probedRules).toBeGreaterThanOrEqual(3); // measured 3
    expect(nestedTotals.neutral).toBeGreaterThanOrEqual(1070); // measured 1,122
    // An unvalidatable variant is not a valid one. Both zeros are trustworthy
    // only because the counter sits at its own skip rather than downstream.
    expect(validationErrors).toBe(0);
    expect(nestedTotals.droppedUnvalidatable).toBe(0);
    // Every gate must be observed removing something: a control that never
    // drops anything is indistinguishable from an absent one.
    expect(nestedTotals.droppedByExportStrip).toBeGreaterThanOrEqual(23); // measured 24
    expect(nestedTotals.droppedByWrap).toBeGreaterThanOrEqual(262); // measured 273
    expect(nestedTotals.droppedReportOnWrapper).toBeGreaterThanOrEqual(98); // measured 103
    expect(nestedTotals.droppedInvalid).toBeGreaterThanOrEqual(6); // measured 6
  });

  /**
   * Why BOTH wrapper spellings ship, on the rule that proves it.
   *
   * Under the arrow wrapper `global-const-style` simply falls silent — its
   * subject leaves module scope — and the messageId multiset gate catches that.
   * Under the class wrapper the multiset MATCHES, because the report it loses on
   * the fixture's own const is replaced one-for-one by a report renaming
   * `ProbeShell` itself: same shape, different subject. Only the second gate
   * sees it, and only this variant makes the second gate fire. Ship one variant
   * and that gate becomes decoration (#1998).
   */
  it('keeps both neutrality gates load-bearing, not just the multiset one', () => {
    const { byVariant } = results.get('global-const-style')!.nested!;
    expect(byVariant.arrow.droppedByWrap).toBeGreaterThanOrEqual(65); // measured 122
    expect(byVariant.arrow.droppedReportOnWrapper).toBe(0);
    expect(byVariant.class.droppedReportOnWrapper).toBeGreaterThanOrEqual(40); // measured 69
    // Neither variant may leave it a usable fixture; a single survivor here
    // would be one the probe had silently swapped the subject of.
    expect(byVariant.arrow.neutral).toBe(0);
    expect(byVariant.class.neutral).toBe(0);
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

describe('fixers must not print a type name an inner type alias captures', () => {
  /**
   * Non-vacuity for an arm whose expected answer is ZERO. The rule-side remedy
   * for #2229 declines the fix wherever a printed name no longer denotes the
   * symbol it was printed for, so no capture is exactly what a healthy run
   * finds — and exactly what a broken arm would report too. Three things keep
   * the zero honest: the qualifying set is asserted (an emitter cannot fall
   * out of the census unnoticed), the floors sit just under the measured
   * counts, and every skip counter is read here rather than only printed.
   */
  it('probes the measured emitter set, every skip accounted', () => {
    expect([...typeArmResults.keys()].sort()).toEqual([
      'prefer-map-over-conditional-dispatch',
    ]);
    expect(typeArmSum((a) => a.sites)).toBeGreaterThanOrEqual(140); // measured 146
    expect(typeArmSum((a) => a.enclosed)).toBeGreaterThanOrEqual(138); // measured 143
    expect(typeArmSum((a) => a.probed)).toBeGreaterThanOrEqual(132); // measured 137
    expect(typeArmSum((a) => a.droppedUnparsable)).toBe(0);
    expect(typeArmSum((a) => a.droppedShadowNeverLanded)).toBe(0);
    expect(typeArmSum((a) => a.droppedReportOnInjection)).toBe(0);
    expect(typeArmSum((a) => a.droppedNonNeutral)).toBe(0);
    // Exactly one variant is rejected by the validity differential, and the
    // reason is a property of the alias RHS the arm deliberately injects:
    // `type Sized = string` is compatible-but-wider only for a string-like
    // union, and the `Sized` fixture's module-level alias is an OBJECT type the
    // body then reads `.size` from, so the injection introduces TS2339. Pinned
    // exactly, not as an upper bound, so corpus drift is a conscious edit.
    expect(typeArmSum((a) => a.droppedInvalid)).toBe(1);
    expect(typeArmSum((a) => a.droppedUnvalidatable)).toBe(0);
    expect(typeArmSum((a) => a.shadowOverwritten)).toBe(0);
    expect(typeArmSum((a) => a.checkerErrors)).toBe(0);
  });

  it.each([...typeArmResults.keys()])('%s', (rule) => {
    // A capture means the fix must decline instead — the reaction #2229's
    // rule-side remedy implements, and the one this arm holds in place.
    expect(reportOf(typeArmResults.get(rule)!.captures)).toBe('');
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

/**
 * A fixer whose report SET changes when the shadow lands, with no report on the
 * injected span itself: it reports on `render(…)` as the positive control does,
 * and gains a second, fix-less report on the enclosing function's own name once
 * that function's body holds more than one statement.
 *
 * This is the half of neutrality the corpus does not exercise. The
 * on-the-injection gate fires on `enforce-centralized-mock-firestore`, and the
 * subject gate fires 9 times on `enforce-timestamp-now` — but always in its
 * degenerate form, every subject vanishing at once. A partial change is the
 * shape a rule can hide a swap in (one report in, one out, matching counts), so
 * the gate is planted rather than left present and never firing.
 */
linter.defineRule(PREFIX + 'control-shadow-subject-shift', {
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
            fixer.replaceText(node.callee, 'helper'),
          ],
        });
      },
      FunctionDeclaration(node: any) {
        if (node.body.body.length < 2 || !node.id) return;
        context.report({ node: node.id, messageId: 'm' });
      },
    };
  },
} as never);

/**
 * The other half: a fixer that reports ON the injected declaration. The corpus
 * fires this gate once — `enforce-centralized-mock-firestore` reports on any
 * `mockFirestore` binding, including the probe's — and a gate whose only
 * evidence is one corpus entry stops being evidence the day that entry moves.
 */
linter.defineRule(PREFIX + 'control-shadow-reports-on-injection', {
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
            fixer.replaceText(node.callee, 'helper'),
          ],
        });
      },
      FunctionDeclaration(node: any) {
        if (node.body.body.length < 2) return;
        context.report({ node: node.body.body[0], messageId: 'm' });
      },
    };
  },
} as never);

/**
 * The same two controls again, but written FLAT — deliberately with no function
 * anywhere, so the report site has nothing enclosing it and the report-anchored
 * arm cannot reach it at all. Running them through `wrapFixture` is what proves
 * the perturbation MANUFACTURES the reach it claims to, rather than the 5 newly
 * probed rules having been reachable all along by some other route.
 */
const FLAT_CONTROL_CASE: FixtureCase = {
  code: "import { x } from './x';\nconst out = render(x);\n",
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted nesting control',
  bucket: 'valid',
};

/**
 * Type-namespace controls, same polarity pair as the value ones — and load
 * bearing for the same reason, doubly so here: with the #2229 decline shipped,
 * every real probe of the type arm answers zero, so without a planted defect
 * the arm would read identically whether it detects captures or nothing at
 * all. The positive control emits a checker-style bare type name at the
 * report site inside the function — the #2229 shape — and MUST be caught. The
 * negative emits the SAME reference to the SAME module-bound type name, but
 * at module level where the injected alias cannot reach it, so a detector
 * that flagged every emitted type name would fail it.
 */
const typeControlRule = (emitAtModuleLevel: boolean) => ({
  meta: {
    type: 'problem' as const,
    fixable: 'code' as const,
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      CallExpression(node: any) {
        if (node.callee.name !== 'compute') return;
        const program = context.getSourceCode().ast;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) =>
            emitAtModuleLevel
              ? fixer.insertTextAfter(
                  program.body[program.body.length - 1],
                  '\nexport type ProbeAlias = Status;\n',
                )
              : fixer.replaceText(node, '(compute() as Status)'),
        });
      },
    };
  },
});

const TYPE_SHADOW_CONTROLS = [
  {
    name: 'control-type-shadow-captured',
    expectCaptures: 1,
    rule: typeControlRule(false),
  },
  {
    name: 'control-type-shadow-uncaptured',
    expectCaptures: 0,
    rule: typeControlRule(true),
  },
];

for (const control of TYPE_SHADOW_CONTROLS) {
  linter.defineRule(PREFIX + control.name, control.rule as never);
}

const TYPE_CONTROL_CASE: FixtureCase = {
  code: "type Status = 'idle' | 'busy';\nexport function run() {\n  return compute();\n}\n",
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted type control',
  bucket: 'valid',
};

/**
 * A fixer that RESPELLS a heritage reference as a type reference — the
 * `interface A extends B` -> `type A = B & …` shape `prefer-type-over-interface`
 * ships, reduced to its essentials. The name it prints was already in a type
 * position at the same site, so no shadow can newly capture it and the census
 * must count zero sites. Counting `TSTypeReference` alone reads the respelling
 * as an emission and enrolls the rule; this control is what makes the heritage
 * arm of `typeNameCounts` load-bearing rather than merely present.
 */
linter.defineRule(PREFIX + 'control-type-heritage-respell', {
  meta: {
    type: 'problem' as const,
    fixable: 'code' as const,
    schema: [],
    messages: { m: 'x' },
  },
  create(context: any) {
    return {
      TSInterfaceDeclaration(node: any) {
        context.report({
          node,
          messageId: 'm',
          fix: (fixer: any) =>
            fixer.replaceText(node, 'type A = B & { extra: number };'),
        });
      },
    };
  },
} as never);

const HERITAGE_CONTROL_CASE: FixtureCase = {
  code:
    'type B = { id: string };\nexport function run() {\n' +
    '  interface A extends B { extra: number }\n' +
    '  return null as unknown as A;\n}\n',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted heritage-respell control',
  bucket: 'valid',
};

const nestedControlOutcome = (name: string, variant: WrapVariant) => {
  const flat = triggersFor(name, [
    { testCase: FLAT_CONTROL_CASE, filename: 'file.ts' },
  ]);
  const wrap = wrapFixture(FLAT_CONTROL_CASE.code, 'file.ts', variant);
  if (!wrap.ok) throw new Error(`control unwrappable: ${wrap.reason}`);
  const wrapped = triggersFor(name, [
    {
      testCase: { ...FLAT_CONTROL_CASE, code: wrap.wrapped },
      filename: 'file.ts',
    },
  ]);
  return { flat, wrapped, ...capturesFor(name, wrapped.triggers) };
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
      const probe = capturesFor(name, reach.triggers);
      expect(probe.probed).toBeGreaterThan(0);
      // A probe that stood a shadow but read no fixer output back would return
      // zero captures for the positive control too, so the polarity below is
      // only a verdict once an output has been resolved.
      expect(probe.examinedFixes).toBeGreaterThan(0);
      expect(probe.captures.length).toBe(expectCaptures);
    },
  );

  /**
   * Both neutrality gates, each on a planted fixer that trips it and not the
   * other. A gate the corpus never fires is indistinguishable from an absent
   * one, and the subject gate's only corpus firings are degenerate — every
   * subject vanishing at once — so the partial change it exists for is planted.
   */
  it.each([
    ['control-shadow-subject-shift', 'droppedNonNeutral'],
    ['control-shadow-reports-on-injection', 'droppedReportOnInjection'],
  ] as const)('control %s is dropped as %s', (name, channel) => {
    const reach = triggersFor(name, [
      { testCase: CONTROL_CASE, filename: 'file.ts' },
    ]);
    // Same emitted reference as the positive control, so a zero below is the
    // gate speaking rather than a fixer that never reached the injection.
    expect(reach.triggers.length).toBeGreaterThan(0);
    const probe = capturesFor(name, reach.triggers);
    expect(probe.considered).toBe(reach.triggers.length);
    expect(probe[channel]).toBe(probe.considered);
    expect(probe.probed).toBe(0);
    expect(probe.examinedFixes).toBe(0);
    // Each gate must be the one that fired: the report set changing and a
    // report landing on the scaffolding are different findings, and a probe
    // that answered both would attribute neither.
    const other =
      channel === 'droppedNonNeutral'
        ? 'droppedReportOnInjection'
        : 'droppedNonNeutral';
    expect(probe[other]).toBe(0);
  });

  it.each(
    SHADOW_CONTROLS.flatMap((c) =>
      (['arrow', 'class'] as WrapVariant[]).map(
        (v) => [c.name, v, c.expectCaptures] as const,
      ),
    ),
  )(
    'control %s under the %s wrapper: flat has no enclosure, wrapped yields %s capture(s)',
    (name, variant, expectCaptures) => {
      const o = nestedControlOutcome(name, variant);
      // Flat, the site is at module level and there is nothing to probe.
      expect(o.flat.enclosed).toBe(0);
      expect(o.flat.triggers.length).toBe(0);
      // Wrapped, the same fixture reaches an injection...
      expect(o.wrapped.enclosed).toBeGreaterThan(0);
      expect(o.probed).toBeGreaterThan(0);
      // ...and the detector still tells the two polarities apart there, so the
      // reach the perturbation adds is reach that can still report a defect.
      expect(o.captures.length).toBe(expectCaptures);
    },
  );

  /**
   * The whole nested pipeline, end to end, on a rule with a PLANTED defect.
   *
   * The test above drives `triggersFor`/`capturesFor` directly, which leaves
   * `runNested` itself — the two neutrality gates, the checker differential, the
   * report- and wrapper-anchored arms and their aggregation — exercised only
   * over the shipped rules, every one of which is clean. A `runNested` that
   * returned no captures at all would therefore pass every assertion in this
   * file. This is the only test that would notice, and it is the one that makes
   * the merge into `results.captures` load-bearing rather than decorative.
   */
  it.each(SHADOW_CONTROLS.map((c) => [c.name, c.expectCaptures] as const))(
    'the nested pipeline carries control %s through to %s capture(s)',
    (name, expectCaptures) => {
      const nested = runNested(name, [FLAT_CONTROL_CASE]);
      // Both wrapper variants must survive both gates, or the zero below would
      // mean "nothing was asked" rather than "nothing was found".
      expect(nested.wrappable).toBe(2);
      expect(nested.neutral).toBe(2);
      expect(nested.dropped).toBe(0);
      expect(nested.enclosed).toBeGreaterThan(0);
      expect(nested.value.probed).toBeGreaterThan(0);
      expect(nested.value.examinedFixes).toBeGreaterThan(0);
      expect(nested.value.captures.length).toBeGreaterThanOrEqual(
        expectCaptures,
      );
      if (expectCaptures === 0) expect(nested.value.captures).toEqual([]);
    },
  );

  it.each(TYPE_SHADOW_CONTROLS.map((c) => [c.name, c.expectCaptures] as const))(
    'type control %s yields %s type capture(s)',
    (name, expectCaptures) => {
      const reach = triggersFor(name, [
        { testCase: TYPE_CONTROL_CASE, filename: 'file.ts' },
      ]);
      // The emission is type-namespace only, and the census must file it there:
      // a VALUE trigger here would mean `isTypePosition` stopped holding the
      // boundary that keeps the `const` shadow from reading type references —
      // the false-capture failure the namespaces were separated to prevent.
      expect(reach.triggers.length).toBe(0);
      expect(reach.typeSites).toBeGreaterThan(0);
      expect(reach.typeTriggers.length).toBeGreaterThan(0);
      const arm = typeCapturesFor(name, reach.typeTriggers);
      // Every gate must pass, or the polarity below would mean "not asked"
      // rather than "answered".
      expect(arm.probed).toBeGreaterThan(0);
      expect(
        arm.droppedUnparsable +
          arm.droppedShadowNeverLanded +
          arm.droppedReportOnInjection +
          arm.droppedNonNeutral +
          arm.droppedInvalid +
          arm.droppedUnvalidatable +
          arm.shadowOverwritten +
          arm.checkerErrors,
      ).toBe(0);
      expect(arm.captures.length).toBe(expectCaptures);
    },
  );

  // The complementary direction: the VALUE control emits only value
  // references, so the type census must stay silent on it. The two arms
  // answer disjoint questions, and each control set proves one boundary.
  it('the value control contributes no type sites', () => {
    const reach = triggersFor('control-shadow-captured', [
      { testCase: CONTROL_CASE, filename: 'file.ts' },
    ]);
    expect(reach.triggers.length).toBeGreaterThan(0);
    expect(reach.typeSites).toBe(0);
  });

  // Respelling a reference that was ALREADY in a type position is not an
  // emission, so the census must stay at zero — the boundary that keeps a rule
  // copying verbatim source text out of an arm meant for printed names.
  it('a heritage-to-type-reference respelling contributes no type sites', () => {
    const reach = triggersFor('control-type-heritage-respell', [
      { testCase: HERITAGE_CONTROL_CASE, filename: 'file.ts' },
    ]);
    // The rewrite must actually have happened, or zero would mean "not asked".
    expect(reach.actionable).toBeGreaterThan(0);
    expect(reach.typeSites).toBe(0);
  });

  /**
   * The corpus must carry the configuration each case was written for; a
   * bare-snippet corpus cannot reach an option-gated or path-gated fixer.
   */
  it('carries options and filenames from the fixtures themselves', () => {
    const cases = [...corpus.byRule.values()].flat();
    expect(cases.filter((c) => c.options).length).toBeGreaterThanOrEqual(702); // measured 784
    expect(cases.filter((c) => c.filename).length).toBeGreaterThanOrEqual(3690); // measured 4,131
    expect(
      (corpus.byRule.get('no-usememo-for-pass-by-value') || []).length,
    ).toBeGreaterThanOrEqual(198); // measured 220
  });
});
