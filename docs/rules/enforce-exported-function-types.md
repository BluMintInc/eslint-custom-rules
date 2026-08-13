# Enforce exporting types for function props and return values (`@blumintinc/blumint/enforce-exported-function-types`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Exported functions and React components must rely on exported types so consumers can import the same contract instead of guessing shapes. This rule requires type aliases or interfaces used by exported APIs to be exported from the module.

## Rule Details

- Detects parameters of exported functions that reference non-exported type aliases or interfaces.
- Also reports exported functions whose return types rely on non-exported aliases or interfaces.
- Warns when exported React components use props types that are defined but not exported.
- Allows built-in/standard library types, imported types, generic parameters, and inline literal types.

If the type is kept private while the function/component is exported, callers duplicate the shape or fall back to `any`, causing type drift and maintenance bugs. Exporting the shared contract keeps implementations and consumers aligned.

### Component shapes the props check covers

A component counts however it is written:

- `export function Banner(props: BannerProps)`
- `export const Banner = (props: BannerProps) => ...`
- `export const Banner = function (props: BannerProps) { ... }`
- `export const Banner = memo(...)`, `React.memo(...)`, `forwardRef(...)`, `React.forwardRef(...)`, and any nesting of those (`memo(forwardRef(fn))`) around a function expression or arrow
- `export const Banner = memo(BannerUnmemoized)`, where the wrapper argument names a function declared in the same file, through any nesting of wrappers (`memo(forwardRef(BannerUnmemoized))`)
- the `export default` form of each of those
- `export default Banner`, where the identifier names a declaration in the same file (`const Banner = memo(function BannerUnmemoized(props: BannerProps) {...});`)

The props annotation is read off a named parameter (`props: BannerProps`) and off a destructured one (`({ message }: BannerProps)`) alike: destructuring changes how the component reads its props, not the contract consumers compose against.

Covering the wrapped shapes is what keeps the check alive: [`require-memo`](./require-memo.md) rewrites `export function Banner(props: BannerProps)` into `export const Banner = memo(function BannerUnmemoized(props: BannerProps) {...})`, so a check that reads only the declaration form goes blind on every component that rule's fixer touches. The same holds for the argument spelled as a name, which is how a memoized component reaches the export once its implementation is hoisted to its own declaration.

A default-exported declaration is the one shape that rule cannot rewrite in place, since `export default const Banner = memo(...)` is a syntax error. It splits the declaration from the export instead, leaving `const Banner = memo(...);` followed by `export default Banner;` — so the export is a bare identifier and the component sits on a declaration carrying no `export` of its own. Reading the identifier back to that declaration is what keeps the two spellings of one component reported alike.

Boundaries that keep the check on props:

- A capitalized name marks a component. `export const useBanner = (config: BannerConfig) => ...` stays a plain exported function, and a `memo` call wrapping a lowercase-named function or binding stays outside the props check.
- Only the first parameter carries props. The ref `forwardRef` passes as the second argument is no part of the contract a consumer composes against.
- A wrapper argument that names an import (`memo(BannerUnmemoized)` for a component from another module) resolves to nothing local. Its props type is declared elsewhere and cannot be exported from this file, so the component is left alone. A default-exported identifier naming an import (`export default Banner`) is left alone for the same reason.
- A bare identifier is followed only from `export default`, where the declaration it names is the component the module ships. The named form `export const Banner = BannerUnmemoized` re-exports a value whose props are the other declaration's concern.
- A generic parameter the component itself declares (`memo(function ListUnmemoized<T>({ items }: ListProps<T>))`) is no exportable contract, so only `ListProps` is checked.
- An inline literal annotation (`({ message }: { message: string })`) names no type, so there is nothing to export.

## Fixer

A props violation is fixable: the rule inserts `export ` before the module-scope `type` or `interface` declaration that names the props type, turning `type BannerProps = ...` into `export type BannerProps = ...`.

The report stands without a fix when the declaration cannot be exported by that single insertion:

- the type has no declaration in the file (an ambient or globally declared type),
- the declaration sits outside the module's top level, such as inside a namespace,
- several merged declarations share the name, since TypeScript requires all or none of them to be exported.

Parameter and return-type violations are reported without a fix. A props type is by convention part of the component's public contract, so exporting it is the remedy every time; an arbitrary parameter or return type has other valid remedies — inline the shape, or reuse a contract that is already exported — and picking one for the author would be a guess.

### Examples of **incorrect** code for this rule:

```ts
import { memo } from 'react';

type Config = { timeout: number };

export function initializeApp(config: Config) {
  return config;
}

type NotificationBannerProps = {
  message: string;
  onClose: () => void;
};

export const NotificationBanner = memo(function NotificationBannerUnmemoized(
  props: NotificationBannerProps,
) {
  return <div>{props.message}</div>;
});

type AlertProps = { message: string };

export const Alert = ({ message }: AlertProps) => <div>{message}</div>;

type BadgeProps = { label: string };

const BadgeUnmemoized = ({ label }: BadgeProps) => <div>{label}</div>;

export const Badge = memo(BadgeUnmemoized);

type PanelProps = { title: string };

// The split `require-memo` emits for `export default function Panel(...)`
const Panel = memo(function PanelUnmemoized({ title }: PanelProps) {
  return <div>{title}</div>;
});
export default Panel;

type Result = { value: string };

export const getData = (): Result => ({ value: 'test' });
```

### Examples of **correct** code for this rule:

```ts
import { memo } from 'react';
import { User } from './models';

export type Config = { timeout: number };

export function initializeApp(config: Config) {
  return config;
}

export type NotificationBannerProps = {
  message: string;
  onClose: () => void;
};

export const NotificationBanner = memo(function NotificationBannerUnmemoized(
  props: NotificationBannerProps,
) {
  return <div>{props.message}</div>;
});

export type AlertProps = { message: string };

export const Alert = ({ message }: AlertProps) => <div>{message}</div>;

export type BadgeProps = { label: string };

const BadgeUnmemoized = ({ label }: BadgeProps) => <div>{label}</div>;

export const Badge = memo(BadgeUnmemoized);

export type PanelProps = { title: string };

const Panel = memo(function PanelUnmemoized({ title }: PanelProps) {
  return <div>{title}</div>;
});
export default Panel;

export type Result = { value: string };

export const getData = (): Result => ({ value: 'test' });

// Imported or built-in types are fine
export function processTimestamp(timestamp: Date): Promise<User> {
  return Promise.resolve({ id: '1', name: 'Test User' });
}
```

### When not to use it

- Modules that intentionally keep all functions internal and do not export them.
- Modules that expose runtime values without exporting any public TypeScript types.
