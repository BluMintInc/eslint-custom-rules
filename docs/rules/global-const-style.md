# Enforce UPPER_SNAKE_CASE and as const for global static constants (`@blumintinc/blumint/global-const-style`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Top-level constants should read as immutable configuration and stay frozen at the value authored. This rule keeps that intent obvious by enforcing:

1. `UPPER_SNAKE_CASE` names for module-scope constants so they stand out from runtime variables.
1. `as const` for literal, array, and object initializers in TypeScript so the type stays exact and the value cannot be mutated accidentally.

## Rule Details

Global configuration often feeds props, feature flags, and lookups. When these values look like regular variables or lose their literal types, downstream code can mutate them or accidentally rely on widened types. UPPER_SNAKE_CASE signals “static config lives here,” and `as const` preserves literal types so enums, discriminated unions, and memoized consumers stay stable.

### Examples of **incorrect** code for this rule:

```ts
// Looks like a runtime variable and can be widened
const apiEndpoint = 'https://api.bluemint.com/v1';

// Literal object is mutable without `as const`
const COLORS = { primary: '#000', secondary: '#fff' };

// Array literal loses its literal element types without `as const`
const buttonSizes = ['small', 'medium', 'large'];
```

### Examples of **correct** code for this rule:

```ts
const API_ENDPOINT = 'https://api.bluemint.com/v1' as const;
const MAX_RETRIES = 3 as const;
const COLORS = { primary: '#000', secondary: '#fff' } as const;
const BUTTON_SIZES = ['small', 'medium', 'large'] as const;

// Inside functions (not affected by this rule)
function example() {
  const apiEndpoint = 'https://api.bluemint.com/v1';
  const maxRetries = 3;
}

// Dynamic or computed values (not affected by this rule)
const API_VERSION = getApiVersion();
const DEFAULT_TIMEOUT = 1000 * 60;

// Destructuring (not affected by this rule)
const { apiUrl, maxRetries } = config;

// React components and hooks at module scope (not affected), in either
// function spelling and however their type is pinned
const MyComponent = () => null;
const Row = function (props) {
  return null;
};
const memoized = memo(MyComponent);
const MemoizedRow = memo(Row) satisfies ComponentType;

// Next.js reserved export names (not renamed — the literal export name is a
// framework contract; renaming `config` would silently break the API route)
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } } as const;
```

### Function values and React components

Neither half of the rule applies to a `const` whose initializer is a function
value or a React component factory call:

```ts
// Function values — arrow and function-expression spellings alike.
const MyComponent = () => null;
const Row = function (props) {
  return null;
};
const useThing = function () {
  return useState(0);
};

// `memo` / `forwardRef`, called bare or through a namespace import.
const MemoizedRow = memo(Row);
const ForwardedRow = React.forwardRef(RowRefless);
```

The initializer is classified through any type wrapper, so the exemption holds
however the author pins the type — `as T`, `<T>`, `satisfies T` and `!` all wrap
the same value:

```ts
const MemoizedRow = memo(Row) as FC;
const MemoizedCell = memo(Cell) satisfies ComponentType;
const MemoizedGrid = React.memo(Grid)!;
```

Renaming a component to `SCREAMING_SNAKE` fights the React naming convention and
also hides the declaration from every component-keyed sibling rule, each of which
recognizes a component by its PascalCase binding.

A third shape withholds the `SCREAMING_SNAKE` rename, and unlike the two above it
is a **name-shape heuristic** rather than a claim about the value: a binding read
off another object keeps its name when the binding name **and** the property name
are both component-shaped, meaning each starts with a capital and carries a
lowercase letter. Nothing has to be a component and the binding need never appear
as a JSX element, so a coincidentally PascalCase constant is exempt too:

```ts
// Exempt — `StatusCode` and the property read are both component-shaped.
const StatusCode = Constants.StatusCode;

// Reported — the property is camelCase, so the heuristic does not apply.
const StatusCode = Constants.statusCode;
```

