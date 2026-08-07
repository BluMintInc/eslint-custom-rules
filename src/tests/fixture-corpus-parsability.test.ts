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
 */
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  FixtureCase,
} from '../utils/fixtureCorpus';

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

describe('fixture corpus parsability', () => {
  const corpus = harvestFixtureCorpus();
  const cases = [...corpus.byRule].flatMap(([rule, ruleCases]) =>
    ruleCases
      .filter((testCase) => testCase.bucket !== 'output')
      .map((testCase) => ({ rule, testCase })),
  );

  it('harvests a corpus big enough for the check to mean anything', () => {
    // Guards against the require-cache collapse that makes a second harvest
    // return zero suites and every downstream assertion vacuously true.
    expect(corpus.suitesUsed).toBeGreaterThan(250);
    expect(cases.length).toBeGreaterThan(10000);
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
