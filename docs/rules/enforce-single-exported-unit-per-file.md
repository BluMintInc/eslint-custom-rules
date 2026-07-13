# Enforce that a .tsx/.jsx file exports at most one React component and any file exports at most one class (`@blumintinc/blumint/enforce-single-exported-unit-per-file`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

A `.tsx`/`.jsx` file may export at most **one React component**, and any file may export at most **one class**. Exporting multiple components or multiple classes from a single file is a file-organization leak: each exported unit is an independent public abstraction, and co-locating two of them in one file hides one behind the other's filename and breaks the file-per-abstraction navigation model. The rule mechanizes the recurring "abstract this into its own file" review correction.

The rule reports on each exported unit **beyond the first**, anchored at that unit's declaration, so it is clear exactly which units to extract.

### What counts as a "unit"

- **Component** (enforced only in `.tsx`/`.jsx` files): an exported PascalCase declaration that is a function/arrow returning JSX (detected via the shared `ASTHelpers.returnsJSX` helper, after unwrapping `memo(...)`/`React.memo(...)`/`forwardRef(...)`/HOC wrapper calls), or a class extending `Component`/`PureComponent`/`React.Component`/`React.PureComponent`.
- **Class** (enforced in all files): any other exported class.

A React class component counts **only** as a component, never as a class (disjoint classification). Types, interfaces, enums, constants, `createContext(...)` results, and hooks (`use*`) count toward **neither** budget.

### Relationship to `prefer-utility-function-own-file`

This rule is the deliberate complement to [`prefer-utility-function-own-file`](./prefer-utility-function-own-file.md), which owns co-located utility **functions** (and explicitly excludes components and hooks). This rule owns **components and classes**, with no size threshold — a second exported component or class is a second public abstraction regardless of its size. The two rules partition the "should this live in its own file?" question by unit kind with zero overlap.

## Examples

### Incorrect

```tsx
// SlideTransition.tsx — four thin variant components (four units)
export const SlideTransitionDown = memo(function SlideTransitionDownUnmemoized(props) {
  return <Slide {...props} direction="down" />;
});
export const SlideTransitionUp = memo(function SlideTransitionUpUnmemoized(props) {
  return <Slide {...props} direction="up" />;
});
```

```tsx
// DateEdit.tsx — both derive from the IMPORTED DatePicker, so neither collapses
export const DateEdit = withDatePickerEdit(DatePicker);
export const DateEditUtc = withDatePickerEdit(DatePicker, { utc: true });
```

```ts
// Two independent classes = two abstractions
export class UserFetcher {
  async fetch() { /* ... */ }
}
export class ScoreCalculator {
  calculate() { /* ... */ }
}
```

### Correct

```tsx
// One component — parameterize the variants into a single component
export const SlideTransition = memo(function SlideTransitionUnmemoized({ direction, ...props }) {
  return <Slide {...props} direction={direction} />;
});
```

```tsx
// The *Unmemoized + memo() export pair is ONE unit (derived-wrapper collapse)
export const TeamStatusChipUnmemoized = ({ sx }) => <div style={sx} />;
export const TeamStatusChip = memo(TeamStatusChipUnmemoized);
```

```tsx
// A custom HOC applied to a sibling export also collapses to ONE unit
export const SignInDropdownMenuless = () => <div />;
export const SignInDropdown = withMenu(SignInDropdownMenuless, SignInMenu);
```

```tsx
// Supporting types/constants/hooks alongside one component are fine
export type LogoProps = { isLink?: boolean };
export const BLUMINT_LOGO_URL = '/assets/word_logo.svg';
export function LogoUnmemoized(props: LogoProps) { return <Link>{/* ... */}</Link>; }
export const Logo = memo(LogoUnmemoized);
```

```ts
// A trivial error-class hierarchy sharing a common base is exempt
export class CircularDependencyError extends HttpsError {
  constructor(path: string[]) { super({ code: 'failed-precondition', message: '...' }); }
}
export class MissingDependencyError extends HttpsError {
  constructor() { super({ code: 'failed-precondition', message: '...' }); }
}
```

## Key mechanics

- **Derived-wrapper collapse.** An exported component whose declaration is a bare `memo(...)`/`React.memo(...)`/`forwardRef(...)`/HOC call, where one of the call's arguments (recursing through nested calls, e.g. `memo(forwardRef(X))`) is an identifier referencing another component exported from the same file, collapses into that sibling and counts as the SAME unit. The linkage is call-argument-based, not name-suffix-based. Deriving from an **imported** base does not collapse, and merely **rendering** a sibling inside a function body does not collapse.
- **Default vs. named exports.** `export default Identifier` and `export { X }` specifiers are resolved to their local declaration and deduped — one declaration is one unit regardless of how many export statements reference it.
- **Re-exports are free.** Any export with a source (`export { X } from './x'`, `export * from './x'`) introduces no new declaration and contributes zero units, so barrel files are naturally exempt.
- **Error-class hierarchy exemption.** A multi-class file is exempt when every exported class body contains only a constructor (no methods, getters, or other members) **and** all exported classes share a common base (the same imported identifier, or a hierarchy rooted at a single in-file class).

## Exempt files

- `*.test.*` / `*.spec.*` files
- Files under `__mocks__/`
- `.d.ts` declaration files

`*.stories.tsx` is **not** exempt in v1 because the consuming codebase has no Storybook files. If Storybook is ever adopted, `*.stories.tsx` should be added to the exempt-file predicate — stories export multiple story configs of one component, not multiple components in the enforcement sense.

## When To Disable

Use `// eslint-disable-next-line @blumintinc/blumint/enforce-single-exported-unit-per-file` when two exported units are genuinely one cohesive abstraction that the collapse/exemption heuristics do not recognize. Prefer extracting the second unit into its own file, or parameterizing sibling component variants into a single component.

## Related Rules

- [`prefer-utility-function-own-file`](./prefer-utility-function-own-file.md) — the disjoint-by-design complement that owns co-located utility functions.