The two differ only in the case of the property being read. The heuristic is
deliberately coarse because the alternative is resolving what the property holds
across files, which a single-file rule cannot do; the cost is that it exempts
some constants that are not components.

A wrapper is looked through, never treated as a carve-out of its own, so a data
constant keeps exactly the reports it carries without one:

```ts
// Still renamed to CONFIG / RETRY_DELAYS.
const config = { a: 1 } satisfies Config;
const retryDelays = [1, 2, 3] satisfies number[];
```

### Initializers that already carry a type wrapper

An initializer wrapped in a non-`const` assertion, a `satisfies` clause, or a
non-null assertion is exempt from the `as const` requirement:

```ts
// Not flagged — the author has already pinned the type.
const CONFIG = { a: 1 } as Foo;
const PHONE_PROVIDER = { providerId: 'phone' } as unknown as UserProviderInfo;
const THEME = <Theme>{ primary: '#000' };
const LIMITS = { max: 10 } satisfies Limits;
```

TypeScript permits a `const` assertion only on a literal, so appending one after
such a wrapper is a compile error (TS1355: *A 'const' assertion can only be
applied to references to enum members, or string, number, boolean, array, or
object literals*). The wrapper is also the author pinning the type deliberately —
the same intent as the explicit `id` annotation the rule already skips.

To get both an exact literal type and a widening cast, put the `const`
assertion on the literal itself, where it is legal:

```ts
const PHONE_PROVIDER = {
  providerId: 'phone',
} as const as unknown as UserProviderInfo;
```

The `UPPER_SNAKE_CASE` half of the rule is unaffected and still applies to these
declarations.

### Constants that are mutated later

`as const` does more than pin literal types — it makes the value deeply
`readonly`. A constant that is written through after its declaration therefore
cannot carry the assertion at all, so the `as const` half of the rule stays
silent for it:

```ts
// Renamed to ITEMS, but never frozen: `ITEMS.push(1)` on a `readonly []` is
// TS2339 (Property 'push' does not exist on type 'readonly []').
const items = [];
items.push(1);

// Renamed to CONFIG, but never frozen: TS2540 (Cannot assign to 'a' because it
// is a read-only property).
const config = { a: 1 };
config.a = 2;
```

A write is an assignment to a member or element of the binding (`X.a = …`,
`X[0] = …`, `X.count += 1`, `X.count++`), a `delete` of one of its properties,
or a call to a method that mutates its receiver — `push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`. The whole access
path counts, because the assertion is deep: `X.items.push(1)` breaks just as
`X.push(1)` does.

A write through an **alias** counts as well. `const OTHER = ITEMS;` gives one
array two names, so `OTHER.push(3)` writes `ITEMS` and freezing `ITEMS` breaks
that call. Aliases are followed for as many hops as they are chained
(`const A = ITEMS; const B = A; B.push(3)`), in whatever scope they are
declared, and whatever keyword declares them — a `let` alias takes its type from
the same initializer, so it inherits the `readonly` type exactly as a `const`
one does. **Reassigning** an alias counts too, not only writing through one:
that alias took its type from the constant, so `let stage = DEFAULT_STAGE;`
followed by `stage = 'live';` is TS2322 once `DEFAULT_STAGE` is frozen to
`'ready'`. Storing the constant in an object or array literal is followed on the
same terms, because storing does not copy: `const HOLDER = { items: ITEMS };`
keeps the one array reachable, so `HOLDER.items.push(3)` writes `ITEMS` and the
assertion is withheld. Containers nest, and the shorthand spelling
(`{ ITEMS }`) counts the same.

A write through a binding the constant is **iterated** into counts on the same
reasoning. A `for…of` head and an iteration callback's parameter are second
names for the constant's *contents*, and the assertion is deep, so the element
carries the frozen type:

```ts
// Not frozen: `item.label = 'b'` writes a member of an element of ITEMS, which
// is TS2540 (Cannot assign to 'label' because it is a read-only property).
const ITEMS = [{ label: 'a' }];
for (const item of ITEMS) {
  item.label = 'b';
}

// Not frozen: the callback parameter carries the same element type, so
// `row.tags.push('y')` is TS2339 on a `readonly ['x']`.
const ROWS = [{ tags: ['x'] }];
ROWS.forEach((row) => {
  row.tags.push('y');
});
```

