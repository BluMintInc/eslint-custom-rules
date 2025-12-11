# Enforce exporting types for function props and return values (`@blumintinc/blumint/enforce-exported-function-types`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Exported functions and React components must rely on exported types so consumers can import the same contract instead of guessing shapes. This rule requires type aliases or interfaces used by exported APIs to be exported from the module.

## Rule Details

- Detects parameters of exported functions that reference non-exported type aliases or interfaces.
- Also reports exported functions whose return types rely on non-exported aliases or interfaces.
- Warns when exported React components use props types that are defined but not exported.
- Allows built-in/standard library types, imported types, generic parameters, and inline literal types.

If the type is kept private while the function/component is exported, callers duplicate the shape or fall back to `any`, causing type drift and maintenance bugs. Exporting the shared contract keeps implementations and consumers aligned.

### Examples of **incorrect** code for this rule:

```ts
type Config = { timeout: number };

export function initializeApp(config: Config) {
  return config;
}

type NotificationBannerProps = {
  message: string;
  onClose: () => void;
};

export function NotificationBanner(props: NotificationBannerProps) {
  return <div>{props.message}</div>;
}

type Result = { value: string };

export const getData = (): Result => ({ value: 'test' });
```

### Examples of **correct** code for this rule:

```ts
export type Config = { timeout: number };

export function initializeApp(config: Config) {
  return config;
}

export type NotificationBannerProps = {
  message: string;
  onClose: () => void;
};

export function NotificationBanner(props: NotificationBannerProps) {
  return <div>{props.message}</div>;
}

import { User } from './models';

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
