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
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  FixtureCase,
} from '../utils/fixtureCorpus';

const linter = new Linter();
linter.defineParser('ts', tsParser as never);

/**
 * Parsing is the whole question, so no rule is registered: with an empty rule
 * set `verify` still parses, and a parse failure is the only message it can
 * emit.
 */
const parseErrorFor = (testCase: FixtureCase, filename: string) => {
  try {
    const messages = linter.verify(
      testCase.code,
      { parser: 'ts', parserOptions: parserOptionsFor(testCase), rules: {} },
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
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(jsxInTsSuite)).toBe('file.tsx');
    expect(parseErrorFor(jsxInTsSuite, 'file.ts')).not.toBeNull();

    const assertionInJsxSuite = {
      code: "function getData() { return <SomeType>{ foo: 'bar' }; }",
      tester: 'ruleTesterJsx',
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
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(plain)).toBe('file.ts');

    const generic = {
      code: 'const wrap = <T,>(value: T) => [value];',
      tester: 'ruleTesterJsx',
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
      origin: 'planted',
      bucket: 'valid',
    } as FixtureCase;
    expect(defaultFilenameFor(declared)).toBe('src/hooks/useThing.ts');
  });
});
