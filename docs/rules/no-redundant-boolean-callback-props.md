# Disallow redundant boolean props that duplicate the semantic meaning of optional callback props, violating the Interface Segregation Principle (`@blumintinc/blumint/no-redundant-boolean-callback-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule flags React Props type declarations that contain BOTH an optional boolean visibility/enablement prop (e.g. `shouldShowMinimizeIcon?: boolean`) AND a corresponding optional callback prop (e.g. `onMinimize?: () => void`) whose presence already communicates the same intent.

The boolean is redundant because consumers can key off whether the callback is defined. Keeping both violates the Interface Segregation Principle: it forces consumers to coordinate two related props, creates potential for inconsistent state (`shouldShowMinimizeIcon: true` but `onMinimize: undefined`), and doubles the API surface unnecessarily.

The preferred alternatives are:
1. Remove the boolean and test `!!onMinimize` at the usage site.
2. Use the `callback | 'disabled'` union pattern already established in the codebase (e.g. `onChange: OnChange | 'disabled'`).

### Detection Strategy

The rule operates purely syntactically — no type resolution required. It analyzes `TSTypeAliasDeclaration` and `TSInterfaceDeclaration` nodes, unwrapping `Readonly<{...}>` and flattening inline `&` intersections.

For the collected members it:
1. Identifies **boolean candidates**: props whose type is `boolean` (or `boolean | undefined`) and whose name starts with a configurable visibility/enablement prefix (`shouldShow`, `shouldEnable`, `enable`, `show`, etc.) and contains no exempt qualifier (`Initially`, `WhenHovered`, etc.).
2. Identifies **callback candidates**: props whose type is a function type or named callback type, and whose name starts with a configurable callback prefix (`on`, `handle`).
3. Flags a boolean when a callback's core noun (name with callback prefix stripped) matches the boolean's core noun (name with boolean prefix stripped) with sufficient confidence.

### Matching Confidence

Two tiers of match:

- **Tier 1 — exact match**: the boolean's core (after prefix strip) equals the callback's noun exactly (case-insensitive). No minimum length restriction. E.g. `shouldShowMinimize` → `Minimize` matches `onMinimize` → `Minimize`.
- **Tier 2 — suffix-strip match**: the boolean's core starts with the callback noun AND the remainder is a recognized decorative suffix (`Icon`, `Button`, `Action`, `Control`, `Badge`). Requires the callback noun to be at least 6 characters to avoid false positives on short generic action words like `Close` that appear in many general-purpose callbacks. E.g. `shouldShowMinimizeIcon` → `MinimizeIcon` starts with `Minimize` (8 chars ≥ 6) + `Icon` → match.

This is why `shouldShowCloseIcon` is NOT flagged when `onClose` is present — `Close` has only 5 characters, below the 6-character minimum for suffix-strip matches. `onClose` often handles multiple triggers (backdrop, escape key, icon click) and is not specific to showing a close icon.

### Scope

Only inline type members are analyzed. External types referenced in `extends` clauses or `&` intersections that resolve to type aliases are skipped to avoid flagging inherited library props.

### Autofix

Not provided — removing a boolean prop changes the public API and requires coordinated updates at all call sites.

## Options

```typescript
{
  // Boolean prop prefixes that signal visibility/enablement control.
  // Default: ['shouldShow', 'shouldEnable', 'shouldAllow', 'enable', 'allow', 'show', 'hide', 'display']
  booleanPrefixes?: string[];

  // Callback prop prefixes to match against.
  // Default: ['on', 'handle']
  callbackPrefixes?: string[];

  // Trailing decorative suffixes stripped from the boolean's noun during tier-2 matching.
  // Default: ['Icon', 'Button', 'Action', 'Control', 'Badge']
  booleanSuffixesToStrip?: string[];

  // Word-parts that exempt a boolean from matching (it has different semantics).
  // Default: ['Initially', 'OnMount', 'ByDefault', 'WhenHovered', 'WhenFocused', 'WhenActive', 'Always', 'Never']
  exemptQualifiers?: string[];

  // Minimum callback noun length for tier-2 (suffix-strip) matching to apply.
  // Default: 6
  minNounLengthForSuffixMatch?: number;
}
```

## Examples

### ❌ Incorrect

```typescript
// shouldShowMinimizeIcon is redundant — onMinimize's presence IS the signal
type DialogProps = {
  onMinimize?: () => void;
  shouldShowMinimizeIcon?: boolean;
};
```

```typescript
// shouldEnableSearch duplicates the information already carried by onSearch
type SearchProps = {
  shouldEnableSearch?: boolean;
  onSearch?: (query: string) => void;
};
```

```typescript
// Multiple redundant pairs
type NotificationProps = {
  shouldEnableDismiss?: boolean;
  onDismiss?: () => void;
  shouldShowMinimize?: boolean;
  onMinimize?: () => void;
};
```

```typescript
// Works inside Readonly<{...}>
type HeaderProps = Readonly<{
  shouldShowMinimizeIcon?: boolean;
  onMinimize?: () => void;
}>;
```

### ✅ Correct

```typescript
// Callback presence is the only signal — no redundant boolean
export type DialogCenteredProps = Readonly<{
  onClose?: () => void;
  onMinimize?: () => void;
  // shouldShowCloseIcon is OK here — 'Close' is only 5 chars, below
  // the tier-2 minimum for suffix-strip matching
  shouldShowCloseIcon?: boolean;
}>;
```

```typescript
// `is` prefix represents state, not visibility control
type AccordionProps = {
  isExpanded?: boolean;
  onExpand?: () => void;
};
```

```typescript
// Exempt qualifier 'Initially' changes semantics — initial state, not feature presence
type AccordionProps = {
  shouldExpandInitially?: boolean;
  onExpand?: () => void;
};
```

```typescript
// Preferred 'disabled' pattern — no boolean needed
type ValueChangeable<TValue> = Readonly<{
  value?: TValue;
  onChange: OnChange<TValue> | 'disabled';
}>;
```

## When to Disable

Disable this rule on a line when a boolean genuinely controls a UI element that is independent of whether the callback fires — for example, a boolean that controls visibility based on external state (server-side feature flags, user permissions) rather than callback presence.

```typescript
// eslint-disable-next-line @blumintinc/blumint/no-redundant-boolean-callback-props
shouldShowPremiumFeature?: boolean; // controlled by subscription status, not onPremiumFeature
onPremiumFeature?: () => void;
```
