/**
 * Mirrors the type-marker predicate the shipped `no-hungarian` rule applies to
 * a declaration name, so a fixer can refuse to SYNTHESISE a name that rule
 * rejects. `no-hungarian` is not fixable, so a generated identifier it flags
 * converts machine-resolvable work into a manual rename inside a file that was
 * clean before `--fix` ran (#1997).
 *
 * Scope is the shape a fixer emits: an alphanumeric camelCase/PascalCase
 * identifier. `no-hungarian`'s SCREAMING_SNAKE_CASE branch and its
 * compound-noun / descriptive-suffix / <entity>Number / <domain>Symbol
 * carve-outs are deliberately absent. Every one of them can only turn a
 * rejection into an acceptance, and each is keyed on a trailing word a
 * generated name does not carry, so their absence is unreachable for such a
 * name and, if ever reached, costs the caller its next candidate rather than
 * reintroducing the defect. `no-array-length-in-deps.test.ts` pins agreement
 * with the real rule over the corpus of names its fixer can emit, so a change
 * to either predicate surfaces there.
 */

// Abbreviation type markers. No English word is spelled this way, so their
// presence as a whole camelCase segment is unambiguously a type tag.
const ABBREVIATION_MARKERS = ['str', 'num', 'int', 'bool', 'arr', 'obj'];

const COMMON_TYPES = [
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'RegExp',
  'Promise',
  'Symbol',
  'BigInt',
];

const TYPE_MARKERS = [
  ...ABBREVIATION_MARKERS,
  'array',
  ...COMMON_TYPES,
  'Class',
  'Interface',
  'Enum',
];

const ABBREVIATION_MARKER_SET = new Set(ABBREVIATION_MARKERS);

const FULL_TYPE_WORDS = new Set(COMMON_TYPES.map((word) => word.toLowerCase()));

// Single-letter Hungarian type prefixes (b=boolean, i=integer/index), matched
// only as a strict camelCase prefix. This is the arm that rejects `bHash`.
const SINGLE_LETTER_PREFIXES = new Set(['b', 'i']);

const CAMEL_SEGMENT_REGEX = /[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[A-Z]/g;

function splitCamelSegmentsRaw(name: string): string[] {
  return name.match(CAMEL_SEGMENT_REGEX) ?? [];
}

// A built-in type word carrying an internal capital (BigInt) splits into parts
// whose tail collides with an abbreviation marker (Int/int), so the parts are
// re-merged into one atomic segment before segment matching.
const MULTI_CAPITAL_TYPE_WORD_PARTS = COMMON_TYPES.map(
  splitCamelSegmentsRaw,
).filter((parts) => parts.length > 1);

function mergeMultiCapitalTypeWords(segments: string[]): string[] {
  const merged: string[] = [];
  let index = 0;
  while (index < segments.length) {
    const match = MULTI_CAPITAL_TYPE_WORD_PARTS.find((parts) =>
      parts.every(
        (part, offset) =>
          segments[index + offset]?.toLowerCase() === part.toLowerCase(),
      ),
    );
    if (match) {
      merged.push(segments.slice(index, index + match.length).join(''));
      index += match.length;
    } else {
      merged.push(segments[index]);
      index += 1;
    }
  }
  return merged;
}

function splitCamelSegments(name: string): string[] {
  return mergeMultiCapitalTypeWords(splitCamelSegmentsRaw(name));
}

function isPascalCaseName(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== name.toUpperCase();
}

// A PascalCase name whose type word qualifies a DIFFERENT head noun names a
// concept or relation (StringToNumber, NumberAmountEditor), not the value's own
// runtime type.
function isSemanticTypeConcept(name: string): boolean {
  const segments = splitCamelSegments(name);
  if (segments.length < 2) {
    return false;
  }
  const hasTypeWord = segments.some((segment) =>
    FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
  if (!hasTypeWord) {
    return false;
  }
  return segments.some(
    (segment) => !FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
}

/**
 * Whether `no-hungarian` reads `name` as encoding its own type.
 */
export function encodesTypeMarker(name: string): boolean {
  if (isPascalCaseName(name) && isSemanticTypeConcept(name)) {
    return false;
  }

  if (
    name.length > 1 &&
    SINGLE_LETTER_PREFIXES.has(name[0]) &&
    /[A-Z]/.test(name[1])
  ) {
    return true;
  }

  const normalizedName = name.toLowerCase();
  return TYPE_MARKERS.some((marker) => {
    const normalizedMarker = marker.toLowerCase();
    if (normalizedName === normalizedMarker) {
      return false;
    }

    // An abbreviation marker is a type tag only as a whole segment: "int"
    // inside "Mint" or "point" is a word fragment, not a tag.
    if (ABBREVIATION_MARKER_SET.has(normalizedMarker)) {
      return splitCamelSegments(name).some(
        (segment) => segment.toLowerCase() === normalizedMarker,
      );
    }

    // A full type word tags the value's type only at a word boundary in
    // leading or trailing position; a middle segment qualifies a domain concept.
    if (
      normalizedName.startsWith(normalizedMarker) &&
      normalizedName.length > normalizedMarker.length &&
      /[A-Z0-9]/.test(name[normalizedMarker.length])
    ) {
      return true;
    }
    return (
      normalizedName.endsWith(normalizedMarker) &&
      normalizedName.length > normalizedMarker.length &&
      (/[A-Z0-9]/.test(name[name.length - normalizedMarker.length - 1]) ||
        /[A-Z]/.test(name[name.length - normalizedMarker.length]))
    );
  });
}
