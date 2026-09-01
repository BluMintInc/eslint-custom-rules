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
 * unparsable" is trivially true of a corpus that shrank, and a global floor
 * left far under its measurement leaves a third of the corpus free to vanish
 * inside a still-passing sum. Worse, the harvest's OWN failure list was never
 * asserted: a fifth of the suites could fail to load while this gate swept the
 * shrunken remainder and called it clean — the exact shape that let a partial
 * harvest go unnoticed. So the check is closed both ways against the plugin's
 * rule map, which is the one population outside the corpus: every registered
 * rule must contribute a parsed fixture or be a named skip carrying a measured
 * cause, and a named skip that becomes parsable fails as stale.
 *
 * "Contributes a fixture" is not the same claim as "contributes its fixtures",
 * and the loss above satisfies the first: 17 of 87 cases survived it. The
 * per-rule counts in `PARSED_CASES_BY_RULE` carry the second, since every
 * aggregate here is dominated by the twenty rules holding hundreds of cases.
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

/**
 * Cases each registered rule contributes to this gate, measured at 1.20.198.
 *
 * The map above is satisfied by ONE parsed fixture per rule, and the loss it
 * exists to catch clears that threshold comfortably: the harvest that discarded
 * 70 of `no-margin-properties`' 87 cases left 17 behind, so "the rule
 * contributes something" held throughout while four fifths of its corpus was
 * gone. Every other number in this file is an aggregate dominated by the twenty
 * rules with hundreds of fixtures, so a per-rule count is the only shape that
 * separates a rule whose corpus shrank from one whose corpus is intact.
 *
 * Held as a floor with a retention margin rather than as an equality, because
 * fixtures accumulate and a rewrite that merges two cases into one is ordinary
 * churn — losing a fifth of a rule's corpus is not. Closed both ways against
 * `plugin.rules`: a registered rule with no entry fails, and an entry naming an
 * unregistered rule fails, so the map cannot decay into a partial list that
 * certifies only the rules it happens to name.
 */
