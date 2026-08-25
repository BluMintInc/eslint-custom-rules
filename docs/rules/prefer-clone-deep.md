# Prefer using cloneDeep over nested spread copying (`@blumintinc/blumint/prefer-clone-deep`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Prefer `cloneDeep` from `functions/src/util/cloneDeep.ts` instead of chaining nested spread operators for deep copies.

## Rule Details

Chained spreads only clone one level of an object. Every deeper property still points at the original structure, so later mutations leak back into the source state/config and invalidate assumptions about immutability. `cloneDeep(base, overrides)` deep-clones the base object first and then applies overrides in one place, keeping referential stability and preserving literal type inference.

### What the rule flags

The rule targets one specific shape: a hand-written **partial deep copy**. A
literal is reported when it spreads a base **and** contains a nested literal
whose **every** spread is a **sub-path of that same base**:

```ts
{ ...base, a: { ...base.a, x: 1 } }
```

Only `base.a` gets a copy of its own. Every other sub-object of `base` still
points at the original, so mutating the "copy" later leaks back into `base` —
the exact hazard the message describes.

Merging unrelated sources is safe and is **not** reported, because nothing is
copied twice:

```ts
// ✅ not a partial copy — `b` is not a sub-path of `a`
const merged = { ...a, nested: { ...b } };

// ✅ style objects and lookup maps that never re-copy their own base
const sx = { '& .MuiInputBase-input': { ...variantStyle } } as const;
const map = { bottomLeft: { ...OVERLAY_SX, bottom: 4 }, topRight: { ...OVERLAY_SX, top: 4 } };

// ✅ an ordinary two-source merge
const options = { operation, details: { ...baseDetails, ...banDetails } };

// ✅ defaults under caller overrides — `sx` is a NEW object built from two
// sources, so it aliases neither of them, whichever order they are spread in
const merged = { ...props, sx: { ...DEFAULT_SX, ...props?.sx } };

// ❌ a partial copy — `base.a` is copied by hand, `base.b` is not
const patched = { ...base, a: { ...base.a, x: 1 } };
```

A nested literal is judged by **all** of its sources at once: one source that is
not a sub-path of a spread base makes the literal a merge rather than a copy.
Sibling literals are judged independently, so
`{ ...a, merged: { ...DEFAULTS, ...a.merged }, pure: { ...a.pure, v: 1 } }` is
still reported for `pure`.

Re-spreading the *exact* same path (`{ ...a, x: { ...a } }`) is also left alone:
that is a redundant copy rather than a partial one, and the rule prefers false
negatives over false positives.

### Why cloneDeep instead of nested spreads

- Nested spreads leave inner references shared, so mutations to the "copy" also mutate the source.
- Deep spread chains are hard to read and easy to miss optional branches, especially with conditional spreads.
- `cloneDeep` applies overrides in one call, which keeps TypeScript literal types and avoids brittle spread ordering.

### How to fix violations

1. Identify the base object being spread (the first `...base` entry).
1. Call `cloneDeep(baseObject, { /* overrides */ } as const)` instead of chaining nested spreads.
1. Move only the overridden leaves into the overrides object; the rest is cloned by `cloneDeep`.

### Autofix behavior

The hazard is always **reported**. The fix — rewriting the literal into
`cloneDeep(base, { ...overrides } as const)` — is emitted **only when the file
already imports `cloneDeep` under that name** from the helper module, by any
specifier that names it (`functions/src/util/cloneDeep`, `../util/cloneDeep`,
`./cloneDeep`, …), as either a named or a default import. That import is the
proof that the call the fix writes resolves.

The call is emitted in whichever of prettier's three layouts for a call with a
trailing object argument prettier would print at that spot, so the fix lands
without formatting churn behind it:

- **Overrides hugged open** — `cloneDeep(base, {` on the line the literal already
  started, one entry per line below it. This is the default spelling.