The head is followed in all three binding spellings, so
`for (const [head, ...rest] of PAIRS)` and `for (const { meta } of ROWS)` count
as the plain one does; `for await` binds its element the same way and counts
too; and the iterated expression may be a property of the constant
(`for (const item of CONFIG.list)`), which is frozen with the object that holds
it. The callback methods read this way are `forEach`, `map`, `filter`, `find`,
`findIndex`, `findLast`, `findLastIndex`, `some`, `every`, `flatMap`, `reduce`
and `reduceRight`. For `reduce` and `reduceRight` the element is the **second**
parameter; the accumulator is typed from the seed value rather than from the
constant, so writing to it is not a write to the constant.

The receiver may be one step removed from the constant, because a copy or a
projection of it still yields the frozen elements — `[...ITEMS].forEach(…)`,
`ITEMS.filter(Boolean).forEach(…)`, `for (const item of ITEMS.slice())` and
`Object.values(CONFIG).forEach(…)` all count, as does `Object.entries`.
`Object.keys` does not: its result is `string[]` whatever the argument's type,
so nothing the assertion changes reaches a binding taken from it.

Iteration that only **reads** the element leaves the assertion in place. The
withhold keys on the write, not on the iteration:

```ts
// Still flagged for `as const` — nothing writes through the element.
const ITEMS = [{ n: 1 }];
export const NS = ITEMS.map((item) => item.n);
```

Two spellings introduce no binding typed from the constant, so they stay frozen
as well: a `for…of` head that is not a declaration (`for (current of ITEMS)`)
assigns into a binding declared elsewhere, and a callback passed by name
(`ITEMS.forEach(mutate)`) declares its parameter elsewhere, each carrying
whatever type that declaration gives it.

A binding built *from* the constant rather than naming or holding it
(`const COPY = [...ITEMS]`) is a fresh value: mutating the copy leaves the
constant frozen. Being held somewhere is not itself a mutation either, so a
constant merely stored in a container and never written through stays frozen.

The binding's writes are found through the scope manager, so only references
that resolve to this declaration, or to an alias of it, count. A same-named
method on another receiver (`other.push(1)`), the constant passed as an argument
to one (`other.push(X)`), a read-only method (`X.map(…)`, `X.includes(…)`) and a
same-named binding shadowed in an inner scope all leave the assertion in place:

```ts
// Still flagged for `as const` — nothing writes through ITEMS.
const ITEMS = [1];
other.push(ITEMS);
export const doubled = () => ITEMS.map((x) => x * 2);
```

