# Detect unused props in React component type definitions (`@blumintinc/blumint/no-unused-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule ensures every prop declared in a component's Props type is either read inside the component or intentionally forwarded. Unused props make the component API misleading: call sites keep passing values that are ignored, reviewers assume behavior that does not exist, and spread props from UI libraries get silently dropped.

## Rule Details

Props define the contract for a component. When a prop appears in the type but is never used:

- Callers keep threading data and dependencies that have no effect on rendering.
- Reviewers assume the component supports behavior (like disabled states or ARIA labels) that is not implemented.
- Spread props from library types (such as MUI) are lost when they are not forwarded with a rest spread.

The rule flags any prop declared in a `Props` type alias that is not read in the component body and not forwarded via `...rest`.

The function spelling is not part of the question. An arrow function, a function
expression and a `function` declaration all state the same contract, so all three
are checked the same way.

Neither is nesting. A component declared inside another component — directly, in
a hook callback, or in any block within the body — states its own contract, and
so does the component holding it. Every level is checked on its own.

### Examples of **incorrect** code for this rule:

The props type may be carried either by the parameter annotation or by an
FC-shaped declarator annotation (`React.FC<Props>`, `FC<Props>`,
`FunctionComponent<Props>`); both resolve the same way when the type is
declared in the same file. An FC-shaped annotation belongs to a binding, so a
`function` declaration carries its props type on the parameter.

```tsx
type MyComponentProps = {
  title: string;
  subtitle: string; // subtitle is declared but never read or forwarded
};

const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  return <h1>{title}</h1>;
};
```

```tsx
import { FormControlLabelProps } from '@mui/material';

type GroupModeTogglesProps = {
  mode: string;
  preferences: Record<string, any>;
} & FormControlLabelProps;

// FormControlLabelProps are declared but never forwarded or read
const GroupModeToggles = ({ mode, preferences }: GroupModeTogglesProps) => (
  <FormControlLabel control={<div />} label="Group mode" />
);
```

```tsx
type PanelProps = {
  title: string;
  subtitle: string; // subtitle is declared but never read or forwarded
};

export function Panel({ title }: PanelProps) {
  return <h1>{title}</h1>;
}
```

### Examples of **correct** code for this rule:

```tsx
type MyComponentProps = {
  title: string;
  subtitle: string;
};

const MyComponent: React.FC<MyComponentProps> = ({ title, subtitle }) => {
  return (
    <div>
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
    </div>
  );
};

// Forward all remaining props with a rest spread
type MyComponentProps = {
  title: string;
  subtitle: string;
};

const MyComponent: React.FC<MyComponentProps> = (props) => {
  return <ChildComponent {...props} />;
};

import { FormControlLabelProps } from '@mui/material';

type GroupModeTogglesProps = {
  mode: string;
  preferences: Record<string, any>;
} & FormControlLabelProps;

// Spread props from the intersection are forwarded
const GroupModeToggles = ({ mode, preferences, ...rest }: GroupModeTogglesProps) => (
  <FormControlLabel {...rest} control={<div />} label="Group mode" />
);
```

```tsx
type PanelProps = {
  title: string;
  subtitle: string;
};

export function Panel({ title, subtitle }: PanelProps) {
  return (
    <div>
      <h1>{title}</h1>
      <h2>{subtitle}</h2>
    </div>
  );
}
```

## When Not To Use It

You might want to disable this rule if:

1. You're building a library where some props might be used by higher-order components or other wrappers.
1. Placeholder props exist for type-level wiring that must not reach the component.
1. Certain props are being deprecated but must stay temporarily for backward compatibility.

## Version

This rule was introduced in eslint-plugin-blumint 1.0.4
