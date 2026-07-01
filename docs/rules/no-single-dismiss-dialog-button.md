# Disallow a single dialog button whose label is a dismiss action (Cancel, Close, Dismiss, Not now, Never mind). Use navigation.onClose for dismissal; the buttons array should only contain affirmative actions (`@blumintinc/blumint/no-single-dismiss-dialog-button`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

BluMint's dialog system auto-derives an X close button from `navigation.onClose` (or `DialogCentered.onClose`). Providing a single `buttons` element whose `children` label is a dismiss action — `Cancel`, `Close`, `Dismiss`, `Not now`, or `Never mind` — is therefore redundant and misleading: the array is intended exclusively for **affirmative actions** (Confirm, Save, Delete, Continue, …).

This rule flags any `buttons: [{ children: '<dismiss-label>' }]` property where the array has exactly one element and the `children` value is a static string matching a configurable set of dismiss labels (case-insensitive, trimmed).

### Detection strategy

Detection is purely syntactic (no type-checker required):

1. Visit every `Property` AST node.
2. Skip if the property key is not `buttons` (identifier or string literal, non-computed).
3. Skip if the value is not an `ArrayExpression`.
4. Skip if the array has anything other than exactly one element.
5. Skip if the element is not an `ObjectExpression`.
6. Inside that object, look for a `children` property whose value is a `Literal` string or an expression-free `TemplateLiteral`.
7. If the string (after trimming) matches one of the dismiss labels (case-insensitive), report the button element.

Non-string `children` values (JSX elements, identifiers, call expressions, template literals with expressions) are never flagged.

### Why this matters

Passing a single dismiss button creates a confusing UX: two ways to dismiss the same dialog (the button AND the X icon). It also misuses the dialog API — the X button is the canonical dismiss mechanism and is already provided for free via `onClose`.

### Examples

#### Incorrect

```typescript
// Single cancel button — the X button already handles this
const props = {
  buttons: [{ isAsync: false, children: 'Cancel', onClick: close }],
};

// Dismiss / Not now / Never mind — same issue
const props2 = {
  buttons: [{ children: 'Dismiss', onClick: handleDismiss }],
};
```

#### Correct

```typescript
// Affirmative action — fine
const props = {
  buttons: [{ isAsync: true, children: 'Confirm', onClick: handleConfirm }],
};

// Multiple buttons — fine even if the first is a dismiss label
const props2 = {
  buttons: [
    { children: 'Decline', onClick: handleDecline },
    { children: 'Accept', onClick: handleAccept },
  ],
};

// Use onClose for dismissal
const props3 = {
  navigation: { onClose: handleClose },
  buttons: [{ children: 'Confirm', onClick: handleConfirm }],
};
```

## Options

```typescript
{
  // Labels treated as dismiss actions (case-insensitive, exact match after trimming).
  // Default: ['Cancel', 'Close', 'Dismiss', 'Not now', 'Never mind']
  dismissLabels?: string[];
}
```

### Example configuration

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/no-single-dismiss-dialog-button': [
    'error',
    {
      dismissLabels: ['Cancel', 'Close', 'Dismiss', 'Not now', 'Never mind', 'Go back'],
    },
  ],
}
```

## When to disable

If your dialog intentionally presents a single dismiss-labelled button for a specific UX reason that cannot be expressed through `onClose`, suppress the line:

```typescript
// eslint-disable-next-line @blumintinc/blumint/no-single-dismiss-dialog-button
buttons: [{ children: 'Cancel', onClick: specialDismissFlow }],
```
