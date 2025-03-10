# Enforce the use of "ID" instead of "id" in user-facing text (`@blumintinc/blumint/enforce-id-capitalization`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule ensures consistency in user-facing text by enforcing the use of "ID" instead of "id" when referring to identifiers in UI labels, instructions, error messages, and other visible strings.

Using "ID" (uppercase) improves readability and maintains a professional standard across all user interactions.

## Rule Details

This rule aims to enforce consistent capitalization of "ID" in user-facing text. It specifically excludes code-level identifiers such as variable names, property names, and type definitions, focusing only on strings that will be displayed to users.

Examples of **incorrect** code for this rule:

```js
const message = "Please enter your in-game id.";
const label = "User id:";
const error = "Invalid id format";
<div>Please enter your id</div>
<Button>Submit id</Button>
const message = `Your id is ${userId}`;
t("user.profile.id");
```

Examples of **correct** code for this rule:

```js
const message = "Please enter your in-game ID.";
const label = "User ID:";
const error = "Invalid ID format";
<div>Please enter your ID</div>
<Button>Submit ID</Button>
const message = `Your ID is ${userId}`;
t("user.profile.ID");

// The following are not affected by this rule:
const userId = 12345; // Variable names
function getUserId() { return 123; } // Function names
interface User { id: string; } // Interface properties
type UserData = { id: number; } // Type properties
export type CallerRequestButtonsProps = Pick<CallerCardBaseProps, 'status' | 'id'>; // Type definitions with Pick utility
type UserSummary = Pick<User, 'id' | 'name'>; // Type utility with property names
const message = "This grid system is flexible."; // "id" as part of another word
const message = "Rapid development"; // "id" as part of another word
```

## When Not To Use It

If your codebase has a different convention for referring to identifiers, or if you don't need to enforce this level of consistency in user-facing text, you can disable this rule.

## Further Reading

- [UI Text Guidelines](https://material.io/design/communication/writing.html)
