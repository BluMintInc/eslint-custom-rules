import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'noHungarian';

// Common built-in types that might be used in Hungarian notation
const COMMON_TYPES = [
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  // 'Function' is intentionally excluded. Unlike an incidental, rot-prone data
  // type (String/Number/...), a value named *Function is intrinsically and
  // permanently callable, so the marker can never become misleading. Fn/Func/
  // Function are function-ROLE designators (like callback/handler/predicate),
  // not Hungarian type tags — compareFn/mapFn are the ECMAScript/MDN-canonical
  // parameter names. See the ABBREVIATION_MARKERS note and issue #1255.
  // 'Date', too many false positives
  'RegExp',
  'Promise',
  'Symbol',
  'BigInt',
];

// Abbreviation type markers (e.g. str, arr, obj). No English word is spelled this
// way, so their presence as a segment — even in the middle of a name — is
// unambiguously a type tag (strName, USER_STR_NAME, ConfigArrSettings).
// `fn`/`func` are deliberately excluded: they abbreviate a value's callable ROLE
// (like callback/handler/predicate), which is intrinsic and never rots, so
// checkFn/compareFn/mapFn/renderFunc are legitimate role names, not Hungarian
// type tags (#1255).
const ABBREVIATION_MARKERS = ['str', 'num', 'int', 'bool', 'arr', 'obj'];

// Combined type markers (former Hungarian prefixes and type suffixes)
const TYPE_MARKERS = [
  ...ABBREVIATION_MARKERS,
  'array',
  ...COMMON_TYPES,
  'Class',
  'Interface',
  //'Type', people like to use 'type' as a general purpose noun
  'Enum',
];

const ABBREVIATION_MARKER_SET = new Set(ABBREVIATION_MARKERS);

// Single-letter Hungarian type prefixes (b=boolean, i=integer/index).
// Only matched as a strict camelCase prefix (e.g. bIsActive, iCount); never as
// a suffix/middle/SCREAMING_SNAKE segment, where a lone letter is almost always
// a real word fragment (tab, lib, ui) rather than a type tag.
const SINGLE_LETTER_PREFIXES = new Set(['b', 'i']);

// Full type-concept words (spelled out). When one of these appears as a clean
// PascalCase segment inside a multi-word TYPE name (alias/interface/class), it
// denotes a type concept/relation (e.g. StringToNumber, CapitalizedString,
// PromiseOrValue) rather than a redundant Hungarian type tag — comparable to the
// allowed compound noun PhoneNumber. Abbreviation markers (str/arr/obj/...) are
// deliberately excluded: no English word is spelled that way, so their presence
// as a segment is unambiguously a type tag even inside a type name.
const FULL_TYPE_WORDS = new Set(COMMON_TYPES.map((word) => word.toLowerCase()));

// Allowed descriptive suffixes that should not be flagged as Hungarian notation
const ALLOWED_SUFFIXES = [
  'Formatted',
  'Parsed',
  'Processed',
  'Transformed',
  'Converted',
  'Rendered',
  'Display',
  'Displayed',
];

// Common compound nouns that should not be flagged as Hungarian notation
const ALLOWED_COMPOUND_NOUNS = ['PhoneNumber', 'EmailAddress', 'PostalCode'];

// Domain-entity head nouns that legitimately precede a "Number" suffix. In
// <entity>Number the trailing "Number" is the HEAD NOUN of the domain concept
// (the number OF an issue/line/round/version — GitHub's REST field is literally
// `issue_number`), not a type marker bolted onto the name. Removing it yields a
// wrong name (`issue` denotes the whole issue object, not its number), so these
// are domain compounds, not Hungarian notation — the same reasoning that
// motivated PhoneNumber/EmailAddress/PostalCode (#640), generalized to the whole
// <entity>Number category (#1277). Words that are themselves quantities (count,
// age, index, size, amount, ...) are intentionally ABSENT: for them "Number" is
// a redundant type tag, so <quantity>Number stays flagged as Hungarian.
const DOMAIN_NUMBER_HEAD_NOUNS = new Set([
  'phone',
  'issue',
  'line',
  'round',
  'version',
  'account',
  'match',
  'order',
  'invoice',
  'ticket',
  'serial',
  'model',
  'page',
  'reference',
  'confirmation',
  'tracking',
  'license',
  'part',
  'revision',
  'build',
  'sequence',
  'port',
  'card',
  'contract',
  'document',
  'receipt',
  'registration',
  'flight',
  'room',
  'seat',
  'block',
  'route',
  'channel',
  'badge',
]);

// Domain head nouns that legitimately precede a "Symbol" suffix. In
// <domain>Symbol the trailing "Symbol" is the HEAD NOUN of the domain concept —
// the printed GLYPH that writes a currency/ticker/unit/element ("$", "BTC",
// "kg", "Fe") — not the JS `symbol` primitive bolted onto the name. ISO 4217 and
// CLDR literally call that glyph a *currency symbol*, and the value is a string,
// so there is no type marker to strip: removing it yields a wrong name
// (`currency` denotes the currency itself, not the character it is written
// with). Same reasoning as the <entity>Number carve-out (#1277), applied to the
// glyph sense of "symbol" (#1835).
//
// Nouns whose <noun>Symbol really does name a JS `symbol` — id, key, cache,
// brand, tag, marker, meta, registry, slot, field, instance — are intentionally
// ABSENT, so idSymbol / cacheSymbol / brandSymbol stay flagged, as do all
// PREFIX uses (symbolKey, symbolValue). The carve-out is additionally vetoed
// whenever the declaration syntactically proves a `symbol` value (see
// isSymbolTypedDeclaration).
const DOMAIN_SYMBOL_HEAD_NOUNS = new Set([
  // Finance / markets: the glyph or ticker a traded thing is written with.
  'currency',
  'ticker',
  'token',
  'coin',
  'asset',
  'stock',
  'share',
  'market',
  'commodity',
  // Measurement and science: "kg", "°", "Fe".
  'unit',
  'degree',
  'element',
  'chemical',
  // Typography / notation / character sets: printed operator, punctuation and
  // phonetic glyphs.
  'math',
  'operator',
  'punctuation',
  'phonetic',
  'musical',
  'unicode',
  'ascii',
]);

