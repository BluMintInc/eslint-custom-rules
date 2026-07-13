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

The rule is a pure AST rule — it uses no type information. As a deliberate
consequence, it only sees a `TSUnionType` written **directly** as the alias's
right-hand side. Aliases that merely *evaluate* to a literal union at the type
level (indexed access into a generated type, a re-exported third-party union,
etc.) contain no syntactic `TSUnionType` and are exempt by construction.

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
```

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
