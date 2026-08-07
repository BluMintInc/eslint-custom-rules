/**
 * Every harvested fixture must PARSE under the filename the corpus assigns it.
 *
 * The extension is not cosmetic: `.ts` alone accepts the angle-bracket assertion
 * `<T>expr` and `.tsx` alone accepts JSX, so picking it from the tester that
 * declared a case rather than from the case itself makes the mismatched ones a
 * FATAL parse. That failure is invisible by construction — every consumer
 * filters messages by `ruleId`/`messageId`, and a fatal carries neither, so a
 * fixture that never parsed is indistinguishable from a rule that stayed silent.
 *
 * It ran at 168 of 13,584 cases, and the damage was not evenly spread: 70 of
 * `no-margin-properties`' 87 cases and 63 of
 * `prefer-nullish-coalescing-boolean-props`' 142 were being discarded, so guards
 * built on this corpus were asserting over four fifths less than they appeared
 * to. It also manufactured a finding — a report-site audit called two
 * `no-margin-properties` detectors untested when existing fixtures pin both.
 *
 * A count is the wrong shape for this gate, so it asserts ZERO and names every
 * offender: a floor calibrated once decays as rules are added, whereas "no
 * fixture is unparsable" stays true or fails loudly.
 *
 * The same argument decides the PARSER, not just the extension. The corpus
 * carries JSON and Markdown fixtures — the only fixtures two registered,
 * `recommended: 'error'`, autofixing rules have (#1860) — and handing those to
 * `@typescript-eslint/parser` is a fatal in exactly the same invisible way. Each
 * case is parsed by the parser its own tester declared.
 *
 * NON-VACUITY IS PER-RULE, NOT A GLOBAL FLOOR (#1863). "No fixture is
 * unparsable" is trivially true of a corpus that shrank, and a floor of 10,000
 * against 14,586 cases leaves a third of the corpus free to vanish inside a
 * still-passing sum. Worse, the harvest's OWN failure list was never asserted:
 * a fifth of the suites could fail to load while this gate swept the shrunken
 * remainder and called it clean — the exact shape that let a partial harvest go
 * unnoticed. So the check is closed both ways against the plugin's rule map,
 * which is the one population outside the corpus: every registered rule must
 * contribute a parsed fixture or be a named skip carrying a measured cause, and
 * a named skip that becomes parsable fails as stale.
 */
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  FixtureCase,
  FixtureLanguage,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, unknown> };
/* eslint-enable @typescript-eslint/no-var-requires */

const linter = new Linter();
defineCorpusParsers(linter);

/**
 * Parsing is the whole question, so no rule is registered: with an empty rule
 * set `verify` still parses, and a parse failure is the only message it can
 * emit.
 */
const parseErrorFor = (testCase: FixtureCase, filename: string) => {
  try {
    const messages = linter.verify(
      testCase.code,
      {
        parser: parserKeyFor(testCase),
        parserOptions: parserOptionsFor(testCase),
        rules: {},
      },
      { filename },
    );
    return messages.find((message) => message.fatal)?.message ?? null;
  } catch (error) {
    return `threw: ${(error as Error).message}`;
  }
};

const corpus = harvestFixtureCorpus();
const registeredRules = Object.keys(plugin.rules).sort();

const cases = [...corpus.byRule].flatMap(([rule, ruleCases]) =>
  ruleCases
    .filter((testCase) => testCase.bucket !== 'output')
    .map((testCase) => ({ rule, testCase })),
);

/**
 * Why a registered rule could contribute no parsed fixture, read off the
 * corpus rather than asserted by hand.
 *
 * `noCorpus` is derived from the corpus itself, so a rule that loses its
 * fixtures enters the accounting automatically; `onlyAlreadyFixedFixtures` is a
 * fact about which BUCKETS a rule declares, which no metadata announces.
 */
const UNPARSED_CAUSES = {
  noCorpus:
    'the harvest holds no fixture for it at all, so there is nothing here to parse',
  onlyAlreadyFixedFixtures:
    'declares only `output` states, which this gate excludes because an output is a fixed copy of a case it already parsed',
} as const;
type UnparsedCause = keyof typeof UNPARSED_CAUSES;

/** Cases actually handed to a parser, per rule and per language. */
const parsedByRule = new Map<string, number>();
const parsedByLanguage = new Map<FixtureLanguage, number>();
for (const { rule, testCase } of cases) {
  parsedByRule.set(rule, (parsedByRule.get(rule) || 0) + 1);
  parsedByLanguage.set(
    testCase.language,
    (parsedByLanguage.get(testCase.language) || 0) + 1,
  );
}

const unparsedCauseOf = (rule: string): UnparsedCause | null => {
  if (parsedByRule.get(rule)) return null;
  return corpus.byRule.get(rule)?.length
    ? 'onlyAlreadyFixedFixtures'
    : 'noCorpus';
};

const measuredUnparsed: Record<string, UnparsedCause> = Object.fromEntries(
  registeredRules
    .map((rule) => [rule, unparsedCauseOf(rule)] as const)
    .filter((entry): entry is readonly [string, UnparsedCause] => !!entry[1]),
);

/**
 * Registered rules with no fixture this gate parses, each with the measured
 * cause.
 *
 * SHIPS EMPTY: all 194 registered rules contribute at least one `valid` or
 * `invalid` fixture. It is the place a skip must be written down, because a rule
 * dropping out of the corpus is otherwise indistinguishable from a rule whose
 * fixtures all parse — both leave this gate green. Asserted as an exact map, so
 * an unrecorded skip, a stale entry and a changed cause all fail.
 */
