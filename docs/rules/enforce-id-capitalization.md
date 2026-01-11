# Enforce the use of "ID" instead of "id" in user-facing text (`@blumintinc/blumint/enforce-id-capitalization`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule ensures consistency in user-facing text by suggesting the use of "ID" instead of "id" when referring to identifiers in UI labels, instructions, error messages, and other visible strings.

## Why this rule?

- "ID" is the standard capitalization for "identifier".
- Consistent capitalization improves the professional look and feel of the UI.
- Standalone "id" in text can look like a typo or technical jargon.

## Examples

### ❌ Incorrect

```tsx
const message = "Please enter your in-game id.";
const label = "User id:";
<div>Please enter your id</div>
```

Example message:

```text
Use "ID" instead of "id" in user-facing text for better readability. This rule is a suggestion; if "id" is intentional (e.g., a specific technical term), please use an // eslint-disable-next-line @blumintinc/blumint/enforce-id-capitalization comment. Otherwise, consider "ID" for visible labels and messages.
```

### ✅ Correct

```tsx
const message = "Please enter your in-game ID.";
const label = "User ID:";
<div>Please enter your ID</div>

// technical contexts are ignored
const userId = 12345;
interface User { id: string; }
```

### ✅ Correct (With disable comment if "id" is intentional)

```tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-id-capitalization
const technicalTerm = "element id";
```

## Options

This rule does not have any options.

## When Not To Use It

Disable this rule if you are working in a technical context where lowercase "id" is required (e.g., documenting an HTML attribute or a specific API response field). Use an `// eslint-disable-next-line @blumintinc/blumint/enforce-id-capitalization` comment for local exceptions.
