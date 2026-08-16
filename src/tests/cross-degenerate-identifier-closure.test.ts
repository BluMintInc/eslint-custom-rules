/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CROSS-PAIRED degenerate-identifier closure.
 *
 * `src/tests/degenerate-identifier-closure.test.ts` pairs each rule with
 * `corpus.byRule.get(rule)` — its OWN fixtures. A rule's own suite is by
 * construction the shapes its author anticipated, so the degenerate rename has
 * only ever been applied to inputs the rule already expects. Every other
 * already-cross-paired guard consumes the corpus AS WRITTEN, so a guard that
 * PERTURBS the fixture before linting sits on inputs no cross sweep has ever
 * produced: its cell is empty regardless of oracle.
 *
 * This probe changes ONLY the pairing. Every TypeScript fixture in the corpus
 * is screened under all plugin rules, and each rule that REPORTS on it is then
 * driven through the identical perturbation and the identical oracle. The
 * binding collector, the rename, the parse oracle and the skip accounting are
 * copied VERBATIM from the shipped guard, so a difference in outcome is a
 * difference in PAIRING and nothing else.
 *
 * It carries the shipped guard's FIRST arm only — rename a declared binding,
 * assert the output parses. The second arm (rewrite a string literal's content
 * and diff the names the fixer invents) is a different perturbation with a
 * different oracle, so cross-pairing it is its own exercise and its helpers are
 * deliberately not dragged along here.
 *
 * ## The budget, and what it drops
 *
 * A cross sweep multiplies the own-corpus pairing by however many rules happen
 * to fire on each fixture, so it is capped at THREE fixtures per (fixer, owner)
 * pair. What the cap drops is carried and asserted rather than left implicit —
 * a silent truncation reads as "covered everything" when it did not.
 *
 * The cap costs no PAIR coverage at any value: already at one fixture per pair
 * every distinct (fixer, owner) combination the screen produces is probed, and
 * what a cap drops is only a repeat fixture of a combination already covered.
 * Three is chosen because it costs no wall clock either — screening 20k
 * fixtures under every rule dominates the run, so cap 1 and cap 3 both measure
 * ~320s — while lifting the RULE dimension: 74 rules rewritten at cap 1 against
 * 79 at cap 3, with the same 64 distinct cross fixers and the same nine binding
 * kinds. Raising it further buys sample density inside combinations already
 * covered, which is why the floors below are on reach counters and not on it.
 *
 * ## Cross and own are scored SEPARATELY
 *
 * A single set of counters mixing both would let the own-corpus pairs — which
 * the shipped guard already covers exhaustively — carry a floor that the cross
 * arm never reaches. So the two arms accumulate into their own `Totals`, every
 * floor below is on the CROSS arm, and the own arm is kept only as a control
 * that this harness reproduces the shipped guard's behaviour at all.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as ts from 'typescript';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
  ruleNameByIdentity,
  suggestionEditsOf,
  suggestionRuleNames,
} from '../utils/fixtureCorpus';

/**
 * Inverting the corpus's identity map keeps this guard keyed on the same rule
 * objects the corpus matched suites by, so a rule can never be registered here
 * under a name the corpus resolved differently.
 */
const ruleByName = new Map<string, { meta?: { fixable?: unknown } }>(
  [...ruleNameByIdentity].map(([rule, name]) => [
    name,
    rule as { meta?: { fixable?: unknown } },
  ]),
);

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of ruleByName) {
  linter.defineRule(`b/${name}`, rule as never);
}
const DEGENERATE_NAMES = ['_', '_1', '_2fa', '$'] as const;

const parseErrorCount = (code: string, filename: string) => {
  const kind = filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  return (sourceFile as unknown as { parseDiagnostics: unknown[] })
    .parseDiagnostics.length;
};

/**
 * How a rewrite site must be spelled. A shorthand site cannot simply take the
 * new text: the one token is playing two roles, and replacing it renames both.
 */
type SiteShape = 'plain' | 'property' | 'import' | 'export';

type RenameSite = { start: number; shape: SiteShape };

/**
 * One thing that can be renamed, with every site that must move with it.
 * `kind` is the scope manager's definition type (`Parameter`, `ImportBinding`,
 * `Type`, …) or `Member`, and is carried so the floors below can assert that
 * each SHAPE drove a fixer rather than that some large number of them did.
 */