- **Everything on one line** — `cloneDeep(base, { a: 1 } as const)` — where the
  hugged spelling is not one prettier would print back. That happens where
  prettier moves a broken call onto a line of its own: a concise arrow body
  (`() => …`), an argument list (`doThing(…)`, `new Thing(…)`), a statement head
  (`if (…)`, `for (… of …)`), a ternary branch, a logical operand and a parameter
  default. The leading break prettier wants there belongs to text outside the
  range this fix replaces, so it cannot be written. A site that **already** opens
  its own line has spent that break, and keeps the hugged spelling whoever its
  parent is.
- **One argument per line** — the base and the overrides each on their own line
  inside the call's parentheses — once `cloneDeep(base, {` no longer fits on the
  line it starts, which is exactly when prettier stops hugging.

In the two broken layouts every entry is terminated, including the last one at
each nesting depth, because prettier's `trailingComma: 'all'` requires that
comma. The one-line layout takes no trailing comma at all. `{}`, for an override
that collapses to nothing, is spelled the same way in every layout; its
terminator belongs to the surrounding entry, never inside the braces.

The one break the fix does write is the one after a concise arrow's `=>`, by
taking the gap after that token into the replaced range:

```ts
// before
import { cloneDeep } from 'functions/src/util/cloneDeep';

const buildIt = () => ({
  ...configuration,
  nested: { ...configuration.nested, isEnabled: true, retryLimit: 3 },
});
```

```ts
// after --fix
import { cloneDeep } from 'functions/src/util/cloneDeep';

const buildIt = () =>
  cloneDeep(configuration, {
    nested: {
      isEnabled: true,
      retryLimit: 3,
    },
  } as const);
```

Nothing else claims that gap, and writing it is what keeps `() => ({ … })` and
its `() => { return { … }; }` twin fixed alike, instead of the fix depending on
how the enclosing function is spelled. A block comment in the gap is carried
across onto the line the break opens, which is where prettier puts it anyway.
The gap is not taken where a line comment sits in it — `//` would swallow the
call behind it — nor where something else is deciding the same break, as an
arrow that is itself an argument is: prettier answers `doThing(() => …)` from
the argument list outwards, and the `,` and `)` it wants there are text this fix
does not own.

Width is measured against the print width **or the source line's own width where
that is already greater**. A line the input already ran over is one prettier
reflows whether or not the fix lands, so a trailing comment that happens to push
a line past the margin does not decide whether the rule fixes at all.

Parentheses that were doing work around the literal are absorbed into the
replaced range, because a `cloneDeep(...)` call is a `LeftHandSideExpression`
and needs none of them:

```ts
// before
import { cloneDeep } from 'functions/src/util/cloneDeep';

const result = ({ ...a, b: { ...a.b, c: 1 } } as const)!;
```

```ts
// after --fix
import { cloneDeep } from 'functions/src/util/cloneDeep';

const result = cloneDeep(a, {
  b: {
    c: 1,
  },
} as const)!;
```

A parenthesis the **enclosing construct** owns is never absorbed, since deleting
it would rewrite the program: an argument list's `(` (`doThing({ … })`), a
statement head's (`if ((… as const).b)`), and a `new` callee's, where
`new (fn())()` re-associates into `new fn()()` without its pair. Nor is a pair
whose margin holds a comment — the fix still lands, and the comment stays where
its author put it.

The rule never writes an import of its own. Which specifier reaches the helper —
or whether the helper exists at all — belongs to the consuming project, so a
guessed import trades working code for a build error. Where the file does not
already import the helper, the report stands unfixed and adding the import is
left to whoever applies the change.

An autofix must never change runtime behavior, so the rule also reports
**without** fixing whenever the overrides object cannot reproduce the literal
faithfully:

- A nested spread of anything other than the path `cloneDeep` already copies, for
  example `{ ...a, nested: { ...a.other, value: 42 } }`. Dropping `...a.other`
  would delete data.
- A spread that is not the first property of its object, for example
  `{ ...a, nested: { value: 42, ...a.nested } }`, where the spread overrides the
  keys declared before it.
- A second top-level spread, for example `{ ...a, ...b, nested: { ...a.nested } }`.
- A conditional spread such as `...(condition ? { … } : {})` inside the overrides.
- A binding named `cloneDeep` that resolves to something else (a local variable,
  a namespace import, a type-only import, or `lodash`'s `cloneDeep`, which takes
  no overrides argument).
