# Disallow Hungarian notation in locally declared variables, types, and classes (`@blumintinc/blumint/no-hungarian`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows embedding type information in identifier names (Hungarian notation) for locally declared variables, parameters, functions, classes, interfaces, and type aliases. Type prefixes and suffixes such as `str`, `num`, `bool`, `String`, or `Number` are flagged because they duplicate what the type system already communicates.

## Rule Details

### Why this matters

- Type-coded names drift as soon as the underlying type changes, leaving misleading hints that cause misuse and slow reviews.
- Prefixes and suffixes push the domain concept out of the name, making it harder to see what the value represents at a glance.
- Type information already lives in TypeScript annotations and runtime validation; duplicating it in names increases maintenance overhead without adding safety.

### What gets checked

- Locally declared identifiers that start or end with common type markers (camelCase, PascalCase, or SCREAMING_SNAKE_CASE).
- Class members and parameters that reuse the same markers.
- Single-letter type prefixes `b` (boolean) and `i` (integer/index) when followed by an uppercase letter, e.g. `bIsActive`, `iCount`. The same tag is caught in `SCREAMING_SNAKE_CASE` when the letter is a leading segment of its own followed by at least one more segment, e.g. `B_IS_ACTIVE`, `I_COUNT` — this keeps the rule firing on names that `global-const-style` renames from camelCase into `SCREAMING_SNAKE_CASE` (`bIsActive` → `B_IS_ACTIVE`).
- The rule allows common compound nouns (for example, `PhoneNumber`, `EmailAddress`) and descriptive suffixes like `Formatted`, `Parsed`, or `Converted`.
- Built-in methods and imported identifiers are ignored to avoid false positives for code you do not control.

### What is NOT flagged

