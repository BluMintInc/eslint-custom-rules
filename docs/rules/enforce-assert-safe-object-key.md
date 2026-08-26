# Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion (`@blumintinc/blumint/enforce-assert-safe-object-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of `assertSafe(id)` when accessing object properties with computed keys that involve string interpolation or explicit string conversion.

## Rule Details

Dynamic keys that come from variables, string conversions, or template literals can point to unintended properties (including `__proto__` and other prototype fields) and make lookups brittle or unsafe. `assertSafe()` validates the key before it is used so property access stays within the allowed surface area.

Use `assertSafe()` whenever you index objects with a non-literal key. The rule auto-fixes by wrapping the key and inserting the import if needed. The inserted import specifier is computed relative to the file being fixed (for example `../util/assertSafe`), so it resolves regardless of how deeply the file is nested — a bare specifier such as `functions/src/util/assertSafe` would not resolve inside a project whose `baseUrl` is `functions/`.

### Examples

#### ❌ Incorrect

```js
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

console.log(obj[String(id)]);
console.log(obj[`${id}`]);
console.log(obj[id]);
console.log(obj[id as string]); // an assertion erases; the lookup is unchanged
```

#### ✅ Correct

```js
import { assertSafe } from '../util/assertSafe';

const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

console.log(obj[assertSafe(String(id))]);
console.log(obj[assertSafe(`${id}`)]);
console.log(obj[assertSafe(id)]);
console.log(obj[assertSafe(`${id}_suffix`)]);
console.log(obj[assertSafe(id as string)]);
const hasKey = assertSafe(String(id)) in obj;
```

### A coercion is wrapped, not replaced

`assertSafe()` **validates** a key; it never coerces one. It throws on any
argument whose `typeof` is neither `string` nor `number`, so a `String(...)`
call or a template the author wrote is part of the key rather than scaffolding
around it. The fix wraps the key exactly as written:

```ts
// obj[String(id)] and obj[`${id}`] are rewritten to these
console.log(obj[assertSafe(String(id))]);
console.log(obj[assertSafe(`${id}`)]);
```

Emitting `assertSafe(id)` instead would hand `assertSafe` the raw operand and
change what the key evaluates to. Where the operand is a boolean — the shape a
`` Record<`${boolean}`, string> `` lookup is written in — that turns working
code into code that throws `Invalid Key Type` on its first call. A lone
substitution is treated exactly like every other template for the same reason:
`` `${a}${b}` `` has always been wrapped whole.

Caching the validated value in a variable is also accepted — the rule recognises
identifiers that are initialised directly from `assertSafe(...)` and does not
require a second wrapping:

```js
import { assertSafe } from '../util/assertSafe';

// safeKey holds an already-validated key; obj[safeKey] is fine.
const safeKey = assertSafe(rawKey);
const a = objA[safeKey];
const b = objB[safeKey];
const c = objC[safeKey];
```

### Parentheses the wrap makes redundant

Every position that yields an access span takes a call bare — between the
brackets of a lookup, and as the left operand of `in` — so grouping parentheses
the source wrote around the key have nothing left to group once it is wrapped.
The fix drops them along with the wrap, rather than emit a pair a formatter
deletes on its next run:

```ts
// obj[(id)] is rewritten to this, not to obj[(assertSafe(id))]
console.log(obj[assertSafe(id)]);
```

Nested pairs go together (`obj[((id))]`), and a pair is kept wherever it is
doing something other than grouping: where dropping it would fuse the key onto
the token before it, and where a comment sits between the parenthesis and the
key — `obj[(/* keep */ assertSafe(id))]` — since dropping the pair there would
move the comment out of the group its author wrote it inside.

### Numeric keys and array-like objects are exempt

