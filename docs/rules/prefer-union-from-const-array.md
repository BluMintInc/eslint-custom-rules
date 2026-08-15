# Derive string-literal union types from an `as const` array instead of declaring the union inline, so the runtime value set and the type share a single source of truth (`@blumintinc/blumint/prefer-union-from-const-array`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

A named `type` alias whose right-hand side is a pure, multi-member string-literal
union (`type X = 'a' | 'b' | 'c'`) declares a value set inline. That inline form
is one of **two untethered sources of truth** — the type, and whatever runtime
array/switch eventually enumerates the same values — which drift silently: add a
literal to the type but forget the runtime array (or vice versa) and nothing
fails to compile.

This rule flags every such alias and autofixes it into the derived form, where a
single `as const` array is the source of truth and the type is derived from it:

```ts
// Bad — inline union, no runtime artifact
export type TournamentActionId = 'start' | 'contribute';

// Good — array is the single source of truth; type derives from it
export const TOURNAMENT_ACTION_ID_VALUES = ['start', 'contribute'] as const;
export type TournamentActionId = (typeof TOURNAMENT_ACTION_ID_VALUES)[number];
```

## Rule Details

The rule fires when **all** of the following hold:

1. The node is a named `type X = ...` alias declaration. Inline union
   annotations on a parameter, property, or return type never fire — an inline
   annotation used once has no name for other code to reuse and no drift risk.
2. The alias's right-hand side is a `TSUnionType`.
3. The union has **at least two members**. Small is not exempt: the motivating
   real case had exactly two members.
4. **Every** member is a string-literal type. Any other member kind (number,
   `null`, `undefined`, `string`, a template-literal type, or a type reference)
   disqualifies the whole union.
