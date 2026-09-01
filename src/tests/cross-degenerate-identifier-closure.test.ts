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
 * It carries BOTH of the shipped guard's arms. The first renames a declared
 * binding and asserts the output parses. The second rewrites a string literal's
 * content and diffs the names the fixer invents — a different perturbation with
 * a different oracle, and the one that reaches #1811/#1813, whose trigger is a
 * key VALUE that normalization folds away rather than an identifier.
 *
 * The two arms are budgeted, reached and starved SEPARATELY. Sharing one cap
 * would let a fixture holding no string literal spend a (fixer, owner) slot and
 * starve the literal arm towards zero while every shared counter still read
 * healthy — the accident that left the `throw` restricted-production arm
 * calibrated over an empty corpus.
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
// The SECOND perturbation: the CONTENT of a string literal.
//
// The rename arm can only reach a fixer that reads an IDENTIFIER. #1811/#1813's
// trigger is a key VALUE that normalization folds away
// (`useRouterState({ key: '---' })`) — no rename expresses that input, so the
// gate that shipped for those issues could not fail on them. The own-corpus
// guard carries both arms; this file carried only the first, which left the
// literal oracle having never met a fixture outside its own author's suite.
//
// The helpers below are copied VERBATIM from
// `src/tests/degenerate-identifier-closure.test.ts`, for the same reason its
// rename helpers are: a difference in outcome must then be a difference in
// PAIRING and nothing else. `walk` and `parseErrorCount` above are already
// shared with it this way.
// ---------------------------------------------------------------------------

const stringLiteralRangesOf = (
  code: string,
  jsx: boolean,
): [number, number][] => {
  let ast: unknown;
  try {
    ast = tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return [];
  }
  const ranges: [number, number][] = [];
  walk(ast, (node) => {
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      Array.isArray(node.range)
    ) {
      ranges.push([node.range[0], node.range[1]] as [number, number]);
    }
  });
  return ranges;
};

/**
 * Every identifier in `code`, or null when it does not parse.
 *
 * Null rather than an empty set, and the callers must skip on it. Defaulting to
 * empty makes an unparsable BASELINE report every identifier in the output as
 * newly derived. `range: true` is load-bearing: without it `tsParser.parse`
 * throws on ANY JSX input, which withheld 42% of the own guard's derivations
 * while every counter still read clean.
 */
const identifierNamesOf = (code: string, jsx: boolean): Set<string> | null => {
  const names = new Set<string>();
  let ast: unknown;
  try {
    ast = tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    });
  } catch {
    return null;
  }
  walk(ast, (node) => {
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      names.add(node.name);
    }
  });
  return names;
};

const spliceRange = (
  code: string,
  [start, end]: [number, number],
  text: string,
) => code.slice(0, start) + text + code.slice(end);

/**
 * The names a fix INVENTED: present in the output, absent from the input.
 * Null when either side fails to parse, so an unreadable pair is skipped rather
 * than counted as a derivation.
 */
const derivedNames = (
  input: string,
  output: string | null,
  jsx: boolean,
): Set<string> | null => {
  if (!output) return new Set<string>();
  const before = identifierNamesOf(input, jsx);
  const after = identifierNamesOf(output, jsx);
  if (!before || !after) return null;
  return new Set([...after].filter((name) => !before.has(name)));
};

/**
 * A value with content, against which a collapsed derivation is measured. It
 * must survive every normalization the rules apply (upper-casing, folding
 * non-alphanumerics to `_`, collapsing runs) with something left over.
 */
const CONTROL_LITERAL = 'ordinaryKey';

/**
 * Values that normalization folds to nothing: empty, whitespace-only, and
 * separator-only. Each leaves a prefix-building fixer with no content to append.
 */
const DEGENERATE_LITERALS = ['', '   ', '---'] as const;

/**
 * Does `degenerate` carry nothing of the literal that `control` carried?
 *
 * Differential rather than a naming predicate, so it needs no per-rule affix
 * list and stays silent for a fixer that declines. The question is whether the
 * control's name survives DELETING the author's content from the middle of it:
 * `degenerate` splits into `head + tail` with
 * `control === head + <something non-empty> + tail`, which answers it for a
 * prefix, a suffix and an infix builder alike (#1819).
 *
 * Names the two runs SHARE are dropped before pairing, and that is load-bearing
 * rather than an optimization: a name identical under both literals did not come
 * from the literal, so it belongs to neither side of the comparison.
 */
