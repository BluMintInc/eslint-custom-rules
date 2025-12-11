# Require console logging for useAlertDialog severities (`@blumintinc/blumint/enforce-console-error`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Pair every user-facing alert opened via `useAlertDialog` with console logging so monitoring captures the underlying error or warning.

## Why

- Error and warning dialogs without console logs leave no breadcrumbs in monitoring tools, making triage and correlation difficult.
- Logging inside the same function scope ensures the log corresponds to the exact `open()` call, even inside nested callbacks or async flows.
- Dynamic severity values can render either an error or a warning; logging both prevents silent branches that hide production issues.

## Rule Details

The rule reports when:

- `open()` receives `severity: 'error'` but the containing function scope has no `console.error`.
- `open()` receives `severity: 'warning'` but the containing function scope has no `console.warn`.
- `open()` receives a non-literal or dynamic severity and the containing function scope has neither `console.error` nor `console.warn`.

## How to Fix

- Log the same message shown to the user with `console.error` or `console.warn` in the same function that calls `open()`.
- When severity is dynamic (variables, expressions, computed keys), include both `console.error` and `console.warn` so any branch that renders is logged.

## Examples

### ✅ Correct

```tsx
import { useAlertDialog } from '../useAlertDialog';

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
    console.error('Potential error dialog', message);
    console.warn('Potential warning dialog', message);
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
open({
  title: 'Error',
  description: 'An error occurred',
  severity: 'error',
}); // ✖ No console.error, monitoring has no breadcrumb
```

```tsx
const { open } = useAlertDialog('DIALOG');
open({
  title: 'Warning',
  description: 'Heads up',
  severity: 'warning',
}); // ✖ No console.warn, warning is invisible to observability
```

```tsx
const { open } = useAlertDialog('DIALOG');
const showDialog = (severity: string, description: string) => {
  open({
    title: 'Alert',
    description,
    severity,
  });
}; // ✖ Dynamic severity without console.error and console.warn, so one branch will stay unlogged
```