5. The alias does **not** sit in an ambient context (see
   [Ambient contexts](#ambient-contexts)).

The rule is a pure AST rule — it uses no type information. As a deliberate
consequence, it only sees a `TSUnionType` written **directly** as the alias's
right-hand side. Aliases that merely *evaluate* to a literal union at the type
level (indexed access into a generated type, a re-exported third-party union,
etc.) contain no syntactic `TSUnionType` and are exempt by construction.

### Ambient contexts

An ambient context accepts only a string, numeric, or literal-enum `const`
initializer: an array literal there is `TS1254: A 'const' initializer in an
ambient context must be a string or numeric literal or literal enum reference`,
with or without `as const`. The derived form therefore cannot be written in that
position at all, so the rule declines to report rather than offering a fix that
does not compile. The exempt contexts are:

- A `declare namespace X {}`, `declare module 'x' {}`, or `declare global {}`
  block, at any nesting depth. Ambience is inherited, and only the **outermost**
  declaration carries the `declare` modifier, so an alias several namespaces deep
  inside one is exempt too.
- An alias carrying the modifier itself (`declare type X = 'a' | 'b'`), which is
  the promise that the declaration emits nothing at runtime — and the derived
  array is exactly a runtime emit.
- Any declaration in a declaration file (`.d.ts`, `.d.mts`, `.d.cts`), which is
  ambient in its entirety even where no `declare` keyword appears.

A plain `namespace X {}` in a `.ts` file is **not** ambient — a `const` array is
legal there — so an alias inside one is still reported and fixed.

### Incorrect

```ts
export type TournamentActionId = 'start' | 'contribute';
type Direction = 'asc' | 'desc';
type ChipTone = 'active' | 'warning' | 'critical' | 'neutral';

// The `Literal` suffix does NOT opt out
type StatusLiteral = 'active' | 'inactive';

// Prop unions that mirror an MUI variant set still fire — a locally re-typed
// union drifts independently of MUI
type ButtonVariant = 'contained' | 'outlined' | 'text';

// A plain namespace is not an ambient context, so the derived form is legal
namespace Access {
  type Role = 'owner' | 'member';
}
```

### Correct

```ts
// The rule's own derived form (does not re-fire — idempotent)
export const EVENT_TYPES = ['Tournament', 'Giveaway'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Inline annotations — single use site, no reusable named value set
function sortRows(direction: 'asc' | 'desc') {}
type SortState = { direction: 'asc' | 'desc'; column: string };

// Non-string-literal unions (out of scope in v1 — see below)
type HttpStatus = 200 | 404 | 500;
type MaybeMode = 'arena' | 'studio' | null;
type Loose = 'exact' | string;

// Aliases of external/generated types — no syntactic union to see
type Environment = NodeJS.ProcessEnv['NODE_ENV'];
import type { ChannelType } from 'stream-chat';
type ChatChannelKind = ChannelType;

// Ambient contexts reject a const array initializer (TS1254), so there is no
// derived form to write
declare namespace Access {
  type Role = 'owner' | 'member';
}
declare module 'stream-chat' {
  namespace Team {
    type Role = 'owner' | 'member';
  }
}
```

Every declaration in a declaration file is ambient, exempting the alias below
even though no `declare` keyword appears:

```ts
// File: src/types/roles.d.ts
export type Role = 'owner' | 'member';
```

## Options

```js
'@blumintinc/blumint/prefer-union-from-const-array': ['error', {
  // Column the autofix wraps the emitted declaration at
  printWidth: 80,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix wraps at, matching Prettier's option of the same name.
Set it to your formatter's `printWidth` so the fixed source is already in the
shape the formatter would produce; a lint run carrying `--fix` otherwise leaves
the tree failing `prettier --check`.

## Autofix

The fixer rewrites the alias to `const {TYPE_NAME}_VALUES = [...] as const;`
followed by `type X = (typeof {TYPE_NAME}_VALUES)[number];`. It:

- Derives the const name by upper-snake-casing the type name and appending
  `_VALUES` (`TournamentActionId` → `TOURNAMENT_ACTION_ID_VALUES`).
- Preserves member order and the original quote style of each literal.
- Mirrors `export`: an exported alias produces an exported const and type.
- Preserves any type parameters and the declaration's indentation.
- Leaves a leading JSDoc/comment in place — it sits above the generated const,
  which becomes the primary declaration.
- **Skips the fix (report-only)** when the derived `{TYPE_NAME}_VALUES` name
  already exists in scope, so it never shadows or duplicates an existing
  identifier.

The autofix intentionally produces bare literals inside the array. Naming each
literal as its own constant (e.g. `START_TOURNAMENT_ACTION = 'start'`) is a good
next step the report message suggests, but inventing those names requires domain
judgment beyond a mechanical rule.

### Line width

Both emitted lines stay compact while they fit within [`printWidth`](#printwidth)
and break open past it, which is what a formatter would do to them anyway. A
lint run carrying `--fix` therefore leaves the tree `prettier --check` clean
instead of landing an over-long line for the next `prettier --write` to rewrite.

Wrapping is not the safe default here. Unlike an object literal, an array that a
formatter judges short enough is collapsed back onto one line, so blanket
wrapping would trade an over-width line on long unions for a needlessly split one
on every short union. The fixer measures the exact statement it is about to
write — the declaration's indentation, the `export ` prefix, the derived name,
every rendered member and the ` as const;` suffix — and only breaks when that
measurement overflows.

Past the width, each member gets its own line indented one step in from the
declaration, with a trailing comma and `] as const;` back at the declaration's
own indentation. The step is the file's own indent unit, read from the source, so
a tab-indented or four-space file is not rewritten into two spaces:

```ts
export const TABS_VARIANT_VALUES = [
  'tabs',
  'toggle-button',
  'chip',
  'chip-large',
  'underline',
] as const;
export type TabsVariant = (typeof TABS_VARIANT_VALUES)[number];
```

The derived alias is measured separately, since a long type name can overflow it
while the array still fits. Its only break point is after the `=`:

```ts
export const EVENT_IS_LIVE_DIALOG_BODY_VARIANT_VALUES = [
  'successWithoutBlubot',
  'successWithBlubot',
] as const;
export type EventIsLiveDialogBodyVariant =
  (typeof EVENT_IS_LIVE_DIALOG_BODY_VARIANT_VALUES)[number];
```

A member written with a backslash line continuation cannot sit on one line at
all, so its array always breaks open. That member's raw text is reproduced
verbatim: the newline it carries — and the column everything after it sits at —
is string data the fixer never re-indents.

## When Not To Use It

For a genuinely single-use, never-enumerated alias where the array derivation is
pure ceremony, use a per-line disable **with a written justification** rather
than turning the rule off:

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-union-from-const-array -- intentionally inline, single call site, no runtime enumeration planned
type HandshakePhase = 'hello' | 'ack';
```

There is no naming-convention auto-exemption (e.g. a `Literal` suffix does not
opt out) — the justified disable is the single, auditable escape hatch.

## Known Limitations

- **Numeric-literal unions are out of scope in v1.** `type HttpStatus = 200 |
  404 | 500` follows the same underlying pattern and could derive from an
  `as const` number array, but supporting it doubles the fixer's surface
  (numeric formatting, mixed radix). It is a plausible future extension, not a
  silently half-supported one.
- **Cross-declaration duplication detection is an explicit non-goal.** When a
  file already contains *both* an inline union and a separate array listing the
  same literals but not tethered via `(typeof ARR)[number]`, the rule flags the
  union half (surfacing the file for a human to consolidate) but does not detect
  that the array duplicates it. The correct human fix is to tether the existing
  array. When the derived const name collides with that array, the autofix skips
  (report-only) rather than adding a redundant second array.

## Related Rules

- `prefer-type-alias-over-typeof-constant` — complementary: it bans deriving
  scalar types from ad-hoc `typeof CONST` references, and explicitly exempts the
  `(typeof ARR)[number]` shape this rule's autofix produces.
- `global-const-style`
- `enforce-global-constants`
- `extract-global-constants`
- `enforce-object-literal-as-const`
