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
Prettier prints that last shape for any block that cannot share the field's
line, so it is the spelling formatted source actually contains — matching on
line sharing alone would leave the rule inert exactly there.

Attachment stops at the separator. A block starting after the field's `;` or `,`
on a later line is the leading documentation of whatever follows — or a note
about the enclosing shape — and is left alone. That carve-out is also why a
class field whose trailing block prettier parks _after_ its `;` goes unreported:
that position is indistinguishable from leading documentation.

### ❌ Incorrect

```ts
export type User = {
  phone?: string; /** @remarks stored as +15551234567 */
};

// Prettier rewrites the comment ahead of the separator — the same violation
export type Contact = {
  phone?: string /** @remarks stored as +15551234567 */;
};

// A block too tall to share the line is reflowed onto its own — still a violation
export type Session = {
  timeout: number
  /**
   * @remarks milliseconds
   * ensure positive
   */;
};

interface Profile {
  username: string /** @remarks unique handle */;
}

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

// Past the separator the block documents the NEXT field, so it stays put
export type Contact = {
  phone?: string;
  /** @remarks shown in the UI */
  displayName: string;
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