// Domain head nouns that legitimately precede a "Class" suffix. In
// <taxonomy>Class the trailing "Class" is the HEAD NOUN of the domain concept —
// the BUCKET a value falls into — not the JavaScript `class` construct bolted
// onto the name. "Window size class" is the Material Design 3 / UIKit term for
// a breakpoint bucket (compact/medium/expanded), a regex *character class* is
// `[a-z]`, an S3 *storage class* is "STANDARD" — in each case the value is a
// string or number map, so there is no type marker to strip: removing the
// suffix yields a wrong name (WINDOW_SIZE names a width, not a bucket). Same
// reasoning as the <entity>Number (#1277) and <domain>Symbol (#1835)
// carve-outs, applied to the taxonomy sense of "class" (#2030).
//
// Nouns whose <noun>Class reads as a tag on a JS class value — user, config,
// helper, base, model, controller, wrapper — are intentionally ABSENT, so
// UserClass / userClass / HELPER_CLASS stay flagged, as do all PREFIX uses
// (classRegistry, CLASS_MAP). The carve-out is additionally vetoed whenever the
// declaration syntactically proves a real class (see isClassValuedDeclaration).
const DOMAIN_CLASS_HEAD_NOUNS = new Set([
  // Layout / responsive design: M3 and UIKit bucket a window's width into a
  // "size class".
  'size',
  // Regex and linguistics: character class ([a-z]), word class (noun/verb).
  'character',
  'word',
  // Mathematics / CS taxonomy: equivalence class, complexity class (P, NP).
  'equivalence',
  'complexity',
  // Systems / infrastructure: C and S3 storage class, QoS traffic/service
  // class, USB device class.
  'storage',
  'traffic',
  'service',
  'device',
  // Finance: asset class, share class.
  'asset',
  'share',
  // Travel: fare/cabin/booking class (airline RBD codes).
  'fare',
  'cabin',
  'booking',
  // Categorization by attribute: weight class (boxing), age class, hazard
  // class (DOT), drug class (pharmacology), vehicle class (DMV).
  'weight',
  'age',
  'hazard',
  'drug',
  'vehicle',
]);

// Conversion heads: the verb or preposition a CONVERTER function's name opens
// with. In <head><Type> the trailing type word names what the function
// PRODUCES (or consumes, for `from`), never the type of the value the
// identifier holds — the identifier holds a function. Hungarian notation tags a
// value with its own type, so `toNumber` is outside the notation entirely, and
// stripping the type word destroys the name (`to`, `parse` and `from` denote
// nothing on their own), which is this rule's own test for a domain compound
// versus a tag. The same reasoning the rule already applies to the type-concept
// names it exempts (`StringToNumber`) and to the `Parsed` / `Converted`
// suffixes, applied to function names (#2302).
//
// `convertto` is the two-segment head `convertTo`, stored joined because the
// lookup is done on the head segments concatenated and lowercased.
const CONVERSION_HEADS = new Set([
  'to',
  'as',
  'from',
  'parse',
  'into',
  'convertto',
]);

// Common built-in JavaScript prototype methods
const BUILT_IN_METHODS = new Set([
  // String methods
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'localeCompare',
  'match',
  'matchAll',
  'normalize',
  'padEnd',
  'padStart',
  'repeat',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'startsWith',
  'substring',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLowerCase',
  'toString',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
  'valueOf',

  // Array methods
  'forEach',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'keys',
  'values',
  'entries',
  'push',
  'pop',
  'shift',
  'unshift',
  'slice',
  'splice',
  'sort',
  'reverse',
  'flatMap',
  'flat',
  'concat',
  'join',
  'includes',
  'indexOf',
  'lastIndexOf',
  'fill',
  'copyWithin',

  // Object methods
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  'assign',
  'create',
  'defineProperty',
  'defineProperties',
  'entries',
  'freeze',
  'fromEntries',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  'getPrototypeOf',
  'is',
  'isExtensible',
  'isFrozen',
  'isSealed',
  'keys',
  'preventExtensions',
  'seal',
  'setPrototypeOf',
  'values',

  // Date methods
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'setDate',
  'setFullYear',
  'setHours',
  'setMilliseconds',
  'setMinutes',
  'setMonth',
  'setSeconds',
  'setTime',
  'setUTCDate',
  'setUTCFullYear',
  'setUTCHours',
  'setUTCMilliseconds',
  'setUTCMinutes',
  'setUTCMonth',
  'setUTCSeconds',
  'toDateString',
  'toISOString',
  'toJSON',
  'toLocaleDateString',
  'toLocaleString',
  'toLocaleTimeString',
  'toString',
  'toTimeString',
  'toUTCString',
  'valueOf',

  // Promise methods
  'then',
  'catch',
  'finally',
]);

