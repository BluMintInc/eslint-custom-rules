import {
  canonicalizeDiagnostic,
  codeOf,
  intersectDiagnostics,
  multisetIntersect,
} from '../utils/fixtureTypeProgram';

/**
 * `intersectDiagnostics` is the mode discount shared by
 * `cross-fixture-fixer-type-safety`, `composed-fix-type-safety-closure` and
 * `cross-suggestion-type-safety`. It is a SILENCING oracle - what it drops
 * becomes a clean - so its comparison key is load-bearing in a way an ordinary
 * helper's is not, and it is unit-tested here rather than only through the
 * three corpus guards, each of which takes minutes to run.
 *
 * The defect it exists to prevent (#2235): the key was the raw message string,
 * and TypeScript orders a printed union by type ID - the order the checker
 * created those types in, which is per-program - so the same diagnostic prints
 * two ways across the two modes. Comparing raw strings discarded a diagnostic
 * present in BOTH modes as strict-only, and `cross-fixture-fixer-type-safety`
 * read 0 findings while `fixer-type-safety`, which unions instead of
 * intersecting, baselined the same 4 `enforce-microdiff` TS2345 pairs.
 */

/** The two spellings measured across the two modes in #2235. */
const MICRODIFF_DEFAULT_ORDER =
  "TS2345: Argument of type 'object' is not assignable to parameter of type 'Record<string, unknown> | unknown[]'.";
const MICRODIFF_REVERSED_ORDER =
  "TS2345: Argument of type 'object' is not assignable to parameter of type 'unknown[] | Record<string, unknown>'.";

describe('canonicalizeDiagnostic', () => {
  it('makes the two #2235 union spellings one key', () => {
    expect(canonicalizeDiagnostic(MICRODIFF_REVERSED_ORDER)).toBe(
      canonicalizeDiagnostic(MICRODIFF_DEFAULT_ORDER),
    );
  });

  /**
   * The negative control for the assertion above. Canonicalizing to a constant
   * would satisfy it and destroy the oracle, so an unrelated diagnostic must
   * still key apart.
   */
  it('does not collapse diagnostics that genuinely differ', () => {
    const other =
      "TS2345: Argument of type 'string' is not assignable to parameter of type 'Record<string, unknown> | unknown[]'.";
    expect(canonicalizeDiagnostic(other)).not.toBe(
      canonicalizeDiagnostic(MICRODIFF_DEFAULT_ORDER),
    );
  });

  it('leaves a diagnostic with no union untouched', () => {
    const plain = "TS6133: 'd' is declared but its value is never read.";
    expect(canonicalizeDiagnostic(plain)).toBe(plain);
  });

  it.each([
    ['a nested union', "Type 'Array<A | B>'", "Type 'Array<B | A>'"],
    [
      'a union in an object member',
      "Type '{ a: A | B; }'",
      "Type '{ a: B | A; }'",
    ],
    [
      'a union under a mapped/indexed type',
      "Type 'Foo[A | B]'",
      "Type 'Foo[B | A]'",
    ],
    [
      'a function-typed member, whose => must not be read as a closing bracket',
      "Type '((a: string) => void) | number'",
      "Type 'number | ((a: string) => void)'",
    ],
    ['a union of string literal types', `Type '"a" | "b"'`, `Type '"b" | "a"'`],
    ['a three-member union', "Type 'A | B | C'", "Type 'C | A | B'"],
  ])('normalizes %s', (_label, one, other) => {
    expect(canonicalizeDiagnostic(one)).toBe(canonicalizeDiagnostic(other));
  });

  /**
   * Tuple elements, function parameters and object members print in DECLARATION
   * order, which is a property of the source and stable across programs.
   * Sorting those would erase a real difference rather than a spurious one, so
   * each must remain two distinct keys.
   */
  it.each([
    ['tuple elements', "Type '[B, A]'", "Type '[A, B]'"],
    ['object-type members', "Type '{ b: X; a: Y; }'", "Type '{ a: Y; b: X; }'"],
    [
      'function parameters',
      "Type '(b: B, a: A) => void'",
      "Type '(a: A, b: B) => void'",
    ],
    ['type arguments', "Type 'Map<B, A>'", "Type 'Map<A, B>'"],
  ])('does NOT reorder %s', (_label, one, other) => {
    expect(canonicalizeDiagnostic(one)).not.toBe(canonicalizeDiagnostic(other));
  });

  it('survives an unbalanced bracket without throwing or truncating', () => {
    const ragged = "TS1005: '<' expected. Type 'Array<A | B'";
    expect(() => canonicalizeDiagnostic(ragged)).not.toThrow();
    expect(canonicalizeDiagnostic(ragged)).toContain('TS1005');
  });
});

describe('codeOf', () => {
  it('reads the TS code prefix', () => {
    expect(codeOf(MICRODIFF_DEFAULT_ORDER)).toBe('TS2345');
  });

  it('returns the whole string when there is no prefix', () => {
    expect(codeOf('no colon here')).toBe('no colon here');
  });
});