The `UPPER_SNAKE_CASE` half of the rule is a separate concern and still applies:
a mutated constant is renamed, just not frozen. To get the assertion as well,
build the value without mutating it — `map` derives an array whose element type
is whatever the callback returns, so the constant's frozen type does not reach
it and the result can be mutated freely. A spread, `filter`, `slice`, `concat`
or `Object.assign` copy is different: see [Copies carry the frozen
type](#copies-carry-the-frozen-type).

### Constants a declaration's type is inferred from

`as const` also makes the literal type **non-widening**. Wherever TypeScript
infers a type from the constant, an inference that used to widen `'ready'` to
`string` keeps the literal instead — which rewrites a declaration the assertion
was never asked to touch. So a constant used as the default value of a
parameter with **no type annotation** keeps the `as const` half of the rule
silent:

```ts
// Not frozen: `as const` would pin both parameters to one literal each, and
// `buildRequest(REFEREE_ID, REFEREE_ID)` becomes TS2345.
const REFEREE_ID = 'referee-uid';
const REFERRER_ID = 'referrer-uid';
const buildRequest = (uid = REFEREE_ID, referrerId = REFERRER_ID) => {
  return { uid, referrerId };
};
```

An **annotated** parameter declares its own type, so nothing infers from the
default and the assertion cannot narrow anything. Both spellings of the
annotation are recognized — on the binding, and on the pattern a destructured
parameter carries it on:

```ts
// Both still flagged for `as const` — the parameter types are declared.
const DEFAULT_MODEL = 'gpt-4';
export const prompt = (model: ModelName = DEFAULT_MODEL) => model;

const DISTANCE_DEFAULT = 8;
export const reveal = ({ distance = DISTANCE_DEFAULT }: Props) => distance;
```

A destructuring **declaration** default (`const { name = FALLBACK } = source;`)
is the same syntax but declares no signature, so it is not an inference site and
the constant is still frozen.

A **class property** takes its type from its initializer in exactly the same
way, and is answered on exactly the same terms:

```ts
// Not frozen: `as const` would pin `stage` to `'ready'`, so a later
// `session.stage = 'live'` becomes TS2322.
const DEFAULT_STAGE = 'ready';
export class Session {
  public stage = DEFAULT_STAGE;
}
```

```ts
// Still flagged for `as const` — the property's type is declared, so nothing
// infers from the initializer.
const DEFAULT_STAGE = 'ready';
export class AnnotatedSession {
  public stage: string = DEFAULT_STAGE;
}
```

A **constructor parameter property** declares a class property and a parameter
at once, so it infers twice over and is answered the same way:

```ts
// Not frozen: `stage` would be pinned to `'ready'` on every instance.
const DEFAULT_STAGE = 'ready';
export class Session {
  constructor(public stage = DEFAULT_STAGE) {}
}
```

### Copies carry the frozen type

A spread builds a fresh **value** but not a fresh **type**. `[...ITEMS]` of a
frozen `readonly [1, 2]` is `(1 | 2)[]` — mutable, but no longer able to hold
anything else — so writing to the copy stops compiling for an input that
compiled. The assertion is withheld when a copy of the constant is written to:

```ts
// Not frozen: `COPY.push(3)` would be TS2345 once ITEMS is `readonly [1, 2]`.
const ITEMS = [1, 2];
const COPY = [...ITEMS];
COPY.push(3);
```

The same applies to `Array.from(ITEMS)`, `structuredClone(CONFIG)`,
`Object.assign({}, CONFIG)` and the copying array methods `concat`, `slice`,
`filter`, `flat`, `toSorted`, `toReversed`, `toSpliced` and `with`. A copy
destructured into bindings carries the type into each of them and counts the
same, in both spellings — `const { items } = { ...CONFIG };` and
`const [, ...rest] = [...ITEMS];`.

A **rest element** is a fresh array typed from whatever it destructures, so it
is followed even when no copy feeds it:

```ts
// Not frozen: `rest` becomes `(1 | 2)[]`, so `rest.push(3)` would be TS2345.
const ITEMS = [1, 2];
const [head, ...rest] = ITEMS;
rest.push(3);
```

Two shapes are excluded because nothing of the constant's type survives into
their result: `map`, which is typed from its callback, and `Array.from(X, fn)`,
which takes the same kind of mapper. Admitting either would withhold the
assertion from every array anything is computed from.

A copy that is **iterated in place** rather than bound to a name carries the
type into the element the iteration binds — `[...ITEMS].forEach(…)` and
`for (const item of ITEMS.slice())` are withheld on a write through that
element, exactly as a bound copy is. See [Constants that are mutated
later](#constants-that-are-mutated-later).

A copy that is only **read** cannot break, so the constant is still frozen. The
withhold keys on the write, not on the copy:

```ts
// Still flagged for `as const` — nothing writes to the copy.
const ITEMS = [1, 2];
export const run = () => {
  const copy = [...ITEMS];
  return copy.length;
};
```

### Inference sites that are not carved out

Two further sites narrow in the same way but are **not** withheld, because
declining at either costs far more reports than the breaks it prevents. Add an
explicit type annotation, or an `eslint-disable-next-line`, where `--fix`
narrows one of these.

**A return position.** A function with no return-type annotation takes its
return type from what it returns, so freezing a returned constant narrows the
return type for every caller:

```ts
// Frozen, and `read()` narrows from `string` to `'ready'`.
const DEFAULT_STAGE = 'ready';
export const read = () => DEFAULT_STAGE;
```

Declining here was measured at 59 of 778 consumer reports (7.6%) — the constant
need only be *held* in a literal that is returned — against zero breaks in that
consumer. Annotate the return type (`(): string => DEFAULT_STAGE`) to opt out.

**A generic type argument.** `useState(DEFAULT_STAGE)` infers `T` from the
constant, so `setStage('live')` becomes TS2345 once it is frozen. A call
argument is the only syntactic evidence of this, and withholding on it costs 364
of the same 778 consumer reports (47%) — the reason the `typeof` query is not
carved out either. Pass the type argument explicitly (`useState<string>(DEFAULT_STAGE)`) to
opt out.

**A copy that is never bound.** `[...ITEMS].push(3)` breaks once `ITEMS` is
frozen, but the break comes from the ARGUMENT's type rather than from the
mutation, and the two cannot be told apart syntactically. Withholding on "a
mutating method called on an unbound copy" would silence `ITEMS.slice().sort()`,
which compiles perfectly well frozen. Bind the copy to a variable to get the
carve-out.

### A note on precision

The copy walk asks only whether the copy is written, not whether the write could
actually fail. A mutation that inserts no element — `copy.sort()`,
`copy.reverse()`, `copy.pop()` — is safe on a frozen constant's copy, but still
withholds the assertion. This is deliberate: it errs toward reporting less
rather than toward an autofix that breaks a build. Derive the value with `map`
if you want both the assertion and a freely mutable result.

### Next.js reserved exports

Next.js recognizes certain exports by their literal identifier (`config`,
`getServerSideProps`, `getStaticProps`, `getStaticPaths`, `getInitialProps`,
`middleware`). Renaming these to `UPPER_SNAKE_CASE` silently breaks the
framework, so **exported** declarations using these reserved names are not
flagged for renaming. Only the rename is suppressed — `as const` is still
enforced because it never changes the export name. A local (unexported)
constant sharing one of these names is still renamed, since renaming a value
that Next.js never reads is safe.

### Jest mock handles

Jest mock handles created with a `jest.Mock*` cast are exempt from the
`UPPER_SNAKE_CASE` requirement:

```ts
// Not flagged — a mutable test double, not immutable config.
const mockedFetch = fetchData as jest.MockedFunction<typeof fetchData>;
mockedFetch.mockResolvedValue('ok');
```

The exemption covers `jest.Mock`, `jest.MockedFunction`, `jest.Mocked`, and
`jest.MockedClass` casts, wherever the cast sits in a wrapper chain
(`(fetchData as jest.Mock)!`). These handles are reassigned through
`.mockImplementation()`, `.mockReturnValue()`, etc. — they are not immutable
module configuration, and the `mockedX` camelCase spelling is the established
idiom, so renaming them to `UPPER_SNAKE_CASE` would fight the convention.

### Aliases of another binding

A `const` whose initializer is a bare identifier aliases an existing binding
rather than declaring a configuration value, so neither half of the rule
applies:

```ts
// Not flagged — a re-export that preserves a callable's name.
import { toKvStamp } from './stampedKvValue';
export const toUsernameSlugStamp = toKvStamp;

// Not flagged — component/hook aliases, and aliases carrying a cast.
export const BalanceGuardProvider = BalanceGuardProviderInternal;
const mockDb = db as unknown as { collection: jest.Mock };
```

An alias inherits whatever convention its target follows, and the dominant case
— aliasing a function, component, or hook — is camelCase everywhere else in the
codebase. Renaming one is also destructive: the point of such a re-export is
preserving a name importers depend on, and a single-file fixer cannot rewrite
them (the rename would produce TS2724 in every importer).

The exemption is deliberately blanket — the rule does not resolve what the
identifier points at, so `const alias = MAX_RETRIES;` is exempt too. Aliasing is
not declaring a configuration constant, and a missed rename is preferable to a
build-breaking one.

Two narrow shapes stay in scope:

- `undefined`, `NaN` and `Infinity` parse as identifiers but denote primitive
  values, not a binding being aliased, so `const someDefault = undefined;` is
  still renamed to `SOME_DEFAULT`.
- A member expression reads a property off something rather than aliasing a
  binding, so `const themeColor = Theme.color;` is unaffected by this exemption.

### Reference-safe autofix

The rename fix rewrites the declaration **and every in-file reference** in a
single pass, so `--fix` never orphans a use site on a now-undefined name.
Shorthand object properties are expanded so only the value is renamed:

```ts
// Before                             // After --fix
const fooBar = 42 as const;           const FOO_BAR = 42 as const;
const OBJ = { fooBar } as const;      const OBJ = { fooBar: FOO_BAR } as const;
```

The suggested name splits the identifier on case **boundaries**, so an acronym
run stays one word and the conversion is idempotent — re-running `--fix` over an
already-renamed constant never adds another separator:

```ts
// Before                             // After --fix
const HTTPServer = 8080 as const;     const HTTP_SERVER = 8080 as const;
const parseHTMLString = '' as const;  const PARSE_HTML_STRING = '' as const;
const userID = 1 as const;            const USER_ID = 1 as const;
```

When a safe rename cannot be guaranteed, the violation is still reported but the
fix is withheld (report-only) rather than risk changing behavior. That happens
when the new name would collide with or shadow an existing binding, when the
suggested name is not itself a valid `UPPER_SNAKE_CASE` identifier, or when the
symbol crosses a file boundary — **any** exported declaration, whether an inline
`export const` or a re-export such as `export { fooBar }` — where a single-file
fixer cannot reach the importers.

### Names the suggestion cannot be derived from

The leading underscore is dropped so the suggested name passes the rule's own
`UPPER_SNAKE_CASE` test, but for two shapes dropping it leaves something that is
not an identifier at all: a name built only from underscores derives the empty
string, and an underscore in front of a digit derives a name that starts with
that digit. Renaming to either emits code that does not parse — and because the
fix rewrites every reference, each use site is corrupted along with the
declaration. The fix is therefore declined and the report stands unfixed:

```ts
// Reported, never autofixed — pick a name by hand.
const _ = { a: 1 } as const;
const __ = { a: 1 } as const;
const _1 = { a: 1 } as const;
const _2fa = { a: 1 } as const;
const _9lives = { a: 1 } as const;
```

The same test covers a derivation that stays a legal identifier yet is still not
`UPPER_SNAKE_CASE` (`_$` derives `$`), where renaming would only relocate the
identical report onto a name the rule can never accept. Only the rename is
withheld — `as const` is still enforced and still autofixed on these
declarations, because it derives nothing from the name.

An underscore in front of a *letter* derives a usable name, so those constants
are renamed as usual:

```ts
// Before                             // After --fix
const _privateThing = 1 as const;     const PRIVATE_THING = 1 as const;
const _APIKey = 1 as const;           const API_KEY = 1 as const;
const _a1 = 1 as const;               const A1 = 1 as const;
```

An exported name is a contract spelled out in other files, so the rename is
withheld regardless of whether the declaring file also uses the name: a
constants module with no local use sites is the most exposed shape, not the
safest one. The `as const` fix still lands on exported declarations, because it
never touches the export name.

```ts
// Before                                // After --fix
export const retryConfig = { a: 3 };     export const retryConfig = { a: 3 } as const;
const retryConfig = { a: 3 };            const RETRY_CONFIG = { a: 3 } as const;
```

Rename an exported constant by hand, together with its importers (an editor's
rename-symbol refactor covers the whole project).

## When Not To Use It

You might want to disable this rule if:

1. Use a different naming convention for module-level constants.
1. Prefer explicit type annotations over `as const` for literals.
1. Avoid this rule if you rarely keep literal values at module scope and do not need the visual distinction.

## Further Reading

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [Naming conventions in JavaScript](https://github.com/airbnb/javascript#naming-conventions)
