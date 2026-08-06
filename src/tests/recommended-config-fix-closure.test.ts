import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the guard only
// needs the plugin object shape (rules, configs), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<
    string,
    { meta?: { fixable?: string; hasSuggestions?: boolean } }
  >;
  configs: { recommended: { rules: Record<string, unknown> } };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * The recommended config must be closed under its own autofixes: running
 * `eslint --fix` with it must never leave behind a violation of another
 * recommended rule.
 *
 * A sweep over a consumer mainline (#1477) found 289 fix-induced violations,
 * every one of them NON-fixable — so `--fix` converted machine-resolvable work
 * into manual work. Nothing in the suite could see that. The autofix corruption
 * sweep only asks whether a *fixable* report survives the fix (it filters
 * `m.fix`), and ESLint's multi-pass fixing silently absorbs any newly-introduced
 * *fixable* violation, so a newly-introduced *unfixable* one is never counted.
 *
 * Method, matching that sweep: fix a snippet with one rule, then lint the
 * snippet and the fixed output with the SAME full recommended rule set and
 * fixing disabled. Any rule whose report count rises was introduced by the
 * fixer.
 *
 * A SUGGESTION is the same transform under a different delivery mechanism — an
 * editor applies it verbatim — so it can leave exactly the same wreckage, and
 * `meta.fixable` alone made every suggestion-only rule structurally invisible
 * here (#1601). Suggestions are carried through the identical count diff, with
 * one semantic difference that is load-bearing: `--fix` never applies them, so
 * each suggestion is applied ALONE to the untouched snippet. Composing two
 * suggestions, or running them through the fix loop, would judge the fixer
 * against a state no user can reach.
 *
 * Corpus: every fenced code block in `docs/rules/<rule>.md`, fixed by that
 * rule alone. Polarity ("correct"/"incorrect") is deliberately NOT consulted —
 * a block the rule does not report on produces no fix and drops out on its own,
 * so taking every block costs nothing and roughly doubles the corpus.
 * IMPORTING each rule's own test file is the dead end: `src/tests/*.test.ts`
 * call `RuleTester.run` and `describe`/`it` at module scope, so importing them
 * re-executes the entire suite inside this file (2350 tests, 2 minutes, 48
 * cross-file side-effect failures when measured). PARSING one as text is not,
 * and the suggestion channel does exactly that on top of the documented blocks
 * — see `harvestTestSnippets` for why the docs alone cannot reach it.
 */

/** Fence languages that hold TypeScript this harness can parse. */
const LINTABLE_LANGS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'typescript',
  'javascript',
  '',
]);

/**
 * Candidate filenames, tried in order until one produces a fix. Many rules key
 * off the path (cloud function entry points, test-file exemptions, component
 * directories), so a single hard-coded filename would leave those fixers
 * unexercised.
 */
const FILENAME_CANDIDATES = [
  'src/util/helper.ts',
  'functions/src/callable/handler.f.ts',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/components/Widget.tsx',
];

/**
 * Tried in ADDITION to the first matching candidate above, not as part of that
 * list. The candidate loop stops at the first filename that produces a fix, so
 * a `.dynamic` entry appended to it would never be reached for any rule whose
 * fixer already fires on `src/util/helper.ts` — the corpus would silently never
 * visit a `.dynamic` file, and every rule gated on that suffix
 * (`no-static-constants-in-dynamic-files` returns `{}` for any other filename)
 * would be structurally unreachable. That blind spot is why #1599's
 * `global-const-style -> no-static-constants-in-dynamic-files` pair reached a
 * consumer without this guard going red.
 */
const DYNAMIC_FILENAME_CANDIDATE = 'src/config/settings.dynamic.ts';

/** Path-segment matching needs a rooted path, not a relative one. */
const ROOT = '/repo/';
const anchor = (filePath: string) =>
  filePath.startsWith('/') ? filePath : ROOT + filePath;

/**
 * Libraries whose static import a shipped fixer emits. `enforce-dynamic-imports`
 * rejects any external import outside its ignore list, so every one of these
 * must be accepted there — the exact defect #1474 fixed after fixers injected
 * imports the default ignore list did not allow.
 *
 * Asserted to be reachable from the corpus below: if a doc edit stops a fixer
 * from firing, coverage of this axis would otherwise vanish silently.
 *
 * `safe-stable-stringify` (enforce-safe-stringify) is absent because that rule
 * ships no fixer, so no fix can introduce its import.
 */
const FIXER_INJECTED_LIBRARIES = [
  'use-latest-callback',
  '@blumintinc/typescript-memoize',
  '@blumintinc/use-deep-compare',
  '@blumintinc/microdiff',
  '@blumintinc/fast-deep-equal',
];

type Block = { lang: string; code: string; line: number };

/**
 * Pull every fenced code block out of a markdown document.
 *
 * Deliberately a local copy of the extractor in
 * `docs-examples-conformance.test.ts` rather than a shared import: that file
 * registers ~500 tests at module scope, so importing it would re-run them here.
 * Drift is caught by the corpus floor below, which fails loudly if extraction
 * stops finding blocks.
 */