type Binding = { name: string; kind: string; sites: RenameSite[] };

type Bindings = {
  bindings: Binding[];
  /** Bindings whose sites could not be verified against the source. */
  unrenamable: number;
};

type AnyNode = Record<string, unknown> & {
  type?: string;
  name?: string;
  range?: [number, number];
};

const walk = (node: unknown, visit: (node: AnyNode) => void): void => {
  if (!node || typeof node !== 'object') return;
  const candidate = node as AnyNode;
  if (typeof candidate.type === 'string') visit(candidate);
  for (const key of Object.keys(candidate)) {
    if (key === 'parent') continue;
    const value = candidate[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
};

const startOf = (node: unknown): number | null => {
  const candidate = node as AnyNode | null;
  return candidate && Array.isArray(candidate.range)
    ? candidate.range[0]
    : null;
};

/** The identifier a JSX element name is spelled with, through `A.B.C`. */
const jsxNameIdentifier = (name: unknown): AnyNode | null => {
  let current = name as AnyNode | null;
  while (current && current.type === 'JSXMemberExpression') {
    current = (current as { object?: AnyNode }).object ?? null;
  }
  return current && current.type === 'JSXIdentifier' ? current : null;
};

const MEMBER_OWNERS = new Set([
  'MethodDefinition',
  'PropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSAbstractPropertyDefinition',
  'AccessorProperty',
  'TSPropertySignature',
  'TSMethodSignature',
]);

/**
 * Everything in `code` that can be renamed, with the sites each rename owns.
 *
 * Null when the source does not parse, which the callers count rather than fold
 * into "nothing to rename".
 */
const declaredBindingsOf = (code: string, jsx: boolean): Bindings | null => {
  let parsed;
  try {
    parsed = tsParser.parseForESLint(code, {
      range: true,
      loc: true,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return null;
  }
  const scopeManager = parsed.scopeManager;
  if (!scopeManager) return null;

  const shapeByStart = new Map<number, SiteShape>();
  const closingByOpening = new Map<number, number>();
  const memberSitesByName = new Map<string, Set<number>>();
  const memberDeclaredNames = new Set<string>();

  const addMemberSite = (name: string, start: number) => {
    const sites = memberSitesByName.get(name) ?? new Set<number>();
    sites.add(start);
    memberSitesByName.set(name, sites);
  };

  walk(parsed.ast, (node) => {
    const key = node.key as AnyNode | undefined;
    const local = node.local as AnyNode | undefined;
    if (node.type === 'Property' && node.shorthand === true) {
      const start = startOf(key);
      if (start !== null) shapeByStart.set(start, 'property');
    }
    if (
      (node.type === 'ImportSpecifier' || node.type === 'ExportSpecifier') &&
      startOf(local) !== null
    ) {
      const other = (node.imported ?? node.exported) as AnyNode | undefined;
      if (startOf(other) === startOf(local)) {
        shapeByStart.set(
          startOf(local) as number,
          node.type === 'ImportSpecifier' ? 'import' : 'export',
        );
      }
    }
    if (node.type === 'JSXElement') {
      const opening = jsxNameIdentifier(
        (node.openingElement as { name?: unknown } | undefined)?.name,
      );
      const closing = jsxNameIdentifier(
        (node.closingElement as { name?: unknown } | undefined)?.name,
      );
      const openingStart = startOf(opening);
      const closingStart = startOf(closing);
      if (openingStart !== null && closingStart !== null) {
        closingByOpening.set(openingStart, closingStart);
      }
    }
    // `constructor` is excluded: renaming it turns the constructor into an
    // ordinary method, and a `super()` call in its body then sits outside any
    // constructor — a different program, not a degenerate one.
    if (
      MEMBER_OWNERS.has(node.type as string) &&
      node.computed === false &&
      key?.type === 'Identifier' &&
      typeof key.name === 'string' &&
      key.name !== 'constructor'
    ) {
      memberDeclaredNames.add(key.name);
      addMemberSite(key.name, startOf(key) as number);
    }
    const property = node.property as AnyNode | undefined;
    if (
      node.type === 'MemberExpression' &&
      node.computed === false &&
      property?.type === 'Identifier' &&
      typeof property.name === 'string'
    ) {
      addMemberSite(property.name, startOf(property) as number);
    }
  });

  const bindings: Binding[] = [];
  let unrenamable = 0;

  const siteFor = (name: string, start: number): RenameSite | null =>
    code.slice(start, start + name.length) === name
      ? { start, shape: shapeByStart.get(start) ?? 'plain' }
      : null;

  for (const scope of scopeManager.scopes) {
    // The global scope holds the TypeScript lib declarations, which have no
    // definition in this file and no site to rewrite.
    if (scope.type === 'global') continue;
    for (const variable of scope.variables) {
      if (!variable.defs.length) continue;
      const { name } = variable;
      const starts = new Map<number, RenameSite>();
      let usable = true;
      const add = (node: unknown) => {
        const candidate = node as AnyNode | null;
        if (
          !candidate ||
          (candidate.type !== 'Identifier' &&
            candidate.type !== 'JSXIdentifier')
        ) {
          usable = false;
          return;
        }
        const start = startOf(candidate);
        if (candidate.name !== name || start === null) {
          usable = false;
          return;
        }
        const site = siteFor(name, start);
        if (!site) {
          usable = false;
          return;
        }
        starts.set(start, site);
        const closing = closingByOpening.get(start);
        if (closing === undefined) return;
        const closingSite = siteFor(name, closing);
        if (closingSite) starts.set(closing, closingSite);
      };
      for (const def of variable.defs) add(def.name);
      for (const reference of variable.references) add(reference.identifier);
      if (!usable || !starts.size) {
        unrenamable++;
        continue;
      }
      bindings.push({
        name,
        kind: String(variable.defs[0].type),
        sites: [...starts.values()],
      });
    }
  }

  /**
   * A member is renamed at every property-position occurrence of its name.
   * Scope analysis cannot resolve `this.foo` to a declaration, so the name
   * itself is the only available identity — over-inclusive by design, since a
   * declaration renamed without its uses is the broken input this harness must
   * never hand a fixer.
   */
  for (const name of memberDeclaredNames) {
    const sites = [...(memberSitesByName.get(name) ?? [])]
      .map((start) => siteFor(name, start))
      .filter((site): site is RenameSite => site !== null);
    if (!sites.length) {
      unrenamable++;
      continue;
    }
    bindings.push({ name, kind: 'Member', sites });
  }

  return { bindings, unrenamable };
};

const renameBinding = (code: string, binding: Binding, to: string): string => {
  const textFor = (shape: SiteShape) => {
    if (shape === 'property') return `${binding.name}: ${to}`;
    if (shape === 'import') return `${binding.name} as ${to}`;
    if (shape === 'export') return `${to} as ${binding.name}`;
    return to;
  };
  // Applied right to left so an earlier site's replacement cannot shift the
  // offsets of a later one.
  const ordered = [...binding.sites].sort((a, b) => b.start - a.start);
  let output = code;
  for (const site of ordered) {
    output =
      output.slice(0, site.start) +
      textFor(site.shape) +
      output.slice(site.start + binding.name.length);
  }
  return output;
};

type Finding = {
  rule: string;
  origin: string;
  kind: string;
  from: string;
  to: string;
  input: string;
  output: string;
  errors: number;
  /** Which channel emitted the output: `--fix`, or an accepted suggestion. */
  channel: 'fix' | 'suggestion';
  desc?: string;
};

type Totals = {
  findings: Finding[];
  considered: number;
  rewritten: number;
  bindings: number;
  fixtures: number;
  /** Suggestion edits offered on degenerate input, across all reports. */
  suggestionEdits: number;
  discardedUnparsable: number;
  discardDetails: string[];
  discardedUnrenamable: number;
  /** Perturbations another binding already produced byte-for-byte. */
  discardedDuplicate: number;
  unparsableFixture: number;
  /** Rules that threw on degenerate input — a defect, never a skip. */
  crashes: number;
  crashDetails: string[];
  /** Perturbations the ESLint parser rejected though TypeScript accepted them. */
  fatals: number;
  fatalDetails: string[];
  rulesRewritten: Set<string>;
  /**
   * Rules a perturbation was ever built for, and rules that then SPOKE. Both
   * exist so a rule missing from `rulesRewritten` can be told apart from one
   * the sweep never reached — a rule-dimension floor conflates the two, and the
   * conflation is what lets a subset go dark inside a passing sum (#1863).
   */
  rulesConsidered: Set<string>;
  rulesReporting: Set<string>;
  kindsRewritten: Map<string, number>;
};

const emptyTotals = (): Totals => ({
  findings: [],
  considered: 0,
  rewritten: 0,
  bindings: 0,
  fixtures: 0,
  suggestionEdits: 0,
  discardedUnparsable: 0,
  discardDetails: [],
  discardedUnrenamable: 0,
  discardedDuplicate: 0,
  unparsableFixture: 0,
  crashes: 0,
  crashDetails: [],
  fatals: 0,
  fatalDetails: [],
  rulesRewritten: new Set(),
  rulesConsidered: new Set(),
  rulesReporting: new Set(),
  kindsRewritten: new Map(),
});

/**
 * Only rules that measurably report NOTHING under this harness are excluded —
 * currently none. The wider "mentions the type checker" set was excluded before
 * on the theory that a bare `Linter` has no program; it has one (isolated,
 * single-file), and all 16 of those rules report over their own fixtures, so the
 * exclusion was suppressing live coverage rather than a false clean (#1859).
 */
const fixableRuleNames = [...ruleByName]
  .filter(([, rule]) => rule.meta?.fixable)
  .map(([name]) => name)
  .filter((name) => !silentWithoutProgramRuleNames.has(name));

/** The suggestion channel's population: `--fix` never applies these edits. */
const suggestingRuleNames = suggestionRuleNames.filter(
  (name) => !silentWithoutProgramRuleNames.has(name),
);
const probeCase = (
  rule: string,
  /** The id the rule is registered under, which a suggestion message carries. */
  ruleId: string,
  origin: string,
  code: string,
  filename: string,
  config: unknown,
  channel: 'fix' | 'suggestion',
  totals: Totals,
): void => {
  const jsx = filename.endsWith('x');
  totals.fixtures++;
  const collected = declaredBindingsOf(code, jsx);
  if (!collected) {
    totals.unparsableFixture++;
    return;
  }
  totals.discardedUnrenamable += collected.unrenamable;
  totals.bindings += collected.bindings.length;
  const seen = new Set<string>();

  for (const binding of collected.bindings) {
    for (const to of DEGENERATE_NAMES) {
      if (binding.name === to) continue;
      const input = renameBinding(code, binding, to);
      if (input === code) continue;
      if (seen.has(input)) {
        totals.discardedDuplicate++;
        continue;
      }
      seen.add(input);
      // A perturbation that does not parse is a harness artifact and must
      // never be counted as either a pass or a finding.
      if (parseErrorCount(input, filename) > 0) {
        totals.discardedUnparsable++;
        totals.discardDetails.push(
          `${rule} (${origin}) [${binding.kind}] ${binding.name} -> ${to}\n  ${input}`,
        );
        continue;
      }
      totals.considered++;
      totals.rulesConsidered.add(rule);

      if (channel === 'fix') {
        let result;
        try {
          result = linter.verifyAndFix(input, config as never, filename);
        } catch (error) {
          totals.crashes++;
          totals.crashDetails.push(
            `${rule} threw on ${binding.name} -> ${to}: ${
              (error as Error).message
            }`,
          );
          continue;
        }
        if (result.messages.some((message) => message.fatal)) {
          totals.fatals++;
          totals.fatalDetails.push(
            `${rule} (${origin}) ${binding.name} -> ${to}: ${
              result.messages.find((message) => message.fatal)?.message
            }`,
          );
        }
        // `verifyAndFix` returns the RESIDUAL messages, so they are the whole
        // lint only when nothing was applied. A rule that fixed obviously
        // spoke, which covers the other branch.
        if (
          result.fixed ||
          result.messages.some((message) => message.ruleId === ruleId)
        ) {
          totals.rulesReporting.add(rule);
        }
        if (!result.fixed || result.output === input) continue;
        totals.rewritten++;
        totals.rulesRewritten.add(rule);
        totals.kindsRewritten.set(
          binding.kind,
          (totals.kindsRewritten.get(binding.kind) ?? 0) + 1,
        );
        const errors = parseErrorCount(result.output, filename);
        if (errors > 0) {
          totals.findings.push({
            rule,
            origin,
            kind: binding.kind,
            from: binding.name,
            to,
            input,
            output: result.output,
            errors,
            channel,
          });
        }
        continue;
      }

      let messages;
      try {
        messages = linter.verify(input, config as never, filename);
      } catch (error) {
        totals.crashes++;
        totals.crashDetails.push(
          `${rule} threw on ${binding.name} -> ${to}: ${
            (error as Error).message
          }`,
        );
        continue;
      }
      if (messages.some((message) => message.fatal)) {
        totals.fatals++;
        totals.fatalDetails.push(
          `${rule} (${origin}) ${binding.name} -> ${to}: ${
            messages.find((message) => message.fatal)?.message
          }`,
        );
      }
      if (messages.some((message) => message.ruleId === ruleId)) {
        totals.rulesReporting.add(rule);
      }
      const edits = suggestionEditsOf(input, messages, ruleId);
      if (!edits.length) continue;
      totals.suggestionEdits += edits.length;
      totals.rewritten++;
      totals.rulesRewritten.add(rule);
      totals.kindsRewritten.set(
        binding.kind,
        (totals.kindsRewritten.get(binding.kind) ?? 0) + 1,
      );
      for (const edit of edits) {
        const errors = parseErrorCount(edit.output, filename);
        if (errors === 0) continue;
        totals.findings.push({
          rule,
          origin,
          kind: binding.kind,
          from: binding.name,
          to,
          input,
          output: edit.output,
          errors,
          channel,
          desc: edit.desc,
        });
      }
    }
  }
};

// ---------------------------------------------------------------------------
// CROSS PAIRING — the only thing this file changes
// ---------------------------------------------------------------------------

const corpus = harvestFixtureCorpus();

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
for (const name of ruleByName.keys()) {
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
  SCREEN[`b/${name}`] = 'error';
}

const fixableSet = new Set(fixableRuleNames);
const suggestingSet = new Set(suggestingRuleNames);

/** Three fixtures per (fixer, owner); see the header for why three. */
const PAIR_FIXTURE_CAP = 3;

/**
 * Fixtures this guard's probe cannot be applied to, named per rule with the
 * reason. The probe renames a fixture's declared TypeScript identifiers, which
 * needs TypeScript bindings and a TypeScript AST; a `package.json` body and a
 * Markdown document have neither. Skipping by LANGUAGE rather than by parse
 * failure is what keeps the skip honest — a Markdown fence is an empty template
 * literal, so several of those fixtures do parse as TypeScript and would
 * otherwise answer a TypeScript question by accident (#1860).
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

type Pairing = {
  fixturesScreened: number;
  screenFatal: number;
  screenThrew: number;
  nonTypeScriptSkipped: number;
  rulesWithNonTypeScriptFixtures: Set<string>;
  pairs: number;
  crossPairs: number;
  cappedPairs: number;
  crossCappedPairs: number;
  crossFixers: Set<string>;
  ownFixers: Set<string>;
  crossOwners: Set<string>;
};

const emptyPairing = (): Pairing => ({
  fixturesScreened: 0,
  screenFatal: 0,
  screenThrew: 0,
  nonTypeScriptSkipped: 0,
  rulesWithNonTypeScriptFixtures: new Set(),
  pairs: 0,
  crossPairs: 0,
  cappedPairs: 0,
  crossCappedPairs: 0,
  crossFixers: new Set(),
  ownFixers: new Set(),
  crossOwners: new Set(),
});

type Swept = { cross: Totals; own: Totals; pairing: Pairing };

const sweepCross = (channel: 'fix' | 'suggestion'): Swept => {
  const cross = emptyTotals();
  const own = emptyTotals();
  const pairing = emptyPairing();
  const population = channel === 'fix' ? fixableSet : suggestingSet;
  const seenPairs = new Map<string, number>();

  for (const [owner, cases] of corpus.byRule) {
    for (const testCase of cases) {
      if (testCase.language !== 'ts') {
        pairing.nonTypeScriptSkipped++;
        pairing.rulesWithNonTypeScriptFixtures.add(owner);
        continue;
      }
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      const parsing = {
        parser: parserKeyFor(testCase),
        parserOptions: parserOptionsFor(testCase),
      };

      /**
       * A fixture's `options` belong to its OWNER. Handing them to a different
       * rule configures it with a schema it never declared, so only the
       * owner's entry carries them; every other rule runs bare.
       */
      let screened: Linter.LintMessage[];
      try {
        screened = linter.verify(
          testCase.code,
          {
            ...parsing,
            rules: {
              ...SCREEN,
              ...(DIVERGENT_WITHOUT_PROGRAM.has(owner)
                ? {}
                : { [`b/${owner}`]: severityWithOptions(testCase) }),
            },
          } as never,
          filename,
        );
      } catch {
        pairing.screenThrew++;
        continue;
      }
      pairing.fixturesScreened++;
      /**
       * A fatal parse produces no `ruleId`, so it is indistinguishable from
       * every rule staying silent — counted, then asserted, never dropped.
       */
      if (screened.some((message) => message.fatal)) {
        pairing.screenFatal++;
        continue;
      }

      const reporting = new Set(
        screened
          .map((message) => message.ruleId)
          .filter((id): id is string => !!id && id.startsWith('b/'))
          .map((id) => id.slice(2)),
      );

      for (const fixer of reporting) {
        if (DIVERGENT_WITHOUT_PROGRAM.has(fixer)) continue;
        if (!population.has(fixer)) continue;
        const isCross = fixer !== owner;
        const key = `${fixer}::${owner}`;
        const used = seenPairs.get(key) ?? 0;
        if (used >= PAIR_FIXTURE_CAP) {
          pairing.cappedPairs++;
          if (isCross) pairing.crossCappedPairs++;
          continue;
        }
        seenPairs.set(key, used + 1);
        pairing.pairs++;
        if (isCross) {
          pairing.crossPairs++;
          pairing.crossFixers.add(fixer);
          pairing.crossOwners.add(owner);
        } else {
          pairing.ownFixers.add(fixer);
        }

        probeCase(
          fixer,
          `b/${fixer}`,
          `${testCase.origin} [owner ${owner}]`,
          testCase.code,
          filename,
          {
            ...parsing,
            rules: {
              [`b/${fixer}`]: isCross ? 'error' : severityWithOptions(testCase),
            },
          },
          channel,
          isCross ? cross : own,
        );
      }
    }
  }
  return { cross, own, pairing };
};

const fixSweep = sweepCross('fix');
const suggestionSweep = sweepCross('suggestion');

// ---------------------------------------------------------------------------
// Planted controls — driven over FOREIGN fixtures through the SAME code path.
// A control that reimplements the walk, or that only ever meets a synthetic
// input, proves that the control works and nothing about the corpus.
// ---------------------------------------------------------------------------

/** Derives a name exactly as #1816 did — strip, then drop a leading `_`. */
const degenerateDerivation = (name: string) =>
  name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^_/, '');

