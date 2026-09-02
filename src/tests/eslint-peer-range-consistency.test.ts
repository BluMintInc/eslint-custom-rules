import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { satisfies } from 'semver';
import { Linter } from 'eslint';
import { parse } from '@typescript-eslint/typescript-estree';
import { rules } from '../index';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  defaultFilenameFor,
  severityWithOptions,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * The published `peerDependencies.eslint` range is a promise about which ESLint
 * majors this plugin runs on, and it has been broken from BOTH ends.
 *
 * Above: it was `>=7` while 33 rules called `context.getScope()` and friends,
 * which ESLint 9 removed — a consumer installed cleanly and then every lint run
 * aborted with `TypeError: context.getScope is not a function` (#1540).
 *
 * Below: 58 rule files read the rule context's `sourceCode` PROPERTY, which
 * ESLint adds in 8.40.0, while the range still admitted 7.x and 8.0-8.39. On any
 * such install the property is `undefined` and the first visitor to touch it
 * throws, aborting the whole file's lint. Driving each rule over its own
 * fixtures (23,932 cases) under a context of that shape, 62 of the 194 rules
 * with a corpus threw, and none of the 62 threw under a modern context (#2251).
 *
 * The whole suite passes on the dev-installed 8.57.1 whether or not the source
 * is safe at either end, so nothing else can catch this. The three arms below
 * pin the floor, and the arm further down pins the ceiling.
 */

const SRC = join(__dirname, '..');
const PKG = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as { peerDependencies?: Record<string, string> };

/** Rule-context methods ESLint 9 removed, with their SourceCode replacements. */
const REMOVED_IN_V9 = [
  'getScope',
  'getDeclaredVariables',
  'getAncestors',
  'markVariableAsUsed',
  'getSource',
  'getSourceLines',
  'getAllComments',
  'getNodeByRangeIndex',
] as const;

const CALL_PATTERN = new RegExp(
  `context\\.(${REMOVED_IN_V9.join('|')})\\(`,
  'g',
);

const declaredRange = PKG.peerDependencies?.eslint;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFilesUnder(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

const sourceFiles = [
  ...tsFilesUnder(join(SRC, 'rules')),
  ...tsFilesUnder(join(SRC, 'utils')),
];

const offenders = sourceFiles
  .map((file) => {
    const matches = [
      ...new Set(
        [...readFileSync(file, 'utf8').matchAll(CALL_PATTERN)].map((m) => m[1]),
      ),
    ];
    return { file: file.slice(SRC.length + 1), matches };
  })
  .filter((entry) => entry.matches.length > 0);

/* ------------------------------------------------------------------ *
 * Floor: the rule context's `sourceCode` property is 8.40+ only.
 * ------------------------------------------------------------------ */

/** The property ESLint adds to the rule context in 8.40.0. */
const CONTEXT_SOURCE_CODE = 'sourceCode';

/**
 * The accessor every major in the declared range exposes. Present well before
 * 7 and retained through 9 — ESLint 9 removes the context's `getScope`,
 * `getAncestors`, `getDeclaredVariables` and friends, but not this one.
 */
const VERSION_SAFE_ACCESSOR = 'getSourceCode';

/**
 * Identifiers that name an ESLint rule context in this codebase.
 *
 * `ruleContext` is deliberately absent: `logical-top-to-bottom-grouping` binds
 * that name to a rule-local record which legitimately carries an
 * already-resolved SourceCode, and flagging it would be a false positive.
 */
const CONTEXT_RECEIVERS = new Set(['context', 'ctx']);

type AnyNode = { type: string; [key: string]: unknown };

const isNode = (value: unknown): value is AnyNode =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as AnyNode).type === 'string';

function walk(node: unknown, visit: (node: AnyNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isNode(node)) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    walk(value, visit);
  }
}

/** Casts do not change the receiver, so they must not hide it either. */
const CAST_TYPES = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSSatisfiesExpression',
]);

const unwrapCasts = (node: unknown): unknown => {
  let current = node;
  while (isNode(current) && CAST_TYPES.has(current.type)) {
    current = current.expression;
  }
  return current;
};

const isContextReceiver = (node: unknown): boolean => {
  const inner = unwrapCasts(node);
  return (
    isNode(inner) &&
    inner.type === 'Identifier' &&
    CONTEXT_RECEIVERS.has(inner.name as string)
  );
};