const PARSED_CASES_BY_RULE: Record<string, number> = {
  'array-methods-this-context': 11,
  'avoid-utils-directory': 9,
  'class-methods-read-top-to-bottom': 111,
  'consistent-callback-naming': 166,
  'dynamic-https-errors': 131,
  'enforce-assert-safe-object-key': 400,
  'enforce-assert-throws': 174,
  'enforce-boolean-naming-prefixes': 669,
  'enforce-callable-types': 11,
  'enforce-callback-memo': 118,
  'enforce-centralized-mock-firestore': 89,
  'enforce-cloud-function-id-length': 30,
  'enforce-console-error': 114,
  'enforce-css-media-queries': 63,
  'enforce-date-ttime': 43,
  'enforce-dynamic-file-naming': 45,
  'enforce-dynamic-firebase-imports': 162,
  'enforce-dynamic-imports': 99,
  'enforce-early-destructuring': 79,
  'enforce-empty-object-check': 92,
  'enforce-exported-function-types': 99,
  'enforce-f-extension-for-entry-points': 49,
  'enforce-fieldpath-syntax-in-docsetter': 126,
  'enforce-firestore-doc-ref-generic': 334,
  'enforce-firestore-facade': 252,
  'enforce-firestore-path-utils': 34,
  'enforce-firestore-rules-get-access': 57,
  'enforce-firestore-set-merge': 162,
  'enforce-global-constants': 70,
  'enforce-id-capitalization': 89,
  'enforce-identifiable-firestore-type': 62,
  'enforce-is-prefix-validators': 46,
  'enforce-m3-sentence-case': 128,
  'enforce-memoize-async': 304,
  'enforce-memoize-getters': 152,
  'enforce-microdiff': 108,
  'enforce-mock-firestore': 50,
  'enforce-mui-rounded-icons': 79,
  'enforce-object-literal-as-const': 112,
  'enforce-positive-naming': 245,
  'enforce-props-argument-name': 92,
  'enforce-props-naming-consistency': 54,
  'enforce-querykey-ts': 280,
  'enforce-react-type-naming': 122,
  'enforce-realtimedb-path-utils': 41,
  'enforce-render-hits-memoization': 75,
  'enforce-safe-stringify': 24,
  'enforce-serializable-params': 30,
  'enforce-single-exported-unit-per-file': 50,
  'enforce-singular-type-names': 282,
  'enforce-snapshot-state-narrowing': 76,
  'enforce-stable-hash-spread-props': 61,
  'enforce-storage-context': 60,
  'enforce-timestamp-now': 58,
  'enforce-transform-memoization': 80,
  'enforce-types-directory-placement': 45,
  'enforce-typescript-markdown-code-blocks': 76,
  'enforce-unique-cursor-headers': 49,
  'enforce-verb-noun-naming': 283,
  'ensure-pointer-events-none': 119,
  'export-if-in-doubt': 28,
  'extract-global-constants': 125,
  'fast-deep-equal-over-microdiff': 129,
  'firestore-transaction-reads-before-writes': 78,
  'flatten-push-calls': 55,
  'generic-starts-with-t': 16,
  'global-const-style': 217,
  'jsdoc-above-field': 85,
  'key-only-outermost-element': 51,
  'logical-top-to-bottom-grouping': 171,
  'memo-compare-deeply-complex-props': 142,
  'memo-nested-react-components': 132,
  'memoize-root-level-hocs': 38,
  'no-always-true-false-conditions': 193,
  'no-array-length-in-deps': 125,
  'no-async-array-filter': 4,
  'no-async-foreach': 12,
  'no-circular-references': 139,
  'no-class-instance-destructuring': 47,
  'no-complex-cloud-params': 46,
  'no-compositing-layer-props': 47,
  'no-conditional-literals-in-jsx': 43,
  'no-console-error': 43,
  'no-curly-brackets-around-commented-properties': 64,
  'no-direct-function-state': 88,
  'no-empty-dependency-use-callbacks': 83,
  'no-entire-object-hook-deps': 210,
  'no-excessive-parent-chain': 116,
  'no-explicit-return-type': 375,
  'no-fill-template-mutation': 37,
  'no-filter-without-return': 14,
  'no-firestore-jest-mock': 25,
  'no-firestore-object-arrays': 74,
  'no-handler-suffix': 32,
  'no-harness-coupled-disables': 57,
  'no-hungarian': 365,
  'no-inline-component-prop': 46,
  'no-jsx-in-hooks': 34,
  'no-jsx-whitespace-literal': 42,
  'no-margin-properties': 110,
  'no-memoize-on-static': 19,
  'no-misleading-boolean-prefixes': 184,
  'no-misused-switch-case': 5,
  'no-mixed-firestore-transactions': 43,
  'no-mock-firebase-admin': 70,
  'no-object-values-on-strings': 49,
  'no-overridable-method-calls-in-constructor': 46,
  'no-passthrough-getters': 95,
  'no-portal-inside-tooltip': 36,
  'no-redundant-annotation-assertion': 180,
  'no-redundant-boolean-callback-props': 55,
  'no-redundant-param-types': 99,
  'no-redundant-this-params': 52,
  'no-redundant-usecallback-wrapper': 141,
  'no-render-function-components': 37,
  'no-res-error-status-in-onrequest': 35,
  'no-restricted-properties-fix': 10,
  'no-satisfies-in-frontend-bundle': 33,
  'no-separate-loading-state': 18,
  'no-single-dismiss-dialog-button': 37,
  'no-stablehash-react-nodes': 35,
  'no-stale-state-across-await': 95,
  'no-static-constants-in-dynamic-files': 27,
  'no-try-catch-already-exists-in-transaction': 32,
  'no-type-assertion-returns': 136,
  'no-undefined-null-passthrough': 97,
  'no-unmemoized-memo-without-props': 28,
  'no-unnecessary-destructuring': 54,
  'no-unnecessary-destructuring-rename': 34,
  'no-unnecessary-verb-suffix': 294,
  'no-unpinned-dependencies': 6,
  'no-unsafe-firestore-spread': 40,
  'no-unused-props': 157,
  'no-unused-usestate': 30,
  'no-useless-fragment': 75,
  'no-useless-usememo-primitives': 118,
  'no-usememo-for-pass-by-value': 123,
  'no-uuidv4-base62-as-key': 69,
  'omit-index-html': 20,
  'optimize-object-boolean-conditions': 180,
  'parallelize-async-operations': 423,
  'parallelize-loop-awaits': 106,
  'prefer-batch-operations': 69,
  'prefer-block-comments-for-declarations': 91,
  'prefer-clone-deep': 136,
  'prefer-destructuring-no-class': 35,
  'prefer-docsetter-setall': 39,
  'prefer-document-flattening': 84,
  'prefer-field-paths-in-transforms': 65,
  'prefer-flat-transform-each-keys': 71,
  'prefer-fragment-component': 80,
  'prefer-fragment-shorthand': 11,
  'prefer-getter-over-parameterless-method': 200,
  'prefer-global-router-state-key': 170,
  'prefer-map-over-conditional-dispatch': 238,
  'prefer-next-dynamic': 29,
  'prefer-nullish-coalescing-boolean-props': 227,
  'prefer-params-over-parent-id': 147,
  'prefer-settings-object': 42,
  'prefer-spread-over-reassembly': 249,
  'prefer-sx-prop-over-system-props': 110,
  'prefer-type-alias-over-typeof-constant': 59,
  'prefer-type-over-interface': 89,
  'prefer-union-from-const-array': 73,
  'prefer-url-tostring-over-tojson': 20,
  'prefer-use-base62-id': 85,
  'prefer-use-deep-compare-memo': 106,
  'prefer-use-theme': 44,
  'prefer-usecallback-over-usememo-for-functions': 83,
  'prefer-usememo-over-useeffect-usestate': 39,
  'prefer-utility-function-over-private-static': 208,
  'prefer-utility-function-own-file': 76,
  'prevent-children-clobber': 107,
  'react-memoize-literals': 241,
  'react-usememo-should-be-component': 97,
  'require-dynamic-firebase-imports': 38,
  'require-hooks-default-params': 59,
  'require-https-error': 41,
  'require-https-error-cause': 34,
  'require-image-optimized': 108,
  'require-memo': 181,
  'require-memoize-jsx-returners': 199,
  'require-migration-script-metadata': 36,
  'require-props-composition': 233,
  'require-server-timestamp-for-firestore-dates': 63,
  'semantic-function-prefixes': 280,
  'sync-onwrite-name-func': 14,
  'test-file-location-enforcement': 52,
  'use-custom-link': 19,
  'use-custom-memo': 60,
  'use-custom-router': 17,
  'use-latest-callback': 194,
  'vertically-group-related-functions': 74,
  'warn-https-error-message-user-friendly': 52,
};

