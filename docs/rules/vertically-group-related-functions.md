# Keep top-level functions grouped vertically so callers, exports, and helpers read top-down (`@blumintinc/blumint/vertically-group-related-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keeping related functions grouped vertically makes a file easier to scan and helps readers follow call chains top-down. This rule suggests grouping event handlers, main logic, and utilities so the file remains organized.

## Why this rule?

- Scattering related logic makes it harder to trace how data flows through a file.
- Grouping by category (e.g., event handlers first) provides a consistent structure across files.
- A predictable function order speeds up code reviews and onboarding.

## Examples

### ❌ Incorrect

```ts
function utilityHelper() { /* ... */ }

function handleClick() {
  utilityHelper();
}

function anotherHelper() { /* ... */ }

function onSubmit() {
  anotherHelper();
}
```

Example message:

```text
Function "utilityHelper" is out of order: utilities should follow the configured group order. This rule is a suggestion for vertical grouping; what constitutes "related" logic is subjective. If this order is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/vertically-group-related-functions comment. Otherwise, consider moving it after "onSubmit" to improve file scanability.
```

### ✅ Correct

```ts
// Main entry/event handlers
function handleClick() {
  utilityHelper();
}

function onSubmit() {
  anotherHelper();
}

// Helpers/utilities grouped together below
function utilityHelper() { /* ... */ }
function anotherHelper() { /* ... */ }
```

### ✅ Correct (With disable comment if order is intentional)

```ts
// eslint-disable-next-line @blumintinc/blumint/vertically-group-related-functions
function legacyUtility() { /* ... */ }
```

## Options

This rule accepts an options object:

- `exportPlacement`: (`'top' | 'bottom' | 'ignore'`, Default: `'ignore'`) Whether to group exported functions together.
- `dependencyDirection`: (`'callers-first' | 'callees-first'`, Default: `'callers-first'`) Whether helpers should appear above or below their callers.
- `groupOrder`: (`['event-handlers' | 'utilities' | 'other'][]`, Default: `['event-handlers', 'other', 'utilities']`) The preferred order of function groups.
- `eventHandlerPattern`: (Regex string) Pattern to identify event handlers.
- `utilityPattern`: (Regex string) Pattern to identify utility functions.

## When Not To Use It

Disable this rule if you prefer a different organizational style or if the rule's suggestions conflict with your project's specific file layout conventions. Use an `// eslint-disable-next-line @blumintinc/blumint/vertically-group-related-functions` comment for local exceptions.

## Further Reading

- [Clean Code: Stepdown Rule](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter03.html#ch3lev1sec7)
- [Refactoring: Reorder Functions](https://refactoring.guru/reorder-functions)
