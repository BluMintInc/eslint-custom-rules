import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import * as ts from 'typescript';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: Record<string, unknown> }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';
const TESTS_DIR = __dirname;

/**
 * An autofix must not turn compiling code into non-compiling code.
 *
 * Every other fixer guard reads ESLint-level signals only — reports, scope
 * bindings, re-parse — so a fix that emits parseable-but-type-broken code is
 * invisible to all of them, and to `RuleTester`, which never type-checks. One
 * pass of this check found four defects at once: #1521 (a `Timestamp.now()`
 * fix emitted with no `Timestamp` in scope), #1522 (a prop rename applied to
 * one side of the contract only), #1523 (a synthesized `= {}` default on a
 * nested object pattern) and #1524 (a destructure that dropped the receiver of
 * a method).
 *
 * The assertion is a differential, never an absolute diagnostic count: the
 * corpus is made of test snippets, which are fragments full of identifiers no
 * program defines. What must hold is that the fixed text carries no diagnostic
 * the input did not already carry.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Two things about this harness are load-bearing, and both were learned the
 * hard way while the axis was first swept:
 *
 * 1. The compiler API, not the `tsc` CLI. `tsc` short-circuits: if ANY file in
 *    the program fails to parse it reports zero semantic diagnostics for EVERY
 *    file. Over a flat corpus of hundreds of fix outputs, one parse-breaking
 *    fix would mask every type error in the run and the guard would report a
 *    clean sweep. `getSyntacticDiagnostics(file)` / `getSemanticDiagnostics(
 *    file)` are per-file and have no such short-circuit — the syntax-breaking
 *    control below sits in the same program as everything else precisely to
 *    keep proving that.
 *
 * 2. `declare module '*'` types every import as `any`, so a fix that adds an
 *    import cannot manufacture a TS2307 the input lacked, and `export {}` is
 *    appended to every file so script-scope declarations cannot collide across
 *    the flat corpus. Both transforms apply identically to the before and after
 *    corpora, so they cancel in the diff. `export {}` does not contain a
 *    `declare global`, though, which is why snippets carrying one are dropped
 *    from the corpus outright (see `DECLARES_INTO_SHARED_SCOPE`).
 */
const STUBS = `
declare module '*';
declare namespace JSX {
  interface IntrinsicElements { [k: string]: any }
  interface Element {}
  interface ElementAttributesProperty { props: {} }
  interface ElementChildrenAttribute { children: {} }
}
declare const require: any;
declare const process: any;
declare const module: any;
`;

const VIRTUAL_DIR = '/virtual-fixer-corpus';

/** A rule that gates on file location needs a filename it accepts. */
const FILENAMES = [
  '/repo/src/components/Widget.tsx',
  '/repo/src/util/helper.ts',
  '/repo/src/util/helper.test.ts',
  '/repo/src/__tests__/helper.test.ts',
  '/repo/functions/src/util/helper.test.ts',
  '/repo/functions/src/callable/handler.ts',
  '/repo/src/pages/index.tsx',
];

/**
 * Compiling every snippet separately would build one program per pair and cost
 * a lib load each time. The corpus is flat and every file is its own module, so
 * one program per side is equivalent and ~500x cheaper.
 */