const plantRenamer = (id: string, derive: (name: string) => string) => {
  linter.defineRule(id, {
    meta: { type: 'problem', fixable: 'code', schema: [], messages: {} },
    create(context: any) {
      return {
        Identifier(node: any) {
          if (node.parent?.type !== 'VariableDeclarator') return;
          if (node.parent.id !== node) return;
          const next = derive(node.name);
          if (next === node.name) return;
          context.report({
            node,
            message: 'planted',
            fix: (fixer: any) => fixer.replaceTextRange(node.range, next),
          });
        },
      } as never;
    },
  } as never);
};

plantRenamer('b/__planted_degenerate', degenerateDerivation);
plantRenamer(
  'b/__planted_safe',
  (name) => `SAFE_${degenerateDerivation(name)}`,
);

/**
 * Both controls run over the same bounded slice of FOREIGN fixtures, so the
 * positive and the negative differ only in the derivation — which is the one
 * thing under test.
 */
const runPlant = (id: string): Totals => {
  const totals = emptyTotals();
  let probed = 0;
  for (const [owner, cases] of corpus.byRule) {
    for (const testCase of cases) {
      if (testCase.language !== 'ts') continue;
      if (testCase.bucket !== 'invalid') continue;
      if (probed >= 40) return totals;
      probed++;
      probeCase(
        id.slice(2),
        id,
        `${testCase.origin} [owner ${owner}] [PLANT]`,
        testCase.code,
        testCase.filename ?? defaultFilenameFor(testCase),
        {
          parser: parserKeyFor(testCase),
          parserOptions: parserOptionsFor(testCase),
          rules: { [id]: 'error' },
        },
        'fix',
        totals,
      );
    }
  }
  return totals;
};