/**
 * Share of a rule's measured corpus that must still reach a parser. Cut so the
 * documented loss (17 of 87 surviving, 20%) fails by a wide margin while the
 * one- and two-case edits of ordinary fixture churn do not.
 */
const RETENTION = 0.8;

const retentionFloorFor = (measured: number) =>
  Math.max(1, Math.ceil(measured * RETENTION));

/**
 * Rules whose parsed-case count fell through the retention floor, as text.
 * Written as a function of both populations so the controls below can drive the
 * SAME comparison over planted counts — a detector proved only against the live
 * corpus is proved only while the corpus is healthy.
 */
const shrunkAgainst = (
  pinned: Record<string, number>,
  parsed: Map<string, number>,
) =>
  Object.keys(pinned)
    .sort()
    .filter((rule) => (parsed.get(rule) || 0) < retentionFloorFor(pinned[rule]))
    .map(
      (rule) =>
        `${rule}: ${
          parsed.get(rule) || 0
        } parsed, under the ${retentionFloorFor(
          pinned[rule],
        )} required of a measured ${pinned[rule]}`,
    );

describe('fixture corpus parsability', () => {
  it('harvests a corpus big enough for the check to mean anything', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[parsability] suites=${corpus.suitesUsed} files=${corpus.filesLoaded} ` +
        `parsedCases=${cases.length} rules=${registeredRules.length} ` +
        `byLanguage=${[...parsedByLanguage]
          .map(([language, count]) => `${language}:${count}`)
          .sort()
          .join(' ')}`,
    );
    // The per-rule pins that have fallen behind their rule's actual corpus,
    // printed as the list a re-cut needs. A pin left far under what it measures
    // is the drift that turns this map back into "contributes something".
    const drifted = Object.keys(PARSED_CASES_BY_RULE)
      .sort()
      .filter(
        (rule) => (parsedByRule.get(rule) || 0) > PARSED_CASES_BY_RULE[rule],
      )
      .map(
        (rule) =>
          `${rule}=${parsedByRule.get(rule)}(${PARSED_CASES_BY_RULE[rule]})`,
      );
    // eslint-disable-next-line no-console
    console.log(
      `[parsability] pins behind their measurement: ${drifted.length}` +
        (drifted.length ? ` -> ${drifted.join(' ')}` : ''),
    );
    // The harvest's own failures, asserted rather than inherited: a suite that
    // throws while loading contributes nothing, and this gate would sweep the
    // shrunken remainder and report zero unparsable fixtures.
    expect(corpus.failures).toEqual([]);
    // Guards against the require-cache collapse that makes a second harvest
    // return zero suites and every downstream assertion vacuously true. Each
    // floor sits just under its measurement rather than at a round number far
    // below it: the 10,000 this replaces stood against 19,466, which is room
    // for half the corpus to leave inside a still-green sum.
    expect(corpus.suitesUsed).toBeGreaterThan(360); // measured 367
    expect(cases.length).toBeGreaterThan(19000); // measured 19,466
  });

  /**
   * The rule dimension, closed both ways against `plugin.rules` — the one
   * population that is not derived from the corpus, so a corpus that collapsed
   * cannot satisfy it by shrinking both sides together.
   */
  it('parses a fixture for every registered rule', () => {
    expect(measuredUnparsed).toEqual(UNPARSED_RULES);
    expect(registeredRules.length).toBeGreaterThan(190); // measured 194
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
   * The same dimension at the granularity a rule's corpus actually collapses
   * at. "Contributes a fixture" is the question above; "still contributes the
   * fixtures it had" is this one, and only the second fails on the loss this
   * file was written for.
   */
  it('keeps each rule the corpus it was measured to have', () => {
    expect(shrunkAgainst(PARSED_CASES_BY_RULE, parsedByRule)).toEqual([]);
    // Closed both ways, so the map cannot certify a shrinking subset of the
    // rule set: a registered rule with no entry is unmeasured, and an entry for
    // a rule that no longer exists is a floor nothing can trip.
    expect(
      registeredRules.filter((rule) => !(rule in PARSED_CASES_BY_RULE)),
    ).toEqual([]);
    expect(
      Object.keys(PARSED_CASES_BY_RULE).filter(
        (rule) => !registeredRules.includes(rule),
      ),
    ).toEqual([]);
  });

  /**
   * Both directions of that comparison, driven through the same helper on
   * planted counts. Without them a retention margin widened until nothing can
   * trip it reads exactly like a healthy corpus.
   */
  it('flags a rule that loses most of its corpus, and only such a rule', () => {
    const pinned = { 'planted-rule': 87 };
    expect(shrunkAgainst(pinned, new Map([['planted-rule', 17]]))).toHaveLength(
      1,
    );
    expect(shrunkAgainst(pinned, new Map([['planted-rule', 80]]))).toEqual([]);
    expect(shrunkAgainst(pinned, new Map())).toHaveLength(1);
    // A rule with a single measured case must still be required to keep it,
    // which the ceil() is what guarantees.
    expect(retentionFloorFor(1)).toBe(1);
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
    expect(parsedByLanguage.get('ts')).toBeGreaterThan(19000); // measured 19,383
    // The two small populations get floors of their own. Presence alone lets
    // either fall to a single case while the TypeScript floor above stays
    // green, and they are the whole corpus of two registered, `error`-severity,
    // autofixing rules (#1860).
    expect(parsedByLanguage.get('json')).toBeGreaterThanOrEqual(6); // measured 7
    expect(parsedByLanguage.get('markdown')).toBeGreaterThanOrEqual(70); // measured 76
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