const collapsedAgainst = (control: Set<string>, degenerate: Set<string>) => {
  const literalDerived = [...degenerate].filter((name) => !control.has(name));
  const literalDerivedControl = [...control].filter(
    (name) => !degenerate.has(name),
  );
  for (const derived of literalDerived) {
    for (const reference of literalDerivedControl) {
      if (reference.length <= derived.length) continue;
      for (let split = 0; split <= derived.length; split++) {
        const head = derived.slice(0, split);
        const tail = derived.slice(split);
        if (
          reference.startsWith(head) &&
          reference.endsWith(tail) &&
          reference.length > head.length + tail.length
        ) {
          return { derivedDegenerate: derived, derivedControl: reference };
        }
      }
    }
  }
  return null;
};

type LiteralFinding = {
  kind: 'parse' | 'collapsed';
  channel: 'fix' | 'suggestion';
  rule: string;
  origin: string;
  literal: string;
  derivedControl: string;
  derivedDegenerate: string;
  input: string;
  output: string;
};

type LiteralTotals = {
  findings: LiteralFinding[];
  considered: number;
  rewritten: number;
  /**
   * Control runs where a benign literal made the fixer invent a name. This is
   * the floor that matters: it is the only number proving the pairing actually
   * reaches a derive-a-name-from-text fixer, which is the thing under test.
   */
  derivationsObserved: number;
  discardedUnparsable: number;
  skippedUnparsableComparison: number;
  /**
   * Control runs whose BASELINE could not be read. Distinct from
   * `skippedUnparsableComparison`, which can only count pairs that already
   * cleared the deriving gate — so it stays at 0 no matter how much of the
   * corpus an unreadable baseline withholds.
   */
  unreadableControl: number;
  crashes: number;
  crashDetails: string[];
  rulesDeriving: Set<string>;
  /** As above: reached, rewrote, derived are three different failures. */
  rulesConsidered: Set<string>;
  rulesRewritten: Set<string>;
};

const emptyLiteralTotals = (): LiteralTotals => ({
  findings: [],
  considered: 0,
  rewritten: 0,
  derivationsObserved: 0,
  discardedUnparsable: 0,
  skippedUnparsableComparison: 0,
  unreadableControl: 0,
  crashes: 0,
  crashDetails: [],
  rulesDeriving: new Set(),
  rulesConsidered: new Set(),
  rulesRewritten: new Set(),
});

/**
 * The literal perturbation for ONE (fixer, fixture) pair.
 *
 * Written as a function over an explicit `totals` so the planted controls below
 * drive the identical code path over foreign fixtures.
 *
 * On the suggestion channel a run's derivation is the UNION of the names every
 * offered edit invents. Pairing edit-by-edit would need the two runs to offer
 * the same slots in the same order, which a rule that reports a different number
 * of times under a different literal does not do — and a mispaired slot invents
 * a collapse out of nothing.
 */