const plantedPositive = runPlant('b/__planted_degenerate');
const plantedNegative = runPlant('b/__planted_safe');

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const describeFindings = (totals: Totals) => {
  const byRule = [...new Set(totals.findings.map((finding) => finding.rule))];
  const header = byRule.length
    ? `\n${totals.findings.length} finding(s) in ${
        byRule.length
      } rule(s): ${byRule.join(', ')}\n`
    : '';
  return (
    header +
    totals.findings
      .slice(0, 10)
      .map(
        (finding) =>
          `\n--- ${finding.rule} (${finding.origin}) [${finding.kind}] ${finding.from} -> ${finding.to}` +
          `, ${finding.errors} parse error(s) via ${finding.channel}` +
          `${finding.desc ? ` (${finding.desc})` : ''}` +
          `\nINPUT:\n${finding.input}\nOUTPUT:\n${finding.output}`,
      )
      .join('\n')
  );
};

/**
 * The binding shapes a cross pair must be shown to have driven a fixer from. A
 * count of thousands of rewrites says nothing about whether any of them came
 * from a parameter or an import (#1863).
 */
const REQUIRED_KINDS = [
  'Variable',
  'Parameter',
  'ImportBinding',
  'FunctionName',
  'ClassName',
  'Type',
  'Member',
];

