/**
 * A fixer may never emit source that does not parse.
 *
 * Several rules build a replacement NAME by transforming an existing one —
 * stripping non-alphanumerics, uppercasing, dropping a leading `_`, flipping
 * `charAt(0)`. Those transforms are total functions on text but partial ones on
 * *identifiers*: `_` derives the empty string and `_1`/`_2fa` derive `1`/`2FA`,
 * none of which can be an identifier. A fixer that applies the derived text
 * unconditionally exits 0 having written a file that no longer compiles
 * (#1811, #1813, #1816).
 *
 * Every other corpus guard is structurally blind to this. They lint the
 * fixtures as written, and no fixture was written with a pathological name, so
 * `fixer-type-safety`, `recommended-config-fix-closure` and
 * `fixture-corpus-parsability` all passed while #1816 shipped. The missing
 * ingredient is PERTURBATION: make the input degenerate first, then ask whether
 * the fixer still emits code.
 *
 * It takes TWO perturbations to cover the three defects, because they degenerate
 * in different places and fail in different ways (#1818):
 *
 * - **Rename a declared binding** to `_`, `_1`, `_2fa`, `$` and require the
 *   output to PARSE. This reaches #1816, whose derived text is not a legal
 *   identifier at all.
 * - **Rewrite a string literal's content** to a value normalization folds away
 *   (`''`, `'   '`, `'---'`) and compare the derived name against a control run
 *   on a value with content. This reaches #1811/#1813, and parseability cannot:
 *   `QUERY_KEY_` is a perfectly legal identifier, so the first arm's assertion
 *   is green on it by construction. Only the differential shows that the
 *   author's value vanished and the rule's constant affix is all that survived
 *   — at whichever end the rule puts it (#1819).
 *
 * The first arm shipped alone, citing all three issues. Reverting #1811 and
 * #1813 left it green — the corpus could not express their trigger and the
 * assertion could not have failed on it. Both directions of that audit are the
 * acceptance test for this file; a planted control alone would not have shown
 * it, since a plant passes even when the corpus reaches no real rule.
 *
 * Each perturbation is applied to BOTH channels a rule can rewrite code
 * through, because `verifyAndFix` never applies a suggestion: a rule with
 * `meta.hasSuggestions` offers edits that `--fix` will not take and that a
 * fix-only sweep therefore never inspects, while a user accepting one in an
 * editor gets exactly the same file on disk. Seven rules offer them, and under
 * degenerate input they emit thousands of name-inventing edits (#1862, #1419).
 *
 * ## What counts as a binding
 *
 * The collector walks the SCOPE MANAGER's variables rather than enumerating
 * declaration node types by hand. The hand-written list is what made the gap
 * possible: it recognized `VariableDeclarator`, `FunctionDeclaration` and
 * `ClassDeclaration`, because #1816's defect sat on a `const`, and so it never
 * degenerated a parameter, a destructured name, an import specifier, a type
 * alias, an interface, an enum, a type parameter or a catch clause — 2,565 of
 * 3,358 invalid fixtures carried a binding it could not see (#1862). A rule that
 * derives a name from a PARAMETER or an IMPORT is exactly as capable of emitting
 * a leading-digit identifier as one deriving from a `const`, and the corpus is
 * full of both. Asking the scope analyzer means a binding form the plugin has
 * never met is covered on the day it appears.
 *
 * Class and interface MEMBERS are collected separately and deliberately: they
 * are not lexical bindings, so no scope holds them, yet several fixers derive a
 * name from a method or property key (`prefer-getter-over-parameterless-method`
 * turns `getFoo` into `foo`). Their rename rewrites every property-position
 * occurrence of the name in the file, which is what keeps declaration and use
 * sites in agreement.
 *
 * ## Renaming must produce a program
 *
 * A perturbation that breaks the input is a bug in the harness, not a finding
 * about the fixer, so the rename is precise rather than textual:
 *
 * - Every definition AND every reference the scope manager resolved is
 *   rewritten together. A binding renamed at its declaration alone is a
 *   stranded reference, which is a different program than the one the fixture
 *   author wrote.
 * - Only the identifier's own token is replaced. A TSESTree `Identifier` range
 *   spans its type annotation (`z: T1`), so replacing the whole range deletes
 *   the annotation and quietly changes what the rule is looking at (#1351).
 * - Shorthand is EXPANDED, not overwritten: `{ a }` becomes `{ a: _ }`,
 *   `import { Foo }` becomes `import { Foo as _ }` and `export { a }` becomes
 *   `export { _ as a }`. Overwriting instead renames the property being read or
 *   the module contract being imported, which is a different fixture rather
 *   than a degenerate one.
 * - A JSX closing tag is rewritten only when it PAIRS with an opening tag that
 *   is itself a reference to the binding. Rewriting every closing tag with a
 *   matching name renames `</button>` when a variable happens to be called
 *   `button`, and the mismatched pair no longer parses — 8 perturbations
 *   discarded themselves that way before the pairing was added.
 * - Every rewrite site is verified to actually hold the name before use, and a
 *   binding that fails is COUNTED (`discardedUnrenamable`) rather than skipped
 *   silently, so a scope-manager shape this harness cannot express shows up as a
 *   number instead of as absence.
 *
 * The perturbation is still allowed to change MEANING — it may collide with an
 * existing binding of the same degenerate name. That is sound here because the
 * assertion is not "the fix is correct" but "the fix is *syntax*" and "the fix
 * carries the author's content", neither of which any input licenses a fixer to
 * violate.
 *
 * Four accounting rules make the result mean something:
 *
 * - The floor is on inputs actually REWRITTEN, not inputs considered. A
 *   perturbation pass that triggers no fixer proves nothing, and a
 *   considered-count hides that ([[floor-the-asserted-not-examined-count]]).
 *   For the literal arm the load-bearing floor is stricter still: a control run
 *   that actually INVENTED a name, which is the only evidence the sweep reached
 *   a derive-from-text fixer rather than merely rewriting near one. For the
 *   widened collector it is stricter again: every binding KIND must be shown to
 *   have driven a fixer, since a count of 34,000 rewrites says nothing about
 *   whether any of them came from a parameter.
 * - Validity is `ts.createSourceFile(...).parseDiagnostics`, never a reparse:
 *   `typescript-estree` recovers from syntax errors and hands back a tree, so a
 *   corrupt rewrite would read as clean.
 * - A pair that fails to parse is SKIPPED, never scored. Treating an unreadable
 *   baseline as "no identifiers" reports the whole output as newly derived and
 *   manufactures findings out of harness artifacts.
 * - Every skip is COUNTED and asserted at zero — an unreadable baseline, a
 *   discarded perturbation, a rule that threw, a fatal parse from the linter.
 *   Skipping quietly is the mirror failure: `tsParser.parse` needs `range: true`
 *   or it throws on all JSX, and folding that null into "derived nothing"
 *   withheld 42% of the literal arm's derivations and 11 rules while every
 *   counter read clean (#1820). A counter placed past the skip it is meant to
 *   measure can only ever report zero.
 *
 * NON-VACUITY IS PER-RULE AS WELL AS PER-KIND (#1863). The four rule-dimension
 * floors — 70 of 80 rewritten, 5 of 7 suggesting, 28 of 38 deriving, 4 of 4
 * through suggestions — are global sums that a subset can leave in silence, so
 * each arm additionally accounts for its whole population: a rule is driven, or
 * it is named with a measured cause that fails when it goes stale.
 *
 * SCOPE, as a to-do rather than as coverage: the rename channel asks only
 * whether the output parses, so a suggestion that emits a legal-but-empty name
 * is caught by the literal channel or not at all; and the literal channel
 * compares the UNION of names invented across a report's suggestions, which
 * cannot attribute a collapse to one slot when a report offers several.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as ts from 'typescript';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  silentWithoutProgramRuleNames,
  ruleNameByIdentity,
  suggestionEditsOf,
  suggestionRuleNames,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * Inverting the corpus's identity map avoids a second `require` of the plugin
 * and keeps this guard keyed on the same rule objects the corpus matched
 * suites by, so a rule can never be registered here under a name the corpus
 * resolved differently.
 */