// The camelCase/PascalCase splitter's core pattern. Kept separate from
// splitCamelSegments so precomputed constants (below) can fragment known type
// words without recursing through the merge step.
const CAMEL_SEGMENT_REGEX = /[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[A-Z]/g;

function splitCamelSegmentsRaw(name: string): string[] {
  return name.match(CAMEL_SEGMENT_REGEX) ?? [];
}

// COMMON_TYPES words containing an internal capital — only `BigInt` today — are
// fragmented by the splitter into parts (["Big","Int"]) where a fragment ("Int")
// collides with an abbreviation marker ("int"), so ANY identifier containing
// BigInt would spuriously match that marker regardless of position (#1317).
// Precompute those fragment sequences so splitCamelSegments can re-merge them
// into a single atomic segment, ensuring a built-in type word is never mistaken
// for a Hungarian abbreviation tag.
const MULTI_CAPITAL_TYPE_WORD_PARTS = COMMON_TYPES.map(
  splitCamelSegmentsRaw,
).filter((parts) => parts.length > 1);

// Re-merge any consecutive segments that reconstitute a multi-capital built-in
// type word (Big + Int -> BigInt). Case-insensitive so lower/upper camelCase
// variants collapse identically.
function mergeMultiCapitalTypeWords(segments: string[]): string[] {
  if (MULTI_CAPITAL_TYPE_WORD_PARTS.length === 0) {
    return segments;
  }
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

// Split a PascalCase/camelCase identifier into its word segments
// (e.g. "StringToNumber" -> ["String","To","Number"], "FuncKeys" -> ["Func","Keys"]).
// Multi-capital built-in type words (BigInt) are kept as one atomic segment.
function splitCamelSegments(name: string): string[] {
  return mergeMultiCapitalTypeWords(splitCamelSegmentsRaw(name));
}

// A TYPE name (alias/interface/class) is exempt from a full-type-word marker when
// that marker is one clean PascalCase segment among OTHER descriptive segments —
// i.e. the word denotes a type concept/relation, not a redundant type tag.
// Examples: StringToNumber, CapitalizedString, PromiseOrValue.
// Abbreviation markers (str/arr/obj/...) never qualify, so genuine Hungarian type
// names like UserStrName / ConfigArrSettings / UserObjData still fire.
function isSemanticTypeConcept(typeName: string): boolean {
  const segments = splitCamelSegments(typeName);
  if (segments.length < 2) {
    return false;
  }
  const fullTypeWordSegments = segments.filter((segment) =>
    FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
  if (fullTypeWordSegments.length === 0) {
    return false;
  }
  // At least one segment must be a non-type-word descriptor so the name reads as a
  // concept (e.g. Extract+Number) rather than bare type tags glued together.
  return segments.some(
    (segment) => !FULL_TYPE_WORDS.has(segment.toLowerCase()),
  );
}

// A PascalCase declaration name (leading capital, at least one lowercase letter):
// a component, class, or type identifier. Distinguished from SCREAMING_SNAKE_CASE
// constants (all caps) and lowercase-initial variables, which are handled on their
// own code paths.
function isPascalCaseName(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== name.toUpperCase();
}

// Is `name` a domain compound of the form <entity>Number, where the word directly
// before the trailing "Number" is a known domain-entity noun (issueNumber,
// lineNumber, roundNumber, versionNumber)? Only the LAST head segment is
// consulted, so prefixed variants generalize (githubIssueNumber, currentLineNumber
// pass) while numeric-head compounds still read as Hungarian (maxCountNumber ->
// head segment "Count", not a domain entity -> still flagged).
function isDomainNumberCompound(name: string): boolean {
  if (!name.endsWith('Number')) {
    return false;
  }
  const head = name.slice(0, -'Number'.length);
  if (head.length === 0) {
    return false;
  }
  const segments = splitCamelSegments(head);
  const lastSegment = segments[segments.length - 1];
  return (
    !!lastSegment && DOMAIN_NUMBER_HEAD_NOUNS.has(lastSegment.toLowerCase())
  );
}

// Is `name` a domain compound of the form <domain>Symbol, where the word
// directly before the trailing "Symbol" names a thing that is WRITTEN with a
// glyph (currencySymbol, tickerSymbol, unitSymbol)? Only the LAST head segment
// is consulted, so prefixed and accessor variants generalize
// (getCurrencySymbol, localizedCurrencySymbol pass) while names whose value is a
// real JS symbol keep firing (idSymbol -> head segment "Id", not a glyph
// domain).
function isDomainSymbolCompound(name: string): boolean {
  if (!name.endsWith('Symbol')) {
    return false;
  }
  const head = name.slice(0, -'Symbol'.length);
  if (head.length === 0) {
    return false;
  }
  const segments = splitCamelSegments(head);
  const lastSegment = segments[segments.length - 1];
  return (
    !!lastSegment && DOMAIN_SYMBOL_HEAD_NOUNS.has(lastSegment.toLowerCase())
  );
}

// Is `name` a domain compound of the form <taxonomy>Class, where the word
// directly before the trailing "Class" names a bucketing taxonomy
// (windowSizeClass, characterClass, storageClass)? Only the LAST head segment
// is consulted, so prefixed variants generalize (currentWindowSizeClass passes)
// while names whose value is a real JS class keep firing (userClass -> head
// segment "user", not a taxonomy).
function isDomainClassCompound(name: string): boolean {
  if (!name.endsWith('Class')) {
    return false;
  }
  const head = name.slice(0, -'Class'.length);
  if (head.length === 0) {
    return false;
  }
  const segments = splitCamelSegments(head);
  const lastSegment = segments[segments.length - 1];
  return (
    !!lastSegment && DOMAIN_CLASS_HEAD_NOUNS.has(lastSegment.toLowerCase())
  );
}

// Does a type annotation denote the JS `symbol` primitive (`symbol` or the
// declaration-site form `unique symbol`)?
function isSymbolTypeAnnotation(node: TSESTree.TypeNode | undefined): boolean {
  if (!node) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.TSSymbolKeyword) {
    return true;
  }
  return (
    node.type === AST_NODE_TYPES.TSTypeOperator &&
    node.operator === 'unique' &&
    node.typeAnnotation?.type === AST_NODE_TYPES.TSSymbolKeyword
  );
}

// Is the initializer a call to the `Symbol` factory (Symbol('x'), Symbol.for)?
function isSymbolFactoryCall(node: TSESTree.Node | null | undefined): boolean {
  if (!node || node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'Symbol';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Symbol'
  );
}

// Does the declaration site PROVE, syntactically, that the named value is a JS
// `symbol`? Only an explicit `symbol`/`unique symbol` annotation or a `Symbol()`
// factory initializer are conclusive without type information — an inferred
// `string` (the currencySymbol getter returns `part.value`) is invisible here,
// which is precisely why the glyph carve-out is keyed on the head noun rather
// than on the type. When this holds, the trailing "Symbol" genuinely encodes the
// value's type and the DOMAIN_SYMBOL_HEAD_NOUNS carve-out is vetoed, so
// `const currencySymbol: symbol = Symbol('currency')` still reports.
function isSymbolTypedDeclaration(node: TSESTree.Identifier): boolean {
  if (isSymbolTypeAnnotation(node.typeAnnotation?.typeAnnotation)) {
    return true;
  }
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.VariableDeclarator: {
      if (parent.id !== node) {
        return false;
      }
      if (isSymbolFactoryCall(parent.init)) {
        return true;
      }
      // A named accessor/factory arrow describes its RETURNED value, so an
      // explicit `(): symbol` return type is the same proof.
      const init = parent.init;
      return (
        !!init &&
        (init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          init.type === AST_NODE_TYPES.FunctionExpression) &&
        isSymbolTypeAnnotation(init.returnType?.typeAnnotation)
      );
    }
    case AST_NODE_TYPES.PropertyDefinition:
      return (
        parent.key === node &&
        (isSymbolTypeAnnotation(parent.typeAnnotation?.typeAnnotation) ||
          isSymbolFactoryCall(parent.value))
      );
    case AST_NODE_TYPES.MethodDefinition:
      return (
        parent.key === node &&
        isSymbolTypeAnnotation(parent.value.returnType?.typeAnnotation)
      );
    case AST_NODE_TYPES.FunctionDeclaration:
      return (
        parent.id === node &&
        isSymbolTypeAnnotation(parent.returnType?.typeAnnotation)
      );
    default:
      return false;
  }
}

// Does a type annotation denote a class constructor (`new (...) => T`)? Such an
// annotation is the one syntactic spelling that proves the annotated value is a
// class without type information.
function isConstructorTypeAnnotation(
  node: TSESTree.TypeNode | undefined,
): boolean {
  return !!node && node.type === AST_NODE_TYPES.TSConstructorType;
}

// Does the declaration site PROVE, syntactically, that the named value is a JS
// class? Only a `class` expression initializer, a class declaration's own name,
// or an explicit constructor-type annotation are conclusive without type
// information — an aliased constructor (`const sizeClass = User`) is invisible
// here, which is precisely why the taxonomy carve-out is keyed on the head noun
// rather than on the type. When this holds, the trailing "Class" genuinely
// encodes the value's type and the DOMAIN_CLASS_HEAD_NOUNS carve-out is vetoed,
// so `const SizeClass = class {}` still reports. Mirrors
// isSymbolTypedDeclaration (#1835).
function isClassValuedDeclaration(node: TSESTree.Identifier): boolean {
  if (isConstructorTypeAnnotation(node.typeAnnotation?.typeAnnotation)) {
    return true;
  }
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.ClassExpression:
      return parent.id === node;
    case AST_NODE_TYPES.VariableDeclarator:
      return (
        parent.id === node &&
        parent.init?.type === AST_NODE_TYPES.ClassExpression
      );
    case AST_NODE_TYPES.PropertyDefinition:
      return (
        parent.key === node &&
        parent.value?.type === AST_NODE_TYPES.ClassExpression
      );
    default:
      return false;
  }
}