export function extractBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let fence: string | null = null;
  let buf: string[] = [];
  let lang = '';
  let startLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        blocks.push({
          lang: lang.trim().toLowerCase(),
          code: buf.join('\n'),
          line: startLine,
        });
        fence = null;
        buf = [];
      } else {
        buf.push(line);
      }
      continue;
    }

    if (fenceMatch) {
      fence = fenceMatch[1];
      lang = fenceMatch[2] || '';
      startLine = i + 1;
      buf = [];
    }
  }
  return blocks;
}

/** Docs declare a path-sensitive snippet's context inside the snippet itself. */
export function filenameHint(code: string): string | null {
  const explicit = /^\s*(?:\/\/|\/\*)\s*File:\s*([^\s*]+)/im.exec(code);
  if (explicit) return anchor(explicit[1].replace(/^\.\//, ''));
  const firstLine = code.split('\n').find((l) => l.trim().length > 0) || '';
  const bare = /^\s*\/\/\s*((?:[\w.-]+\/)+[\w.-]+\.tsx?)\b/.exec(firstLine);
  return bare ? anchor(bare[1]) : null;
}

/**
 * A snippet that only holds under a non-default option declares it inline. The
 * hint is applied to BOTH the fix and the observation: judging a fix computed
 * under one configuration against a differently-configured observer manufactures
 * a finding that no consumer could ever hit.
 */
export function optionsHint(code: string): unknown | null {
  const match = /^\s*\/\/\s*eslint-options:\s*(\{.*\})\s*$/im.exec(code);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`malformed // eslint-options: ${match[1]}`);
  }
}

const recommendedRuleNames = Object.keys(plugin.configs.recommended.rules)
  .filter((id) => id.startsWith(PREFIX))
  .map((id) => id.slice(PREFIX.length))
  .filter((name) => Boolean(plugin.rules[name]));

const fixableRuleNames = recommendedRuleNames.filter((name) =>
  Boolean(plugin.rules[name].meta?.fixable),
);

/**
 * Rules whose transform reaches a consumer as a suggestion. Kept separate from
 * `fixableRuleNames` rather than merged into it: the two are applied by
 * different machinery (the fix loop vs. a single editor-accepted edit) and are
 * baselined separately, so conflating them would let a fix-induced pair mask a
 * suggestion-induced one.
 */
const suggestionRuleNames = recommendedRuleNames.filter((name) =>
  Boolean(plugin.rules[name].meta?.hasSuggestions),
);

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const buildConfig = (
  filename: string,
  rules: Linter.Config['rules'],
): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: filename.endsWith('.tsx') },
    },
    rules,
  } as unknown as Linter.Config);

/** The rule set a consumer actually runs, every rule at `error`. */
const OBSERVER_RULES: Record<string, 'error'> = Object.fromEntries(
  recommendedRuleNames.map((name) => [PREFIX + name, 'error' as const]),
);

export type Counts = Record<string, number>;

/**
 * Report counts per rule for `code`, with the whole recommended config enabled
 * and fixing off.
 *
 * Returns null when the snippet does not parse: an unparsed snippet ran no rule
 * at all, so counting zero for it would silently pass anything.
 */
export function observe(
  code: string,
  filename: string,
  scopedRule?: string,
  scopedOptions?: unknown,
): Counts | null {
  const rules =
    scopedRule && scopedOptions
      ? { ...OBSERVER_RULES, [PREFIX + scopedRule]: ['error', scopedOptions] }
      : OBSERVER_RULES;

  let messages;
  try {
    messages = linter.verify(
      code,
      buildConfig(filename, rules as Linter.Config['rules']),
      { filename },
    );
  } catch {
    return null;
  }
  if (messages.some((message) => message.fatal)) return null;

  const counts: Counts = {};
  for (const message of messages) {
    if (!message.ruleId?.startsWith(PREFIX)) continue;
    const name = message.ruleId.slice(PREFIX.length);
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export type CorpusEntry = {
  rule: string;
  /**
   * How the transform reaches a consumer. `fix` is the output of the multi-pass
   * fix loop; `suggestion` is one editor-accepted edit applied alone.
   */
  kind: 'fix' | 'suggestion';
  line: number;
  /** Where the input came from, so a finding is reproducible by hand. */
  origin: string;
  filename: string;
  options: unknown | null;
  before: string;
  after: string;
};

/** Every documented snippet that the owning rule's fixer actually rewrites. */
function buildCorpus(): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  for (const rule of fixableRuleNames) {
    const docPath = path.join(DOCS_DIR, `${rule}.md`);
    if (!fs.existsSync(docPath)) continue;

    const blocks = extractBlocks(fs.readFileSync(docPath, 'utf8')).filter(
      (block) => LINTABLE_LANGS.has(block.lang),
    );

    for (const block of blocks) {
      const options = optionsHint(block.code);
      const rules = {
        [PREFIX + rule]: options ? ['error', options] : 'error',
      } as Linter.Config['rules'];
      const jsxish = block.lang === 'tsx' || block.lang === 'jsx';
      const hinted = filenameHint(block.code);
      const candidates = hinted
        ? [hinted]
        : FILENAME_CANDIDATES.map((candidate) =>
            anchor(jsxish ? candidate.replace(/\.ts$/, '.tsx') : candidate),
          );

      for (const filename of candidates) {
        let result;
        try {
          result = linter.verifyAndFix(
            block.code,
            buildConfig(filename, rules),
            { filename },
          );
        } catch {
          // Rule crashes are a separate, already-guarded axis.
          continue;
        }
        if (!result.fixed || result.output === block.code) continue;
        corpus.push({
          rule,
          kind: 'fix',
          line: block.line,
          origin: `docs/rules/${rule}.md:${block.line}`,
          filename,
          options,
          before: block.code,
          after: result.output,
        });
        break;
      }

      // Always also fix under a `.dynamic` filename, whether or not a candidate
      // above already matched, so the suffix-gated rules stay reachable.
      if (!hinted && !jsxish) {
        const filename = anchor(DYNAMIC_FILENAME_CANDIDATE);
        try {
          const result = linter.verifyAndFix(
            block.code,
            buildConfig(filename, rules),
            { filename },
          );
          if (result.fixed && result.output !== block.code) {
            corpus.push({
              rule,
              kind: 'fix',
              line: block.line,
              origin: `docs/rules/${rule}.md:${block.line}`,
              filename,
              options,
              before: block.code,
              after: result.output,
            });
          }
        } catch {
          // Rule crashes are a separate, already-guarded axis.
        }
      }
    }
  }
  return corpus;
}

const applyEdit = (
  text: string,
  fix: { range: readonly number[]; text: string },
) => text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);

