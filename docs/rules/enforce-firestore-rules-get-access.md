# Ensure Firestore security rules use .get() with a default value instead of direct field access comparisons (e.g., resource.data.fieldX.fieldY != null) (`@blumintinc/blumint/enforce-firestore-rules-get-access`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

When writing Firestore security rules, avoid directly accessing nested fields with property chains like `resource.data.fieldX.fieldY != null`. Such access can behave unexpectedly when fields are missing. Instead, use `.get('<field>', <default>)` chaining with a default value to safely handle missing fields.

## Rule Details

- **Disallowed**: Direct field access comparisons to `null`/`undefined` in Firestore rules strings/templates, e.g., `resource.data.user.name != null`.
- **Required**: Use `.get('<field>', <default>)` with a provided default value (e.g., `null`) and chain for deeper paths, e.g., `resource.data.get('user', null).get('name', null) != null`.

This rule checks string and template literals that look like Firestore rules and:

- Flags direct property access comparisons like `resource.data.foo.bar === null` or `request.resource.data.x.y != undefined`.
- Flags `.get('<field>')` calls missing a default value.
- Provides auto-fixes for string literals (not for template literals). Fixes cover dotted access and bracketed string segments (e.g., `resource.data["field-x"].child`), but non-string bracket expressions are only reported, not auto-fixed.
- Template literal detection is best-effort: embedded expressions are ignored when joining quasis, so violations that span expressions might not be detected.

## Examples

### ❌ Incorrect

```javascript
// Direct property access may fail if a field is missing
const rules = "allow read: if resource.data.fieldX.fieldY != null;";
```

```javascript
// Missing default in .get()
const rules = "allow read: if resource.data.get('fieldX') != null;";
```

```javascript
// request.resource variant
const rules = "allow update: if request.resource.data.profile.image === undefined;";
```

### ✅ Correct

```javascript
// Safe null check using .get() with a default value
const rules = "allow read: if resource.data.get('fieldX', null) != null;";
```

```javascript
// Chained .get() for nested fields
const rules = "allow update: if request.resource.data.get('fieldX', null).get('fieldY', null) != null;";
```

## Options

```js
'@blumintinc/blumint/enforce-firestore-rules-get-access': ['error', {
  // Column the autofix measures the rewritten literal against
  printWidth: 80,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix measures against, matching Prettier's option of the same
name. Set it to your formatter's `printWidth` so the fixed source is already in
the shape the formatter would produce; a lint run carrying `--fix` otherwise
leaves the tree failing `prettier --check`.

Rewriting `.seg` into `.get('seg', null)` adds 13 columns per path segment, and
the segment count comes entirely from the source, so the emitted literal's width
is unbounded — a two-segment path is enough to push a realistic rules string past
80 columns.

A string literal cannot be broken across lines, so the wrap the fix emits is the
one a formatter would perform on the statement around it: the literal moves to
its own line after the `=` or `:` that introduces it.

```javascript
// Emitted when the rewritten literal would overflow
const rules =
  "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;";
```

A literal passed straight to a call is wrapped the other way a formatter reaches
for, because there is no `=` to break after: the argument list opens instead,
putting the argument on its own line one step in, a trailing comma after it, and
the closing parenthesis back at the call's own column.

```javascript
// Emitted when the rewritten argument would overflow
publish(
  "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;",
);
```

The width is measured, never assumed: a rewritten literal that still fits is left
on its original line, because a formatter pulls a needlessly wrapped short value
straight back up.

A comment sharing the line is measured the way a formatter measures it, and the
two kinds differ. A block comment occupies columns like any other text, so it can
carry an otherwise-fitting rewrite past the width and open the wrap by itself; a
line comment is printed as a suffix that never counts toward whether the
statement fits, so it never does. Both shapes keep the comment.

## When Not To Use It

- If your project does not store or lint Firestore rules as strings or template literals in your codebase, this rule may be unnecessary.

## Further Reading

- Firestore Security Rules best practices