describe('intersectDiagnostics', () => {
  it('keeps a diagnostic the modes spell differently, and counts no drop', () => {
    const result = intersectDiagnostics([
      [MICRODIFF_DEFAULT_ORDER],
      [MICRODIFF_REVERSED_ORDER],
    ]);
    expect(result.common).toEqual([MICRODIFF_DEFAULT_ORDER]);
    expect(result.dropped).toEqual([]);
    expect(result.codeMatchedDrops).toEqual([]);
  });

  /**
   * The regression control: the raw-string intersection this replaced must be
   * shown to FAIL on the same input, or the assertion above would pass just as
   * well against the defect it was written for.
   */
  it('is a change in behaviour - the raw-string key drops the same pair', () => {
    const rawStringIntersect = (lists: string[][]) =>
      lists.reduce((common, list) =>
        common.filter((entry) => list.includes(entry)),
      );
    expect(
      rawStringIntersect([
        [MICRODIFF_DEFAULT_ORDER],
        [MICRODIFF_REVERSED_ORDER],
      ]),
    ).toEqual([]);
  });

  it('still discounts a genuinely strict-only diagnostic', () => {
    const strictOnly = "TS2532: Object is possibly 'undefined'.";
    const result = intersectDiagnostics([[], [strictOnly]]);
    expect(result.common).toEqual([]);
    expect(result.dropped).toEqual([strictOnly]);
    expect(result.codeMatchedDrops).toEqual([]);
  });

  it('reports a one-sided diagnostic as dropped, not code-matched', () => {
    const strictOnly = "TS2532: Object is possibly 'undefined'.";
    const result = intersectDiagnostics([
      [MICRODIFF_DEFAULT_ORDER, strictOnly],
      [MICRODIFF_REVERSED_ORDER],
    ]);
    expect(result.common).toEqual([MICRODIFF_DEFAULT_ORDER]);
    expect(result.dropped).toEqual([strictOnly]);
    expect(result.codeMatchedDrops).toEqual([]);
  });

  /**
   * The counter's whole purpose. A divergence the canonicalizer does NOT cover
   * must surface here rather than vanish, so a future print-order change cannot
   * silently re-open #2235.
   */
  it('flags a same-code message divergence canonicalization does not cover', () => {
    const one = "TS2345: Argument of type 'A' is not assignable.";
    const other = "TS2345: Argument of type 'B' is not assignable.";
    const result = intersectDiagnostics([[one], [other]]);
    expect(result.common).toEqual([]);
    // Both modes' spellings are dropped; only the first list's is code-matched,
    // which is enough to name the divergence and fail the guards.
    expect(result.dropped).toEqual([one, other]);
    expect(result.codeMatchedDrops).toEqual([one]);
  });

  /**
   * The counter must see a STRICT-only diagnostic. That is the artifact class
   * the discount exists FOR, and it never appears in the default mode's list,
   * so a `dropped` read off the first list alone reports 0 for exactly the
   * case the discount is doing its job on - a counter that reads zero while
   * silencing is the #2235 failure one level up.
   */
  it('counts a drop the LATER list contributed, not just the first', () => {
    const strictOnly = "TS2532: Object is possibly 'undefined'.";
    const result = intersectDiagnostics([[], [strictOnly]]);
    expect(result.dropped).toEqual([strictOnly]);
    expect(result.codeMatchedDrops).toEqual([]);
  });

  it('counts drops from both sides at once', () => {
    const looseOnly = 'TS2322: a';
    const strictOnly = 'TS2532: b';
    const shared = 'TS2345: c';
    const result = intersectDiagnostics([
      [shared, looseOnly],
      [shared, strictOnly],
    ]);
    expect(result.common).toEqual([shared]);
    expect(result.dropped.sort()).toEqual([looseOnly, strictOnly].sort());
    expect(result.codeMatchedDrops).toEqual([]);
  });

  it('respects multiplicity rather than set membership', () => {
    const one = 'TS2345: a';
    const result = intersectDiagnostics([
      [one, one, one],
      [one, one],
    ]);
    expect(result.common).toEqual([one, one]);
    expect(result.dropped).toEqual([one]);
    // A third copy with no counterpart is a count difference, not a divergence.
    expect(result.codeMatchedDrops).toEqual([]);
  });

  it('is the identity on a single list, so a one-mode pair is not discounted', () => {
    const result = intersectDiagnostics([[MICRODIFF_DEFAULT_ORDER]]);
    expect(result.common).toEqual([MICRODIFF_DEFAULT_ORDER]);
    expect(result.dropped).toEqual([]);
    expect(result.codeMatchedDrops).toEqual([]);
  });

  it('returns nothing for no lists at all', () => {
    expect(intersectDiagnostics([])).toEqual({
      common: [],
      dropped: [],
      codeMatchedDrops: [],
    });
  });

  it("carries the FIRST list's spelling into common, not the second's", () => {
    expect(
      intersectDiagnostics([
        [MICRODIFF_REVERSED_ORDER],
        [MICRODIFF_DEFAULT_ORDER],
      ]).common,
    ).toEqual([MICRODIFF_REVERSED_ORDER]);
  });

  it('keeps multisetIntersect as the common projection', () => {
    const lists = [
      [MICRODIFF_DEFAULT_ORDER, 'TS2532: x'],
      [MICRODIFF_REVERSED_ORDER],
    ];
    expect(multisetIntersect(lists)).toEqual(
      intersectDiagnostics(lists).common,
    );
  });
});