`assertSafe()` exists to reject dangerous **property names** — `__proto__`,
`constructor`, `prototype`. None of those is ever the string form of a number,
so prototype pollution is unreachable through a numeric index: validating one
guards nothing, while costing a coercion on every element of a hot loop (and,
in a module with no other imports, an inserted `import` statement that breaks
sources evaluated as raw text).

The rule therefore skips a computed access when either half of it rules out a
property name:

- **The object reads as a sequence.** A name matching `array`, `arr`, `items`,
  `elements`, `list`, `collection` or `data` (singular or plural) is treated as
  a collection indexed by position. A collection reached as a field is judged by
  the field name, so `raster.data[i]`, `this.items[i]`, `this.#items[i]` and
  `state.buffer.list[i]` all qualify. A computed object (`grid[0][key]`)
  contributes no name.
- **The key is statically a number.** The key expression itself proves it —
  numeric literals, `i++`, `-x`, `~x`, arithmetic and bitwise operators
  (`-`, `*`, `/`, `%`, `**`, `<<`, `>>`, `>>>`, `&`, `|`, `^`), `Number(...)`,
  `parseInt(...)`, `parseFloat(...)`, any `Math.*` call, `.length`, and `+` when
  **both** sides are themselves numeric. An identifier qualifies when the
  binding it resolves to proves it: a `: number` parameter, a variable whose
  every write keeps it numeric, or a binding **declared** numeric (below). A
  call and a member read qualify when the declaration they resolve to is
  declared numeric (below) as well.
- **A template's fixed text rules the names out.** `` obj[`user-${id}`] `` is
  exempt because no substitution can make a key beginning `user-` be
  `__proto__`, `constructor` or `prototype`. The fixed text has to *earn* that,
  though — it is checked, not assumed. `` obj[`__pro${x}`] `` carries fixed text
  too and is still reported, because `x` = `"to__"` spells `__proto__` and
  resolves to `Object.prototype`. A template is judged reaching when a dangerous
  name starts with its first quasi, ends with its last, and contains the
  interior quasis in order. A template whose every substitution is provably
  numeric is exempt for the same reason a numeric key is.

```js
// ✅ Exempt: the fixed text cannot spell a dangerous name.
obj[`user-${id}`];
obj[`${id}_suffix`];
obj[`prototype_owner_${id}`]; // longer than the name it starts with
obj[`__pro${index}`]; // index is a number

// ❌ Still reported: the template can still spell one.
obj[`__pro${x}`]; // x = 'to__'
obj[`${x}proto__`]; // x = '__'
obj[`__${x}__`]; // x = 'proto'
obj[`cons${x}`]; // x = 'tructor'
```

```js
// ✅ Exempt: the key cannot name a property.
const sampleRaster = (raster, index) => raster.data[index];

const sum = (values) => {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return total;
};

const blend = (pixels, width, height) => {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] *= 2;
    }
  }
};

const sample = (palette, t) => palette[Math.floor(t * 255)];
const at = (buffer, index: number) => buffer[index];
```

The analysis is syntactic and proof-based: a key it cannot prove numeric is
still reported, so nothing is exempted on a guess.

```js
// ❌ Still reported: none of these keys is proven to be a number.
let k;
obj[k]; // holds undefined, never written

let n = 0;
n = userInput; // a write that does not keep it numeric
obj[n];

obj[a + b]; // `+` over unknown operands may concatenate strings
obj[String(index)]; // an explicit string conversion is a string
```

#### The declaration site is a numeric proof

A value produced by a call has no numeric shape to read, so the only thing that
can prove it is the type its declaration gives it. TypeScript rejects a
non-numeric value under any spelling of that declaration, which makes every one
of them a syntactic proof — the same trust a `(index: number)` parameter earns.
Which site the author wrote the annotation on does not change the verdict:

- **`: number` on the binding name** — `const rank: number = rankOf(id)`,
  `let cursor: number = seek()`, `(index: number = compute()) => …`.
- **`number` asserted on the initializing value** — `const rank = rankOf(id) as
  number`, `rankOf(id) satisfies number`, `<number>rankOf(id)`.