/**
 * One output per emitted suggestion, each applied ALONE to `code`.
 *
 * Never composed and never looped: ESLint hands a suggestion to an editor one
 * at a time, so a state reached by stacking two of them — or by re-running the
 * rule on its own suggestion's output — is not a state a consumer can be in,
 * and a finding against one would be unactionable.
 */
function suggestionOutputs(
  code: string,
  filename: string,
  rules: Linter.Config['rules'],
  ruleId: string,
): string[] {
  let messages;
  try {
    messages = linter.verify(code, buildConfig(filename, rules), { filename });
  } catch {
    // Rule crashes are a separate, already-guarded axis.
    return [];
  }
  if (messages.some((message) => message.fatal)) return [];

  const outputs: string[] = [];
  for (const message of messages) {
    if (message.ruleId !== ruleId) continue;
    for (const suggestion of message.suggestions || []) {
      if (!suggestion.fix) continue;
      const output = applyEdit(code, suggestion.fix);
      if (output !== code) outputs.push(output);
    }
  }
  return outputs;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const walkAst = (node: any, visit: (n: any) => void) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walkAst(child, visit));
    else if (
      value &&
      typeof value === 'object' &&
      typeof value.type === 'string'
    ) {
      walkAst(value, visit);
    }
  }
};

/**
 * A rule's own test file, read as TEXT and parsed — never imported.
 *
 * The documented blocks are the right corpus for the fix path and are kept as
 * the primary one here, but they cannot reach every suggestion: the whole
 * `react-memoize-literals` doc set produces reports whose suggestions the rule
 * declines (nested hook arguments carry none, and #1600 made it decline a
 * literal that closes over nothing), so a docs-only suggestion corpus would
 * leave the very rule that motivated #1601 at zero. Each rule's own test file
 * is the one input set guaranteed to trigger it.
 *
 * Importing that file is still the dead end the header describes — it calls
 * `RuleTester.run` at module scope — so the text is parsed and its string and
 * no-substitution template literals are harvested, exactly as
 * `fixer-convergence` and `fixer-type-safety` already do.
 */