const compileCorpus = (files: Array<{ name: string; text: string }>) => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: false,
    noImplicitAny: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    types: [],
    jsx: ts.JsxEmit.Preserve,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    experimentalDecorators: true,
  };

  // In-memory: the corpus is transient and a test must not litter the disk.
  const sources = new Map<string, string>();
  sources.set(`${VIRTUAL_DIR}/stubs.d.ts`, STUBS);
  for (const file of files) {
    sources.set(`${VIRTUAL_DIR}/${file.name}`, `${file.text}\nexport {};\n`);
  }

  const host = ts.createCompilerHost(options, true);
  const getSourceFileFromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = sources.get(fileName);
    if (text === undefined) {
      return getSourceFileFromDisk(
        fileName,
        languageVersion,
        onError,
        shouldCreate,
      );
    }
    return ts.createSourceFile(
      fileName,
      text,
      languageVersion,
      true,
      fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  };
  const fileExistsOnDisk = host.fileExists.bind(host);
  host.fileExists = (fileName) =>
    sources.has(fileName) || fileExistsOnDisk(fileName);
  const readFileFromDisk = host.readFile.bind(host);
  host.readFile = (fileName) =>
    sources.has(fileName) ? sources.get(fileName) : readFileFromDisk(fileName);

  const program = ts.createProgram([...sources.keys()], options, host);
  const byFile = new Map<string, string[]>();
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    byFile.set(
      path.basename(sourceFile.fileName),
      // Keyed without position: a fix shifts lines, and a shifted duplicate of
      // an existing diagnostic is not a new defect.
      diagnostics.map(
        (d) =>
          `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
      ),
    );
  }
  return byFile;
};

const multisetDiff = (before: string[], after: string[]) => {
  const counts = new Map<string, number>();
  for (const d of before) counts.set(d, (counts.get(d) || 0) + 1);
  const added: string[] = [];
  for (const d of after) {
    const remaining = counts.get(d) || 0;
    if (remaining > 0) counts.set(d, remaining - 1);
    else added.push(d);
  }
  return added;
};

/**
 * Every "cannot find name" variant, so the artifact filter below keys on the
 * missing identifier rather than on one exact message.
 */
const UNRESOLVED_NAME = /^TS(?:2304|2552|2662|2663):[^']*'([^']+)'/;

const missingNameOf = (diagnostic: string) => {
  const match = UNRESOLVED_NAME.exec(diagnostic);
  return match ? match[1] : null;
};

/**
 * The one artifact class. A fix that merely mentions an already-unresolvable
 * name one more time adds a duplicate TS2304 to the multiset without breaking
 * anything:
 *
 *   before: for (; !config;)                                    1x TS2304
 *   after:  for (; (!config || Object.keys(config).length === 0);)  2x TS2304
 *
 * A TS2304 naming an identifier that was resolvable — or absent — before the
 * fix is not filtered: that is exactly the #1521 defect, where the fix emitted
 * `Timestamp.now()` into a file with no `Timestamp` binding.
 *
 * The filter costs real detection, and the cost is worth stating: #1524's shape
 * — a fix that rebuilds `new Person(...)` once per destructured property, in a
 * fixture where `Person` is undefined — is a duplicate reference to an
 * already-unresolvable name and is therefore indistinguishable from the
 * artifact here. Reverting that fix does not fail this guard. An absolute
 * diagnostic count would catch it and would also fire on every snippet in the
 * corpus, since test snippets are fragments, so the differential is the only
 * usable framing.
 */
const introducedDiagnostics = (before: string[], after: string[]) => {
  const alreadyMissing = new Set<string>();
  for (const d of before) {
    const name = missingNameOf(d);
    if (name) alreadyMissing.add(name);
  }
  return multisetDiff(before, after).filter((d) => {
    const name = missingNameOf(d);
    return !(name && alreadyMissing.has(name));
  });
};

const parse = (text: string, filePath: string) => {
  try {
    return tsParser.parseForESLint(text, {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: filePath.endsWith('.tsx') },
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

/**
 * Every rule ships cases whose whole purpose is to make it fire, so the
 * triggers already exist — harvest them instead of inventing a synthetic input
 * per rule. Any string or no-substitution template literal is a candidate; one
 * that makes the rule fire is usable regardless of which array it came from,
 * and an `output` string doubles as an already-fixed input.
 *
 * A template literal with substitutions is not reconstructable here, so it is
 * counted rather than dropped in silence: a test file that assembles every case
 * from a shared prelude (`${typedPrelude}\n...`) is invisible to this harvest,
 * and that is a property of the harness, not evidence the rule has no trigger.
 */
const harvestSnippets = (testFile: string) => {
  const parsed = parse(fs.readFileSync(testFile, 'utf8'), testFile);
  if (!parsed) return { snippets: [] as string[], interpolated: 0 };
  const snippets: string[] = [];
  const seen = new Set<string>();
  let interpolated = 0;
  const push = (s: unknown) => {
    if (typeof s !== 'string') return;
    // Shorter than this is a messageId or a rule name, not a snippet.
    if (s.length < 25 || !/[;{(=<]/.test(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    snippets.push(s);
  };
  walkAst(parsed.ast, (node: any) => {
    if (node.type === 'Literal') push(node.value);
    if (node.type !== 'TemplateLiteral') return;
    if (node.expressions.length === 0) {
      push(node.quasis.map((q: any) => q.value.cooked).join(''));
      return;
    }
    const width = node.quasis.reduce(
      (total: number, q: any) => total + q.value.cooked.length,
      0,
    );
    if (width >= 25) interpolated++;
  });
  return { snippets, interpolated };
};

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

const configFor = (ruleId: string): Linter.Config =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: { [ruleId]: 'error' },
  } as Linter.Config);

/**
 * `verifyAndFix`, not a single fix application: what a developer runs is the
 * fix loop, and that is the text that has to compile.
 */
const fixWith = (ruleId: string, snippet: string) => {
  for (const filename of FILENAMES) {
    let result;
    try {
      result = linter.verifyAndFix(snippet, configFor(ruleId), { filename });
    } catch {
      continue;
    }
    if (result && result.output && result.output !== snippet) {
      return { output: result.output, filename };
    }
  }
  return null;
};

type Pair = {
  rule: string;
  name: string;
  before: string;
  after: string;
};

/**
 * Planted defects, run through the exact pipeline the guard uses. A zero on the
 * real rules only means something if the same corpus, the same programs and the
 * same diff flag code that is known-broken.
 *
 * `expectFlagged: false` is as important as the true cases — it pins the
 * artifact filter's polarity so a future widening cannot quietly swallow the
 * #1521 defect shape along with the duplicate-reference noise.
 */
const CONTROLS: Array<{
  name: string;
  code: string;
  expectFlagged: boolean;
  rule: Record<string, any>;
}> = [
  {
    name: 'control-type-break',
    // Retypes a string to a number: parses fine, fails tsc (TS2322).
    code: 'export const v: string = "hello";\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          Literal(node: any) {
            if (node.value !== 'hello') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, '42'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-syntax-break',
    // Sits in the same program as the real corpus to keep proving that one
    // unparseable file does not zero out everybody else's diagnostics.
    code: 'export const fn = (a: number) => { return a + 1; };\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          ReturnStatement(node: any) {
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'return a +;'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-unbound-reference',
    // The #1521 shape, in a file that ALREADY has an unresolved name: the fix
    // emits `Timestamp.now()` with no `Timestamp` in scope. Must survive the
    // artifact filter.
    code: 'const missing = ghost;\nexport const at = new Date();\n',
    expectFlagged: true,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          NewExpression(node: any) {
            if (node.callee.name !== 'Date') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) => f.replaceText(node, 'Timestamp.now()'),
            });
          },
        };
      },
    },
  },
  {
    name: 'control-duplicate-reference',
    // The artifact: one more mention of a name that was already unresolvable.
    // Must NOT be flagged.
    code: 'export const flag = !ghost;\n',
    expectFlagged: false,
    rule: {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: { m: 'x' },
      },
      create(context: any) {
        return {
          UnaryExpression(node: any) {
            if (node.operator !== '!') return;
            if (node.argument.name !== 'ghost') return;
            context.report({
              node,
              messageId: 'm',
              fix: (f: any) =>
                f.replaceText(
                  node,
                  '(!ghost || Object.keys(ghost).length === 0)',
                ),
            });
          },
        };
      },
    },
  },
];

for (const control of CONTROLS) {
  linter.defineRule(`control/${control.name}`, control.rule as never);
}

/**
 * The cap counts *fix pairs*, not harvested snippets, and every snippet a rule
 * offers is scanned until that many pairs exist.
 *
 * Capping the harvest instead silently excluded rules (#1527). Snippets come out
 * in test-file order, `valid` cases first, and a rule with more than the cap's
 * worth of them spent its whole budget before reaching a single trigger — so it
 * contributed nothing and was listed as a rule with no fixable trigger,
 * indistinguishable from one that genuinely has none. `enforce-object-literal-
 * as-const` was the proof: 122 snippets, the first 30 all `valid`, and its
 * TS4104 defect (#1526) sat outside the window the guard could ever see.
 */
const MAX_PAIRS_PER_RULE = 30;

/**
 * A snippet that declares into the *shared* scope — `declare global`, or an
 * ambient/augmenting `declare module 'x'` — retypes every other file in the
 * corpus, because one program compiles them all. `export {}` makes each file a
 * module and so contains ordinary declarations; it cannot contain these.
 *
 * The damage is not hypothetical: one `prefer-map-over-conditional-dispatch`
 * fixture declares `namespace JSX { interface Element { readonly _brand: unique
 * symbol } }` globally, which brands `JSX.Element` for the whole corpus and
 * makes every component whose return type is concrete a TS2786 — in whichever
 * of the two corpora happens to have the concrete type. Such snippets are
 * dropped, and counted below.
 */
const DECLARES_INTO_SHARED_SCOPE = /\bdeclare\s+(?:global\b|module\s+['"])/;

const fixableRules = Object.entries(plugin.rules)
  .filter(([, rule]) => rule && rule.meta && rule.meta.fixable)
  .map(([name]) => name)
  .sort();

/**
 * Why a rule's fixer went unprobed, established by re-running the rule over the
 * same snippets: a rule that never reports on its own test corpus is a different
 * (and more surprising) fact than one that reports and declines to fix.
 */
const noFixReasonFor = (ruleId: string, snippets: string[]) => {
  let reported = false;
  let offeredFix = false;
  for (const snippet of snippets) {
    for (const filename of FILENAMES) {
      let messages;
      try {
        messages = linter.verify(snippet, configFor(ruleId), { filename });
      } catch {
        continue;
      }
      for (const message of messages) {
        // A parse failure surfaces as a message with no rule attached.
        if (message.ruleId !== ruleId) continue;
        reported = true;
        if (message.fix) offeredFix = true;
      }
    }
  }
  if (offeredFix) return 'offers a fix that the fix loop then discards';
  if (reported) return 'reports on its own snippets but never offers a fix';
  return 'never reports on any of its own snippets, under any probed filename';
};

const coverage = {
  noTestFile: [] as string[],
  noSnippets: [] as string[],
  neverFixed: [] as string[],
  illTypedInput: [] as string[],
  covered: [] as string[],
  unscannedTail: [] as string[],
};
const explanation = new Map<string, string>();

const pairs: Pair[] = [];
let harvested = 0;
let unscanned = 0;
let sharedScopeDropped = 0;
let interpolatedSkipped = 0;

for (const rule of fixableRules) {
  const testFile = path.join(TESTS_DIR, `${rule}.test.ts`);
  if (!fs.existsSync(testFile)) {
    coverage.noTestFile.push(rule);
    explanation.set(rule, `no ${rule}.test.ts to harvest triggers from`);
    continue;
  }
  const harvest = harvestSnippets(testFile);
  interpolatedSkipped += harvest.interpolated;
  const snippets = harvest.snippets.filter(
    (snippet) => !DECLARES_INTO_SHARED_SCOPE.test(snippet),
  );
  sharedScopeDropped += harvest.snippets.length - snippets.length;
  if (!snippets.length) {
    coverage.noSnippets.push(rule);
    explanation.set(
      rule,
      `its test file yields no corpusable snippet (${harvest.snippets.length} ` +
        `literal(s) harvested, ${
          harvest.snippets.length - snippets.length
        } declaring into the shared scope, ${
          harvest.interpolated
        } case(s) assembled by interpolation and so unharvestable)`,
    );
    continue;
  }
  harvested += snippets.length;
  let fixed = 0;
  let scanned = 0;
  for (const snippet of snippets) {
    if (fixed >= MAX_PAIRS_PER_RULE) break;
    scanned++;
    const result = fixWith(PREFIX + rule, snippet);
    if (!result) continue;
    pairs.push({
      rule,
      name: `${rule}__${fixed}.${
        result.filename.endsWith('.tsx') ? 'tsx' : 'ts'
      }`,
      before: snippet,
      after: result.output,
    });
    fixed++;
  }
  if (scanned < snippets.length) {
    coverage.unscannedTail.push(`${rule} ${snippets.length - scanned}`);
    unscanned += snippets.length - scanned;
  }
  if (!fixed) {
    coverage.neverFixed.push(rule);
    explanation.set(
      rule,
      `${snippets.length} snippets scanned; ${noFixReasonFor(
        PREFIX + rule,
        snippets,
      )}`,
    );
  }
}

const controlPairs: Pair[] = [];
for (const control of CONTROLS) {
  const result = fixWith(`control/${control.name}`, control.code);
  // A control whose fixer never fires would make its assertion vacuous, so it
  // is carried through as an empty pair and fails loudly below.
  controlPairs.push({
    rule: control.name,
    name: `${control.name}.ts`,
    before: control.code,
    after: result ? result.output : control.code,
  });
}

const allPairs = [...pairs, ...controlPairs];
const beforeDiagnostics = compileCorpus(
  allPairs.map((p) => ({ name: p.name, text: p.before })),
);
const afterDiagnostics = compileCorpus(
  allPairs.map((p) => ({ name: p.name, text: p.after })),
);

const introducedFor = (pair: Pair) =>
  introducedDiagnostics(
    beforeDiagnostics.get(pair.name) || [],
    afterDiagnostics.get(pair.name) || [],
  );

/**
 * The claim being tested is that an autofix does not turn *compiling* code into
 * non-compiling code, so a snippet that does not compile is no baseline at all.
 * Against a broken input the differential reports re-wordings rather than
 * defects, and every one of them costs a maintainer a full investigation:
 *
 *   before: TS2739: Type 'any[]' is missing ... from type 'Promise<[A, B]>'
 *   after:  TS2322: Type 'readonly [any, any]' is not assignable to 'Promise<[A, B]>'
 *
 * That pair (a non-`async` function annotated `Promise<...>` returning an array
 * literal) is not valid TypeScript with or without the fix, and the same shape
 * written `async` — the one that does compile — is already left alone. A pair
 * whose input carries a real type error is therefore excluded and reported,
 * never silently dropped.
 *
 * Unresolved *names* are the deliberate exception. The corpus is test fragments
 * full of identifiers no program defines; excluding those would leave nearly
 * nothing, and the artifact filter above already handles them in the diff.
 */
const baselineCompiles = (pair: Pair) =>
  (beforeDiagnostics.get(pair.name) || []).every(
    (diagnostic) => missingNameOf(diagnostic) !== null,
  );

const assertedPairs = pairs.filter(baselineCompiles);
const assertedByRule = new Set(assertedPairs.map((pair) => pair.rule));
for (const rule of fixableRules) {
  if (assertedByRule.has(rule)) {
    coverage.covered.push(rule);
    continue;
  }
  if (explanation.has(rule)) continue;
  const rulePairs = pairs.filter((pair) => pair.rule === rule);
  coverage.illTypedInput.push(rule);
  explanation.set(
    rule,
    `all ${rulePairs.length} fix pairs start from an input that does not ` +
      `type-check, e.g. ${
        rulePairs
          .flatMap((pair) => beforeDiagnostics.get(pair.name) || [])
          .find((diagnostic) => !missingNameOf(diagnostic)) || 'unknown'
      }`,
  );
}

const findingsByRule = new Map<string, Array<Pair & { added: string[] }>>();
for (const rule of fixableRules) findingsByRule.set(rule, []);
for (const pair of assertedPairs) {
  const added = introducedFor(pair);
  if (added.length) findingsByRule.get(pair.rule)!.push({ ...pair, added });
}

const controlOutcomes = controlPairs.map((pair) => ({
  name: pair.rule,
  fired: pair.after !== pair.before,
  flagged: introducedFor(pair).length > 0,
  baselineCompiles: baselineCompiles(pair),
}));

const report = (finding: Pair & { added: string[] }) =>
  [
    `introduced: ${finding.added.join(' | ')}`,
    '--- input (compiles) ---',
    finding.before,
    '--- after --fix (does not) ---',
    finding.after,
  ].join('\n');

const uncovered = [
  ...coverage.noTestFile,
  ...coverage.noSnippets,
  ...coverage.neverFixed,
  ...coverage.illTypedInput,
].sort();

const heldOutByRule = coverage.covered
  .map((rule) => {
    const total = pairs.filter((pair) => pair.rule === rule).length;
    const asserted = assertedPairs.filter((pair) => pair.rule === rule).length;
    return { rule, held: total - asserted, total };
  })
  .filter((entry) => entry.held > 0)
  .map((entry) => `${entry.rule} ${entry.held}/${entry.total}`);

/**
 * Printed, not merely asserted, and printed *per rule with its reason*: an
 * uncovered rule that lands in an unlabelled bucket reads as "this rule has no
 * fixable trigger" when the truth may be that the harness dropped it, which is
 * how #1526's defect stayed invisible under a rule the guard listed as swept.
 */
console.log(
  [
    `[fixer-type-safety] asserted ${assertedPairs.length} of ${pairs.length} ` +
      `fix pairs across ${coverage.covered.length} of ${fixableRules.length} ` +
      `fixable rules`,
    `  uncovered (${uncovered.length}), each with its reason:`,
    ...uncovered.map((rule) => `    ${rule}: ${explanation.get(rule)}`),
    `  pair cap ${MAX_PAIRS_PER_RULE}/rule left ${unscanned} of ${harvested} ` +
      `harvested snippets unscanned, in ${
        coverage.unscannedTail.length
      } rule(s) [unscanned tail]: ${
        coverage.unscannedTail.join(', ') || 'none'
      }`,
    `  ${sharedScopeDropped} snippet(s) dropped for declaring into the shared ` +
      `scope, ${interpolatedSkipped} case(s) unharvestable (interpolated)`,
    `  ${
      pairs.length - assertedPairs.length
    } pair(s) held out for an input that does not type-check, in ${
      heldOutByRule.length
    } covered rule(s) [held/total]: ${heldOutByRule.join(', ') || 'none'}`,
  ].join('\n'),
);

describe('an autofix must not turn compiling code into non-compiling code', () => {
  /**
   * Non-vacuity. Planted defects go through the same harvest, the same two
   * programs and the same diff as every rule below, so a broken harness cannot
   * degrade the assertions into a clean sweep.
   */
  it.each(CONTROLS.map((c) => [c.name, c.expectFlagged] as const))(
    'control %s is flagged: %s',
    (name, expectFlagged) => {
      const outcome = controlOutcomes.find((o) => o.name === name)!;
      expect(outcome.fired).toBe(true);
      // A control whose own input stopped type-checking would be held out by
      // the baseline gate and prove nothing about the gate's other side.
      expect(outcome.baselineCompiles).toBe(true);
      expect(outcome.flagged).toBe(expectFlagged);
    },
  );

  /**
   * Coverage floor. The per-rule assertions pass trivially if harvesting or
   * fixing breaks, so the corpus size is asserted rather than assumed.
   */
  it('compiles a meaningful share of the fixable rules', () => {
    expect(fixableRules.length).toBeGreaterThan(70);
    expect(coverage.covered.length).toBeGreaterThanOrEqual(74);
    expect(assertedPairs.length).toBeGreaterThanOrEqual(1300);
  });

  /**
   * "Uncovered" must never be a silent bucket (#1527). Every fixable rule lands
   * in exactly one bucket, and every rule outside `covered` carries a reason —
   * so a rule the harness drops can never again read as a rule with no fixable
   * trigger.
   */
  it('accounts for every fixable rule, uncovered ones by reason', () => {
    expect([...coverage.covered, ...uncovered].sort()).toEqual(fixableRules);
    expect(uncovered.filter((rule) => !explanation.get(rule))).toEqual([]);
  });

  it.each(fixableRules)('%s', (rule) => {
    const findings = findingsByRule.get(rule)!;
    // A finding means the fix must decline instead; see #1521, #1522, #1523.
    expect(findings.length === 0 ? '' : findings.map(report).join('\n\n')).toBe(
      '',
    );
  });
});