- **`: number` as a function's return type** — `function rankOf(id): number`,
  `const rankOf = (id): number => …`, `private rankOf(id): number`,
  `#rankOf(id): number`, `declare function rankOf(id): number`, and the getter
  spellings `get rank(): number` and `get #rank(): number`. A call to one is
  numeric wherever it appears, key position included.
- **`: number` on a class property** — `private readonly rank: number = 1`,
  `readonly #rank: number = 1`, `static rank: number = 1`,
  `abstract rank: number`, and the constructor parameter property
  `constructor(private readonly rank: number) {}`. A read of one is numeric.

```js
// ✅ Exempt: the declaration is what proves the key numeric.
const rank: number = this.rankOfRecipient(toId);
placements[rank];

const index = raw.offset as number;
buffer[index];

class Reader {
  private readonly rank: number = 1;
  constructor(private readonly mapping) {}
  private rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    const rank = this.rankOf(seed); // the return type proves it
    return [this.mapping[rank], this.mapping[this.rankOf(seed)], this.mapping[this.rank]];
  }
}

class PrivateReader {
  readonly #rank: number = 1;
  constructor(private readonly mapping) {}
  #rankOf(seed): number {
    return seed + 1;
  }
  read(seed) {
    // The ECMA spelling of privacy carries the same annotation, and the author
    // cannot add `private` to opt in: `private #rankOf` is TS18010.
    return [this.mapping[this.#rankOf(seed)], this.mapping[this.#rank]];
  }
}
```

A call and a member read are credited only against the declaration they actually
resolve to. The callee resolves through the scope chain, so a local that shadows
a numeric helper is judged by the shadowing declaration alone, and a binding
reassigned to another function has to prove every write. A member resolves
against the class it is written in: `this` inside an instance member reaches the
instance half, `this` inside a `static` member and a bare `ClassName.` reach the
static half, and a `this` a non-arrow callback rebinds reaches neither. A
same-named member of another class, of the other half of this one, or of an
object literal is never read.

An ECMA private name is a member of its own. `#rank` and a public `rank` can be
declared side by side in one class and name two different values, so each is
credited only with its own declaration: `this.#rank` never reads the public
annotation, and `this.rank` never reads the private one. The two privacy
spellings are otherwise equal — TypeScript forbids writing both at once
(`private #rank` is TS18010), so the proof is the written annotation and the
declaration the reference resolves to, never which spelling of privacy the
author chose.

The proof is exact and it is local:

- Only the `number` keyword counts, at every site. `as any`, `as unknown`,
  `as string`, `as const`, a generic such as `Wrapped<number>` or
  `Promise<number>`, and a union such as `number | string` all leave the key
  reported, because none of them rules out a property name.
- Only a **written** annotation counts. An unannotated method whose body happens
  to return a number is still reported: reading that would take the type checker
  this rule deliberately does without.
- An assertion that reaches `number` **through `any` or `unknown`** proves
  nothing either. `raw as number` is worth trusting only because TypeScript
  rejects it unless `raw` could be a number; a step through `any` or `unknown`
  removes exactly that check, which is what makes `raw as unknown as number` the
  idiom for asserting anything at all. It compiles for a `raw` holding
  `'__proto__'`, so `buffer[index]` stays reported.
  That refusal is about an assertion standing **in place of** a declaration. An
  annotation is credited on the strength of the annotation itself, so a
  laundering assertion inside an annotated body leaves the return type standing,
  exactly as `const rank: number = raw as unknown as number` leaves the binding
  annotation standing.
- The proof covers the **initializer** only. A later assignment is a separate
  statement — and it is where a value out of a `catch` binding or an `any`-typed
  source enters the binding — so every other write still has to prove itself.
- A destructuring pattern takes its initializer apart before binding, so neither
  an annotation on the pattern nor an assertion over the whole initializer says
  anything about the element bound out of it.