// Is `name` a conversion compound of the form <head><Type> (toNumber,
// parseBoolean, fromString, asArray, convertToNumber), where the FINAL segment
// is a full type word and everything before it is a conversion head? The type
// word must be final and must follow the head directly, so a name that merely
// contains a head keeps firing: `toNumberValue` names a value (the type word is
// not the target), `numberToValue` leads with the type word, and `strToNumber`
// carries an abbreviation marker, which no English word is spelled with.
// Abbreviation markers are excluded by construction — FULL_TYPE_WORDS holds only
// the spelled-out type words — so `toNum` / `toStr` are untouched.
function isConversionTargetCompound(name: string): boolean {
  const segments = splitCamelSegments(name);
  if (segments.length < 2) {
    return false;
  }
  const target = segments[segments.length - 1];
  if (!FULL_TYPE_WORDS.has(target.toLowerCase())) {
    return false;
  }
  const head = segments.slice(0, -1).join('').toLowerCase();
  return CONVERSION_HEADS.has(head);
}

// Does the declaration site PROVE, syntactically, that the named value is a
// function? Only a function declaration's own name, a function/arrow
// initializer, or a class METHOD are conclusive without type information — an
// aliased function (`const toNumber = parseFloat`) and a bare `(v: string) =>
// number` annotation are deliberately not read, keeping the carve-out on the
// shapes where the function body is written at the declaration itself.
//
// This is the mirror image of isSymbolTypedDeclaration (#1835) and
// isClassValuedDeclaration (#2030): there the syntactic proof WITHDRAWS a
// carve-out because it confirms the suffix encodes the value's type; here it
// GRANTS one, because a function value is precisely what the type word cannot
// be describing. Accessors are excluded (`get toNumber()` is read as a value at
// every use site, so its `Number` does tag that value), as are computed keys,
// whose identifier is a reference to some other binding rather than a
// declaration.
function isFunctionValuedDeclaration(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  const isFunctionValue = (value: TSESTree.Node | null | undefined) =>
    !!value &&
    (value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      value.type === AST_NODE_TYPES.FunctionExpression);
  switch (parent.type) {
    case AST_NODE_TYPES.FunctionDeclaration:
      return parent.id === node;
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.id === node && isFunctionValue(parent.init);
    case AST_NODE_TYPES.MethodDefinition:
      return (
        parent.key === node && !parent.computed && parent.kind === 'method'
      );
    case AST_NODE_TYPES.PropertyDefinition:
      return (
        parent.key === node && !parent.computed && isFunctionValue(parent.value)
      );
    default:
      return false;
  }
}

