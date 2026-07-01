import { ruleTesterTs } from '../utils/ruleTester';
import { noSingleDismissDialogButton } from '../rules/no-single-dismiss-dialog-button';

ruleTesterTs.run(
  'no-single-dismiss-dialog-button',
  noSingleDismissDialogButton,
  {
    valid: [
      // Single affirmative button — not a dismiss label
      `
const config = {
  buttons: [{ isAsync: true, children: 'Confirm', onClick: handleConfirm }],
};
`,
      // Single affirmative button: "Save"
      `
const config = {
  buttons: [{ children: 'Save', onClick: handleSave }],
};
`,
      // Single affirmative button: "Delete"
      `
const config = {
  buttons: [{ children: 'Delete', onClick: handleDelete }],
};
`,
      // Two buttons — first is a dismiss label but length is not 1
      `
const config = {
  buttons: [
    { children: 'Cancel', onClick: close },
    { children: 'Confirm', onClick: handleConfirm },
  ],
};
`,
      // Two buttons — both are dismiss labels (still, length > 1 so fine)
      `
const config = {
  buttons: [
    { children: 'Close', onClick: close },
    { children: 'Dismiss', onClick: dismiss },
  ],
};
`,
      // Empty array — no elements
      `
const config = {
  buttons: [],
};
`,
      // Non-buttons property with a single dismiss label element
      `
const config = {
  actions: [{ children: 'Cancel', onClick: close }],
};
`,
      // Another non-buttons property name
      `
const config = {
  items: [{ children: 'Close', onClick: close }],
};
`,
      // Single button with non-string children: JSX element (identifier, not a string literal)
      `
const config = {
  buttons: [{ children: cancelIcon, onClick: close }],
};
`,
      // Single button where children is a dynamic expression (binary)
      `
const config = {
  buttons: [{ children: label + '!', onClick: close }],
};
`,
      // Single button where children is an identifier (not a static string)
      `
const config = {
  buttons: [{ children: dismissLabel, onClick: close }],
};
`,
      // The word "cancel" embedded in a longer phrase — not an exact match
      `
const config = {
  buttons: [{ children: 'Cancel request', onClick: close }],
};
`,
      // "Close window" — longer phrase, not an exact match
      `
const config = {
  buttons: [{ children: 'Close window', onClick: close }],
};
`,
      // Single button with dismiss-like children but expressed as template literal with expressions
      `
const config = {
  buttons: [{ children: \`\${label}\`, onClick: close }],
};
`,
      // Single button where children is a call expression
      `
const config = {
  buttons: [{ children: getLabel(), onClick: close }],
};
`,
      // Multiple buttons including one with dismiss text
      `
const config = {
  buttons: [
    { children: 'Decline', onClick: handleDecline },
    { children: 'Accept', onClick: handleAccept },
  ],
};
`,
      // Three buttons with dismiss at end
      `
const config = {
  buttons: [
    { children: 'Option A', onClick: optionA },
    { children: 'Option B', onClick: optionB },
    { children: 'Cancel', onClick: close },
  ],
};
`,
      // Computed property key named "buttons" — not flagged (computed key, can't be sure)
      `
const key = 'buttons';
const config = {
  [key]: [{ children: 'Cancel', onClick: close }],
};
`,
      // No buttons property at all — just other keys
      `
const config = {
  title: 'Dialog',
  onClose: handleClose,
};
`,
    ],
    invalid: [
      // Single button with 'Cancel' (exact, original case)
      {
        code: `
const config = {
  buttons: [{ isAsync: false, children: 'Cancel', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Single button with 'Close'
      {
        code: `
const config = {
  buttons: [{ children: 'Close', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Single button with 'Dismiss'
      {
        code: `
const config = {
  buttons: [{ children: 'Dismiss', onClick: handleDismiss }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Single button with 'Not now'
      {
        code: `
const config = {
  buttons: [{ children: 'Not now', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Single button with 'Never mind'
      {
        code: `
const config = {
  buttons: [{ children: 'Never mind', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Case-insensitive: 'cancel' (all lowercase)
      {
        code: `
const config = {
  buttons: [{ children: 'cancel', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Case-insensitive: 'CANCEL' (all uppercase)
      {
        code: `
const config = {
  buttons: [{ children: 'CANCEL', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Case-insensitive: 'dismiss' (all lowercase)
      {
        code: `
const config = {
  buttons: [{ children: 'dismiss', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Case-insensitive: 'CLOSE'
      {
        code: `
const config = {
  buttons: [{ children: 'CLOSE', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Case-insensitive: 'NOT NOW'
      {
        code: `
const config = {
  buttons: [{ children: 'NOT NOW', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Template literal with no expressions: `Cancel`
      {
        code: 'const config = { buttons: [{ children: `Cancel`, onClick: close }] };',
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Template literal with no expressions: `Never mind`
      {
        code: 'const config = { buttons: [{ children: `Never mind`, onClick: close }] };',
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Label with surrounding whitespace that trims to a dismiss label
      {
        code: `
const config = {
  buttons: [{ children: '  Cancel  ', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Extra properties on button object should not prevent detection
      {
        code: `
const config = {
  buttons: [{
    isAsync: true,
    variant: 'outlined',
    children: 'Close',
    onClick: handleClose,
    disabled: false,
  }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Nested inside a function — still flagged
      {
        code: `
function buildDialogProps(onClose) {
  return {
    buttons: [{ children: 'Cancel', onClick: onClose }],
  };
}
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Configurable: custom dismiss label via option
      {
        code: `
const config = {
  buttons: [{ children: 'Go back', onClick: close }],
};
`,
        options: [{ dismissLabels: ['Go back'] }],
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // Configurable: overridden labels still catches default labels when listed
      {
        code: `
const config = {
  buttons: [{ children: 'No thanks', onClick: close }],
};
`,
        options: [{ dismissLabels: ['No thanks', 'Cancel'] }],
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
      // String literal key for "buttons" property (edge case)
      {
        code: `
const config = {
  'buttons': [{ children: 'Cancel', onClick: close }],
};
`,
        errors: [{ messageId: 'noSingleDismissDialogButton' }],
      },
    ],
  },
);