```js
// ❌ Still reported: the declaration proves none of these keys numeric.
const index = compute() as string; // an assertion naming another type
obj[index];

let cursor: number = compute();
cursor = userInput; // a write the annotation's proof does not reach
obj[cursor];

const { offset }: { offset: number } = source; // the pattern carries the type
obj[offset];

class Reader {
  static rank: number = 1;
  constructor(private readonly mapping) {}
  private rankOf(seed) {
    return seed + 1; // inferred, not written
  }
  read(seed) {
    return [
      this.mapping[this.rankOf(seed)], // no return type to read
      this.mapping[this.rank], // `static`, so `this` does not reach it
    ];
  }
}
```

### Compiler-bounded Record lookups are exempt

A lookup whose key the compiler already bounds needs no runtime validation: when
the object is a binding annotated `Record<K, V>` and the key is a binding whose
declared type `K` covers, TypeScript rejects any key value outside the record's
declared keys, so the prototype surface is unreachable without the code failing
to compile. Wrapping such a key in `assertSafe()` validates nothing the compiler
has not already checked — and it is **not** semantics-preserving for the values
that DO slip past a declared type at runtime (data crossing a persistence or
version boundary, where a record minted before a field existed reaches a bundle
that requires it). The plain lookup degrades to `undefined` on such a value;
the wrapped one **throws**. That difference is how the composed autofix of
`prefer-map-over-conditional-dispatch` and this rule once converted a total
render fallback into a render-time crash, which is exactly the rewrite this
carve-out declines to demand.

```ts
// ✅ Exempt: the key's declared type is the record's declared key set.
type Kind = 'live' | 'simulated';
const RESULT_BY_KIND: Record<Kind, string | undefined> = {
  simulated: 'watermark',
  live: undefined,
};
const layer = (kind: Kind) => RESULT_BY_KIND[kind];
```

The proof is syntactic, read from the two bindings' annotations, and two
spellings carry it:

- **The same type reference on both sides** — `kind: Kind` indexing
  `Record<Kind, V>`. Name identity makes the two domains equal whatever the
  alias holds, an imported alias included, so resolution is consulted only to
  refuse an alias that resolves to an open domain (`type K = string` re-opens
  the surface this rule guards) or to a literal union that itself names
  `__proto__`, `constructor` or `prototype`.
- **Literal unions the syntax can compare** — `kind: 'live' | 'simulated'`
  indexing `Record<'live' | 'simulated', V>`, a narrowing of it
  (`kind: 'simulated'`), or a numeric union (`slot: 1 | 2`). Every literal the
  key admits must be a declared record key.

Either side may spell its type through an in-file alias, a string `enum`, or a
`(typeof KINDS)[number]` union derived from an **`as const`** values array —
the derived spelling `prefer-union-from-const-array` rewrites literal-union
aliases into, whose members are read off the array's own literal elements. The
record annotation is read through `Readonly<...>`, `Partial<...>`, a bare
in-file alias (`type Lookup = Record<K, V>`), and a `| undefined` union member
(the natural annotation for a receiver reached via `?.` — a nullish receiver
short-circuits, it never indexes anything else).

The carve-out is deliberately conservative — **both** bindings must be
annotated, and the coverage must be provable from syntax:

```ts
// ❌ Still reported: nothing bounds the key, or nothing closed covers it.
const R: Record<'live' | 'simulated', number> = { live: 1, simulated: 2 };
const a = (kind) => R[kind]; // unannotated key — an `any` key indexes anything
const b = (kind: string) => R[kind]; // open key type admits '__proto__'
const c = (kind: 'live' | 'replay') => R[kind]; // 'replay' is not a declared key

const m: Record<string, number> = {};
const d = (kind: 'live' | 'simulated') => m[kind]; // record declares no closed key set

type Open = string;
const e = (k: Open, r: Record<Open, number>) => r[k]; // shared alias, but open

const f = <K extends string>(r: Record<K, number>, k: K) => r[k]; // K may instantiate at string

const KINDS = ['live', 'simulated']; // no `as const`: (typeof KINDS)[number] IS string
type Kind = (typeof KINDS)[number];
const g = (kind: Kind) => R[kind];
```

