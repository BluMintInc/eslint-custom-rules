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
- Single-letter type prefixes `b` (boolean) and `i` (integer/index) when followed by an uppercase letter, e.g. `bIsActive`, `iCount`.
- The rule allows common compound nouns (for example, `PhoneNumber`, `EmailAddress`) and descriptive suffixes like `Formatted`, `Parsed`, or `Converted`.
- Built-in methods and imported identifiers are ignored to avoid false positives for code you do not control.

### What is NOT flagged

- **Generic type parameters with a `T` prefix.** The leading `T` is the standard TypeScript convention for "Type parameter" (e.g. `TKey`, `TValue`, `TNumber`), not Hungarian notation. The declaration and every reference to it are exempt.
- **Plural domain nouns.** A spelled-out type word that is the domain concept being described is not a type tag, e.g. `areBothFiniteNumbers`, `positiveIntegers`.
- **Domain-entity `Number` compounds.** A trailing `Number` whose head noun names a domain entity is the HEAD NOUN of the concept, not a type tag — the value *is* the number of that entity (GitHub's REST API field is literally `issue_number`), and stripping the suffix yields a wrong name (`issue` denotes the whole issue object, not its number). Examples: `issueNumber`, `lineNumber`, `roundNumber`, `versionNumber`, `accountNumber`. This generalizes the `PhoneNumber` allowance above to the whole `<entity>Number` category. Quantity-headed compounds are unaffected and still flagged, since for them `Number` is a redundant type tag: `countNumber`, `ageNumber`, `indexNumber`.
- **Interior `SCREAMING_SNAKE_CASE` segments.** A full type word buried in the middle of a constant name (not a prefix, suffix, or the segment directly before the final noun) qualifies a variant rather than tagging the entity's type, e.g. `EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT`.
- **Type names that denote a type concept or conversion.** A full type word used as one descriptive segment of a type alias / interface / class name reads as a concept, comparable to `PhoneNumber`, e.g. `StringToNumber`, `CapitalizedString`, `PromiseOrValue`, `FuncKeys`. Abbreviation markers (`str`, `arr`, `obj`, ...) are still flagged in type names because no English word is spelled that way (e.g. `UserStrName` is flagged).
- **PascalCase declarations whose type word qualifies a different head noun.** A component, class, function, or type name where a built-in type word modifies a distinct head noun is a domain compound, not a type tag — the value is a component or props type, never a number/bigint. Examples: `NumberAmountEditor`, `BigIntAmountEditor`, `BigIntAmountEditorProps`, mirroring `Intl.NumberFormat`, `StringBuilder`, and `NumberFormatter`. This is the leading-position analog of the `<entity>Number` carve-out and applies in any segment position (e.g. `CadenceBigIntEditor`). It is scoped to PascalCase (leading capital): a lowercase-initial variable such as `numberCount` or `stringValue` *is* naming its own value's type and stays flagged.
- **Type annotations.** The rule judges only the identifier name, never the annotation, so `type TeamSize = Readonly<Range<number>>` is allowed.

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

// The rule judges the name, never the type annotation
type TeamSize = Readonly<Range<number>>;
```

## When Not To Use It

If your team intentionally encodes types in identifiers, disable this rule. Modern TypeScript and linting make type prefixes unnecessary and often misleading during refactors.

## Further Reading

- [Hungarian Notation](https://en.wikipedia.org/wiki/Hungarian_notation)
- [Why Hungarian Notation Is Bad](https://www.joelonsoftware.com/2005/05/11/making-wrong-code-look-wrong/)