/**
 * Every way this codebase has actually spelled the read, found by AST rather
 * than by text.
 *
 * A `context.sourceCode` substring scan is what a text guard reduces to, and it
 * is measurably insufficient: it misses `const { sourceCode } = context` (5
 * sites) and `(context as unknown as {...}).sourceCode` (9 sites) — 14 of the
 * reads present when #2251 was filed. Matching the AST also makes the guard
 * immune to its own positive controls, which are strings here rather than code.
 */
function contextSourceCodeReadsIn(code: string): string[] {
  const found: string[] = [];
  // Every scanned file is `.ts`, where `<T extends object>` is a type parameter
  // list. Enabling JSX makes that a fatal parse, and a file that fails to parse
  // contributes no reads — indistinguishable from a file that has none.
  const ast = parse(code, { jsx: false, loc: true });
  walk(ast, (node) => {
    const where = (n: AnyNode) =>
      `line ${(n.loc as { start: { line: number } } | undefined)?.start.line}`;

    if (
      node.type === 'MemberExpression' &&
      node.computed === false &&
      isNode(node.property) &&
      node.property.type === 'Identifier' &&
      node.property.name === CONTEXT_SOURCE_CODE &&
      isContextReceiver(node.object)
    ) {
      found.push(`${where(node)}: member read`);
    }

    if (
      node.type === 'VariableDeclarator' &&
      isNode(node.id) &&
      node.id.type === 'ObjectPattern' &&
      isContextReceiver(node.init)
    ) {
      for (const property of (node.id.properties ?? []) as AnyNode[]) {
        if (
          property.type === 'Property' &&
          property.computed === false &&
          isNode(property.key) &&
          property.key.type === 'Identifier' &&
          property.key.name === CONTEXT_SOURCE_CODE
        ) {
          found.push(`${where(property)}: destructured`);
        }
      }
    }
  });
  return found;
}

/** Every `.ts` under `src/`, so a read cannot hide in a directory nobody scans. */
const allSrcFiles = tsFilesUnder(SRC);

/** Files the scan could not parse, and so could not have found a read in. */
const unparsedFiles: string[] = [];

const propertyReadOffenders = allSrcFiles
  .map((file) => {
    const shortName = file.slice(SRC.length + 1);
    try {
      return {
        file: shortName,
        reads: contextSourceCodeReadsIn(readFileSync(file, 'utf8')),
      };
    } catch (error) {
      unparsedFiles.push(
        `${shortName}: ${error instanceof Error ? error.message : error}`,
      );
      return { file: shortName, reads: [] as string[] };
    }
  })
  .filter((entry) => entry.reads.length > 0);

/**
 * Declaring the property on `RuleContext` is what let the reads compile: with
 * the augmentation in place tsc blesses exactly the call sites that throw, so
 * the build stops being a check and the drift is invisible until a consumer on
 * an older ESLint runs it.
 */
const declarationFiles = allSrcFiles.filter((file) => file.endsWith('.d.ts'));

const augmentsRuleContextWithSourceCode = (code: string): boolean =>
  /interface\s+RuleContext(?:[\s\S](?!^\}))*?\breadonly\s+sourceCode\b/m.test(
    code,
  );

const augmentationOffenders = declarationFiles
  .filter((file) =>
    augmentsRuleContextWithSourceCode(readFileSync(file, 'utf8')),
  )
  .map((file) => file.slice(SRC.length + 1));

/* ---- Behavioural arm: drive every rule under a pre-8.40 context ---- */

/**
 * A rule context shaped the way ESLint exposed it before 8.40: `sourceCode` is
 * absent, `getSourceCode()` works. This reproduces the consumer failure without
 * installing an older ESLint, and — unlike the static arms — it is keyed on the
 * crash rather than on any spelling.
 *
 * The context is frozen, so the `get` trap must return the target's own
 * property values verbatim or the proxy invariant throws and every rule looks
 * broken. `sourceCode` is inherited from the shared traversal prototype rather
 * than owned, which is what makes hiding it legal.
 */
function preEslint840Shaped<T extends object>(context: T): T {
  return new Proxy(context, {
    get(target, property, receiver) {
      if (property === CONTEXT_SOURCE_CODE) return undefined;
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (property === CONTEXT_SOURCE_CODE) return false;
      return Reflect.has(target, property);
    },
  });
}

