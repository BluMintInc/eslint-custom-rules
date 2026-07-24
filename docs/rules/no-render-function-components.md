# Disallow declaring a local `render*` function that returns JSX and consuming it as a plain function (direct call or array-iteration callback); author it as a real component rendered with JSX instead (`@blumintinc/blumint/no-render-function-components`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

A function that takes inputs and returns JSX **is** a React component. Naming it
`render*` and then calling it like a helper — either directly (`renderMember(m)`)
or by passing it into an array-iteration method (`members.map(renderMember)`) —
inlines the returned elements into the parent's output instead of mounting them
as their own component.

## Rule Details

This rule flags a locally declared function whose name matches `/^render[A-Z]/`
(e.g. `renderMember`, `renderStep`, `renderWithStyledLink`) when **both** of the
following hold:

1. It **returns JSX** (functions that return strings, plain objects, `null`, or
   arrays of non-JSX objects are ignored), and
2. It is **consumed as a plain function** — either a direct call `renderFoo(...)`
   or a by-reference pass into an array-iteration method
   (`.map`, `.flatMap`, `.forEach`, `.reduce`, `.reduceRight`, `.filter`,
   `.find`, `.findIndex`, `.findLast`, `.findLastIndex`, `.some`, `.every`).

Additionally, an **exported** `render*` function that returns JSX and is not
wired to a render-prop slot within its own file is flagged on its declaration —
exporting a `render*`-named JSX function is itself the smell.

### Why this matters

Invoking a JSX-returning function as a plain call rather than rendering it as
JSX forfeits:

- **Reconciliation and key semantics** — the elements are inlined into the
  parent's tree rather than mounted as a keyed, independently reconciled child.
- **Isolated hook scope** — hooks called inside the function run in the parent's
  render, not in a component of their own, so the Rules of Hooks no longer apply
  cleanly.
- **A memoization boundary** — a real component can be wrapped in `memo` and skip
  re-rendering; an inlined function re-runs with the parent every time.
- **DevTools visibility** — the markup never appears as its own component in
  React DevTools, making it harder to profile and debug.

### What is NOT flagged

When a `render*` function is passed **by reference** into a render-prop slot —
either a JSX attribute or an object property whose name is in `renderPropNames`
(e.g. MUI DataGrid's `renderCell`, Autocomplete's `renderInput`/`renderOption`,
Algolia widgets' `render`) — it is a legitimate external-library callback, not a
component you author, so it is exempt. The exemption anchors on the **slot name**
at the consumption site, not on the function's own name.

If a function is passed to a render-prop slot **and also** invoked as a plain
call somewhere, it is still flagged (the plain call is the violation).

### Examples of incorrect code for this rule:

```tsx
const renderMember = (member) => <UsernameAvatar id={member.id} />;
const TeamMembers = ({ members }) => (
  <Stack>{members.map((m) => renderMember(m))}</Stack>
);
```

```tsx
const renderStep = ({ title }, index) => (
  <li key={title}>
    {index}. {title}
  </li>
);
const Steps = ({ steps }) => <ol>{steps.map(renderStep)}</ol>;
```

```tsx
// Exported render* JSX function not wired to any slot.
export const renderCohortMenuItem = (cohort) => <MenuItem>{cohort.name}</MenuItem>;
```

### Examples of correct code for this rule:

```tsx
// Author a real component and render it with JSX.
const Member = ({ member }) => <UsernameAvatar id={member.id} />;
const TeamMembers = ({ members }) => (
  <Stack>
    {members.map((member) => (
      <Member key={member.id} member={member} />
    ))}
  </Stack>
);
```

```tsx
// Passed by reference into a render-prop slot — a library callback, not a component.
const renderCell = ({ row }) => <span>{row.id}</span>;
const Grid = () => <DataGrid renderCell={renderCell} />;
```

## Options

This rule accepts an options object with the following properties:

| Option            | Type       | Default                                                                                                   | Description                                                                                                                              |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `renderPropNames` | `string[]` | `['renderCell', 'renderHeader', 'renderValue', 'renderInput', 'renderOption', 'renderTags', 'renderGroup', 'render']` | Slot names (JSX attribute names or object property keys) that legitimately consume a `render*` callback by reference. **Added to** the defaults, not replaced. |
| `allowNames`      | `string[]` | `[]`                                                                                                       | Regex patterns tested against the function name; matching functions are never flagged.                                                    |

```jsonc
{
  "@blumintinc/blumint/no-render-function-components": [
    "error",
    {
      "renderPropNames": ["renderCustomSlot"],
      "allowNames": ["^renderLegacy"]
    }
  ]
}
```

## When Not To Use It

If your codebase intentionally uses `render*` helper functions as a convention
and you do not want to migrate them into components, disable this rule. For a
handful of legitimate exceptions, prefer an inline `eslint-disable-next-line`
comment or the `allowNames` / `renderPropNames` options over turning the rule
off entirely.
