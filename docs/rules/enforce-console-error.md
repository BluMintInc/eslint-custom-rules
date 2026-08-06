# Enforce proper logging for useAlertDialog based on severity. When severity is "error", console.error must be included. When severity is "warning", console.warn must be included. This ensures all user-facing errors and warnings are properly logged to observability systems (`@blumintinc/blumint/enforce-console-error`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Pair every user-facing alert opened via `useAlertDialog` with console logging so observability captures the underlying error or warning.

## Why

- Error and warning dialogs without console logs leave no breadcrumbs in observability tools, making triage and correlation difficult.
- Logging inside the same function scope ensures the log corresponds to the exact `open()` call, even inside nested callbacks or async flows.
- Dynamic severity values can render either an error or a warning; logging each branch prevents silent paths and keeps observability aligned to severity.

## Rule Details

The rule reports when:

- An error dialog (`severity: 'error'`) is opened without a `console.error` in the containing function scope.
- A warning dialog (`severity: 'warning'`) is opened without a `console.warn` in the containing function scope.
- `severity` is only known at runtime (a variable, a call, an interpolated template) and the containing function scope is missing either `console.error` or `console.warn`, so one of the severity branches would emit no telemetry.

A severity pinned at compile time counts as static regardless of how it is spelled: a quoted literal, a template with no substitutions (`` `error` ``), and a literal behind a type assertion (`'error' as const`, `'error' satisfies Severity`, `<const>'error'`, `'error'!`) all name one severity, so the rule demands only that severity's console method.

## How to Fix

- Log the same message shown to the user with `console.error` or `console.warn` in the same function that calls `open()`.
- When severity is dynamic (variables, expressions, computed keys), branch on the severity value so only the matching console method runs (`console.error` for error paths, `console.warn` for warning paths), ensuring each possible outcome leaves a single breadcrumb without double-logging.

## Examples

### ✅ Correct

The following example pairs static errors, static warnings, and dynamic severities with matching console logging in the same scope.

```tsx
import { useAlertDialog } from '@blumintinc/blumint/alerts';

export const useDialogs = () => {
  const { open } = useAlertDialog('DIALOGS');

  const showError = (message: string) => {
    console.error('Error dialog', message);
    open({
      title: 'Error',
      description: message,
      severity: 'error',
    });
  };

  const showWarning = (message: string) => {
    console.warn('Warning dialog', message);
    open({
      title: 'Warning',
      description: message,
      severity: 'warning',
    });
  };

  const showDynamic = (severity: 'error' | 'warning', message: string) => {
    if (severity === 'error') {
      console.error('Error dialog', message);
    } else {
      console.warn('Warning dialog', message);
    }

    open({
      title: 'Alert',
      description: message,
      severity,
    });
  };

  return { showError, showWarning, showDynamic };
};
```

### ❌ Incorrect

```tsx
const { open } = useAlertDialog('DIALOG');
const showError = () => {
  open({
    title: 'Error',
    description: 'An error occurred',
    severity: 'error',
  });
}; // ✖ No console.error in the containing function, observability has no breadcrumb
```

```tsx
const { open } = useAlertDialog('DIALOG');
const showWarning = () => {
  open({
    title: 'Warning',
    description: 'Heads up',
    severity: 'warning',
  });
}; // ✖ No console.warn in the containing function, warning is invisible to observability
```

```tsx
const { open } = useAlertDialog('DIALOG');
const showDialog = (severity: string, description: string) => {
  open({
    title: 'Alert',
    description,
    severity,
  });
}; // ✖ Dynamic severity without console.error or console.warn, so one branch will stay unlogged
```

```tsx
const { open } = useAlertDialog('DIALOG');
const showDialog = (severity: string, description: string) => {
  console.error('Logging only errors');
  open({
    title: 'Alert',
    description,
    severity,
  });
}; // ✖ Dynamic severity missing console.warn, so warning dialogs have no breadcrumb
```