const UNPARSED_RULES: Record<string, UnparsedCause> = {};

describe('fixture corpus parsability', () => {
  it('harvests a corpus big enough for the check to mean anything', () => {
    // The harvest's own failures, asserted rather than inherited: a suite that
    // throws while loading contributes nothing, and this gate would sweep the
    // shrunken remainder and report zero unparsable fixtures.
    expect(corpus.failures).toEqual([]);
    // Guards against the require-cache collapse that makes a second harvest
    // return zero suites and every downstream assertion vacuously true.
    expect(corpus.suitesUsed).toBeGreaterThan(250);
    expect(cases.length).toBeGreaterThan(10000);
  });

  /**
   * The rule dimension, closed both ways against `plugin.rules` — the one
   * population that is not derived from the corpus, so a corpus that collapsed
   * cannot satisfy it by shrinking both sides together.
   */
  it('parses a fixture for every registered rule', () => {
    expect(measuredUnparsed).toEqual(UNPARSED_RULES);
    expect(registeredRules.length).toBeGreaterThan(150);
    // Every cause recorded must be one this file knows how to measure, and
    // every entry must name a registered rule, or it is an exemption nothing
    // can ever retire.
    expect(
      Object.values(UNPARSED_RULES).filter((cause) => !UNPARSED_CAUSES[cause]),
    ).toEqual([]);
    expect(
      Object.keys(UNPARSED_RULES).filter(
        (rule) => !registeredRules.includes(rule),
      ),
    ).toEqual([]);
  });

  /**
   * The parser dimension, per member rather than in the aggregate. A language
   * whose fixtures stopped being harvested leaves its parser untested while the
   * total case count barely moves — TypeScript is 99% of the corpus, so the
   * JSON and Markdown arms are exactly what an aggregate floor cannot see.
   */
  it('parses a fixture in every language the corpus carries', () => {
    const languages: FixtureLanguage[] = ['ts', 'json', 'markdown'];
    expect(
      languages.filter((language) => !parsedByLanguage.get(language)),
    ).toEqual([]);
    expect(parsedByLanguage.get('ts')).toBeGreaterThan(10000);
  });

  it('assigns every case a filename its own syntax can parse', () => {
    const unparsable = cases
      .map(({ rule, testCase }) => {
        const filename = defaultFilenameFor(testCase);
        const error = parseErrorFor(testCase, filename);
        return error
          ? `${rule} (${testCase.origin}, ${
              testCase.bucket
            }) as ${filename}: ${error}\n    ${testCase.code
              .trim()
              .slice(0, 120)}`
          : null;
      })
      .filter(Boolean);

    expect(unparsable).toEqual([]);
  });

  /**
   * The gate above passes if the extension logic is disabled AND no fixture
   * needs it, so both directions of the correction are planted here. Each shape
   * is legal in exactly one extension, which is what makes the pair a control
   * rather than a restatement.
   */
  it('corrects a tester whose implied extension cannot parse the snippet', () => {
    const jsxInTsSuite = {
      code: 'const Node = <div className="x" />;',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(jsxInTsSuite)).toBe('file.tsx');
    expect(parseErrorFor(jsxInTsSuite, 'file.ts')).not.toBeNull();

    const assertionInJsxSuite = {
      code: "function getData() { return <SomeType>{ foo: 'bar' }; }",
      tester: 'ruleTesterJsx',
      language: 'ts',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(assertionInJsxSuite)).toBe('react.ts');
    expect(parseErrorFor(assertionInJsxSuite, 'react.tsx')).not.toBeNull();
  });

  /**
   * The correction must fire ONLY on a fatal. A snippet legal both ways that
   * drifted to the other extension would silently change which fixtures reach
   * every path-gated rule.
   */
  it('leaves a snippet that parses either way on its tester extension', () => {
    const plain = {
      code: 'const total = 1 + 2;',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(plain)).toBe('file.ts');

    const generic = {
      code: 'const wrap = <T,>(value: T) => [value];',
      tester: 'ruleTesterJsx',
      language: 'ts',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(generic)).toBe('react.tsx');
  });

  it('never overrides a filename the case declares', () => {
    const declared = {
      code: 'const Node = <div />;',
      filename: 'src/hooks/useThing.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(declared)).toBe('src/hooks/useThing.ts');
  });

  /**
   * The parser is the second half of "parses under the name it is given", and it
   * fails the same silent way: a JSON fixture read by the TypeScript parser is a
   * fatal carrying no `ruleId`, which every consumer reads as the rule staying
   * quiet. Both directions are planted so the gate cannot pass by the corpus
   * merely happening to hold no non-TypeScript fixture.
   */
  it('parses a non-TypeScript fixture with the parser its tester declared', () => {
    const json = {
      code: '{"dependencies": {"eslint": "^8.19.0"}}',
      tester: 'ruleTesterJson',
      language: 'json',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(json)).toBe('package.json');
    expect(parseErrorFor(json, 'package.json')).toBeNull();
    expect(
      parseErrorFor({ ...json, language: 'ts' } as FixtureCase, 'file.ts'),
    ).not.toBeNull();

    const markdown = {
      code: ['# Title', '', '```', 'const example = 1;', '```'].join('\n'),
      tester: 'ruleTesterMarkdown',
      language: 'markdown',
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(markdown)).toBe('docs/example.md');
    expect(parseErrorFor(markdown, 'docs/example.md')).toBeNull();
    expect(
      parseErrorFor({ ...markdown, language: 'ts' } as FixtureCase, 'file.ts'),
    ).not.toBeNull();
  });
});