const ruleByName = new Map<string, { meta?: { fixable?: unknown } }>(
  [...ruleNameByIdentity].map(([rule, name]) => [
    name,
    rule as { meta?: { fixable?: unknown } },
  ]),
);

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of ruleByName) {
  linter.defineRule(`b/${name}`, rule as never);
}

/**
 * Names chosen so that each defeats a different derivation: `_` empties a
 * leading-underscore strip, `_1`/`_2fa` survive the strip but start with a
 * digit, and `$` survives every transform while satisfying no naming
 * convention, which is how an unsatisfiable report hides.
 */
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

/**
 * The second perturbation surface: the CONTENT of a string literal.
 *
 * Renaming bindings reaches #1816 but cannot reach #1811/#1813, whose trigger is
 * a key VALUE that normalization folds away (`useRouterState({ key: '---' })`).
 * Those derivations read a literal, not an identifier, so no rename expresses
 * their input and the gate that shipped for them could not fail on them.
 */
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
      ranges.push([node.range[0], node.range[1]]);
    }
  });
  return ranges;
};

/**
 * Every identifier in `code`, or null when it does not parse.
 *
 * Null rather than an empty set, and the callers must skip on it. Defaulting to
 * empty makes an unparsable BASELINE report every identifier in the output as
 * newly derived: `sourceType` defaults to `script`, so a fixture carrying an
 * `import` threw here, and a fixer that removes the import produced an output
 * that parsed — manufacturing a phantom derivation out of a harness artifact.
 *
 * `range: true` is load-bearing, not cosmetic. Without it `tsParser.parse`
 * throws `Cannot read properties of undefined (reading '0')` on ANY JSX input,
 * which this helper catches and reports as unreadable. That silently withheld
 * 1585 of 3164 invalid fixtures from the literal arm — 42% of its derivations
 * and 11 whole rules — while every counter still read clean.
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

const corpus = harvestFixtureCorpus();

/**
 * Fixtures this guard's probe cannot be applied to, named per (guard, rule)
 * with the reason.
 *
 * The probe renames a fixture's declared TypeScript identifiers to degenerate
 * ones and asks what the fixer derives from them. That needs TypeScript
 * bindings and a TypeScript AST.
 * A `package.json` body and a Markdown document have neither, so a case in
 * either language cannot pose the question. Skipping by LANGUAGE rather than by
 * parse failure is what keeps the skip honest: a Markdown fence is an empty
 * template literal, so several of those fixtures do parse as TypeScript and
 * would otherwise answer a TypeScript question by accident (#1860).
 *
 * A rule-global exclusion would be the wrong instrument — it would un-gate every
 * other arm these rules participate in (#1839) — so the entry is scoped to this
 * guard and asserted in both directions below.
 */
const NON_TYPESCRIPT_FIXTURES: Record<string, string> = {
  'enforce-typescript-markdown-code-blocks':
    'declares only Markdown documents, under ruleTesterMarkdown',
  'no-unpinned-dependencies':
    'declares only package.json bodies, under ruleTesterJson',
  'prefer-nullish-coalescing-boolean-props':
    'declares one package.json body under ruleTesterJson alongside its TypeScript fixtures',
};

let nonTypeScriptSkipped = 0;
const rulesWithNonTypeScriptFixtures = new Set<string>();

const invalidTypeScriptCases = (rule: string) =>
  (corpus.byRule.get(rule) || []).filter((testCase: FixtureCase) => {
    if (testCase.language !== 'ts') {
      nonTypeScriptSkipped++;
      rulesWithNonTypeScriptFixtures.add(rule);
      return false;
    }
    return testCase.bucket === 'invalid';
  });

const configFor = (rule: string, testCase: FixtureCase) =>
  ({
    parser: 'ts',
    parserOptions: parserOptionsFor(testCase),
    rules: {
      [`b/${rule}`]: testCase.options?.length
        ? ['error', ...testCase.options]
        : 'error',
    },
  } as never);

/**
 * One fixture, every binding, every degenerate name — through whichever channel
 * the rule can rewrite code with.
 *
 * Written as a function over an explicit `totals` so the planted controls below
 * drive the SAME code path the sweep does. A control that reimplements the walk
 * proves only that the control works.
 */
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

const sweep = (ruleNames: string[], channel: 'fix' | 'suggestion'): Totals => {
  const totals = emptyTotals();
  for (const rule of ruleNames) {
    for (const testCase of invalidTypeScriptCases(rule)) {
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      probeCase(
        rule,
        `b/${rule}`,
        testCase.origin,
        testCase.code,
        filename,
        configFor(rule, testCase),
        channel,
        totals,
      );
    }
  }
  return totals;
};