// Rebuild a SCREAMING_SNAKE_CASE identifier's segments into a PascalCase compound
// (["MATCH","NUMBER"] -> "MatchNumber") so the snake-case branch can reuse the
// camelCase isDomainNumberCompound / DOMAIN_NUMBER_HEAD_NOUNS exemption verbatim,
// keeping MATCH_NUMBER and matchNumber on a single code path (#1294).
function screamingSnakePartsToPascalCase(parts: readonly string[]): string {
  return parts
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('');
}

export const noHungarian = createRule<[], MessageIds>({
  name: 'no-hungarian',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow Hungarian notation in locally declared variables, types, and classes',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      noHungarian:
        'Identifier "{{name}}" encodes its type through a prefix or suffix (Hungarian notation). Type-coded names hide the domain concept and become misleading when the underlying type changes. Rename it to a domain-focused name without the type marker and rely on TypeScript for type information.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track identifiers that have already been checked to prevent double reporting
    const checkedIdentifiers = new Set<string>();

    // Names declared as generic type parameters (e.g. TNumber, TKey). The leading
    // `T` is the TypeScript convention for "Type parameter", not a Hungarian tag,
    // so neither the declaration nor any reference to it is ever flagged.
    const typeParameterNames = new Set<string>();

    // Check if a variable name contains a type marker with proper word boundaries.
    // `isTypeName` is true for PascalCase type declarations (type aliases,
    // interfaces, classes), enabling the semantic-type-concept exemption.
    // `isSymbolTyped` is true when the declaration syntactically proves a JS
    // `symbol` value, which vetoes the <domain>Symbol glyph exemption.
    // `isClassValued` is true when the declaration syntactically proves a JS
    // class value, which vetoes the <taxonomy>Class exemption.
    // `isFunctionValued` is true when the declaration syntactically proves a
    // function value, which GRANTS the converter-function exemption.
    function hasTypeMarker(
      variableName: string,
      isTypeName = false,
      isSymbolTyped = false,
      isClassValued = false,
      isFunctionValued = false,
    ): boolean {
      // Type names whose type-word denotes a concept/relation (StringToNumber,
      // CapitalizedString, FuncKeys, PromiseOrValue) are not Hungarian — the word
      // is part of the type's meaning, like the allowed compound noun PhoneNumber.
      //
      // Extended to any PascalCase declaration (components, classes, functions):
      // when a built-in type word qualifies a DIFFERENT head noun the value is a
      // component / props type, never a number/bigint (NumberAmountEditor,
      // BigIntAmountEditorProps) — the leading-position analog of the
      // DOMAIN_NUMBER_HEAD_NOUNS suffix carve-out, mirroring Intl.NumberFormat /
      // StringBuilder / NumberFormatter. Keyed on PascalCase because a
      // lowercase-initial variable (numberCount, stringValue) DOES encode its own
      // value's type and must keep firing (#1317).
      if (
        (isTypeName || isPascalCaseName(variableName)) &&
        isSemanticTypeConcept(variableName)
      ) {
        return false;
      }

      // Single-letter Hungarian prefixes (bIsActive, iCount): a lone b/i directly
      // followed by an uppercase letter is a type tag. Restricted to camelCase
      // (lowercase first letter) to avoid PascalCase type names like IButton.
      if (
        variableName.length > 1 &&
        SINGLE_LETTER_PREFIXES.has(variableName[0]) &&
        /[A-Z]/.test(variableName[1])
      ) {
        return true;
      }

      // Check if the variable name is exactly one of the allowed compound nouns
      // or if it contains one of the allowed compound nouns but is not a prefix like "strPhoneNumber"
      for (const compoundNoun of ALLOWED_COMPOUND_NOUNS) {
        // If the variable name is exactly the compound noun (case-insensitive)
        if (variableName.toLowerCase() === compoundNoun.toLowerCase()) {
          return false;
        }

        // If the variable name contains the compound noun
        if (variableName.includes(compoundNoun)) {
          // Check if it's a prefix like "strPhoneNumber" (which should be flagged)
          const prefix = variableName.substring(
            0,
            variableName.indexOf(compoundNoun),
          );
          if (
            TYPE_MARKERS.some(
              (marker) => prefix.toLowerCase() === marker.toLowerCase(),
            )
          ) {
            // This is a type marker prefix + compound noun, so it should be flagged
            return true;
          }

          // Otherwise treat the compound noun as an allowed descriptive phrase
          // (e.g., userPhoneNumber is acceptable even though it contains "Number")
          return false;
        }
      }

      // Check if the variable name ends with one of the allowed descriptive suffixes
      if (
        ALLOWED_SUFFIXES.some(
          (suffix) =>
            variableName.endsWith(suffix) &&
            variableName.length > suffix.length &&
            /[a-z]/.test(variableName[variableName.length - suffix.length - 1]),
        )
      ) {
        return false;
      }

      const normalizedVarName = variableName.toLowerCase();

      // Handle SCREAMING_SNAKE_CASE separately
      if (variableName === variableName.toUpperCase()) {
        // Special case for all-caps variables without underscores (like BREAKPOINTS)
        // These should not be flagged as Hungarian notation
        if (!variableName.includes('_')) {
          return false;
        }
        const parts = variableName.split('_');
        const lastIndex = parts.length - 1;

        // A leading single-letter segment (B_, I_) carries the same tag as the
        // camelCase prefix (bIsActive), so global-const-style's rename to
        // SCREAMING_SNAKE_CASE (bIsActive -> B_IS_ACTIVE) must not disarm the
        // rule. Gated on `parts.length > 1` (guaranteed here, since the
        // no-underscore case already returned above) so a lone `B` — with no
        // following segment — is left alone: there is no tagged name to catch,
        // only an isolated identifier. Reuses SINGLE_LETTER_PREFIXES rather than
        // hardcoding b/i so the two casings can never diverge on which letters
        // count. Real first-word segments (TAB_INDEX, LIB_VERSION, UI_CONFIG)
        // are untouched because they are longer than one letter.
        if (
          parts.length > 1 &&
          SINGLE_LETTER_PREFIXES.has(parts[0].toLowerCase())
        ) {
          return true;
        }

        return TYPE_MARKERS.some((marker) => {
          const markerUpper = marker.toUpperCase();
          const normalizedMarker = marker.toLowerCase();
          const isAbbreviation = ABBREVIATION_MARKER_SET.has(normalizedMarker);

          return parts.some((part, index) => {
            if (part !== markerUpper) {
              return false;
            }
            // Abbreviation markers (STR/ARR/OBJ/...) are type tags in any
            // position — no English word is spelled that way.
            if (isAbbreviation) {
              return true;
            }
            // A FULL type word tags the entity's runtime type only as a genuine
            // leading prefix (index 0) or trailing head-noun (last segment).
            // Mirror the camelCase/PascalCase branch, which never flags a
            // full-type-word in a MIDDLE segment: an interior NUMBER/STRING is a
            // domain modifier describing a variant (CADENCE_NUMBER_EDITORS —
            // "editors of a numeric cadence"), not a redundant type tag. The
            // previous `index === lastIndex - 1` allowance produced a casing
            // asymmetry — CadenceNumberEditor was exempt (#1250) but
            // CADENCE_NUMBER_EDITORS fired (#1294).
            if (index !== 0 && index !== lastIndex) {
              return false;
            }
            // A trailing "..._TYPE" word directly after a conversion head on a
            // declaration that proves a function (TO_NUMBER, PARSE_BOOLEAN as
            // arrow consts) names the conversion TARGET, not the constant's own
            // type — the same carve-out as camelCase toNumber (#2302), routed
            // through the shared PascalCase helper so the two casings cannot
            // diverge (the #1294 asymmetry).
            if (
              isFunctionValued &&
              index === lastIndex &&
              isConversionTargetCompound(screamingSnakePartsToPascalCase(parts))
            ) {
              return false;
            }
            // A trailing "..._NUMBER" whose preceding head noun is a domain
            // entity (MATCH_NUMBER, ISSUE_NUMBER, CURRENT_LINE_NUMBER) is a
            // domain compound, not a Hungarian type tag — route through the same
            // isDomainNumberCompound carve-out used for camelCase matchNumber
            // (#1277), so numeric-quantity heads (COUNT_NUMBER, MAX_RETRY_NUMBER)
            // still fire because those heads are absent from
            // DOMAIN_NUMBER_HEAD_NOUNS.
            if (
              normalizedMarker === 'number' &&
              index === lastIndex &&
              isDomainNumberCompound(screamingSnakePartsToPascalCase(parts))
            ) {
              return false;
            }
            // A trailing "..._SYMBOL" whose preceding head noun names a thing
            // written with a glyph (CURRENCY_SYMBOL, TICKER_SYMBOL) is a domain
            // compound, not a type tag — same carve-out as camelCase
            // currencySymbol (#1835), routed through the shared PascalCase
            // helper so the two casings cannot diverge (the #1294 asymmetry).
            if (
              normalizedMarker === 'symbol' &&
              index === lastIndex &&
              !isSymbolTyped &&
              isDomainSymbolCompound(screamingSnakePartsToPascalCase(parts))
            ) {
              return false;
            }
            // A trailing "..._CLASS" whose preceding head noun names a
            // bucketing taxonomy (WINDOW_SIZE_CLASS, STORAGE_CLASS) is a
            // domain compound, not a type tag — same carve-out as camelCase
            // windowSizeClass (#2030), routed through the shared PascalCase
            // helper so the two casings cannot diverge (the #1294 asymmetry).
            if (
              normalizedMarker === 'class' &&
              index === lastIndex &&
              !isClassValued &&
              isDomainClassCompound(screamingSnakePartsToPascalCase(parts))
            ) {
              return false;
            }
            return true;
          });
        });
      }

      // For camelCase, PascalCase, etc.
      return TYPE_MARKERS.some((marker) => {
        const normalizedMarker = marker.toLowerCase();

        // If the variable name is exactly the marker, ignore it
        if (normalizedVarName === normalizedMarker) {
          return false;
        }

        // Abbreviation markers (str, num, int, bool, arr, obj) are short enough
        // that the raw-character boundary checks below fire on them as
        // substrings inside real English words (e.g. "int" inside "Mint", "str"
        // inside "stream"). The ONLY correct test for an abbreviation marker is
        // therefore an exact match against a full camelCase segment: "Mint" →
        // ["Mint"] never matches "int", while genuine Hungarian like intValue →
        // ["int","Value"] still does.
        //
        // This guard MUST run before the prefix/suffix boundary checks. A
        // capitalized terminal segment makes its own initial capital double as
        // the raw suffix-boundary character: "appendHoldHint" ends with the
        // marker "int" AND its preceding char is the capital "H" of "Hint", so
        // the suffix check below would short-circuit to `true` and short-circuit
        // this guard entirely (issue #1258). Because it always returns, an
        // abbreviation marker never reaches the raw-character heuristics, so
        // words like Hint/Blueprint/Waypoint/Checkpoint/Paint are spared.
        if (ABBREVIATION_MARKER_SET.has(normalizedMarker)) {
          const segments = splitCamelSegments(variableName);
          return segments.some((s) => s.toLowerCase() === normalizedMarker);
        }

        // The prefix/suffix boundary checks below apply only to FULL type-word
        // markers (String, Number, Boolean, Array, Object, ...); abbreviation
        // markers have already returned above.

        // Check if it's a prefix with proper boundary (e.g., stringValue,
        // numberCount)
        if (
          normalizedVarName.startsWith(normalizedMarker) &&
          normalizedVarName.length > normalizedMarker.length &&
          /[A-Z0-9]/.test(variableName[normalizedMarker.length])
        ) {
          return true;
        }

        // Check if it's a suffix with proper boundary (e.g., userString, itemArray)
        if (
          normalizedVarName.endsWith(normalizedMarker) &&
          normalizedVarName.length > normalizedMarker.length &&
          (/[A-Z0-9]/.test(
            variableName[variableName.length - normalizedMarker.length - 1],
          ) ||
            /[A-Z]/.test(
              variableName[variableName.length - normalizedMarker.length],
            ))
        ) {
          // A trailing full type word directly after a conversion head, on a
          // declaration that syntactically proves a function (toNumber,
          // parseBoolean, fromString, asArray, convertToNumber), names what the
          // conversion PRODUCES — the identifier itself holds a function, so
          // there is no value type being tagged, and stripping the word leaves
          // `to` / `parse` / `from`, which name nothing (#2302). Scoped to
          // full-word markers in SUFFIX position on a proven function, so
          // `const toNumber = 5`, `toNum` / `toStr` / `strToNumber`, and
          // `numberToValue` all keep firing.
          if (isFunctionValued && isConversionTargetCompound(variableName)) {
            return false;
          }
          // A trailing "...Number" whose head noun is a domain entity
          // (issueNumber, lineNumber, roundNumber, versionNumber) is a domain
          // compound, not a Hungarian type tag: the suffix names WHAT the value
          // is (the number OF an issue — GitHub's REST field is `issue_number`),
          // and stripping it destroys the concept (`issue` = the whole object).
          // Generalizes #640's PhoneNumber/EmailAddress/PostalCode carve-out to
          // the whole <entity>Number category (#1277). Scoped to the full-word
          // `Number` marker only: abbreviation tags (str/num/obj/arr/bool) are
          // handled above and still fire, and numeric-quantity heads
          // (countNumber, ageNumber, indexNumber) keep firing because such heads
          // are deliberately absent from DOMAIN_NUMBER_HEAD_NOUNS.
          if (
            normalizedMarker === 'number' &&
            isDomainNumberCompound(variableName)
          ) {
            return false;
          }
          // A trailing "...Symbol" whose head noun names a thing WRITTEN with a
          // glyph (currencySymbol, tickerSymbol, unitSymbol) is a domain
          // compound: the suffix names WHAT the value is (the glyph OF a
          // currency — CLDR/ISO 4217 vocabulary), and the value is a string, so
          // there is no type to strip (#1835). Scoped to the full-word `Symbol`
          // marker in SUFFIX position only, and vetoed when the declaration
          // proves a real `symbol`, so idSymbol / cacheSymbol / symbolKey and
          // any annotated `: symbol` keep firing.
          if (
            normalizedMarker === 'symbol' &&
            !isSymbolTyped &&
            isDomainSymbolCompound(variableName)
          ) {
            return false;
          }
          // A trailing "...Class" whose head noun names a bucketing taxonomy
          // (windowSizeClass, characterClass, storageClass) is a domain
          // compound: the suffix names WHAT the value is (the BUCKET a window
          // width falls into — Material Design 3 / UIKit vocabulary), and
          // stripping it yields a wrong name (windowSize is a width, not a
          // bucket) (#2030). Scoped to the full-word `Class` marker in SUFFIX
          // position only, and vetoed when the declaration proves a real
          // class, so userClass / classRegistry / `const SizeClass = class {}`
          // keep firing.
          if (
            normalizedMarker === 'class' &&
            !isClassValued &&
            isDomainClassCompound(variableName)
          ) {
            return false;
          }
          return true;
        }

        // Full type-word markers (non-abbreviations: String, Number, Function,
        // Array, Object, Boolean, …) are Hungarian only when they occupy the
        // first or last camelCase segment — a genuine prefix or suffix that
        // tags the entity's runtime type. The prefix/suffix character checks
        // above already return `true` for those positions, so reaching this
        // point means the marker sits in a middle segment of the identifier
        // (e.g. cloud·Function·Registry, user·String·Name). A middle
        // full-type-word qualifies a domain concept ("a registry of cloud
        // functions") rather than redundantly encoding the entity's type.
        // Accepting the resulting false negatives is the deliberate trade-off:
        // middle-segment full-type-words are overwhelmingly domain vocabulary,
        // not type tags.
        return false;
      });
    }

    // Check if the identifier is a built-in method or imported from an external module
    function isExternalOrBuiltIn(node: TSESTree.Identifier): boolean {
      // Check if the identifier is a property in a member expression
      // (e.g., the 'startsWith' in 'pathname.startsWith')
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.property === node
      ) {
        // Check if it's a known built-in method
        if (BUILT_IN_METHODS.has(node.name)) {
          return true;
        }
      }

      // Check if it's an imported identifier
      const scope = context.getScope();
      const variable = scope.variables.find((v) => v.name === node.name);

      if (variable && variable.defs.length > 0) {
        // Check if it's an import binding
        const def = variable.defs[0];
        if (def.type === 'ImportBinding') {
          return true;
        }
      }

      return false;
    }

    // Determine whether an identifier is (or references) a generic type parameter.
    function isTypeParameter(node: TSESTree.Identifier): boolean {
      // The type-parameter declaration itself: <TNumber>
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.TSTypeParameter &&
        node.parent.name === node
      ) {
        return true;
      }
      // A reference to a declared type parameter (e.g. x: TNumber).
      return typeParameterNames.has(node.name);
    }

    // Check identifier for type markers (Hungarian notation).
    // `isTypeName` enables the semantic-type-concept exemption for type
    // declarations (aliases, interfaces, classes).
    function checkIdentifier(node: TSESTree.Identifier, isTypeName = false) {
      const name = node.name;

      // Generic type parameters (TNumber, TKey, ...) are a TypeScript naming
      // convention, never Hungarian — skip the declaration and all references.
      if (isTypeParameter(node)) {
        return;
      }

      // Create a unique ID for this node to avoid checking it twice
      // Use the name along with source location for uniqueness
      const nodeId = `${name}:${node.loc.start.line}:${node.loc.start.column}`;

      // Skip if we've already checked this identifier
      if (checkedIdentifiers.has(nodeId)) {
        return;
      }

      // Mark this identifier as checked
      checkedIdentifiers.add(nodeId);

      // Skip if the identifier is a built-in method or imported from an external module
      if (isExternalOrBuiltIn(node)) return;

      // Check for type markers
      if (
        hasTypeMarker(
          name,
          isTypeName,
          isSymbolTypedDeclaration(node),
          isClassValuedDeclaration(node),
          isFunctionValuedDeclaration(node),
        )
      ) {
        context.report({
          node,
          messageId: 'noHungarian',
          data: { name },
        });
      }
    }

    return {
      // Check variable declarations
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          checkIdentifier(node.id);
        }
      },

      // Check function declarations
      FunctionDeclaration(node) {
        if (node.id) {
          checkIdentifier(node.id);
        }
        // Check function parameters
        for (const param of node.params) {
          if (param.type === AST_NODE_TYPES.Identifier) {
            checkIdentifier(param);
          } else if (
            param.type === AST_NODE_TYPES.AssignmentPattern &&
            param.left.type === AST_NODE_TYPES.Identifier
          ) {
            checkIdentifier(param.left);
          }
        }
      },

      // Check function expressions and arrow functions
      'FunctionExpression, ArrowFunctionExpression'(
        node: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      ) {
        // Check function parameters
        for (const param of node.params) {
          if (param.type === AST_NODE_TYPES.Identifier) {
            checkIdentifier(param);
          } else if (
            param.type === AST_NODE_TYPES.AssignmentPattern &&
            param.left.type === AST_NODE_TYPES.Identifier
          ) {
            checkIdentifier(param.left);
          }
        }
      },

      // Record generic type-parameter names so neither the declaration nor any
      // reference to them is flagged (the leading `T` is a TS convention).
      TSTypeParameter(node) {
        if (node.name.type === AST_NODE_TYPES.Identifier) {
          typeParameterNames.add(node.name.name);
        }
      },

      // Check class declarations
      ClassDeclaration(node) {
        if (node.id) {
          checkIdentifier(node.id, true);
        }

        // Check class methods and properties
        for (const member of node.body.body) {
          if (
            member.type === AST_NODE_TYPES.MethodDefinition &&
            member.key.type === AST_NODE_TYPES.Identifier
          ) {
            // Check method name
            checkIdentifier(member.key);

            // Check method parameters
            if (member.value.type === AST_NODE_TYPES.FunctionExpression) {
              for (const param of member.value.params) {
                if (param.type === AST_NODE_TYPES.Identifier) {
                  checkIdentifier(param);
                } else if (
                  param.type === AST_NODE_TYPES.AssignmentPattern &&
                  param.left.type === AST_NODE_TYPES.Identifier
                ) {
                  checkIdentifier(param.left);
                }
              }
            }
          } else if (
            member.type === AST_NODE_TYPES.PropertyDefinition &&
            member.key.type === AST_NODE_TYPES.Identifier
          ) {
            // Check property name
            checkIdentifier(member.key);
          }
        }
      },

      // Check type aliases
      TSTypeAliasDeclaration(node) {
        checkIdentifier(node.id, true);
      },

      // Check interface declarations
      TSInterfaceDeclaration(node) {
        checkIdentifier(node.id, true);
      },
    };
  },
});