- A flagged literal whose partial copy is not reachable as a direct property
  value, so no faithful `cloneDeep` call can replace it.
- A literal carrying a `const` assertion *behind another assertion*, for
  example `{ ...a, nested: { ...a.nested, value: 42 } } as Foo as const`. A
  `const` assertion applies only to a literal, so leaving it on the emitted call
  is TS1355, and it cannot be dropped without also dropping the `as Foo` in
  between.
- A literal wrapped in an object or array literal that is written on a **single
  line**, for example `const result = { key: { ...a, b: { ...a.b, c: 1 } } };`.
  The emitted call is multi-line, so the enclosing literal has to break around
  it — a range the fix does not own. Spelling the enclosing literal across lines
  restores the fix.
- A literal hugged open **mid-line** in a position where prettier moves a broken
  call down a line of its own, whose overrides are too wide to collapse onto the
  line the call already occupies — for example a `doSomething({ … })` argument
  that only fits across several lines. No layout the fix can write is one
  prettier prints back unchanged, and leaving the input alone changes no meaning
  while emitting churn does.

A `const` assertion applied **directly** to the literal is absorbed rather than
declined — `{ ...a, nested: { ...a.nested, value: 42 } } as const` becomes a
`cloneDeep(...)` call with no assertion left wrapping it — and any `as Foo`,
`satisfies Foo` or `!` that follows the assertion is kept on the call. The
emitted call already spells `as const` on its overrides literal, which
is the one place the assertion stays legal after the rewrite. Absorbing it is
also what keeps the fix reachable under a composed `--fix`: `global-const-style`
appends `as const` to a module-scope constant before this rule's turn, and a
fix declined on that assertion would never land. `as Foo` and `satisfies Foo`
on the literal are legal on a call expression and keep their fix, as does
`as const` on an *enclosing* literal, where the rewrite happens inside and the
assertion still has a literal:

```ts
// before
import { cloneDeep } from 'functions/src/util/cloneDeep';

const result = {
  key: { ...a, nested: { ...a.nested, value: 42 } },
} as const;
```

```ts
// after --fix
import { cloneDeep } from 'functions/src/util/cloneDeep';

const result = {
  key: cloneDeep(a, {
    nested: {
      value: 42,
    },
  } as const),
} as const;
```

Defensive spellings of the base path are recognized and dropped safely:
`...(base?.x ?? {})`, `...base.x!` and `...base['x']` all mirror `base.x`. Array,
call and conditional property *values* are copied verbatim, so their contents
survive the fix untouched.

### ❌ Incorrect

```ts
const result = {
  ...baseObj,
  data: {
    ...baseObj.data,
    nested: {
      ...baseObj.data.nested,
      value: 42,
    },
  },
};

const membership = {
  sender: 'unchanged',
  receiver: 'unchanged',
  membership: {
    ...membershipIncomplete,
    sender: {
      ...membershipIncomplete.sender,
      request: {
        ...membershipIncomplete.sender.request,
        status: 'accepted',
      },
    },
    receiver: {
      ...membershipIncomplete.receiver,
      request: {
        ...membershipIncomplete.receiver.request,
        status: 'accepted',
      },
    },
  },
};
```

### ✅ Correct

```ts
import { cloneDeep } from 'functions/src/util/cloneDeep';

const result = cloneDeep(baseObj, {
  data: {
    nested: {
      value: 42,
    },
  },
} as const);

const membership = {
  sender: 'unchanged',
  receiver: 'unchanged',
  membership: cloneDeep(membershipIncomplete, {
    sender: {
      request: {
        status: 'accepted',
      },
    },
    receiver: {
      request: {
        status: 'accepted',
      },
    },
  } as const),
};
```

## When Not To Use It

- Objects that contain functions or symbols, which `cloneDeep` does not clone safely
- Single-level, shallow copies where nested references are intentionally shared
- Scenarios that need a custom mix of shallow and deep copying for performance or semantics

## Version

This rule was introduced in v1.0.0

## Further Reading

- [Spread syntax (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Deep cloning objects in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#deep_clone)