/**
 * Each rule is driven over ITS OWN fixtures rather than one shared snippet.
 *
 * A hand-written snippet only reaches the rules whose trigger it happens to
 * contain, and the reads are spread across 58 files with no common shape: the
 * snippet this arm started from caught 18 of the 62 rules that actually throw,
 * so 44 of them would have read as clean. A rule's own corpus is by
 * construction the input that drives it, which is what closes that gap.
 *
 * The corpus is built with `fixtureCorpus`, never by hand — a fixture's
 * filename follows its CODE (`defaultFilenameFor`) and its parser follows the
 * tester that declared it (`parserKeyFor`), and choosing either by hand is what
 * turned 106 valid cases into a fatal parse in #1984. `options` reach the lint
 * through `severityWithOptions`, since a rule gated behind a non-default option
 * would otherwise never run the branch that reads the property.
 */
type ProbeEntry = { name: string; rule: unknown; cases: FixtureCase[] };

type SweepResult = {
  crashes: { rule: string; message: string }[];
  rulesDriven: number;
  rulesWithCases: number;
  casesLinted: number;
  reports: number;
  fatals: number;
};

function sweepUnder(
  shape: <T extends object>(context: T) => T,
  entries: ProbeEntry[],
): SweepResult {
  const result: SweepResult = {
    crashes: [],
    rulesDriven: 0,
    rulesWithCases: 0,
    casesLinted: 0,
    reports: 0,
    fatals: 0,
  };
  for (const { name, rule, cases } of entries) {
    const id = `probe/${name}`;
    const linter = new Linter();
    defineCorpusParsers(linter);
    const module = rule as { create: (context: object) => object };
    linter.defineRule(id, {
      ...(rule as object),
      create: (context: object) => module.create(shape(context)),
    } as never);
    result.rulesDriven += 1;
    if (cases.length === 0) continue;
    result.rulesWithCases += 1;

    for (const testCase of cases) {
      try {
        const messages = linter.verify(
          testCase.code,
          {
            parser: parserKeyFor(testCase),
            parserOptions: parserOptionsFor(testCase),
            rules: { [id]: severityWithOptions(testCase) },
          } as never,
          defaultFilenameFor(testCase),
        );
        result.casesLinted += 1;
        for (const message of messages) {
          if (message.fatal) result.fatals += 1;
          else if (message.ruleId === id) result.reports += 1;
        }
      } catch (error) {
        result.crashes.push({
          rule: name,
          message: String(
            error instanceof Error ? error.message.split('\n')[0] : error,
          ),
        });
        // The first crash settles this rule. Its remaining cases can only
        // re-throw the same way, and letting them would report one rule many
        // times while multiplying the sweep's cost.
        break;
      }
    }
  }
  return result;
}

const corpus = harvestFixtureCorpus();

const ruleEntries: ProbeEntry[] = Object.entries(rules).map(([name, rule]) => ({
  name,
  rule,
  cases: corpus.byRule.get(name) ?? [],
}));

const identityShape = <T extends object>(context: T): T => context;

/** A planted control rule is not in the corpus, so it brings its own case. */
const plantedEntry = (name: string, rule: unknown): ProbeEntry[] => [
  {
    name,
    rule,
    cases: [
      {
        code: 'export const value = 1;',
        tester: 'ruleTesterTs',
        language: 'ts',
        origin: __filename,
        bucket: 'valid',
      },
    ],
  },
];

describe('eslint peer range must match the context APIs the source uses', () => {
  it('scans a meaningful number of source files', () => {
    // Without this floor a broken glob would empty `offenders` and the range
    // assertion below would pass while proving nothing.
    expect(sourceFiles.length).toBeGreaterThan(150); // measured 230
  });

  it('declares an eslint peer range', () => {
    expect(typeof declaredRange).toBe('string');
  });

  it('does not advertise an ESLint major whose removed APIs the source calls', () => {
    const range = declaredRange ?? '';
    const admitsV9 = satisfies('9.0.0', range, {
      includePrerelease: true,
    });
    if (!admitsV9 || offenders.length === 0) {
      expect(true).toBe(true);
      return;
    }
    const detail = offenders
      .map(
        (o) =>
          `  ${o.file}: ${o.matches.map((m) => `context.${m}()`).join(', ')}`,
      )
      .join('\n');
    expect(
      `peerDependencies.eslint is "${range}", which admits ESLint 9, but ${offenders.length} source file(s) still call APIs ESLint 9 removed:\n${detail}\n` +
        '  Either migrate these to the SourceCode equivalents (sourceCode.getScope(node), ...) or keep the range below 9.',
    ).toBe('');
  });

  it('detects the mismatch it is meant to catch (positive control)', () => {
    // Proves the range check can go red: the historical ">=7" plus today's
    // call sites is exactly the #1540 defect.
    const admitsV9 = satisfies('9.0.0', '>=7', {
      includePrerelease: true,
    });
    expect(admitsV9 && offenders.length > 0).toBe(true);
  });
});