An assertion cannot launder a key into the exemption: `R[kind as Kind]` is
judged by the **binding's** annotation, exactly as the wrappers section below
describes, so an open-typed `kind` keeps its report. The documented conversion
triggers also keep reporting regardless of the bindings — `R[String(kind)]` and
``R[`${kind}`]`` are explicit conversions, which are what this rule exists to
flag.

### Assertion and await wrappers are read through

A type assertion erases at compile time and an `await` resolves to the value it
holds, so neither changes the property a computed key names. `obj[id as string]`,
`obj[id!]`, `obj[<string>id]`, `obj[id satisfies string]` and `obj[await id]`
each look up exactly what `obj[id]` looks up — `__proto__` and `constructor`
included. The rule peels those wrappers off, nested ones included
(`obj[(id as any)!]`), and judges the expression underneath, so appending
`as string` to a key is no way past the check.

The numeric carve-out is read through in the same direction, and the proof still
comes from the binding rather than from the assertion:

```js
// ✅ Exempt: the `: number` annotation on the parameter proves the offset
// numeric, and the assertion around it is simply read through.
const next = (buffer: Uint8Array, index: number) => buffer[(index as number) + 1];
```

```js
// ❌ Reported: the very same assertion over a key nothing proves numeric.
// An assertion asserts; it never proves.
buffer[(index as number) + 1];
```

The fix wraps the key **as it is written**, so the assertion the author put there
survives the rewrite:

```js
// ❌ Reported
prev[deviceId as string] = label;

// ✅ Fixed — the assertion is carried into the call, not deleted
prev[assertSafe(deviceId as string)] = label;
```

`assertSafe` is identity-typed (`assertSafe<T extends PropertyKey>(key: T): T`),
so wrapping the asserted expression preserves the key's type. Wrapping the
expression *inside* the wrapper instead would move an `await` to the wrong side
of the call: `await assertSafe(p)` validates the promise rather than the key it
resolves to.

### Optional chains are read through

`?.` guards a nullish **receiver**; this rule guards a hostile **key**, and
`"__proto__"` is a perfectly non-nullish string. `store[req.body?.key]` reaches
the prototype surface exactly as `store[req.body.key]` does, so the chain is read
through to the member access or call it holds and the key underneath is judged as
usual — a defensively chained payload read is the shape most likely to carry
untrusted input, not a reason to go quiet.

The fix wraps the **whole chain**, never the receiver inside it, so the
short-circuit is evaluated once in the position the author wrote it and its
result is what gets validated:

```js
// ❌ Reported
store[change.after?.data().userId] = entry;

// ✅ Fixed — a validation is added; no dereference is moved
store[assertSafe(change.after?.data().userId)] = entry;
```

The numeric carve-out reads through in the same direction: `xs?.length` is the
same `.length` proof `xs.length` is, and a short-circuit to `undefined`
stringifies to `"undefined"`, which names no field of the prototype surface
either.

```js
// ✅ Exempt: the chained `.length` still proves the counter numeric
let i = xs?.length;
const first = xs[i];
```

### Interaction with inline disable comments

The `import { assertSafe } from '...';` statement is added once per file,
attached to the fix of the first violation that is **not** suppressed by an
inline `eslint-disable` directive. Suppressing an individual key access
therefore never strands the remaining `assertSafe(...)` calls without their
import:

```js
const obj = { alpha: 1, beta: 2 };

// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id]; // left alone

const second = obj[id]; // fixed, and carries the import
```

### What the fix rewrites