beforeAll(() => {
  const pairing = fixSweep.pairing;
  // eslint-disable-next-line no-console
  console.log(
    [
      '[cross degenerate-identifier] counters',
      `  fixtures screened:        ${pairing.fixturesScreened}`,
      `  non-TypeScript skipped:   ${pairing.nonTypeScriptSkipped}`,
      `  screen fatal / threw:     ${pairing.screenFatal} / ${pairing.screenThrew}`,
      `  PAIRS:                    ${pairing.pairs} (${pairing.crossPairs} CROSS)`,
      `  dropped by the cap:       ${pairing.cappedPairs} (${pairing.crossCappedPairs} cross)`,
      `  distinct cross fixers:    ${pairing.crossFixers.size}`,
      `  distinct own fixers:      ${pairing.ownFixers.size}`,
      `  distinct cross owners:    ${pairing.crossOwners.size}`,
      '  -- fix channel, CROSS --',
      `  bindings collected:       ${fixSweep.cross.bindings}`,
      `  perturbations:            ${fixSweep.cross.considered}`,
      `  rewritten:                ${fixSweep.cross.rewritten}`,
      `  rules considered:         ${fixSweep.cross.rulesConsidered.size}`,
      `  rules REWRITTEN:          ${fixSweep.cross.rulesRewritten.size}`,
      `  kinds rewritten:          ${[...fixSweep.cross.kindsRewritten.keys()]
        .sort()
        .join(', ')}`,
      '  -- fix channel, own (control) --',
      `  rewritten:                ${fixSweep.own.rewritten}`,
      `  rules REWRITTEN:          ${fixSweep.own.rulesRewritten.size}`,
      '  -- suggestion channel, CROSS --',
      `  pairs:                    ${suggestionSweep.pairing.crossPairs}`,
      `  perturbations:            ${suggestionSweep.cross.considered}`,
      `  rewritten:                ${suggestionSweep.cross.rewritten}`,
      `  suggestion edits:         ${suggestionSweep.cross.suggestionEdits}`,
      `  rules REWRITTEN:          ${suggestionSweep.cross.rulesRewritten.size}`,
      '  -- skips --',
      `  unparsable fixture:       ${fixSweep.cross.unparsableFixture}`,
      `  discarded unparsable:     ${fixSweep.cross.discardedUnparsable}`,
      `  discarded unrenamable:    ${fixSweep.cross.discardedUnrenamable}`,
      `  discarded duplicate:      ${fixSweep.cross.discardedDuplicate}`,
      `  crashes / fatals:         ${fixSweep.cross.crashes} / ${fixSweep.cross.fatals}`,
      `  findings (cross fix):     ${fixSweep.cross.findings.length}`,
      `  findings (cross suggest): ${suggestionSweep.cross.findings.length}`,
      `  planted positive:         ${plantedPositive.findings.length}`,
      `  planted negative:         ${plantedNegative.findings.length}`,
    ].join('\n'),
  );
});