describe('the declared peer floor admits ESLint versions without context.sourceCode', () => {
  const admitsPre840 =
    satisfies('7.0.0', declaredRange ?? '', { includePrerelease: true }) ||
    satisfies('8.0.0', declaredRange ?? '', { includePrerelease: true });

  it('still admits an ESLint that predates the property, so the arms below bind', () => {
    // If the range is ever raised past 8.40 these arms become optional rather
    // than load-bearing, and a reader needs to know which world they are in.
    expect(admitsPre840).toBe(true);
  });

  it('scans every source file under src/, not just rules and utils', () => {
    // A read that moved into a directory the scan misses is indistinguishable
    // from no read at all.
    // Measured 599; the floor sits just under so that files quietly vanishing
    // from the scan fails rather than passes smaller.
    expect(allSrcFiles.length).toBeGreaterThan(590); // measured 601
    expect(allSrcFiles.length).toBeGreaterThan(sourceFiles.length);
    expect(declarationFiles.length).toBeGreaterThanOrEqual(1); // measured 3
    // A file that fails to parse yields no reads, which reads exactly like a
    // clean file unless the skip is asserted.
    expect(unparsedFiles).toEqual([]);
  });

  it('never reads the rule context sourceCode property', () => {
    const detail = propertyReadOffenders
      .map((entry) => `  ${entry.file}: ${entry.reads.join(', ')}`)
      .join('\n');
    expect(
      propertyReadOffenders.length === 0
        ? ''
        : `The rule context 'sourceCode' property lands in ESLint 8.40.0, but peerDependencies.eslint is "${declaredRange}".\n` +
            `On a peer-satisfying older ESLint the property is undefined and the first visitor to touch it throws,\n` +
            `aborting the whole file's lint. ${propertyReadOffenders.length} file(s) read it:\n${detail}\n` +
            `  Use context.${VERSION_SAFE_ACCESSOR}(), which every major in the range exposes.`,
    ).toBe('');
  });

  it('does not re-declare the property on RuleContext', () => {
    // Restoring the augmentation would make tsc bless the crashing sites again,
    // which is how the drift survived 58 files unnoticed.
    expect(augmentationOffenders).toEqual([]);
  });

  it('detects every spelling the codebase has used (positive controls)', () => {
    // Each of these was present in src/ when #2251 was filed. The third and
    // fourth are the ones a `context.sourceCode` substring scan misses, which
    // is why this arm reads the AST.
    expect(
      contextSourceCodeReadsIn('const s = context.sourceCode;'),
    ).toHaveLength(1);
    expect(
      contextSourceCodeReadsIn('const t = context.sourceCode.getText();'),
    ).toHaveLength(1);
    expect(
      contextSourceCodeReadsIn('const { sourceCode } = context;'),
    ).toHaveLength(1);
    expect(
      contextSourceCodeReadsIn(
        'const s = (context as unknown as { sourceCode?: X }).sourceCode;',
      ),
    ).toHaveLength(1);
    expect(
      contextSourceCodeReadsIn(
        'const d = context.sourceCode; const { sourceCode } = ctx;',
      ),
    ).toHaveLength(2);

    expect(
      augmentsRuleContextWithSourceCode(
        [
          "declare module '@typescript-eslint/utils/ts-eslint' {",
          '  interface RuleContext<',
          '    TMessageIds extends string,',
          '    TOptions extends readonly unknown[],',
          '  > {',
          '    readonly sourceCode: TSESLint.SourceCode;',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toBe(true);
  });

  it('does not flag the version-safe accessor or unrelated receivers (negative controls)', () => {
    // Without these the arm above would pass just as well by flagging
    // everything, and the migration it demands would be unsatisfiable.
    expect(
      contextSourceCodeReadsIn(`const s = context.${VERSION_SAFE_ACCESSOR}();`),
    ).toEqual([]);
    expect(
      contextSourceCodeReadsIn('const t = this.sourceCode.getText();'),
    ).toEqual([]);
    expect(
      contextSourceCodeReadsIn('const { context, sourceCode } = ruleContext;'),
    ).toEqual([]);
    expect(
      contextSourceCodeReadsIn(
        'const s = input.sourceCode; const c = { sourceCode };',
      ),
    ).toEqual([]);
    expect(
      contextSourceCodeReadsIn("const doc = 'context.sourceCode is 8.40+';"),
    ).toEqual([]);
    expect(
      augmentsRuleContextWithSourceCode(
        'interface SourceCode { getAncestors(node: Node): Node[] }',
      ),
    ).toBe(false);
  });
});

describe('every rule survives a rule context shaped as ESLint exposed it before 8.40', () => {
  const legacy = sweepUnder(preEslint840Shaped, ruleEntries);
  const modern = sweepUnder(identityShape, ruleEntries);

  it('drives every registered rule against a non-empty corpus', () => {
    expect(legacy.rulesDriven).toBe(ruleEntries.length);
    expect(legacy.rulesDriven).toBeGreaterThan(190); // measured 194
    // A rule whose fixtures went missing is driven over nothing, which reads
    // exactly like a rule that survived. Measured: 194 of 194.
    expect(legacy.rulesWithCases).toBe(legacy.rulesDriven);
  });

  it('is not vacuous: the corpus makes rules do work and parses cleanly', () => {
    // A corpus that reported nothing would let every rule "survive" by never
    // running a visitor, and a fatal parse is indistinguishable from silence.
    // Floors sit just under the measurement (23,932 cases / 11,541 reports) so
    // that a corpus which quietly shrinks fails rather than passes smaller.
    expect(modern.casesLinted).toBeGreaterThan(23000); // measured 23,980
    expect(modern.reports).toBeGreaterThan(11000); // measured 11,563
    expect(modern.fatals).toBe(0);
    expect(legacy.fatals).toBe(0);
  });

  it('no rule throws when the context omits the property', () => {
    const detail = legacy.crashes
      .map((crash) => `  ${crash.rule}: ${crash.message}`)
      .join('\n');
    expect(
      legacy.crashes.length === 0
        ? ''
        : `${legacy.crashes.length} rule(s) throw on a context without 'sourceCode',\n` +
            `which every ESLint below 8.40 in the declared peer range "${declaredRange}" hands them:\n${detail}`,
    ).toBe('');
  });

  it('the same rules are clean under a modern context, so the shape is the variable', () => {
    // A rule that throws under BOTH shapes is a different defect, and must not
    // be attributed to the property.
    expect(modern.crashes).toEqual([]);
  });

  it('catches a rule that reads the property (positive control)', () => {
    const reader = {
      meta: { type: 'problem', schema: [], messages: { m: 'x' } },
      create: (context: Record<string, { getText(): string }>) => ({
        Program() {
          // The read the 58 files of #2251 perform. Spelled through the shared
          // constant rather than as `context.sourceCode` so that the STATIC arm
          // above does not flag this file as an offender — and, incidentally,
          // demonstrating that this arm is keyed on the crash, not the spelling.
          context[CONTEXT_SOURCE_CODE].getText();
        },
      }),
    };
    const swept = sweepUnder(
      preEslint840Shaped,
      plantedEntry('planted-reader', reader),
    );
    expect(swept.crashes).toHaveLength(1);
    expect(swept.crashes[0].message).toMatch(/undefined/);

    // And it is genuinely the SHAPE that breaks it, not the rule.
    expect(
      sweepUnder(identityShape, plantedEntry('planted-reader', reader)).crashes,
    ).toEqual([]);
  });

  it('passes a rule that uses the version-safe accessor (negative control)', () => {
    const accessor = {
      meta: { type: 'problem', schema: [], messages: { m: 'x' } },
      create: (context: { getSourceCode(): { getText(): string } }) => ({
        Program() {
          context.getSourceCode().getText();
        },
      }),
    };
    expect(
      sweepUnder(preEslint840Shaped, plantedEntry('planted-accessor', accessor))
        .crashes,
    ).toEqual([]);
  });
});