function harvestTestSnippets(rule: string): string[] {
  const testFile = path.join(__dirname, `${rule}.test.ts`);
  if (!fs.existsSync(testFile)) return [];
  let parsed;
  try {
    parsed = tsParser.parse(fs.readFileSync(testFile, 'utf8'), {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
      range: true,
      comment: true,
      tokens: true,
    });
  } catch {
    return [];
  }
  const snippets: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    // Shorter than this is a messageId or a rule name, not a snippet.
    if (typeof value !== 'string' || value.length < 25) return;
    if (!/[;{(=<]/.test(value) || seen.has(value)) return;
    seen.add(value);
    snippets.push(value);
  };
  walkAst(parsed, (node: any) => {
    if (node.type === 'Literal') push(node.value);
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      push(node.quasis.map((quasi: any) => quasi.value.cooked).join(''));
    }
  });
  return snippets;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every snippet on which a suggestion-emitting rule offers an edit. */
function buildSuggestionCorpus(): CorpusEntry[] {
  const corpus: CorpusEntry[] = [];

  const collect = (
    rule: string,
    origin: string,
    line: number,
    code: string,
    options: unknown | null,
    candidates: string[],
    dynamicPass: boolean,
  ) => {
    const rules = {
      [PREFIX + rule]: options ? ['error', options] : 'error',
    } as Linter.Config['rules'];

    for (const filename of candidates) {
      const outputs = suggestionOutputs(code, filename, rules, PREFIX + rule);
      if (!outputs.length) continue;
      for (const after of outputs) {
        corpus.push({
          rule,
          kind: 'suggestion',
          line,
          origin,
          filename,
          options,
          before: code,
          after,
        });
      }
      break;
    }

    // The suffix-gated rules stay reachable on the suggestion path too; see
    // DYNAMIC_FILENAME_CANDIDATE for why this is not a candidate-list entry.
    if (!dynamicPass) return;
    const filename = anchor(DYNAMIC_FILENAME_CANDIDATE);
    for (const after of suggestionOutputs(
      code,
      filename,
      rules,
      PREFIX + rule,
    )) {
      corpus.push({
        rule,
        kind: 'suggestion',
        line,
        origin,
        filename,
        options,
        before: code,
        after,
      });
    }
  };

  const asTs = FILENAME_CANDIDATES.map((candidate) => anchor(candidate));
  const asTsx = FILENAME_CANDIDATES.map((candidate) =>
    anchor(candidate.replace(/\.ts$/, '.tsx')),
  );

  for (const rule of suggestionRuleNames) {
    const docPath = path.join(DOCS_DIR, `${rule}.md`);
    if (fs.existsSync(docPath)) {
      const blocks = extractBlocks(fs.readFileSync(docPath, 'utf8')).filter(
        (block) => LINTABLE_LANGS.has(block.lang),
      );
      for (const block of blocks) {
        const jsxish = block.lang === 'tsx' || block.lang === 'jsx';
        const hinted = filenameHint(block.code);
        collect(
          rule,
          `docs/rules/${rule}.md:${block.line}`,
          block.line,
          block.code,
          optionsHint(block.code),
          hinted ? [hinted] : jsxish ? asTsx : asTs,
          !hinted && !jsxish,
        );
      }
    }

    const snippets = harvestTestSnippets(rule);
    for (let index = 0; index < snippets.length; index++) {
      collect(
        rule,
        `src/tests/${rule}.test.ts snippet #${index}`,
        index,
        snippets[index],
        null,
        // Whether a harvested snippet needs the JSX parser is declared nowhere,
        // so the `.tsx` candidates follow the `.ts` ones; a JSX snippet reports
        // fatally under `.ts` and contributes nothing there, and the loop stops
        // at the first filename that yields a suggestion either way.
        [...asTs, ...asTsx],
        true,
      );
    }
  }
  return corpus;
}

export type Finding = {
  pair: string;
  rule: string;
  introduced: string;
  line: number;
  origin: string;
  filename: string;
  before: number;
  after: number;
  /** The transformed text, so a finding can be triaged without re-running. */
  emitted: string;
};

/** Diff per-rule counts across the fix; a rise means the fixer introduced it. */
export function findIntroduced(entries: readonly CorpusEntry[]): Finding[] {
  const findings: Finding[] = [];

  for (const entry of entries) {
    const before = observe(
      entry.before,
      entry.filename,
      entry.rule,
      entry.options,
    );
    const after = observe(
      entry.after,
      entry.filename,
      entry.rule,
      entry.options,
    );
    if (!before || !after) continue;

    for (const introduced of Object.keys(after)) {
      if ((after[introduced] || 0) <= (before[introduced] || 0)) continue;
      findings.push({
        // Suggestion pairs carry their own key so the two baselines cannot
        // absorb each other's regressions.
        pair:
          entry.kind === 'suggestion'
            ? `${entry.rule} (suggestion) -> ${introduced}`
            : `${entry.rule} -> ${introduced}`,
        rule: entry.rule,
        introduced,
        line: entry.line,
        origin: entry.origin,
        filename: entry.filename,
        before: before[introduced] || 0,
        after: after[introduced],
        emitted: entry.after,
      });
    }
  }
  return findings;
}

/**
 * Fixer -> introduced-rule pairs the shipped config produces today, keyed
 * `<fixer> -> <rule it makes report>`.
 *
 * EVERY ENTRY IS AN UNRESOLVED DESIGN QUESTION FROM #1477, NOT ACCEPTED
 * BEHAVIOUR. Resolving one is a product call — either the fixer declines the
 * rewrite, or the rule it upsets learns to accept the shape a fixer emits — so
 * they are recorded rather than guessed at. Anything NOT listed here fails this
 * suite, which is the point: the next #1474 (fixers injecting an import
 * `enforce-dynamic-imports` rejected, 129 consumer files) goes red at the commit
 * that introduces it.
 *
 * Do not add an entry to make a build green. An entry is a promise that someone
 * decided the contradiction is acceptable for now.
 */
export const FIX_INDUCED_BASELINE: Record<string, string> = {
  // --- The fix hoists or rewrites a declaration at module scope, and a rule
  // that polices module scope then objects. Root cause 2 in #1477 (55 consumer
  // hits). Open question: should the fixer keep the declaration scoped, or
  // should the module-scope rules exempt a declaration they did not previously
  // see?
  'no-empty-dependency-use-callbacks -> export-if-in-doubt':
    'the callback is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'no-empty-dependency-use-callbacks -> vertically-group-related-functions':
    'the hoisted helper lands above its caller, which vertically-group-related-functions orders the other way',
  'enforce-global-constants -> export-if-in-doubt':
    'the constant is hoisted to module scope, where export-if-in-doubt demands it be exported',
  'prefer-union-from-const-array -> export-if-in-doubt':
    'the emitted const array and derived type are module-scope declarations export-if-in-doubt demands be exported',
  'prefer-type-over-interface -> export-if-in-doubt':
    'the interface becomes a module-scope type alias export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> export-if-in-doubt':
    'the destructure becomes a module-scope const export-if-in-doubt demands be exported',
  'no-class-instance-destructuring -> global-const-style':
    'the emitted module-scope const keeps its camelCase name, which global-const-style requires be UPPER_SNAKE_CASE',
  'no-unnecessary-destructuring -> export-if-in-doubt':
    'collapsing the rest pattern yields module-scope bindings export-if-in-doubt demands be exported',
  'no-useless-usememo-primitives -> global-const-style':
    'unwrapping the useMemo leaves a camelCase module-scope const, which global-const-style requires be UPPER_SNAKE_CASE',

  // --- Unlike every other entry here, this one is NOT an open question. The
  // second rule's verdict is correct and its documented remedy converges: move
  // the constant to a non-dynamic module and import (or re-export) it, which
  // #1599 verified is silent AND idempotent under both rules. The pair is
  // recorded because the fix does move a snippet from silent to reporting, not
  // because anyone is deferring a decision. See the fixed-point test in
  // src/tests/no-static-constants-in-dynamic-files.test.ts.
  'prefer-union-from-const-array -> no-static-constants-in-dynamic-files':
    'the emitted module-scope `export const X = [...] as const` is genuinely static configuration living in a .dynamic file; the rule correctly says to move it out, and that remedy is a stable fixed point (#1599)',

  // --- The fix introduces a construct that a second rule then demands MORE of,
  // and the demand is a rename or an extra argument no fixer can supply. Same
  // shape as root cause 3 in #1477 (enforce-assert-safe-object-key ->
  // enforce-assert-throws, 122 consumer hits); that exact pair is not reachable
  // from this corpus, so it is not listed. Open question: should the fix decline
  // when it would trigger the second rule, or should the second rule ignore
  // fixer-introduced code?
  'prefer-map-over-conditional-dispatch -> enforce-assert-safe-object-key':
    'the emitted RECORD[key] lookup is exactly the dynamic key enforce-assert-safe-object-key requires be wrapped in assertSafe()',
  'require-memo -> memo-compare-deeply-complex-props':
    'wrapping the component in memo() makes memo-compare-deeply-complex-props demand a custom comparator for its complex props',
  'prefer-usecallback-over-usememo-for-functions -> no-empty-dependency-use-callbacks':
    'useMemo(() => fn, []) becomes useCallback(fn, []), and an empty dependency array is what no-empty-dependency-use-callbacks rejects',
  'enforce-early-destructuring -> react-memoize-literals':
    'the hoisted destructuring introduces an object literal recreated on every render',
  'require-hooks-default-params -> react-memoize-literals':
    'the `= {}` default parameter the fix adds is an object literal recreated on every render',

  // --- The fix changes what a pre-existing line comment sits above.
  // Open question: should a fixer relocate or rewrite comments it strands?
  //
  // The enforce-dynamic-firebase-imports entry that sat here is gone with
  // #1716: that fixer no longer rewrites the import in place, so no documented
  // snippet reaches prefer-block-comments-for-declarations through it.
  'prefer-usecallback-over-usememo-for-functions -> prefer-block-comments-for-declarations':
    'the rewritten call is a declaration, so a line comment above it now needs to be a block comment',
};

/**
 * The same contract for the suggestion path, keyed `<rule> (suggestion) ->
 * <rule it makes report>`.
 *
 * Held separately from `FIX_INDUCED_BASELINE` on purpose. A suggestion is not
 * applied by `--fix`, so the two deliveries have different remedies available:
 * a fixable follow-on violation self-heals on the fix path but is left standing
 * for whoever accepted the suggestion, and an entry here has to say which of
 * those it is. Both maps are subject to the same staleness check, so neither
 * can rot.
 */
export const SUGGESTION_INDUCED_BASELINE: Record<string, string> = {
  // --- #1478 shape 1 — a declaration hoisted to module scope, which the rules
  // policing module scope then object to — used to arrive here through
  // enforce-dynamic-firebase-imports' suggestion. #1716 removed the mechanism:
  // that suggestion no longer rewrites the import where it stands, so it emits
  // no module-scope const for global-const-style or export-if-in-doubt to
  // object to.

  // --- A second, unrelated mechanism reaches prefer-block-comments-for-
  // declarations through the same suggestion: removing the import deliberately
  // outlives its TRAILING comment (`import ...; // needed by run`), which then
  // stands alone on the line above the next declaration and becomes a leading
  // declaration comment. The pair was invisible while that rule attributed a
  // trailing comment to the declaration below it (#1779) — the report existed
  // before the suggestion too, so the count did not RISE. Correcting the
  // attribution is what exposed it.
  //
  // Resolved by design, not deferred, on the same ground as the entry below:
  // `--fix` under the full recommended config rewrites the stranded comment to
  // `/** needed by run */` in one converging pass and the file ends with zero
  // prefer-block-comments-for-declarations reports. Verified end to end with
  // verifyAndFix over the whole config for both filenames the corpus tries.
  'enforce-dynamic-firebase-imports (suggestion) -> prefer-block-comments-for-declarations':
    "the suggestion strands the removed import's trailing comment on its own line above the next declaration; that comment is fixable and the file ends clean under `--fix`",

  // --- A third mechanism, shared by the two entries below: relocating the
  // import into a concise-bodied async arrow means giving that arrow a block,
  // and both of these rules read a function's returned expression only out of a
  // BLOCK body. The object literal and the annotated `return` they object to
  // are written by the developer and unchanged by the suggestion — the block is
  // what makes an already-present violation visible to a reader that was
  // looking in the wrong place.
  //
  // Resolved by design, not deferred, on the same ground as the entry above:
  // `--fix` under the full recommended config appends the `as const` and drops
  // the redundant return annotation in one converging pass, and the file ends
  // with zero reports from either rule. Verified end to end with verifyAndFix
  // over the whole config for both filenames the corpus tries.
  'enforce-dynamic-firebase-imports (suggestion) -> enforce-object-literal-as-const':
    'the block the suggestion adds exposes the returned object literal to a rule that reads block bodies only; the missing `as const` is fixable and the file ends clean under `--fix`',
  'enforce-dynamic-firebase-imports (suggestion) -> no-type-assertion-returns':
    'the block the suggestion adds exposes the annotated `return` to a rule that reads block bodies only; the redundant annotation is fixable and the file ends clean under `--fix`',

  // --- Resolved by design, not deferred: `--fix` under the full recommended
  // config rewrites the emitted `useCallback(fn, deps)` into
  // `useLatestCallback(fn)` and the file ends with zero use-latest-callback
  // reports. Verified end to end with verifyAndFix over the whole config, so
  // the only consumer who ever sees this report is one who accepts the
  // suggestion and does not run the fixer.
  'react-memoize-literals (suggestion) -> use-latest-callback':
    'the suggestion emits useCallback, which use-latest-callback rewrites to useLatestCallback; that rewrite is fixable and the file ends clean under `--fix`',

  // --- The suggestion is deliberately incomplete. It injects a
  // `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder precisely so the developer
  // cannot ship an accidental empty dependency array, and a comment-only array
  // is syntactically empty — which is exactly what enforce-global-constants
  // rejects. Supplying the real dependencies (`[delay]`) silences it, so the
  // report lives only for as long as the placeholder does. #1600 removed the
  // half of this pair where the literal closed over nothing and hoisting was
  // therefore the right advice; what remains closes over a value and cannot be
  // hoisted at all.
  'react-memoize-literals (suggestion) -> enforce-global-constants':
    "the emitted `[/* __TODO_MEMOIZATION_DEPENDENCIES__ */]` is a syntactically empty dependency array until the developer fills it in, which is the suggestion's stated contract; with real dependencies the report disappears",
};

const corpus = buildCorpus();
const findings = findIntroduced(corpus);
const suggestionCorpus = buildSuggestionCorpus();
const suggestionFindings = findIntroduced(suggestionCorpus);
const observedPairs = new Set(
  [...findings, ...suggestionFindings].map((finding) => finding.pair),
);
const exercisedRules = new Set(corpus.map((entry) => entry.rule));
const suggestionExercisedRules = new Set(
  suggestionCorpus.map((entry) => entry.rule),
);

describe('the recommended config is closed under its own autofixes', () => {
  it('introduces no fix-induced violation outside the documented baseline', () => {
    const unlisted = findings.filter(
      (finding) => !(finding.pair in FIX_INDUCED_BASELINE),
    );
    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        byPair.set(finding.pair, [
          ...(byPair.get(finding.pair) || []),
          finding,
        ]);
      }
      throw new Error(
        [
          `${byPair.size} fixer(s) produce code the recommended config rejects:`,
          ...[...byPair.entries()].map(([pair, hits]) =>
            [
              `  ${pair} (${hits.length} documented snippet(s))`,
              ...hits.map(
                (hit) =>
                  `    ${hit.origin} as ${hit.filename}: ${hit.introduced} ${hit.before} -> ${hit.after}`,
              ),
            ].join('\n'),
          ),
          '',
          'Running `eslint --fix` now leaves a consumer with a violation the fix',
          'created. Make the fixer emit code the config accepts, or — if the',
          'contradiction needs a product decision — add the pair to',
          'FIX_INDUCED_BASELINE with the reason, referencing #1477.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    const stale = Object.keys(FIX_INDUCED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'FIX_INDUCED_BASELINE lists pair(s) this corpus no longer reproduces:',
          ...stale.map((pair) => `  ${pair} — ${FIX_INDUCED_BASELINE[pair]}`),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'documented snippet that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

describe('the recommended config is closed under its own suggestions', () => {
  it('introduces no suggestion-induced violation outside the documented baseline', () => {
    const unlisted = suggestionFindings.filter(
      (finding) => !(finding.pair in SUGGESTION_INDUCED_BASELINE),
    );
    if (unlisted.length > 0) {
      const byPair = new Map<string, Finding[]>();
      for (const finding of unlisted) {
        byPair.set(finding.pair, [
          ...(byPair.get(finding.pair) || []),
          finding,
        ]);
      }
      throw new Error(
        [
          `${byPair.size} suggestion(s) produce code the recommended config rejects:`,
          ...[...byPair.entries()].map(([pair, hits]) =>
            [
              `  ${pair} (${hits.length} snippet(s))`,
              ...hits
                .slice(0, 3)
                .map(
                  (hit) =>
                    `    ${hit.origin} as ${hit.filename}: ${hit.introduced} ${hit.before} -> ${hit.after}\n` +
                    `    emitted:\n${hit.emitted.replace(/^/gm, '      ')}`,
                ),
            ].join('\n'),
          ),
          '',
          'Accepting this suggestion in an editor now leaves a consumer with a',
          'violation the suggestion created — and unlike a fix, nothing re-ran',
          'the loop to clean up after it. Make the suggestion emit code the',
          'config accepts, or — if the contradiction needs a product decision —',
          'add the pair to SUGGESTION_INDUCED_BASELINE with the reason,',
          'referencing #1601.',
        ].join('\n'),
      );
    }
    expect(unlisted).toEqual([]);
  });

  it('carries no stale suggestion baseline entry', () => {
    const stale = Object.keys(SUGGESTION_INDUCED_BASELINE).filter(
      (pair) => !observedPairs.has(pair),
    );
    if (stale.length > 0) {
      throw new Error(
        [
          'SUGGESTION_INDUCED_BASELINE lists pair(s) this corpus no longer',
          'reproduces:',
          ...stale.map(
            (pair) => `  ${pair} — ${SUGGESTION_INDUCED_BASELINE[pair]}`,
          ),
          '',
          'Either the contradiction was resolved (delete the entry) or the',
          'documented snippet that reached it was edited away (restore coverage).',
          'A stale entry silently absorbs the next real regression.',
        ].join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Anti-vacuity controls. A closure guard over a corpus that trips no fixer
 * passes forever while asserting nothing, so the corpus is measured, the
 * observer is proven to report at all, and the detector is proven to catch a
 * planted regression.
 */
describe('the closure guard is load-bearing', () => {
  it('exercises most of the fixable rules in the recommended config', () => {
    // Guards the denominator: if rule registration broke, a high ratio over a
    // tiny rule set would still look healthy.
    expect(fixableRuleNames.length).toBeGreaterThanOrEqual(80);
    // 71 of 83 at the time of writing. The rules this corpus cannot reach are
    // ones whose documented blocks never produce a fix under any candidate
    // filename, plus `no-unpinned-dependencies` and
    // `enforce-typescript-markdown-code-blocks`, which need the JSON and
    // markdown parsers rather than the TypeScript one.
    expect(exercisedRules.size).toBeGreaterThanOrEqual(65);
    expect(corpus.length).toBeGreaterThanOrEqual(110);
  });

  it('reaches every library a shipped fixer statically imports', () => {
    // Direct coverage of the #1474 axis. Each of these must be newly present in
    // some fixed output, or a regression in `DEFAULT_IGNORED_LIBRARIES` would
    // go unnoticed for that library.
    const unreached = FIXER_INJECTED_LIBRARIES.filter(
      (library) =>
        !corpus.some(
          (entry) =>
            entry.after.includes(`'${library}'`) &&
            !entry.before.includes(`'${library}'`),
        ),
    );
    expect(unreached).toEqual([]);
  });

  it('observes reports at all (positive control)', () => {
    // A silently-empty observer would make every count diff zero and the whole
    // suite vacuously green.
    const counts = observe(
      'export const x = { a: 1 };\nexport const y = x.a === 1 ? 1 : 2;\n',
      '/repo/src/util/helper.ts',
    );
    expect(counts).not.toBeNull();
    expect(Object.keys(counts as Counts).length).toBeGreaterThan(0);
  });

  it('is deterministic, so a count diff means something', () => {
    for (const entry of corpus.slice(0, 20)) {
      const first = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      const second = observe(
        entry.after,
        entry.filename,
        entry.rule,
        entry.options,
      );
      expect(second).toEqual(first);
    }
  });

  it('treats an unparseable snippet as unobservable, not clean', () => {
    // Counting zero for a snippet no rule ran on would pass anything.
    expect(observe('const = ;', '/repo/src/util/helper.ts')).toBeNull();
  });

  it('detects a planted fix-induced violation (control)', () => {
    // Reproduces the #1474 shape without touching any rule: a "fix" that adds a
    // static import of a library `enforce-dynamic-imports` does not ignore.
    const planted: CorpusEntry = {
      rule: 'planted-fixer',
      kind: 'fix',
      line: 1,
      origin: 'planted control',
      filename: '/repo/src/util/helper.ts',
      options: null,
      before: 'export const value = 1;\n',
      after:
        "import helper from 'not-an-ignored-library';\nexport const value = helper;\n",
    };
    const planted_findings = findIntroduced([planted]);
    expect(planted_findings.map((finding) => finding.pair)).toContain(
      'planted-fixer -> enforce-dynamic-imports',
    );

    // The same detector must stay silent when the fix introduces nothing.
    const inert: CorpusEntry = {
      ...planted,
      after: 'export const value = 1;\n',
    };
    expect(findIntroduced([inert])).toEqual([]);
  });
});

/**
 * Anti-vacuity controls for the suggestion path (#1601). The fix-path controls
 * above prove nothing about it: a suggestion is reached through
 * `message.suggestions`, which `verifyAndFix` never touches, so the extraction
 * and the detection are both planted here end to end — from a real registered
 * rule emitting a real suggestion, not from a hand-written `after` string.
 */
const PLANTED_SUGGESTER = 'planted/suggests-static-import';
const PLANTED_INERT_SUGGESTER = 'planted/suggests-nothing-of-note';

/* eslint-disable @typescript-eslint/no-explicit-any */
const plantSuggestionRule = (id: string, replacement: string) =>
  linter.defineRule(id, {
    meta: {
      type: 'suggestion',
      hasSuggestions: true,
      schema: [],
      messages: { report: 'planted', suggest: 'planted suggestion' },
    },
    create(context: any) {
      return {
        VariableDeclarator(node: any) {
          if (node.id.type !== 'Identifier' || node.id.name !== 'value') return;
          context.report({
            node,
            messageId: 'report',
            suggest: [
              {
                messageId: 'suggest',
                fix: (fixer: any) =>
                  fixer.replaceTextRange(
                    [0, context.getSourceCode().getText().length],
                    replacement,
                  ),
              },
            ],
          });
        },
      };
    },
  } as never);
/* eslint-enable @typescript-eslint/no-explicit-any */

plantSuggestionRule(
  PLANTED_SUGGESTER,
  "import helper from 'not-an-ignored-library';\nexport const value = helper;\n",
);
plantSuggestionRule(PLANTED_INERT_SUGGESTER, 'export const value = 2;\n');

const plantedEntries = (id: string, rule: string): CorpusEntry[] => {
  const before = 'export const value = 1;\n';
  const filename = '/repo/src/util/helper.ts';
  return suggestionOutputs(
    before,
    filename,
    { [id]: 'error' } as Linter.Config['rules'],
    id,
  ).map((after) => ({
    rule,
    kind: 'suggestion' as const,
    line: 1,
    origin: 'planted control',
    filename,
    options: null,
    before,
    after,
  }));
};

describe('the suggestion closure guard is load-bearing', () => {
  it('extracts and applies a planted suggestion at all', () => {
    // `verifyAndFix` returns this snippet unchanged, so a harness that only
    // knows about fixes would build an empty suggestion corpus and pass forever.
    const entries = plantedEntries(PLANTED_SUGGESTER, 'planted-suggester');
    expect(entries).toHaveLength(1);
    expect(entries[0].after).not.toBe(entries[0].before);
  });

  it('detects a planted suggestion-induced violation (control)', () => {
    const findingsForPlanted = findIntroduced(
      plantedEntries(PLANTED_SUGGESTER, 'planted-suggester'),
    );
    expect(findingsForPlanted.map((finding) => finding.pair)).toContain(
      'planted-suggester (suggestion) -> enforce-dynamic-imports',
    );

    // The same detector must stay silent when the suggestion introduces
    // nothing, so a green run means the corpus is clean and not that the
    // detector fires on everything.
    expect(
      findIntroduced(plantedEntries(PLANTED_INERT_SUGGESTER, 'planted-inert')),
    ).toEqual([]);
  });

  it('exercises every suggestion-emitting rule in the recommended config', () => {
    expect(suggestionRuleNames.length).toBeGreaterThanOrEqual(5);
    /**
     * A per-rule floor, not a total: one rule contributing hundreds of
     * suggestions would hold a total up while another quietly stopped emitting
     * any and dropped out of every assertion above.
     */
    const emittedPerRule = Object.fromEntries(
      suggestionRuleNames.map((rule) => [
        rule,
        suggestionCorpus.filter((entry) => entry.rule === rule).length > 0,
      ]),
    );
    expect(emittedPerRule).toEqual(
      Object.fromEntries(suggestionRuleNames.map((rule) => [rule, true])),
    );
    expect(suggestionExercisedRules.size).toBe(suggestionRuleNames.length);
    expect(suggestionCorpus.length).toBeGreaterThanOrEqual(20);
  });
});
