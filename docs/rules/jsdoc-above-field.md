# Require JSDoc blocks to sit above fields instead of trailing inline so IDE hovers surface the documentation (`@blumintinc/blumint/jsdoc-above-field`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Ensures JSDoc-style comments live directly above the fields they describe (interfaces, type literals, class fields, and optionally object literals) instead of trailing on the same line. Inline JSDoc after a field is ignored by IDE hovers and autocompletion, so the documentation becomes invisible to callers. Moving the block above the declaration keeps the docs attached and also preserves decorator ordering on class fields.

## Rule Details

A JSDoc block belongs to the field whose separator still follows it, whatever
line it sits on. `phone?: string; /** … */`, the prettier-canonical
`phone?: string /** … */;`, and the same block reflowed onto its own line ahead
of the separator all document `phone` from below, and are reported alike.
Prettier is not idempotent on a block too tall to share the field's line: one
pass reflows it ahead of the separator, and the next moves the separator back
in front of it, so both spellings occur and neither may be ignored.

Attachment stops at the separator: a block starting after the field's `;` or
`,` on a later line leads whatever follows. On the last member of a container
there is nothing to lead, so the field it trails claims it. A blank line
restores the carve-out — prettier preserves an authored one and never inserts
one while reflowing, so the gap marks a deliberate note about the shape.

Prettier keeps a type literal or object literal on one line whenever the source
has no newline after its `{`, so a documented field often shares its line with
the braces and its siblings. There is no line above such a field to move the
block to, so the fix breaks the whole `{ … }` apart — one member per line, each
separated and the closing brace back at the construct's own column, indented by
the step the file itself uses. That is the layout prettier prints for the
result, so `--fix` and a subsequent format agree instead of rewriting each
other. Every comment inside the braces travels with the rewrite, and a sibling
field's own trailing block is hoisted in the same pass rather than being left
behind past its separator, where the rule would no longer see it.

### ❌ Incorrect

```ts
export type User = {
  phone?: string; /** @remarks stored as +15551234567 */
};

// Prettier rewrites the comment ahead of the separator — the same violation
export type Contact = {
  phone?: string /** @remarks stored as +15551234567 */;
};

// Prettier's fixed point for a block too tall to share the line — a violation
export type Session = {
  timeout: number;
  /**
   * @remarks milliseconds
   * ensure positive
   */
};

interface Profile {
  username: string /** @remarks unique handle */;
}

// Prettier keeps a one-line literal on one line — still a violation
type InlineType = { value: string /** @remarks stays with field */ };

class Account {
  @Column()
  email!: string; /** @remarks must be lowercase */
}

const config = {
  retryDelay: 1000, /** @remarks in milliseconds */
};
```

### ✅ Correct

```ts
export type User = {
  /** @remarks stored as +15551234567 */
  phone?: string;
};

class Account {
  /** @remarks must be lowercase */
  @Column()
  email!: string;
}

const config = {
  /** @remarks in milliseconds */
  retryDelay: 1000,
};

// A one-line literal is broken apart, because the block needs a line of its own
type InlineType = {
  /** @remarks stays with field */
  value: string;
};

// Past the separator the block documents the NEXT field, so it stays put
export type Contact = {
  phone?: string;
  /** @remarks shown in the UI */
  displayName: string;
};

// On the last member there is no next field, so a trailing block would be read
// as that field's documentation. A blank line is what marks it as a note about
// the shape instead — prettier preserves an authored one and never inserts one.
type Trailing = {
  phone?: string;

  /** @remarks describes the shape, not a field */
};
```

## Options

### `checkObjectLiterals` (default: `false`)

- When `true`, the rule also moves inline JSDoc comments that trail object literal properties.
- When `false`, only type literals, interfaces, and class fields are checked.

```json
{
  "@blumintinc/blumint/jsdoc-above-field": ["error", { "checkObjectLiterals": true }]
}
```

## When Not To Use It

- You rely on inline trailing comments for quick notes and do not need those comments to appear in IDE tooltips.
- You prefer to document object literals inline and do not want enforcement there (keep `checkObjectLiterals` disabled).