The fix replaces the **whole access** — `obj[key]`, `[key]` of a computed
property, or the whole `key in obj` comparison — re-emitting every character of
it verbatim except the key, which gains its `assertSafe(...)` wrap. The emitted
text is the same as if only the key had been replaced, so comments and line
breaks inside the brackets survive untouched:

```js
const entry = store[
  // the caller picked this
  assertSafe(KEY) // ← only the key changed
];
```

Claiming the access rather than the key alone is what keeps the fix composable.
ESLint merges the edits of one report into a single replacement spanning from
the first to the last, and this rule's report carries the injected
`import { assertSafe } from '...';` alongside the wrap — so the edit already
reaches from the top of the file to the key. An edit that stopped at the key
stopped in the middle of the access, which is precisely the region a formatter
rewrites as a set of edits: ESLint discarded the formatter's edits inside the
span and kept the ones past its end, and the two halves did not fit together
(#2067).

One consequence is visible under `--fix`: accesses that **nest** — `store[lookup[key]]`,
`store[outer][inner]` — have overlapping spans, so ESLint applies one of them
per pass. `eslint --fix` runs passes until nothing changes, so every level is
wrapped by the time it stops.

### The wrap and the print width

Wrapping a key widens the line it sits on by the twelve characters of
`assertSafe()`, and a line the formatter would break is a line the formatter
**does** break: agora runs prettier and `eslint --fix` over the same tree, so a
wrap emitted past the 80-column print width churns the file on every pass
(#2108). Where the widened line no longer fits, the fix prints the break
prettier would print, in prettier's own shape:

- A concise arrow body that no longer fits after `=>` moves to its own line,
  one step in from the arrow's line (#2108).
- A computed lookup that no longer fits on its own line — because the break
  after `=>` is already taken — opens at its bracket with the wrapped key one
  step in; and where the call does not fit there either, the call opens at its
  parenthesis with the key one step further in and a trailing comma (#2134).

```js
// ❌ Reported — and the wrap alone would push the body to 84 columns
const read = (m: Record<string, number>) =>
  m[someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth];

// ✅ Fixed — the lookup opens at its bracket, in the shape prettier keeps
import { assertSafe } from 'functions/src/util/assertSafe';
const read = (m: Record<string, number>) =>
  m[
    assertSafe(
      someVeryLongKeyNameThatPushesThisLinePastTheEightyColumnPrintWidth,
    )
  ];
```

Each of these layouts is measured against prettier 2.8.8 at agora's options
(`printWidth: 80`, `tabWidth: 2`, `trailingComma: "all"`). Wherever the fix
cannot say what prettier would print — a comment between `=>` and the body, a
lookup the author already broke across lines, parenthesized, or commented
inside, or a key so long that even its own line overflows — it declines the
break and emits the wrap on one line. That costs a formatter pass, never
meaning: the one-line emission is what the fix produced before the width was
measured at all.

### When the fix is withheld

The fix wraps the key in a bare `assertSafe(...)` call and inserts
`import { assertSafe } from '...';`. Both halves break when the name
`assertSafe` already resolves to something else at the key access:

- A module-scope `const`/`function`/`class` named `assertSafe`, or an import of
  that name from another module, collides with the inserted import
  (TS2440 / TS2300).
- A shadowing parameter or block-scoped binding captures the emitted call with
  **no** compile error at all, so the key is validated by the shadow rather
  than by the helper.

The rule resolves `assertSafe` through the scope chain at the key access and
withholds the fix whenever the visible binding is anything other than a named
`assertSafe` specifier imported from the configured helper module (a namespace
or default import is a different value, so it counts as a collision too). The
`useAssertSafe` report still fires; only the automated edit is skipped, leaving
the clash for the author to resolve:

```js
const assertSafe = (key) => key; // a local of the same name

const obj = { alpha: 1, beta: 2 };
const value = obj[id]; // reported, but left untouched by --fix
```

A file that already imports the helper reuses that import instead of gaining a
second one, whichever spelling it uses: `../../assertSafe` and
`functions/src/util/assertSafe` resolve to one module. Because the imports are
read from the AST when the fix is built rather than from traversal order, a key
access that appears _before_ the import declaration does not add a duplicate
either.

The fix is withheld for one more reason: a key inside a `jest.mock`,
`jest.doMock` or `jest.setMock` **module factory**. Jest hoists that factory
above every import in the file, and permits it to read only globals and
bindings whose name begins with `mock` — an `assertSafe` reference there fails
the transform (`Invalid variable access: assertSafe`) and takes the whole suite
down with it. The report still fires, and two remedies the factory can hold are
available to the author:

```js
let mockChips = [];

jest.mock('./useThing', () => {
  // Legal: the helper is loaded inside the hoisted factory.
  const { assertSafe } = jest.requireActual('../../functions/src/util/assertSafe');
  return { useThing: (i) => mockChips[assertSafe(i)] };
});
```

```js
// Legal: the `mock` prefix puts the alias on Jest's allowlist.
import { assertSafe as mockAssertSafe } from '../../functions/src/util/assertSafe';

jest.mock('./useThing', () => ({
  useThing: (i) => mockChips[mockAssertSafe(i)],
}));
```

Only the factory — the registrar's second argument — declines. A key in the
module specifier position, or anywhere else in the file, is fixed as usual, and
a declining factory never claims the import: the injected
`import { assertSafe }` rides on the first violation that does fix.

### The injected import's file extension

Node's ESM resolver takes a specifier literally: an extensionless one throws
`ERR_MODULE_NOT_FOUND` before the module ever runs. The fixer therefore appends
`.js` to the specifier it inserts **only** when the file being fixed is native
ESM:

```js
// scripts/design/count-voice.mjs — native ESM
import { assertSafe } from '../../functions/src/util/assertSafe.js';

const RESULTS = {};
for (const [name, dirs] of Object.entries(SOURCES)) {
  RESULTS[assertSafe(name)] = dirs.length;
}
```

The extension is `.js` rather than `.ts` because the helper is authored as
TypeScript and runs as its compiled output; TypeScript resolves a `.js`
specifier back to the `.ts` source under `nodenext`, so the one spelling is
correct for both.

A file's module system is read the way node reads it:

- `.mjs` is native ESM; `.cjs` is CommonJS — the extension decides, whatever any
  manifest says.
- `.ts`, `.tsx`, `.mts` and `.cts` are compiled before they run, and both the
  TypeScript compiler and every bundler resolve an extensionless specifier, so
  these keep the bare form. TypeScript and bundler consumers see a
  byte-identical fix.
- `.js` defers to the **nearest** `package.json` at or above the file: the first
  manifest found decides, and one without a `type` field is CommonJS. A manifest
  that cannot be read or parsed declines the extension, emitting the bare
  specifier rather than guessing.

An existing helper import is matched with its extension stripped, so a file that
already has `import { assertSafe } from '../util/assertSafe.js';` reuses it and
never gains a second import.

## Options

- `assertSafeImportPath` (string, default: `functions/src/util/assertSafe`): the location of the `assertSafe` helper, given as a path anchored at the repo root (relative to the working directory eslint runs from). The fixer derives a specifier relative to the file being fixed from this value rather than emitting it verbatim, so the inserted import resolves from any nesting depth. Set this to your helper's repo-root-relative path when consuming the plugin outside BluMint.

## When Not To Use It

You might consider disabling this rule if:

1. You have a different validation mechanism for object keys
1. You're working in a context where all object keys are guaranteed to be safe
1. You have explicitly known safe identifiers that don't require validation

## Further Reading

- [Object Property Access Security](https://owasp.org/www-project-top-ten/2017/A1_2017-Injection)
- [JavaScript Property Access](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_Accessors)