- **Generic type parameters with a `T` prefix.** The leading `T` is the standard TypeScript convention for "Type parameter" (e.g. `TKey`, `TValue`, `TNumber`), not Hungarian notation. The declaration and every reference to it are exempt.
- **Plural domain nouns.** A spelled-out type word that is the domain concept being described is not a type tag, e.g. `areBothFiniteNumbers`, `positiveIntegers`.
- **Domain-entity `Number` compounds.** A trailing `Number` whose head noun names a domain entity is the HEAD NOUN of the concept, not a type tag — the value *is* the number of that entity (GitHub's REST API field is literally `issue_number`), and stripping the suffix yields a wrong name (`issue` denotes the whole issue object, not its number). Examples: `issueNumber`, `lineNumber`, `roundNumber`, `versionNumber`, `accountNumber`. This generalizes the `PhoneNumber` allowance above to the whole `<entity>Number` category. Quantity-headed compounds are unaffected and still flagged, since for them `Number` is a redundant type tag: `countNumber`, `ageNumber`, `indexNumber`.
- **Interior `SCREAMING_SNAKE_CASE` segments.** A full type word buried in the middle of a constant name (any segment that is neither the first nor the last) qualifies a variant rather than tagging the entity's type, e.g. `EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT`, `CADENCE_NUMBER_EDITORS`. This mirrors the camelCase/PascalCase branch, which never flags a full type word in a middle segment. Abbreviation markers (`STR`, `ARR`, `OBJ`, ...) are still flagged in any position.
- **Type names that denote a type concept or conversion.** A full type word used as one descriptive segment of a type alias / interface / class name reads as a concept, comparable to `PhoneNumber`, e.g. `StringToNumber`, `CapitalizedString`, `PromiseOrValue`, `FuncKeys`. Abbreviation markers (`str`, `arr`, `obj`, ...) are still flagged in type names because no English word is spelled that way (e.g. `UserStrName` is flagged).
- **PascalCase declarations whose type word qualifies a different head noun.** A component, class, function, or type name where a built-in type word modifies a distinct head noun is a domain compound, not a type tag — the value is a component or props type, never a number/bigint. Examples: `NumberAmountEditor`, `BigIntAmountEditor`, `BigIntAmountEditorProps`, mirroring `Intl.NumberFormat`, `StringBuilder`, and `NumberFormatter`. This is the leading-position analog of the `<entity>Number` carve-out and applies in any segment position (e.g. `CadenceBigIntEditor`). It is scoped to PascalCase (leading capital): a lowercase-initial variable such as `numberCount` or `stringValue` *is* naming its own value's type and stays flagged.
- **Glyph-domain `Symbol` compounds.** A trailing `Symbol` whose head noun names something that is *written with a glyph* denotes that printed character (`"$"`, `"BTC"`, `"kg"`, `"Fe"`), not the JavaScript `symbol` primitive — the value is a string, so there is no type marker to strip, and stripping it yields a wrong name (`currency` is the currency, not the character it is written with). ISO 4217 and CLDR call the glyph a *currency symbol*. Examples: `currencySymbol`, `getCurrencySymbol`, `tickerSymbol`, `tokenSymbol`, `unitSymbol`, `elementSymbol`, `CURRENCY_SYMBOL`. This is the `Symbol` analog of the `<entity>Number` carve-out. The `Symbol` marker is otherwise intact: head nouns whose value really is a JS symbol keep firing (`idSymbol`, `cacheSymbol`, `brandSymbol`), as does any use in *prefix* position (`symbolKey`, `SYMBOL_TABLE`).
- **Taxonomy `Class` compounds.** A trailing `Class` whose head noun names a bucketing taxonomy denotes the *category a value falls into*, not the JavaScript `class` construct — "window size class" is the Material Design 3 / UIKit term for a breakpoint bucket (compact/medium/expanded), a regex *character class* is `[a-z]`, an S3 *storage class* is `"STANDARD"`. The value is a string or number map, so there is no type marker to strip, and stripping it yields a wrong name (`WINDOW_SIZE` names a width, not a bucket). Examples: `WINDOW_SIZE_CLASS`, `windowSizeClass`, `SIZE_CLASS`, `characterClass`, `storageClass`, `assetClass`, `weightClass`, `fareClass`. This is the `Class` analog of the `<entity>Number` carve-out. The `Class` marker is otherwise intact: head nouns outside the taxonomy list keep firing (`UserClass`, `userClass`, `HELPER_CLASS`), as does any use in *prefix* position (`classRegistry`, `CLASS_MAP`).
- **Converter functions.** A name whose FINAL segment is a full type word placed directly after a conversion head (`to`, `as`, `from`, `parse`, `into`, `convertTo`) names the type the conversion *produces*, not the type of the value the identifier holds — the identifier holds a function. Stripping the type word leaves `to` / `parse` / `from`, which name nothing, so the whole compound is the concept, exactly as in the `StringToNumber` type-concept allowance above. Examples: `toNumber`, `toBoolean`, `toArray`, `toObject`, `parseBoolean`, `fromString`, `asNumber`, `convertToNumber`, `toString`, `TO_NUMBER`. This is the converter pattern the sibling `enforce-verb-noun-naming` rule documents as correct, so the two recommended rules agree on it. The exemption is granted only where the declaration syntactically PROVES a function — a function declaration, a function/arrow initializer, a class method, or a class field holding a function — which is the `Symbol` / `Class` proof running the other way: there it withdraws a carve-out, here it grants one. Anything else keeps firing: a non-function binding (`const toNumber = 5`, `let toNumber: (v: string) => number`, `const toNumber = parseFloat`), an accessor whose use site reads as a value (`get toNumber()`), a parameter holding the converted value (`function convert(toNumber: string)`), an abbreviation marker anywhere (`strToNumber`, `toNum`, `toStr`), and the type word in any other position (`numberToValue`, `toDisplayString`). A `: symbol` or `: boolean` return annotation confirms the conversion target rather than withdrawing the exemption.
- **Real-word first `SCREAMING_SNAKE_CASE` segments.** The single-letter prefix check only fires when the leading segment is EXACTLY `B` or `I` on its own; a longer first segment is a word fragment, not a lone-letter type tag, so `TAB_INDEX`, `LIB_VERSION`, `UI_CONFIG`, and `BIN_PATH` stay valid. A bare `B` or `I` with no following segment is left alone too — there is no tagged name for the letter to prefix.
- **Type annotations.** The rule judges only the identifier name, never the annotation, so `type TeamSize = Readonly<Range<number>>` is allowed. The exceptions are the glyph and taxonomy carve-outs above: a declaration that syntactically proves a JS `symbol` — an explicit `: symbol` / `unique symbol` annotation, or a `Symbol()` initializer — withdraws the former, so `const currencySymbol: symbol = Symbol('currency')` is still flagged; a declaration that syntactically proves a real class — a `class` expression initializer, a class declaration's own name, or a `new (...) => T` constructor-type annotation — withdraws the latter, so `const SizeClass = class {}` is still flagged.

### How to fix

Rename the identifier to a domain-focused term and keep the type information in the type annotation or inference. For example, use `email` or `customerEmail` instead of `emailString`, and `results` instead of `resultsArray`.

### Examples of **incorrect** code for this rule:

```js
const nameString = "John";
const ageNumber = 30;
const isActiveBoolean = true;
const userDataObject = { name: "John", age: 30 };
const itemsArray = ["apple", "banana"];

const USER_ROLES_ARRAY = ["admin", "user"];
const B_IS_ACTIVE = true;
const I_COUNT = 0;

function getUserObjectData() {
  const paramString = "value";
  return paramString;
}

class UserObjData {}
```

### Examples of **correct** code for this rule:

```js
const name = "John";
const age = 30;
const isActive = true;
const userData = { name: "John", age: 30 };
const items = ["apple", "banana"];

const userRoles = ["admin", "user"];

// A real word as the leading SCREAMING_SNAKE_CASE segment is not a lone-letter
// type tag, so these stay valid
const TAB_INDEX = 0;
const LIB_VERSION = "1.0.0";
const UI_CONFIG = { theme: "dark" };

function getUserData() {
  const name = "John";
  const age = 30;
  const isActive = true;
  return { name, age, isActive };
}

// Built-in methods are ignored
function checkPath(pathname) {
  return pathname.startsWith('/sitemap');
}

// Imported identifiers are ignored
import { userDataString } from './module';
```

```ts
// Generic type parameters with a `T` prefix are a TypeScript convention
function identity<TValue>(value: TValue): TValue {
  return value;
}
type ExtendProps<TFunc, TNewParams> = TFunc;

// Plural domain nouns describe what is validated, not a type
function areBothFiniteNumbers(a: number, b: number) {
  return Number.isFinite(a) && Number.isFinite(b);
}

// Type-utility names where the type word denotes a concept or conversion
type StringToNumber<T extends string> = T extends `${infer N extends number}`
  ? N
  : never;
type CapitalizedString = `${Capitalize<string>}`;

// A full type word as an interior SCREAMING_SNAKE_CASE segment qualifies a variant
const EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT = { isEditing: true };

// PascalCase declarations where the type word qualifies a different head noun
// (a component / props type, never a number or bigint) are domain compounds
const NumberAmountEditor = () => null;
const BigIntAmountEditor = () => null;
type BigIntAmountEditorProps = { maxValue: string };

// "Symbol" as the glyph a currency/ticker/unit is written with is a domain
// noun, not the JS `symbol` type — the value is a string
const currencySymbol = '$';
const tickerSymbol = 'BTC';
const CURRENCY_SYMBOL = '$';
function getCurrencySymbol(): string {
  return '$';
}

// "Class" as the bucket a value falls into (an M3 window size class, a regex
// character class, an S3 storage class) is a domain noun, not the JS `class`
// construct — the value is a string/number map
const WINDOW_SIZE_CLASS = { compact: 0, medium: 600, expanded: 840 };
const windowSizeClass = 'compact';
const storageClass = 'STANDARD';

// A converter's type word names what the conversion produces; the identifier
// holds a function, so there is no value type being tagged
function toNumber(value: string) {
  return +value;
}
const toBoolean = (value: string): boolean => value === 'true';
function parseBoolean(value: string) {
  return value === 'true';
}
class Money {
  public toString(): string {
    return '$';
  }
}

// The rule judges the name, never the type annotation
type TeamSize = Readonly<Range<number>>;
```

## When Not To Use It

If your team intentionally encodes types in identifiers, disable this rule. Modern TypeScript and linting make type prefixes unnecessary and often misleading during refactors.

## Further Reading

- [Hungarian Notation](https://en.wikipedia.org/wiki/Hungarian_notation)
- [Why Hungarian Notation Is Bad](https://www.joelonsoftware.com/2005/05/11/making-wrong-code-look-wrong/)