describe('the cross degenerate-identifier sweep is load-bearing', () => {
  it('harvests a corpus large enough for a zero to mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThan(250);
    expect(fixSweep.pairing.fixturesScreened).toBeGreaterThan(20000);
  });

  it('pairs fixtures with FOREIGN rules, not just their owners', () => {
    expect(fixSweep.pairing.crossPairs).toBeGreaterThan(2400);
    expect(fixSweep.pairing.crossFixers.size).toBeGreaterThan(60);
    expect(fixSweep.pairing.crossOwners.size).toBeGreaterThan(185);
    // The cross arm must be the BULK of the work, not a rounding error on it.
    expect(fixSweep.pairing.crossPairs).toBeGreaterThan(
      fixSweep.pairing.pairs / 2,
    );
  });

  it('screens every fixture without a fatal parse', () => {
    expect(fixSweep.pairing.screenFatal).toBe(0);
    expect(fixSweep.pairing.screenThrew).toBe(0);
  });

  it('names every rule whose fixtures the probe cannot express', () => {
    expect([...fixSweep.pairing.rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(fixSweep.pairing.nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  it('actually perturbs and REWRITES through foreign fixtures', () => {
    expect(fixSweep.cross.considered).toBeGreaterThan(40000);
    expect(fixSweep.cross.rewritten).toBeGreaterThan(26000);
    expect(fixSweep.cross.rulesRewritten.size).toBeGreaterThan(55);
  });

  it('drove fixers from every binding shape, not just declarators', () => {
    for (const kind of REQUIRED_KINDS) {
      expect(
        `${kind}: ${fixSweep.cross.kindsRewritten.get(kind) ?? 0}`,
      ).not.toBe(`${kind}: 0`);
    }
  });

  it('reaches the suggestion channel too, where --fix never looks', () => {
    expect(suggestionSweep.cross.rewritten).toBeGreaterThan(1100);
    expect(suggestionSweep.cross.suggestionEdits).toBeGreaterThan(1200);
    expect(suggestionSweep.cross.rulesRewritten.size).toBeGreaterThan(4);
  });

  it('keeps the own-corpus control alive as a harness check', () => {
    expect(fixSweep.own.rewritten).toBeGreaterThan(2000);
    expect(fixSweep.own.rulesRewritten.size).toBeGreaterThan(65);
  });

  it('accounts for every case it does NOT judge', () => {
    expect(fixSweep.cross.crashes).toBe(0);
    expect(fixSweep.cross.crashDetails).toEqual([]);
    expect(fixSweep.cross.fatals).toBe(0);
    expect(fixSweep.cross.discardedUnparsable).toBe(0);
    expect(fixSweep.cross.discardedUnrenamable).toBe(0);
    expect(suggestionSweep.cross.crashes).toBe(0);
    expect(suggestionSweep.cross.fatals).toBe(0);
    expect(suggestionSweep.cross.discardedUnparsable).toBe(0);
    /**
     * A byte-identical perturbation another binding already produced. Not a
     * loss of coverage — the input was probed — but the ceiling is cut close
     * so a collapse into duplicates cannot masquerade as a clean sweep.
     */
    expect(fixSweep.cross.discardedDuplicate).toBeLessThan(1600);
    /**
     * A fixture TypeScript cannot parse at all. Cut close to the measured
     * value so a harness regression that starts dropping fixtures fails here
     * rather than silently shrinking the sweep.
     */
    expect(fixSweep.cross.unparsableFixture).toBeLessThan(3);
  });

  it('catches a planted fixer that derives a non-identifier (POSITIVE)', () => {
    expect(plantedPositive.rewritten).toBeGreaterThan(0);
    expect(plantedPositive.findings.length).toBeGreaterThan(0);
  });

  it('stays silent on a plant that derives a legal name (NEGATIVE)', () => {
    expect(plantedNegative.rewritten).toBeGreaterThan(0);
    expect(plantedNegative.findings).toEqual([]);
  });
});

describe('no fixer emits unparsable source under a FOREIGN degenerate input', () => {
  it('reports every finding in the fix channel', () => {
    expect(describeFindings(fixSweep.cross)).toBe('');
  });

  it('reports every finding in the suggestion channel', () => {
    expect(describeFindings(suggestionSweep.cross)).toBe('');
  });
});