const probeLiteralCase = (
  rule: string,
  /** The id the rule is registered under, which a suggestion message carries. */
  ruleId: string,
  origin: string,
  code: string,
  filename: string,
  ranges: [number, number][],
  config: unknown,
  channel: 'fix' | 'suggestion',
  totals: LiteralTotals,
): void => {
  const jsx = filename.endsWith('x');

  const runFix = (input: string) => {
    try {
      const result = linter.verifyAndFix(input, config as never, filename);
      return result.fixed && result.output !== input ? result.output : null;
    } catch (error) {
      totals.crashes++;
      totals.crashDetails.push(
        `${rule} threw on ${JSON.stringify(input)}: ${
          (error as Error).message
        }`,
      );
      return null;
    }
  };

  type ChannelRun = { invented: Set<string>; outputs: string[] } | null;

  /** Every name any suggestion invents, plus each edit's own output. */
  const runSuggestions = (input: string, withNames: boolean): ChannelRun => {
    let messages;
    try {
      messages = linter.verify(input, config as never, filename);
    } catch (error) {
      totals.crashes++;
      totals.crashDetails.push(
        `${rule} threw on ${JSON.stringify(input)}: ${
          (error as Error).message
        }`,
      );
      return null;
    }
    const before = withNames ? identifierNamesOf(input, jsx) : null;
    if (withNames && !before) return null;
    const invented = new Set<string>();
    const outputs: string[] = [];
    for (const edit of suggestionEditsOf(input, messages, ruleId)) {
      outputs.push(edit.output);
      if (!before) continue;
      const after = identifierNamesOf(edit.output, jsx);
      if (!after) return null;
      for (const name of after) {
        if (!before.has(name)) invented.add(name);
      }
    }
    return { invented, outputs };
  };

  /**
   * `withNames` is not an optimization detail: reading identifiers costs two
   * parses per run, and the comparison is only defined when the CONTROL run
   * invented something, so a degenerate run past a silent control is asked for
   * outputs alone.
   */
  const runChannel = (input: string, withNames: boolean): ChannelRun => {
    if (channel === 'suggestion') return runSuggestions(input, withNames);
    const output = runFix(input);
    if (!withNames) {
      return { invented: new Set(), outputs: output ? [output] : [] };
    }
    const invented = derivedNames(input, output, jsx);
    if (!invented) return null;
    return { invented, outputs: output ? [output] : [] };
  };

  for (const range of ranges) {
    const controlInput = spliceRange(code, range, `'${CONTROL_LITERAL}'`);
    if (parseErrorCount(controlInput, filename) > 0) {
      totals.discardedUnparsable++;
      continue;
    }
    const control = runChannel(controlInput, true);
    // An unreadable baseline is not a non-deriving one. Folding null to an
    // empty set routes it into the `!control.invented.size` skip below, where
    // it becomes indistinguishable from a fixer that invented nothing — and
    // `skippedUnparsableComparison` never sees it, because that branch sits
    // past the skip.
    if (!control) {
      totals.unreadableControl++;
      continue;
    }
    if (control.invented.size) {
      totals.derivationsObserved++;
      totals.rulesDeriving.add(rule);
    }

    for (const value of DEGENERATE_LITERALS) {
      const input = spliceRange(code, range, `'${value}'`);
      if (input === code) continue;
      if (parseErrorCount(input, filename) > 0) {
        totals.discardedUnparsable++;
        continue;
      }
      totals.considered++;
      totals.rulesConsidered.add(rule);
      const degenerate = runChannel(input, control.invented.size > 0);
      if (!degenerate) {
        totals.skippedUnparsableComparison++;
        continue;
      }
      if (!degenerate.outputs.length) continue;
      totals.rewritten++;
      totals.rulesRewritten.add(rule);

      const broken = degenerate.outputs.find(
        (output) => parseErrorCount(output, filename) > 0,
      );
      if (broken) {
        totals.findings.push({
          kind: 'parse',
          channel,
          rule,
          origin,
          literal: value,
          derivedControl: '',
          derivedDegenerate: '',
          input,
          output: broken,
        });
        continue;
      }
      if (!control.invented.size) continue;

      const collapse = collapsedAgainst(control.invented, degenerate.invented);
      if (collapse) {
        totals.findings.push({
          kind: 'collapsed',
          channel,
          rule,
          origin,
          literal: value,
          ...collapse,
          input,
          output: degenerate.outputs[0],
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
  /**
   * The literal arm is capped, reached and starved SEPARATELY from the rename
   * arm. Sharing one cap would let a fixture holding no string literal at all
   * consume a (fixer, owner) slot and starve this arm back towards zero while
   * every shared counter still read healthy — the same accident that left the
   * `throw` restricted-production arm calibrated over an empty corpus.
   */
  literalPairs: number;
  literalCrossPairs: number;
  literalCappedPairs: number;
  literalCrossCappedPairs: number;
  literalCrossFixers: Set<string>;
  literalCrossOwners: Set<string>;
  /**
   * Fixtures carrying no string literal for the arm to perturb. Counted rather
   * than dropped: a silent truncation reads as "covered everything".
   */
  fixturesWithoutLiteral: number;
  fixturesWithLiteral: number;
  /**
   * Ranges past `LITERAL_RANGE_CAP` on a single pair. Asserted below, because a
   * cap nobody reads is indistinguishable from full coverage.
   */
  literalRangesDropped: number;
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
  literalPairs: 0,
  literalCrossPairs: 0,
  literalCappedPairs: 0,
  literalCrossCappedPairs: 0,
  literalCrossFixers: new Set(),
  literalCrossOwners: new Set(),
  fixturesWithoutLiteral: 0,
  fixturesWithLiteral: 0,
  literalRangesDropped: 0,
});

/**
 * String literals perturbed per (fixer, fixture). Each range costs one control
 * run plus one run per degenerate value, and a fixture holding dozens of
 * literals would spend the whole arm's budget re-asking one pair's question.
 */
const LITERAL_RANGE_CAP = 4;

type Swept = {
  cross: Totals;
  own: Totals;
  literalCross: LiteralTotals;
  literalOwn: LiteralTotals;
  pairing: Pairing;
};

const sweepCross = (channel: 'fix' | 'suggestion'): Swept => {
  const cross = emptyTotals();
  const own = emptyTotals();
  const literalCross = emptyLiteralTotals();
  const literalOwn = emptyLiteralTotals();
  const pairing = emptyPairing();
  const population = channel === 'fix' ? fixableSet : suggestingSet;
  const seenPairs = new Map<string, number>();
  const seenLiteralPairs = new Map<string, number>();

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

      /**
       * Hoisted out of the fixer loop: which literals a fixture holds is a
       * property of the fixture, not of the rule being driven through it.
       */
      const literalRanges = stringLiteralRangesOf(
        testCase.code,
        filename.endsWith('x'),
      );
      if (literalRanges.length) pairing.fixturesWithLiteral++;
      else pairing.fixturesWithoutLiteral++;
      if (literalRanges.length > LITERAL_RANGE_CAP) {
        pairing.literalRangesDropped +=
          literalRanges.length - LITERAL_RANGE_CAP;
      }
      const cappedRanges = literalRanges.slice(0, LITERAL_RANGE_CAP);

      for (const fixer of reporting) {
        if (DIVERGENT_WITHOUT_PROGRAM.has(fixer)) continue;
        if (!population.has(fixer)) continue;
        const isCross = fixer !== owner;
        const key = `${fixer}::${owner}`;
        const config = {
          ...parsing,
          rules: {
            [`b/${fixer}`]: isCross ? 'error' : severityWithOptions(testCase),
          },
        };

        const used = seenPairs.get(key) ?? 0;
        if (used >= PAIR_FIXTURE_CAP) {
          pairing.cappedPairs++;
          if (isCross) pairing.crossCappedPairs++;
        } else {
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
            config,
            channel,
            isCross ? cross : own,
          );
        }

        /**
         * The literal arm draws from its OWN cap, and only a fixture that
         * actually holds a literal spends a slot — see `literalPairs`.
         */
        if (!cappedRanges.length) continue;
        const literalUsed = seenLiteralPairs.get(key) ?? 0;
        if (literalUsed >= PAIR_FIXTURE_CAP) {
          pairing.literalCappedPairs++;
          if (isCross) pairing.literalCrossCappedPairs++;
          continue;
        }
        seenLiteralPairs.set(key, literalUsed + 1);
        pairing.literalPairs++;
        if (isCross) {
          pairing.literalCrossPairs++;
          pairing.literalCrossFixers.add(fixer);
          pairing.literalCrossOwners.add(owner);
        }

        probeLiteralCase(
          fixer,
          `b/${fixer}`,
          `${testCase.origin} [owner ${owner}]`,
          testCase.code,
          filename,
          cappedRanges,
          config,
          channel,
          isCross ? literalCross : literalOwn,
        );
      }
    }
  }
  return { cross, own, literalCross, literalOwn, pairing };
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

/**
 * The literal arm's plants: a fixer that names a key after the key's own VALUE.
 *
 * `prefixing` reproduces #1811/#1813 exactly — it appends normalized content to
 * a constant prefix, so a value that normalization folds away leaves the bare
 * prefix behind. `distinct` is the negative: it derives a name that does not
 * vary with the literal at all, so nothing can collapse. The two differ only in
 * the derivation, which is the one thing under test.
 */
const plantLiteralNamer = (
  id: string,
  derive: (normalized: string) => string,
) => {
  linter.defineRule(id, {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: {},
    },
    create(context: any) {
      return {
        Literal(node: any) {
          if (typeof node.value !== 'string') return;
          if (node.parent?.type !== 'Property') return;
          const normalized = String(node.value)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          context.report({
            node,
            message: 'planted',
            fix: (fixer: any) =>
              fixer.replaceTextRange(node.range, derive(normalized)),
          });
        },
      } as never;
    },
  } as never);
};

plantLiteralNamer(
  'b/__planted_literal_collapse',
  (normalized) => `QUERY_KEY_${normalized}`,
);
plantLiteralNamer('b/__planted_literal_safe', () => 'QUERY_KEY_FALLBACK');

/**
 * Same bounded slice of FOREIGN fixtures as `runPlant`, and only fixtures that
 * actually hold a literal — a plant driven over inputs it cannot perturb would
 * report a clean the corpus never earned.
 */
const runLiteralPlant = (id: string): LiteralTotals => {
  const totals = emptyLiteralTotals();
  let probed = 0;
  for (const [owner, cases] of corpus.byRule) {
    for (const testCase of cases) {
      if (testCase.language !== 'ts') continue;
      if (testCase.bucket !== 'invalid') continue;
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      const ranges = stringLiteralRangesOf(
        testCase.code,
        filename.endsWith('x'),
      ).slice(0, LITERAL_RANGE_CAP);
      if (!ranges.length) continue;
      if (probed >= 40) return totals;
      probed++;
      probeLiteralCase(
        id.slice(2),
        id,
        `${testCase.origin} [owner ${owner}] [PLANT]`,
        testCase.code,
        filename,
        ranges,
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

const plantedLiteralPositive = runLiteralPlant('b/__planted_literal_collapse');
const plantedLiteralNegative = runLiteralPlant('b/__planted_literal_safe');

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
    /**
     * The two denominators upstream of every count below, ASSERTED rather than
     * accumulated. `fixtures` sits before any skip, so it is the only record
     * that the pairing loop actually entered the probe; `bindings` is the pool
     * the perturbations are drawn from, and a collector that stops finding
     * declarations empties `considered` while every skip counter stays at its
     * measured zero — the shape that reads as a clean sweep.
     *
     * `fixtures` is CLOSED against the pairing rather than floored: `probeCase`
     * runs exactly once per uncapped pair, so the identity fails the moment a
     * pair stops reaching the probe, which no floor cut under a moving corpus
     * can promise.
     */
    expect(fixSweep.cross.fixtures).toBe(fixSweep.pairing.crossPairs);
    expect(fixSweep.cross.fixtures + fixSweep.own.fixtures).toBe(
      fixSweep.pairing.pairs,
    );
    expect(fixSweep.cross.bindings).toBeGreaterThan(11000); // measured 11,817
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
     * Measured 1624. The class-method fixtures of #2165 carry near-identical
     * one-member class bodies, so renaming their sole binding to a degenerate
     * name collides across them — corpus growth, not a collapse.
     */
    expect(fixSweep.cross.discardedDuplicate).toBeLessThan(1650);
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

const describeLiteralFindings = (totals: LiteralTotals) => {
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
          `\n--- ${finding.rule} (${finding.origin}) [${
            finding.kind
          }] literal ${JSON.stringify(finding.literal)} via ${
            finding.channel
          }` +
          `\n  control derived: ${finding.derivedControl}` +
          `\n  degenerate derived: ${finding.derivedDegenerate}` +
          `\nINPUT:\n${finding.input}\nOUTPUT:\n${finding.output}`,
      )
      .join('\n')
  );
};

describe('the cross degenerate-identifier LITERAL arm is load-bearing', () => {
  /**
   * Floors sit just under the values measured at v1.20.192. A floor far below
   * its measured value passes for years while the thing it guards decays — the
   * failure that hid #1984, where `casesConsidered` was floored at 5,500
   * against an actual 8,141.
   */
  it('pairs string literals with FOREIGN rules, not just their owners', () => {
    expect(fixSweep.pairing.literalCrossPairs).toBeGreaterThanOrEqual(1900);
    expect(fixSweep.pairing.literalCrossFixers.size).toBeGreaterThanOrEqual(55);
    expect(fixSweep.pairing.literalCrossOwners.size).toBeGreaterThanOrEqual(
      175,
    );
    // The cross arm must dominate the own arm, or this file is re-running the
    // shipped guard's coverage under a new name.
    expect(fixSweep.pairing.literalCrossPairs).toBeGreaterThan(
      fixSweep.pairing.literalPairs - fixSweep.pairing.literalCrossPairs,
    );
  });

  it('actually drove foreign fixers with degenerate literals', () => {
    expect(fixSweep.literalCross.considered).toBeGreaterThanOrEqual(9500);
    expect(fixSweep.literalCross.rewritten).toBeGreaterThanOrEqual(5500);
    expect(fixSweep.literalCross.rulesConsidered.size).toBeGreaterThanOrEqual(
      57,
    );
    expect(fixSweep.literalCross.rulesRewritten.size).toBeGreaterThanOrEqual(
      50,
    );
  });

  /**
   * The load-bearing floor. `considered` and `rewritten` can both be large
   * while every fixer ignores the literal entirely; `derivationsObserved`
   * counts control runs where a BENIGN literal made a fixer invent a name,
   * which is the only evidence the arm reaches a derive-a-name-from-text fixer
   * at all — the thing under test.
   */
  it('reaches fixers that DERIVE a name from the literal', () => {
    expect(fixSweep.literalCross.derivationsObserved).toBeGreaterThanOrEqual(
      1150,
    );
    expect(fixSweep.literalCross.rulesDeriving.size).toBeGreaterThanOrEqual(26);
  });

  it('reaches the suggestion channel too, where --fix never looks', () => {
    expect(suggestionSweep.pairing.literalCrossPairs).toBeGreaterThanOrEqual(
      150,
    );
    expect(suggestionSweep.literalCross.considered).toBeGreaterThanOrEqual(800);
    expect(suggestionSweep.literalCross.rewritten).toBeGreaterThanOrEqual(220);
    expect(
      suggestionSweep.literalCross.derivationsObserved,
    ).toBeGreaterThanOrEqual(20);
    expect(
      suggestionSweep.literalCross.rulesDeriving.size,
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * The own arm is not coverage — the shipped guard already covers it
   * exhaustively — it is the control that this harness reproduces that guard's
   * behaviour at all. A zero here means the port is broken, not that the
   * corpus is clean.
   */
  it('keeps the own-corpus literal control alive as a harness check', () => {
    expect(fixSweep.literalOwn.considered).toBeGreaterThanOrEqual(900);
    expect(fixSweep.literalOwn.derivationsObserved).toBeGreaterThanOrEqual(90);
    expect(fixSweep.literalOwn.rulesDeriving.size).toBeGreaterThanOrEqual(28);
  });

  it('accounts for every literal case it does NOT judge', () => {
    for (const totals of [
      fixSweep.literalCross,
      fixSweep.literalOwn,
      suggestionSweep.literalCross,
      suggestionSweep.literalOwn,
    ]) {
      expect(totals.crashDetails.slice(0, 5).join('\n')).toBe('');
      expect(totals.crashes).toBe(0);
      // An unreadable baseline is not a non-deriving one, and a skipped
      // comparison is not a passing one. Both are held at zero rather than
      // printed, so a harness regression cannot hide inside them.
      expect(totals.unreadableControl).toBe(0);
      expect(totals.skippedUnparsableComparison).toBe(0);
      expect(totals.discardedUnparsable).toBe(0);
    }
    // What the two caps drop, carried rather than left implicit.
    expect(fixSweep.pairing.fixturesWithLiteral).toBeGreaterThanOrEqual(11000);
    expect(fixSweep.pairing.fixturesWithoutLiteral).toBeGreaterThan(0);
    expect(fixSweep.pairing.literalCappedPairs).toBeGreaterThan(0);
    expect(fixSweep.pairing.literalRangesDropped).toBeLessThanOrEqual(3000);
  });

  it('catches a planted fixer whose derived name collapses (POSITIVE)', () => {
    expect(plantedLiteralPositive.derivationsObserved).toBeGreaterThan(0);
    expect(plantedLiteralPositive.findings.length).toBeGreaterThan(0);
    expect(
      plantedLiteralPositive.findings.map((finding) => finding.kind),
    ).toContain('collapsed');
    expect(
      plantedLiteralPositive.findings.map((finding) => finding.derivedControl),
    ).toContain('QUERY_KEY_ORDINARYKEY');
  });

  /**
   * The negative control has to DERIVE and still not collapse, or it would pass
   * by never reaching the oracle — which is what a plant that simply declines
   * would prove. Its `derivationsObserved` is asserted for exactly that reason.
   */
  it('stays silent on a plant whose name ignores the literal (NEGATIVE)', () => {
    expect(plantedLiteralNegative.derivationsObserved).toBeGreaterThan(0);
    expect(plantedLiteralNegative.rewritten).toBeGreaterThan(0);
    expect(plantedLiteralNegative.findings).toEqual([]);
  });
});

describe('no fixer collapses a derived name under a FOREIGN degenerate literal', () => {
  it('reports every finding in the fix channel', () => {
    expect(describeLiteralFindings(fixSweep.literalCross)).toBe('');
    expect(fixSweep.literalCross.findings).toEqual([]);
  });

  it('reports every finding in the suggestion channel', () => {
    expect(describeLiteralFindings(suggestionSweep.literalCross)).toBe('');
    expect(suggestionSweep.literalCross.findings).toEqual([]);
  });
});
