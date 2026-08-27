# Enforce the use of "ID" instead of "id" in user-facing text (`@blumintinc/blumint/enforce-id-capitalization`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule ensures consistency in user-facing text by enforcing the use of "ID" instead of "id" when referring to identifiers in UI labels, instructions, error messages, and other visible strings.

Using "ID" (uppercase) improves readability and maintains a professional standard across all user interactions.

## Rule Details

This rule aims to enforce consistent capitalization of "ID" in user-facing text. It specifically excludes code-level identifiers such as variable names, property names, and type definitions, focusing only on strings that will be displayed to users.

### Examples of **incorrect** code for this rule:

```tsx
const message = "Please enter your in-game id.";
const label = "User id:";
const error = "Invalid id format";
const prompt = <div>Please enter your id</div>;
const submit = <Button>Submit id</Button>;
const interpolated = `Your id is ${userId}`;
t("user.profile.id");
const prompts = ["Enter your id", "Name"]; // Array elements that read as prose
```

### Examples of **correct** code for this rule:

```tsx
const message = "Please enter your in-game ID.";
const label = "User ID:";
const error = "Invalid ID format";
const prompt = <div>Please enter your ID</div>;
const submit = <Button>Submit ID</Button>;
const interpolated = `Your ID is ${userId}`;
t("user.profile.ID");

// The following are not affected by this rule:
const userId = 12345; // Variable names
function getUserId() { return 123; } // Function names
interface User { id: string; } // Interface properties
type UserData = { id: number; } // Type properties
export type CallerRequestButtonsProps = Pick<CallerCardBaseProps, 'status' | 'id'>; // Type definitions with Pick utility
type UserSummary = Pick<User, 'id' | 'name'>; // Type utility with property names
const matchId: Match['id'] = 'match-123'; // Indexed-access keys name a property
const flexible = "This grid system is flexible."; // "id" as part of another word
const rapid = "Rapid development"; // "id" as part of another word
element.getAttribute("id"); // DOM attribute names are code, not text
const fields = ["id", "broadcastTest"] as const; // Key/field-name lists
```

### Key names versus prose

A string literal is left alone when it names something rather than being shown
to a user. Alongside variable names, property names and type positions, that
covers:

- the attribute-name argument of a DOM or jest-dom attribute API
  (`getAttribute`, `setAttribute`, `toHaveAttribute`, the `*NS` variants, …);
- an **array element that is a single identifier token**, such as
  `["id", "broadcastTest"]`. An array of bare identifiers is a key/field-name
  list — the array spelling of the object keys the rule already skips — so
  rewriting `"id"` to `"ID"` would name a key that does not exist.

The array carve-out is decided per element and requires the whole element to be
one identifier: prose carries whitespace or punctuation, a key name does not. So
`["id", "Enter your id"]` still reports its second element, and a lone `"id"`
outside an array position (`t("id")`) is still treated as user-facing.

## When Not To Use It

If your codebase has a different convention for referring to identifiers, or if you don't need to enforce this level of consistency in user-facing text, you can disable this rule.

## Further Reading

- [UI Text Guidelines](https://material.io/design/communication/writing.html)