const totals = sweep(fixableRuleNames, 'fix');
const suggestionTotals = sweep(suggestingRuleNames, 'suggestion');

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
   * the floor that matters: it is the only number proving the corpus actually
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
 * Does `degenerate` carry nothing of the literal that `control` carried?
 *
 * The test is differential rather than a naming predicate, so it needs no
 * per-rule affix list and stays silent for a fixer that declines (a decline
 * invents no name at all).
 *
 * The question is whether the control's name survives DELETING the author's
 * content from the middle of it: `degenerate` splits into `head + tail` with
 * `control === head + <something non-empty> + tail`. Testing only
 * `startsWith` answers it for a prefix builder and silently says no for every
 * other affix position, which is the same defect with the constant part
 * somewhere else (#1819):
 *
 *   QUERY_KEY_${n}   QUERY_KEY_ORDINARYKEY  vs QUERY_KEY_  head/tail = pre/''
 *   ${n}_KEY         ORDINARYKEY_KEY        vs _KEY        head/tail = ''/suf
 *   USE_${n}_KEY     USE_ORDINARYKEY_KEY    vs USE__KEY    head/tail = pre/suf
 *
 * A derivation that merely differs (`QUERY_KEY_FALLBACK`) admits no such split
 * and stays silent.
 *
 * Names the two runs SHARE are dropped before pairing, and that is load-bearing
 * rather than an optimization. A name identical under both literals did not come
 * from the literal — it is invented from something else in the source, so it
 * belongs to neither side of the comparison. Left in, every short shared name
 * pairs with every longer shared one: `prefer-map-over-conditional-dispatch`
 * names its lookup table after the DISCRIMINANT and its keys after the case
 * tests, so both runs invent `{Record, RESULT_BY_RAW, a, b, c, d}` and `d`
 * still "collapses" against `Record` — `d` splits as `'' + 'd'`, and `Record`
 * both starts with `''` and ends with `d`. The existing "identical derivation"
 * control catches only the exact pair; this is that rule applied to the whole
 * set.
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

/**
 * The literal perturbation, over one channel.
 *
 * On the suggestion channel a run's derivation is the UNION of the names every
 * offered edit invents. Pairing edit-by-edit would need the two runs to offer
 * the same slots in the same order, which a rule that reports a different number
 * of times under a different literal does not do — and a mispaired slot invents
 * a collapse out of nothing.
 */
const sweepLiterals = (
  ruleNames: string[],
  channel: 'fix' | 'suggestion',
): LiteralTotals => {
  const literalTotals = emptyLiteralTotals();

  for (const rule of ruleNames) {
    for (const testCase of invalidTypeScriptCases(rule)) {
      const filename = testCase.filename ?? defaultFilenameFor(testCase);
      const jsx = filename.endsWith('x');
      const ranges = stringLiteralRangesOf(testCase.code, jsx);
      if (!ranges.length) continue;

      const config = configFor(rule, testCase);

      const runFix = (input: string) => {
        try {
          const result = linter.verifyAndFix(input, config, filename);
          return result.fixed && result.output !== input ? result.output : null;
        } catch (error) {
          literalTotals.crashes++;
          literalTotals.crashDetails.push(
            `${rule} threw on ${JSON.stringify(input)}: ${
              (error as Error).message
            }`,
          );
          return null;
        }
      };

      type ChannelRun = { invented: Set<string>; outputs: string[] } | null;

      /** Every name any suggestion invents, plus each edit's own output. */
      const runSuggestions = (
        input: string,
        withNames: boolean,
      ): ChannelRun => {
        let messages;
        try {
          messages = linter.verify(input, config, filename);
        } catch (error) {
          literalTotals.crashes++;
          literalTotals.crashDetails.push(
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
        for (const edit of suggestionEditsOf(input, messages, `b/${rule}`)) {
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
       * The names a run invents, and the outputs to check for parseability.
       *
       * `withNames` is not an optimization detail: reading identifiers costs two
       * parses per run, and the comparison is only defined when the CONTROL run
       * invented something, so a degenerate run past a silent control is asked
       * for outputs alone.
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
        const controlInput = spliceRange(
          testCase.code,
          range,
          `'${CONTROL_LITERAL}'`,
        );
        if (parseErrorCount(controlInput, filename) > 0) {
          literalTotals.discardedUnparsable++;
          continue;
        }
        const control = runChannel(controlInput, true);
        // An unreadable baseline is not a non-deriving one. Folding null to an
        // empty set routes it into the `!controlDerived.size` skip below, where
        // it becomes indistinguishable from a fixer that invented nothing —
        // and `skippedUnparsableComparison` never sees it, because that branch
        // sits past the skip. Counting it separately is what makes the arm's
        // reach measurable rather than merely assumed.
        if (!control) {
          literalTotals.unreadableControl++;
          continue;
        }
        if (control.invented.size) {
          literalTotals.derivationsObserved++;
          literalTotals.rulesDeriving.add(rule);
        }

        for (const value of DEGENERATE_LITERALS) {
          const input = spliceRange(testCase.code, range, `'${value}'`);
          if (input === testCase.code) continue;
          if (parseErrorCount(input, filename) > 0) {
            literalTotals.discardedUnparsable++;
            continue;
          }
          literalTotals.considered++;
          literalTotals.rulesConsidered.add(rule);
          const degenerate = runChannel(input, control.invented.size > 0);
          // This skip sits AHEAD of the parse oracle below, and on the fix
          // channel the only way a run becomes unreadable is that the fixer's
          // own output does not parse — the very `kind: 'parse'` finding the
          // oracle reports. The counter is therefore pinned at zero rather than
          // at a ceiling ("discards nothing silently"), so the first case that
          // would be swallowed here fails the suite instead.
          if (!degenerate) {
            literalTotals.skippedUnparsableComparison++;
            continue;
          }
          if (!degenerate.outputs.length) continue;
          literalTotals.rewritten++;
          literalTotals.rulesRewritten.add(rule);

          const broken = degenerate.outputs.find(
            (output) => parseErrorCount(output, filename) > 0,
          );
          if (broken) {
            literalTotals.findings.push({
              kind: 'parse',
              channel,
              rule,
              origin: testCase.origin,
              literal: value,
              derivedControl: '',
              derivedDegenerate: '',
              input,
              output: broken,
            });
            continue;
          }
          if (!control.invented.size) continue;

          const collapse = collapsedAgainst(
            control.invented,
            degenerate.invented,
          );
          if (collapse) {
            literalTotals.findings.push({
              kind: 'collapsed',
              channel,
              rule,
              origin: testCase.origin,
              literal: value,
              ...collapse,
              input,
              output: degenerate.outputs[0],
            });
          }
        }
      }
    }
  }
  return literalTotals;
};

const literalTotals = sweepLiterals(fixableRuleNames, 'fix');
const literalSuggestionTotals = sweepLiterals(
  suggestingRuleNames,
  'suggestion',
);

/* ------------------------- TWO-WAY DRIVE ACCOUNTING ----------------------- */

/**
 * Why a rule could never have been driven on degenerate input, read off the
 * counters above rather than asserted by hand.
 *
 * Ordered outermost precondition first, so the cause named is the FIRST that
 * failed: a rule with no TypeScript fixture is not also "declines", it was
 * never linted here at all.
 */
const UNDRIVEN_CAUSES = {
  noTsFixture:
    'declares no TypeScript `invalid` fixture, and both perturbations are TypeScript edits',
  noPerturbableSite:
    'has TypeScript fixtures, but none of them holds a binding (or a string literal) this probe can degenerate',
  silentOnDegenerateInput:
    'reports on none of the degenerate inputs built from its fixtures, so it offers nothing to inspect',
  declinesOnDegenerateInput:
    'reports on degenerate input yet rewrites none of it, so no output exists to read a derived name out of',
  inventsNoName:
    'rewrites degenerate input without introducing any identifier absent from it, so there is no derived name to collapse',
} as const;
type UndrivenCause = keyof typeof UNDRIVEN_CAUSES;

/**
 * Read straight off the corpus, NOT through `invalidTypeScriptCases`: that
 * helper increments the non-TypeScript skip counters as a side effect, and
 * calling it again would double every one of them.
 */
const hasTypeScriptFixture = (rule: string) =>
  (corpus.byRule.get(rule) || []).some(
    (testCase: FixtureCase) =>
      testCase.language === 'ts' && testCase.bucket === 'invalid',
  );

const bindingCauseOf =
  (measured: Totals) =>
  (rule: string): UndrivenCause | null => {
    if (measured.rulesRewritten.has(rule)) return null;
    if (!measured.rulesConsidered.has(rule)) {
      return hasTypeScriptFixture(rule) ? 'noPerturbableSite' : 'noTsFixture';
    }
    if (!measured.rulesReporting.has(rule)) return 'silentOnDegenerateInput';
    return 'declinesOnDegenerateInput';
  };

const literalCauseOf =
  (measured: LiteralTotals) =>
  (rule: string): UndrivenCause | null => {
    if (measured.rulesDeriving.has(rule)) return null;
    if (!measured.rulesConsidered.has(rule)) {
      return hasTypeScriptFixture(rule) ? 'noPerturbableSite' : 'noTsFixture';
    }
    if (!measured.rulesRewritten.has(rule)) return 'declinesOnDegenerateInput';
    return 'inventsNoName';
  };

const measuredUndriven = (
  ruleNames: string[],
  causeOf: (rule: string) => UndrivenCause | null,
): Record<string, UndrivenCause> =>
  Object.fromEntries(
    [...ruleNames]
      .sort()
      .map((rule) => [rule, causeOf(rule)] as const)
      .filter((entry): entry is readonly [string, UndrivenCause] => !!entry[1]),
  );

const measuredBindingUndriven = measuredUndriven(
  fixableRuleNames,
  bindingCauseOf(totals),
);
const measuredBindingSuggestionUndriven = measuredUndriven(
  suggestingRuleNames,
  bindingCauseOf(suggestionTotals),
);
const measuredLiteralUndriven = measuredUndriven(
  fixableRuleNames,
  literalCauseOf(literalTotals),
);
const measuredLiteralSuggestionUndriven = measuredUndriven(
  suggestingRuleNames,
  literalCauseOf(literalSuggestionTotals),
);

/**
 * Rules no degenerate BINDING rename ever made rewrite anything, each with the
 * measured cause.
 *
 * `rulesRewritten.size >= 70` against an actual 80 says the sweep drove some
 * fixers; it cannot say it drove a PARTICULAR one, and ten rules can fall out
 * of it in silence (#1863). Asserted as an exact map, so an unrecorded skip, a
 * stale entry and a changed cause all fail.
 */
const BINDING_UNDRIVEN: Record<string, UndrivenCause> = {
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'no-unpinned-dependencies': 'noTsFixture',
  // Its fixtures are bare JSX fragments; none of them declares a binding this
  // probe can rename, so no degenerate input was ever built for it.
  'prefer-fragment-shorthand': 'noPerturbableSite',
};

/** The suggestion channel of the same arm. SHIPS EMPTY: all seven are driven. */
const BINDING_SUGGESTION_UNDRIVEN: Record<string, UndrivenCause> = {};

/**
 * Rules that derive no name from a string LITERAL, each with the measured
 * cause.
 *
 * `inventsNoName` is neither a defect nor a decision: it is what a fixer that
 * only deletes, moves or re-spells existing text does, and the collapse this
 * arm hunts needs an invented name to collapse. `declinesOnDegenerateInput` and
 * `noPerturbableSite` are facts about the FIXTURES — a rule whose corpus holds
 * no string literal to degenerate, or whose fixer stops firing once one is
 * replaced — and neither is announced by any metadata, which is why each is
 * recorded rather than counted. `rulesDeriving.size >= 28` against an actual 38
 * lets ten rules go dark unheard, and a rule LEAVING this list has started
 * deriving a name from author content, which is exactly the population #1811
 * and #1813 came out of.
 */
const LITERAL_UNDRIVEN: Record<string, UndrivenCause> = {
  'enforce-typescript-markdown-code-blocks': 'noTsFixture',
  'no-unpinned-dependencies': 'noTsFixture',
  'class-methods-read-top-to-bottom': 'inventsNoName',
  'enforce-centralized-mock-firestore': 'inventsNoName',
  'enforce-dynamic-firebase-imports': 'inventsNoName',
  'enforce-early-destructuring': 'inventsNoName',
  'enforce-exported-function-types': 'inventsNoName',
  'enforce-fieldpath-syntax-in-docsetter': 'inventsNoName',
  'enforce-firestore-rules-get-access': 'declinesOnDegenerateInput',
  'enforce-id-capitalization': 'inventsNoName',
  'enforce-react-type-naming': 'noPerturbableSite',
  'enforce-unique-cursor-headers': 'declinesOnDegenerateInput',
  'flatten-push-calls': 'noPerturbableSite',
  'jsdoc-above-field': 'inventsNoName',
  'key-only-outermost-element': 'inventsNoName',
  'logical-top-to-bottom-grouping': 'inventsNoName',
  'no-curly-brackets-around-commented-properties': 'inventsNoName',
  'no-direct-function-state': 'inventsNoName',
  'no-empty-dependency-use-callbacks': 'inventsNoName',
  'no-entire-object-hook-deps': 'inventsNoName',
  'no-explicit-return-type': 'inventsNoName',
  'no-firestore-jest-mock': 'declinesOnDegenerateInput',
  'no-redundant-annotation-assertion': 'inventsNoName',
  'no-redundant-param-types': 'inventsNoName',
  'no-redundant-usecallback-wrapper': 'inventsNoName',
  'no-unnecessary-destructuring': 'noPerturbableSite',
  'no-unnecessary-destructuring-rename': 'inventsNoName',
  'no-unused-usestate': 'inventsNoName',
  'no-useless-fragment': 'inventsNoName',
  'no-useless-usememo-primitives': 'inventsNoName',
  // Inlines the memoized expression verbatim: every identifier it writes is
  // copied from the source, so no literal can be degenerate into a name (#1871).
  'no-usememo-for-pass-by-value': 'inventsNoName',
  'omit-index-html': 'declinesOnDegenerateInput',
  'prefer-block-comments-for-declarations': 'inventsNoName',
  'prefer-destructuring-no-class': 'inventsNoName',
  'prefer-fragment-shorthand': 'noPerturbableSite',
  'prefer-nullish-coalescing-boolean-props': 'inventsNoName',
  'prefer-params-over-parent-id': 'inventsNoName',
  'prefer-type-over-interface': 'inventsNoName',
  'require-hooks-default-params': 'inventsNoName',
  'require-image-optimized': 'inventsNoName',
  'sync-onwrite-name-func': 'inventsNoName',
  'use-custom-link': 'declinesOnDegenerateInput',
  'use-custom-memo': 'inventsNoName',
  'use-custom-router': 'declinesOnDegenerateInput',
  'vertically-group-related-functions': 'inventsNoName',
};

/** The suggestion channel of the literal arm. */
const LITERAL_SUGGESTION_UNDRIVEN: Record<string, UndrivenCause> = {
  'enforce-dynamic-firebase-imports': 'inventsNoName',
  'enforce-m3-sentence-case': 'declinesOnDegenerateInput',
  'enforce-safe-stringify': 'inventsNoName',
};

/** Binding shapes the widened collector must be shown to have DRIVEN a fixer with. */
const REQUIRED_KINDS = [
  'Variable',
  'Parameter',
  'ImportBinding',
  'FunctionName',
  'ClassName',
  'Type',
  'Member',
] as const;

const describeFindings = (findings: Finding[]) => {
  const byRule = [...new Set(findings.map((finding) => finding.rule))];
  const header = byRule.length
    ? `${findings.length} finding(s) across ${
        byRule.length
      } rule(s): ${byRule.join(', ')}\n`
    : '';
  return (
    header +
    findings
      .slice(0, 20)
      .map(
        (finding) =>
          `${finding.channel} ${finding.rule} (${finding.origin}) renaming ${finding.kind} ` +
          `${finding.from} -> ${finding.to}, ${finding.errors} parse error(s)` +
          `${
            finding.desc ? ` via suggestion "${finding.desc}"` : ''
          }\n  IN : ${JSON.stringify(finding.input)}\n  OUT: ${JSON.stringify(
            finding.output,
          )}`,
      )
      .join('\n')
  );
};

const describeLiteralFindings = (findings: LiteralFinding[]) => {
  // Every affected rule is named before the truncated examples: slicing to the
  // first 20 findings otherwise hides whole rules behind whichever one the
  // sweep reached first, which is the difference between a report that says
  // what to fix and one that says only where to start looking.
  const byRule = [...new Set(findings.map((finding) => finding.rule))];
  const header = byRule.length
    ? `${findings.length} finding(s) across ${
        byRule.length
      } rule(s): ${byRule.join(', ')}\n`
    : '';
  return (
    header +
    findings
      .slice(0, 20)
      .map((finding) =>
        finding.kind === 'parse'
          ? `${finding.channel} ${finding.rule} (${
              finding.origin
            }) literal ${JSON.stringify(
              finding.literal,
            )} -> output does not parse\n  OUT: ${JSON.stringify(
              finding.output,
            )}`
          : `${finding.channel} ${finding.rule} (${
              finding.origin
            }) literal ${JSON.stringify(finding.literal)} derived ${
              finding.derivedDegenerate
            } where a real value derives ${
              finding.derivedControl
            }\n  IN : ${JSON.stringify(finding.input)}\n  OUT: ${JSON.stringify(
              finding.output,
            )}`,
      )
      .join('\n')
  );
};

describe('degenerate-identifier fix closure', () => {
  /**
   * The non-TypeScript skip, both ways. An unlisted rule whose fixtures get
   * skipped is a silent loss of coverage; a listed rule whose fixtures stop
   * being skipped is a dead entry that would absorb the next one. The count
   * floor keeps the set equality from passing vacuously.
   */
  it('skips only the named non-TypeScript fixtures', () => {
    expect([...rulesWithNonTypeScriptFixtures].sort()).toEqual(
      Object.keys(NON_TYPESCRIPT_FIXTURES).sort(),
    );
    expect(nonTypeScriptSkipped).toBeGreaterThan(0);
  });

  it('harvested a corpus at all', () => {
    expect(corpus.failures).toEqual([]);
    expect(corpus.filesLoaded).toBeGreaterThan(250);
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(70);
    expect(suggestingRuleNames.length).toBeGreaterThanOrEqual(7);
  });

  /**
   * The load-bearing floor. `considered` counts perturbations attempted, which
   * stays high even if every fixer declines; only `rewritten` proves a fixer
   * actually ran on degenerate input and therefore that a defect COULD have
   * been observed.
   */
  it('actually drove fixers with degenerate input', () => {
    // Naming the rules this sweep never drove keeps its reach honest: they are
    // unexercised, not certified clean, and a reader who takes the headline
    // count for full coverage would over-trust the gate.
    const untouched = fixableRuleNames.filter(
      (name) => !totals.rulesRewritten.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-identifier] ${totals.bindings} binding(s) over ${totals.fixtures} fixture(s); ` +
        `considered ${totals.considered}, rewritten ${totals.rewritten} ` +
        `across ${totals.rulesRewritten.size} rule(s)\n` +
        `  by binding kind: ${[...totals.kindsRewritten]
          .sort((a, b) => b[1] - a[1])
          .map(([kind, count]) => `${kind}=${count}`)
          .join(', ')}\n` +
        `  discarded unparsable ${totals.discardedUnparsable}, unrenamable ${totals.discardedUnrenamable}, ` +
        `duplicate ${totals.discardedDuplicate}, unparsable fixtures ${totals.unparsableFixture}\n` +
        `  no fixer ever ran on degenerate input for ${
          untouched.length
        } rule(s): ${untouched.join(', ') || '(none)'}`,
    );
    expect(totals.bindings).toBeGreaterThan(10000); // measured 20601
    expect(totals.considered).toBeGreaterThan(40000); // measured 79355
    expect(totals.rewritten).toBeGreaterThan(25000); // measured 56009
    /**
     * The denominator the three above are drawn from. Floored separately
     * because a harness that lost most of the corpus would still clear a
     * per-binding count while walking a fraction of the fixtures.
     */
    expect(totals.fixtures).toBeGreaterThan(5900); // measured 5991
    expect(totals.rulesRewritten.size).toBeGreaterThanOrEqual(70);
  });

  /**
   * Per rule, which is the unit the floor above cannot express: an unlisted
   * rule that stops being driven fails as an unrecorded skip, and a listed rule
   * that starts being driven fails as a stale entry, so an exemption cannot
   * outlive its reason (#1839).
   */
  it('accounts for every fixable rule no degenerate binding could drive', () => {
    expect(measuredBindingUndriven).toEqual(BINDING_UNDRIVEN);
  });

  it('accounts for every suggesting rule no degenerate binding could drive', () => {
    expect(measuredBindingSuggestionUndriven).toEqual(
      BINDING_SUGGESTION_UNDRIVEN,
    );
  });

  it('explains every cause it records, on a rule it actually probes', () => {
    const causes = [
      ...Object.values(BINDING_UNDRIVEN),
      ...Object.values(BINDING_SUGGESTION_UNDRIVEN),
      ...Object.values(LITERAL_UNDRIVEN),
      ...Object.values(LITERAL_SUGGESTION_UNDRIVEN),
    ];
    expect(causes.filter((cause) => !UNDRIVEN_CAUSES[cause])).toEqual([]);
    // An entry naming a rule outside the arm's own population is an exemption
    // nothing can retire, so it would absorb the next absence forever.
    expect(
      [
        ...Object.keys(BINDING_UNDRIVEN),
        ...Object.keys(LITERAL_UNDRIVEN),
      ].filter((rule) => !fixableRuleNames.includes(rule)),
    ).toEqual([]);
    expect(
      [
        ...Object.keys(BINDING_SUGGESTION_UNDRIVEN),
        ...Object.keys(LITERAL_SUGGESTION_UNDRIVEN),
      ].filter((rule) => !suggestingRuleNames.includes(rule)),
    ).toEqual([]);
  });

  it.each(
    [...fixableRuleNames].sort().filter((rule) => !(rule in BINDING_UNDRIVEN)),
  )('drove %s with a degenerate binding name', (rule) => {
    expect(totals.rulesRewritten.has(rule)).toBe(true);
  });

  /**
   * The widening's own floor. A rewrite count says nothing about WHICH binding
   * shape produced it: the collector that shipped saw three declaration types
   * and drove 14,552 rewrites while never degenerating a parameter, an import
   * or a class member (#1862). Asserting per-kind is what makes a future
   * narrowing of the scope walk fail instead of merely shrinking a number.
   */
  it('drove fixers from every binding shape, not just declarators', () => {
    const missing = REQUIRED_KINDS.filter(
      (kind) => !totals.kindsRewritten.get(kind),
    );
    expect(missing).toEqual([]);
    for (const kind of REQUIRED_KINDS) {
      expect(totals.kindsRewritten.get(kind)).toBeGreaterThan(50);
    }
  });

  /**
   * Every way a perturbation can fail to be scored, asserted at zero.
   *
   * A discarded rename is a bug in this harness, not a finding about a fixer,
   * and a rule that THROWS is a defect worse than the one under test — both
   * were silently swallowed by a bare `catch { continue }` before. The details
   * ride along in the failure message so triage does not start from a number.
   */
  it('discards nothing silently', () => {
    expect(totals.crashDetails.slice(0, 5).join('\n')).toBe('');
    expect(totals.crashes).toBe(0);
    expect(totals.discardDetails.slice(0, 5).join('\n')).toBe('');
    expect(totals.discardedUnparsable).toBe(0);
    expect(totals.discardedUnrenamable).toBe(0);
    expect(totals.unparsableFixture).toBe(0);
    /**
     * A FLOOR rather than a pinned zero, unlike its three siblings above. Those
     * are defect signatures and any occurrence is a finding; a duplicate
     * discard is the deliberate, expected outcome of two derivations landing on
     * one name, so the honest gate is that the deduplication still happens.
     */
    expect(totals.discardedDuplicate).toBeGreaterThan(2900); // measured 3016
    expect(totals.fatalDetails.slice(0, 5).join('\n')).toBe('');
    expect(totals.fatals).toBe(0);
    expect(literalTotals.crashDetails.slice(0, 5).join('\n')).toBe('');
    expect(literalTotals.crashes).toBe(0);
    expect(suggestionTotals.crashDetails.slice(0, 5).join('\n')).toBe('');
    expect(suggestionTotals.crashes).toBe(0);
    expect(suggestionTotals.discardDetails.slice(0, 5).join('\n')).toBe('');
    expect(suggestionTotals.discardedUnparsable).toBe(0);
    expect(suggestionTotals.discardedUnrenamable).toBe(0);
    expect(suggestionTotals.fatalDetails.slice(0, 5).join('\n')).toBe('');
    expect(suggestionTotals.fatals).toBe(0);
    expect(literalSuggestionTotals.crashDetails.slice(0, 5).join('\n')).toBe(
      '',
    );
    expect(literalSuggestionTotals.crashes).toBe(0);
    /**
     * The literal arm's two discard channels, on both of its channels. Each was
     * printed into the diagnostic below and read by no `expect`, which is the
     * state a number has to be in to move unnoticed (#2222, #2225).
     *
     * `skippedUnparsableComparison` is the load-bearing one, and it is pinned at
     * ZERO rather than at a ceiling for a structural reason: it fires when a
     * degenerate run's names cannot be read, which for the fix channel means the
     * FIXER'S OWN OUTPUT does not parse — exactly the `kind: 'parse'` finding
     * this arm exists to report. The skip sits ahead of that report, so a
     * non-zero value here is a finding the arm discarded rather than a case it
     * declined to judge. The cross-paired twin holds the same counters at zero
     * over a superset of these pairs.
     */
    expect(literalTotals.discardedUnparsable).toBe(0);
    expect(literalTotals.skippedUnparsableComparison).toBe(0);
    expect(literalSuggestionTotals.discardedUnparsable).toBe(0);
    expect(literalSuggestionTotals.skippedUnparsableComparison).toBe(0);
  });

  it('no fixer emits source that fails to parse', () => {
    expect(describeFindings(totals.findings)).toBe('');
    expect(totals.findings).toEqual([]);
  });

  /**
   * The suggestion channel's floor. `--fix` never applies a suggestion, so a
   * sweep that drives `verifyAndFix` alone leaves every edit these rules offer
   * unexamined even though accepting one writes the same file to disk (#1862).
   */
  it('actually drove suggestions with degenerate input', () => {
    const untouched = suggestingRuleNames.filter(
      (name) => !suggestionTotals.rulesRewritten.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-suggestion] considered ${suggestionTotals.considered}, ` +
        `offering runs ${suggestionTotals.rewritten}, edits ${suggestionTotals.suggestionEdits} ` +
        `across ${suggestionTotals.rulesRewritten.size} rule(s)\n` +
        `  never offered a suggestion on degenerate input (${
          untouched.length
        }): ${untouched.join(', ') || '(none)'}`,
    );
    expect(suggestionTotals.considered).toBeGreaterThan(2000);
    expect(suggestionTotals.suggestionEdits).toBeGreaterThan(1500);
    expect(suggestionTotals.rulesRewritten.size).toBeGreaterThanOrEqual(5);
  });

  it('no accepted suggestion emits source that fails to parse', () => {
    expect(describeFindings(suggestionTotals.findings)).toBe('');
    expect(suggestionTotals.findings).toEqual([]);
  });

  /**
   * Positive control: a fixer that renames to the derived text WITHOUT checking
   * it is an identifier must be caught. This is the #1816 defect reconstructed
   * as a standalone rule, so the guard cannot pass by never looking.
   */
  it('catches a planted fixer that renames to a non-identifier', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { rename: 'rename' },
      },
      create(context: {
        report: (descriptor: unknown) => void;
        getSourceCode: () => unknown;
      }) {
        return {
          VariableDeclarator(node: {
            id: { type: string; name: string; range: [number, number] };
          }) {
            if (node.id.type !== 'Identifier') return;
            // The #1816 bug exactly: strip a leading underscore, apply blind.
            const derived = node.id.name.toUpperCase().replace(/^_/, '');
            if (derived === node.id.name) return;
            context.report({
              node: node.id,
              messageId: 'rename',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) => fixer.replaceTextRange(node.id.range, derived),
            });
          },
        };
      },
    };
    linter.defineRule('planted/degenerate', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/degenerate': 'error' },
    } as never;
    const output = linter.verifyAndFix(
      'const _ = { a: 1 };\n',
      config,
      't.ts',
    ).output;
    expect(output).toContain('const  =');
    expect(parseErrorCount(output, 't.ts')).toBeGreaterThan(0);
  });

  /**
   * The widening, end to end, through the sweep's own machinery.
   *
   * The planted rule derives its replacement from a PARAMETER — a shape the
   * shipped collector could not see — so this fails on the collector #1862
   * describes no matter how many rewrites the rest of the corpus drives. Driving
   * `probeCase` rather than a hand-rolled rename is the point: it proves the
   * path from "collect a binding" to "record a finding" is connected.
   */
  it('catches a planted fixer that derives a broken name from a parameter', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { rename: 'rename' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          'FunctionDeclaration > Identifier.params'(node: {
            name: string;
            range: [number, number];
          }) {
            const derived = node.name.replace(/^_/, '');
            if (derived === node.name) return;
            context.report({
              node,
              messageId: 'rename',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) => fixer.replaceTextRange(node.range, derived),
            });
          },
        };
      },
    };
    linter.defineRule('planted/parameter', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/parameter': 'error' },
    } as never;
    const plantedTotals = emptyTotals();
    probeCase(
      'planted/parameter',
      'planted/parameter',
      'planted',
      'function render(value) {\n  return value;\n}\n',
      't.ts',
      config,
      'fix',
      plantedTotals,
    );
    expect(plantedTotals.discardedUnparsable).toBe(0);
    expect(plantedTotals.findings.map((finding) => finding.kind)).toContain(
      'Parameter',
    );
    // `_1` strips to `1`, which is not an identifier; `$` survives untouched
    // and must NOT be reported, or the control would pass by flagging every
    // rewrite.
    const reported = plantedTotals.findings.map((finding) => finding.to);
    expect(reported).toEqual(expect.arrayContaining(['_1', '_2fa']));
    expect(reported).not.toContain('$');
  });

  /**
   * The same end-to-end control for the suggestion channel, where the edit is
   * never applied by `--fix` and so is invisible to every other sweep.
   */
  it('catches a planted suggestion that renames to a non-identifier', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        schema: [],
        messages: { rename: 'rename', fixIt: 'fixIt' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          'FunctionDeclaration > Identifier.params'(node: {
            name: string;
            range: [number, number];
          }) {
            const derived = node.name.replace(/^_/, '');
            if (derived === node.name) return;
            context.report({
              node,
              messageId: 'rename',
              suggest: [
                {
                  messageId: 'fixIt',
                  fix: (fixer: {
                    replaceTextRange: (
                      range: [number, number],
                      text: string,
                    ) => unknown;
                  }) => fixer.replaceTextRange(node.range, derived),
                },
              ],
            });
          },
        };
      },
    };
    linter.defineRule('planted/parameter-suggestion', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/parameter-suggestion': 'error' },
    } as never;
    const plantedTotals = emptyTotals();
    probeCase(
      'planted/parameter-suggestion',
      'planted/parameter-suggestion',
      'planted',
      'function render(value) {\n  return value;\n}\n',
      't.ts',
      config,
      'suggestion',
      plantedTotals,
    );
    expect(plantedTotals.suggestionEdits).toBeGreaterThan(0);
    expect(plantedTotals.findings.map((finding) => finding.to)).toEqual(
      expect.arrayContaining(['_1', '_2fa']),
    );
    expect(plantedTotals.findings.map((finding) => finding.to)).not.toContain(
      '$',
    );
  });

  /**
   * Negative control: a well-formed rename must NOT be reported, or the guard
   * would pass by calling everything broken.
   */
  it('does not flag a rename that yields a valid identifier', () => {
    expect(parseErrorCount('const PRIVATE_THING = { a: 1 };\n', 't.ts')).toBe(
      0,
    );
    expect(parseErrorCount('const _1 = { a: 1 };\n', 't.ts')).toBe(0);
  });

  /**
   * The collector, shape by shape. This is the assertion #1862 fails: the
   * shipped collector answered with `{value, Widget, Klass}` and nothing else,
   * so a parameter, a destructured name, an import, a type, an enum member and
   * a catch clause were never degenerated in any fixture.
   */
  it('collects every binding shape, not just three declaration types', () => {
    const source = [
      "import Default, { named as aliased, plain } from 'mod';",
      "import * as namespace from 'other';",
      'type Alias<TParam> = TParam;',
      'interface Shape { member: string }',
      'enum Level { Low }',
      'const value = 1;',
      'const { destructured, defaulted = 2, ...rest } = value;',
      'const [first, ...tail] = [1, 2];',
      'function Widget(param, { deep }) { return param + deep; }',
      'class Klass { field = 1; method(inner) { return inner; } }',
      'try { value; } catch (caught) { caught; }',
      'namespace Space { export const inside = 1; }',
    ].join('\n');
    const collected = declaredBindingsOf(source, false);
    expect(collected).not.toBeNull();
    expect(collected?.unrenamable).toBe(0);
    const names = (collected as Bindings).bindings.map(
      (binding) => binding.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'Default',
        'aliased',
        'plain',
        'namespace',
        'Alias',
        'TParam',
        'Shape',
        'member',
        'Level',
        'value',
        'destructured',
        'defaulted',
        'rest',
        'first',
        'tail',
        'Widget',
        'param',
        'deep',
        'Klass',
        'field',
        'method',
        'inner',
        'caught',
        'Space',
        'inside',
      ]),
    );
    const kinds = new Set(
      (collected as Bindings).bindings.map((binding) => binding.kind),
    );
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining([
        'CatchClause',
        'ClassName',
        'FunctionName',
        'ImportBinding',
        'Member',
        'Parameter',
        'TSEnumName',
        'TSModuleName',
        'Type',
        'Variable',
      ]),
    );
  });

  /**
   * The rename must produce a program, not merely a string. Each case here is a
   * spelling where overwriting the identifier's own token silently writes a
   * DIFFERENT fixture: a renamed property read, a renamed module contract, a
   * deleted type annotation, an unmatched JSX tag.
   */
  it('renames every binding site and expands shorthand', () => {
    const renameOf = (code: string, name: string, jsx = false) => {
      const collected = declaredBindingsOf(code, jsx) as Bindings;
      const binding = collected.bindings.find((entry) => entry.name === name);
      expect(binding).toBeDefined();
      return renameBinding(code, binding as Binding, '_1');
    };

    // A reference moves with its declaration, or the input is broken rather
    // than degenerate.
    expect(renameOf('const value = 1;\nuse(value);\n', 'value')).toBe(
      'const _1 = 1;\nuse(_1);\n',
    );
    // Shorthand destructuring keeps reading the same property.
    expect(renameOf('const { key } = source;\nuse(key);\n', 'key')).toBe(
      'const { key: _1 } = source;\nuse(_1);\n',
    );
    expect(renameOf('const { key = 2 } = source;\n', 'key')).toBe(
      'const { key: _1 = 2 } = source;\n',
    );
    // An import keeps importing the same symbol.
    expect(renameOf("import { Icon } from 'mui';\nuse(Icon);\n", 'Icon')).toBe(
      "import { Icon as _1 } from 'mui';\nuse(_1);\n",
    );
    // An export keeps exporting the same name.
    expect(renameOf('const out = 1;\nexport { out };\n', 'out')).toBe(
      'const _1 = 1;\nexport { _1 as out };\n',
    );
    // A type annotation survives: an `Identifier` range spans it (#1351).
    expect(renameOf('let annotated: SomeType;\n', 'annotated')).toBe(
      'let _1: SomeType;\n',
    );
    // A JSX closing tag pairs with its opening tag.
    expect(
      renameOf(
        'const Card = () => <div />;\nconst App = () => <Card></Card>;\n',
        'Card',
        true,
      ),
    ).toBe('const _1 = () => <div />;\nconst App = () => <_1></_1>;\n');
    // ...and an intrinsic element with the same name as a variable does NOT.
    // Renaming `</button>` alone leaves a mismatched pair that cannot parse,
    // which discards the perturbation instead of probing the fixer.
    const intrinsic = renameOf(
      'const button = 1;\nconst App = () => <button>{button}</button>;\n',
      'button',
      true,
    );
    expect(intrinsic).toBe(
      'const _1 = 1;\nconst App = () => <button>{_1}</button>;\n',
    );
    expect(parseErrorCount(intrinsic, 'file.tsx')).toBe(0);
    // A class member moves with every property-position use of its name.
    expect(
      renameOf(
        'class Klass { field = 1; read() { return this.field; } }\n',
        'field',
      ),
    ).toBe('class Klass { _1 = 1; read() { return this._1; } }\n');
  });

  /**
   * The literal arm's floor. `derivationsObserved` is the load-bearing count:
   * `considered` stays high even if no fixer reads a literal, and `rewritten`
   * stays high for fixers that rewrite something unrelated to the value. Only a
   * control run that invented a NAME proves the corpus reached the kind of
   * derivation #1811/#1813 live in.
   */
  it('actually drove name-from-literal derivations', () => {
    const notDeriving = fixableRuleNames.filter(
      (name) => !literalTotals.rulesDeriving.has(name),
    );
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-literal] considered ${literalTotals.considered}, rewritten ${literalTotals.rewritten}, ` +
        `derivations ${literalTotals.derivationsObserved} across ${literalTotals.rulesDeriving.size} rule(s); ` +
        `discarded unparsable ${literalTotals.discardedUnparsable}, ` +
        `skipped unreadable comparisons ${literalTotals.skippedUnparsableComparison}, ` +
        `unreadable controls ${literalTotals.unreadableControl}\n` +
        `  deriving rules (${literalTotals.rulesDeriving.size}): ${
          [...literalTotals.rulesDeriving].join(', ') || '(none)'
        }\n` +
        // Naming the complement keeps the arm's reach quoted as ASSERTED rather
        // than examined. The deriving count alone reads as "20 rules checked"
        // when it means "20 rules where a name-from-literal derivation was
        // observed at all" — the rest are unexercised, not certified clean.
        `  never observed deriving a name from a literal (${
          notDeriving.length
        }): ${notDeriving.join(', ') || '(none)'}`,
    );
    // A baseline the harness cannot read withholds its whole fixture from the
    // arm while every other counter still reads clean, so this is asserted at
    // zero rather than merely reported.
    expect(literalTotals.unreadableControl).toBe(0);
    expect(literalTotals.considered).toBeGreaterThan(1000);
    expect(literalTotals.rewritten).toBeGreaterThan(100);
    expect(literalTotals.derivationsObserved).toBeGreaterThan(800);
    expect(literalTotals.rulesDeriving.size).toBeGreaterThanOrEqual(28);
  });

  /** The literal arm, per rule, both directions. */
  it('accounts for every fixable rule that derives no name from a literal', () => {
    expect(measuredLiteralUndriven).toEqual(LITERAL_UNDRIVEN);
  });

  it.each(
    [...fixableRuleNames].sort().filter((rule) => !(rule in LITERAL_UNDRIVEN)),
  )('derived a name from a literal for %s', (rule) => {
    expect(literalTotals.rulesDeriving.has(rule)).toBe(true);
  });

  /**
   * The same floor for the suggestion channel. A run that invents no name at
   * all cannot show a collapse, so the deriving count is the only evidence the
   * comparison had anything to compare.
   */
  it('actually drove name-from-literal derivations through suggestions', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[degenerate-literal-suggestion] considered ${literalSuggestionTotals.considered}, ` +
        `rewritten ${literalSuggestionTotals.rewritten}, ` +
        `derivations ${literalSuggestionTotals.derivationsObserved} across ` +
        `${literalSuggestionTotals.rulesDeriving.size} rule(s); ` +
        `discarded unparsable ${literalSuggestionTotals.discardedUnparsable}, ` +
        `skipped unreadable comparisons ${literalSuggestionTotals.skippedUnparsableComparison}, ` +
        `unreadable controls ${literalSuggestionTotals.unreadableControl}\n` +
        `  deriving rules: ${
          [...literalSuggestionTotals.rulesDeriving].join(', ') || '(none)'
        }`,
    );
    expect(literalSuggestionTotals.unreadableControl).toBe(0);
    expect(literalSuggestionTotals.considered).toBeGreaterThan(500);
    expect(literalSuggestionTotals.derivationsObserved).toBeGreaterThan(100);
    expect(literalSuggestionTotals.rulesDeriving.size).toBeGreaterThanOrEqual(
      4,
    );
  });

  /** And the suggestion channel of the literal arm, per rule, both directions. */
  it('accounts for every suggesting rule that derives no name from a literal', () => {
    expect(measuredLiteralSuggestionUndriven).toEqual(
      LITERAL_SUGGESTION_UNDRIVEN,
    );
  });

  /**
   * Pins the parser option the reach depends on. The floors above would also
   * drop if `range` regressed, but they would read as "the corpus shrank"; this
   * names the cause, so the next reader is not left bisecting counters.
   */
  it('reads identifiers out of JSX, not just plain TypeScript', () => {
    const jsxSource =
      'const List = ({ items }) => (\n' +
      '  <ul>{items.map((item) => (<li key={item.id}>{item.name}</li>))}</ul>\n' +
      ');\n';
    const names = identifierNamesOf(jsxSource, true);
    expect(names).not.toBeNull();
    expect([...(names as Set<string>)]).toEqual(
      expect.arrayContaining(['List', 'items', 'item']),
    );
  });

  it('no fixer derives a name that collapses to its bare affix', () => {
    expect(describeLiteralFindings(literalTotals.findings)).toBe('');
    expect(literalTotals.findings).toEqual([]);
  });

  it('no suggestion derives a name that collapses to its bare affix', () => {
    expect(describeLiteralFindings(literalSuggestionTotals.findings)).toBe('');
    expect(literalSuggestionTotals.findings).toEqual([]);
  });

  /**
   * Positive control: #1811/#1813 rebuilt as a standalone rule. Without it the
   * literal arm could pass by never comparing anything, exactly as the shipped
   * gate passed while both defects were live.
   */
  it('catches a planted fixer whose derived name collapses to its prefix', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { key: 'key' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          Literal(node: {
            value: unknown;
            range: [number, number];
            parent?: { type?: string };
          }) {
            if (typeof node.value !== 'string') return;
            if (node.parent?.type !== 'Property') return;
            // The #1811/#1813 bug exactly: prefix unconditionally.
            const normalized = node.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
            context.report({
              node,
              messageId: 'key',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) =>
                fixer.replaceTextRange(node.range, `QUERY_KEY_${normalized}`),
            });
          },
        };
      },
    };
    linter.defineRule('planted/collapse', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/collapse': 'error' },
    } as never;

    const fixOf = (literal: string) =>
      linter.verifyAndFix(`use({ key: '${literal}' });\n`, config, 't.ts')
        .output;

    const controlOut = fixOf(CONTROL_LITERAL);
    const degenerateOut = fixOf('---');
    expect(controlOut).toContain('QUERY_KEY_ORDINARYKEY');
    expect(degenerateOut).toContain('QUERY_KEY_');

    const newNames = (before: string, after: string) => {
      const baseline = identifierNamesOf(before, false);
      const derived = identifierNamesOf(after, false);
      // Both sides are hand-written and must parse. Folding a null into an
      // empty set instead would let the control pass on a pair it could not
      // read, which is the failure this arm exists to prevent (#1820).
      expect(baseline).not.toBeNull();
      expect(derived).not.toBeNull();
      return new Set(
        [...(derived as Set<string>)].filter(
          (name) => !(baseline as Set<string>).has(name),
        ),
      );
    };
    const collapse = collapsedAgainst(
      newNames(`use({ key: '${CONTROL_LITERAL}' });\n`, controlOut),
      newNames("use({ key: '---' });\n", degenerateOut),
    );
    expect(collapse).toEqual({
      derivedDegenerate: 'QUERY_KEY_',
      derivedControl: 'QUERY_KEY_ORDINARYKEY',
    });
  });

  /**
   * Negative control: a fixer that declines on a degenerate value invents no
   * name, so there is nothing to collapse and the arm must stay silent. Without
   * this a detector that flagged every decline would look like it worked.
   */
  it('does not flag a fixer that declines on a degenerate value', () => {
    expect(
      collapsedAgainst(new Set(['QUERY_KEY_ORDINARYKEY']), new Set()),
    ).toBeNull();
    // Nor a derivation that is merely different, rather than a bare prefix.
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_FALLBACK']),
      ),
    ).toBeNull();
    // Nor an identical derivation, which carries the content unchanged.
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_ORDINARYKEY']),
      ),
    ).toBeNull();
    // Nor a fixer whose invented names are the SAME set under both literals,
    // which means none of them was derived from the literal. Pairing across the
    // shared set flagged `prefer-map-over-conditional-dispatch` on output that
    // is byte-identical under the control and the degenerate value (#1859).
    const shared = () => new Set(['Record', 'RESULT_BY_RAW', 'a', 'd']);
    expect(collapsedAgainst(shared(), shared())).toBeNull();
    // A genuine collapse alongside shared names is still caught, so the filter
    // suppresses the pairing artifact and not the defect.
    expect(
      collapsedAgainst(
        new Set(['Record', 'd', 'QUERY_KEY_ORDINARYKEY']),
        new Set(['Record', 'd', 'QUERY_KEY_']),
      ),
    ).toEqual({
      derivedDegenerate: 'QUERY_KEY_',
      derivedControl: 'QUERY_KEY_ORDINARYKEY',
    });
  });

  /**
   * The affix position is incidental to the defect but was load-bearing in the
   * first predicate, which tested `startsWith` alone and so answered "clean" for
   * every builder that puts its constant anywhere but the front (#1819).
   */
  it('catches a collapsed derivation at any affix position', () => {
    expect(
      collapsedAgainst(
        new Set(['QUERY_KEY_ORDINARYKEY']),
        new Set(['QUERY_KEY_']),
      ),
    ).toEqual({
      derivedDegenerate: 'QUERY_KEY_',
      derivedControl: 'QUERY_KEY_ORDINARYKEY',
    });
    expect(
      collapsedAgainst(new Set(['ORDINARYKEY_KEY']), new Set(['_KEY'])),
    ).toEqual({
      derivedDegenerate: '_KEY',
      derivedControl: 'ORDINARYKEY_KEY',
    });
    expect(
      collapsedAgainst(new Set(['USE_ORDINARYKEY_KEY']), new Set(['USE__KEY'])),
    ).toEqual({
      derivedDegenerate: 'USE__KEY',
      derivedControl: 'USE_ORDINARYKEY_KEY',
    });
  });

  /**
   * End-to-end for the affix positions the predicate unit test asserts, so the
   * arm is shown to catch a real fixer emitting a suffix-built name and not just
   * to compare two hand-written sets.
   */
  it('catches a planted suffix-building fixer end to end', () => {
    const planted = {
      meta: {
        type: 'suggestion',
        fixable: 'code',
        schema: [],
        messages: { key: 'key' },
      },
      create(context: { report: (descriptor: unknown) => void }) {
        return {
          Literal(node: {
            value: unknown;
            range: [number, number];
            parent?: { type?: string };
          }) {
            if (typeof node.value !== 'string') return;
            if (node.parent?.type !== 'Property') return;
            const normalized = node.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
            context.report({
              node,
              messageId: 'key',
              fix: (fixer: {
                replaceTextRange: (
                  range: [number, number],
                  text: string,
                ) => unknown;
              }) => fixer.replaceTextRange(node.range, `${normalized}_KEY`),
            });
          },
        };
      },
    };
    linter.defineRule('planted/suffix', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/suffix': 'error' },
    } as never;

    const sourceOf = (literal: string) => `use({ key: '${literal}' });\n`;
    const fixOf = (literal: string) =>
      linter.verifyAndFix(sourceOf(literal), config, 't.ts').output;

    expect(fixOf(CONTROL_LITERAL)).toContain('ORDINARYKEY_KEY');
    expect(fixOf('---')).toContain('_KEY');

    const collapse = collapsedAgainst(
      derivedNames(sourceOf(CONTROL_LITERAL), fixOf(CONTROL_LITERAL), false) ??
        new Set<string>(),
      derivedNames(sourceOf('---'), fixOf('---'), false) ?? new Set<string>(),
    );
    expect(collapse).toEqual({
      derivedDegenerate: '_KEY',
      derivedControl: 'ORDINARYKEY_KEY',
    });
  });
});
