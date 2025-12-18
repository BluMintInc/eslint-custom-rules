# Require JSDoc above fields (`@blumintinc/blumint/jsdoc-above-field`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Ensures JSDoc-style comments live directly above the fields they describe (interfaces, type literals, class fields, and optionally object literals) instead of trailing on the same line. Inline JSDoc after a field is ignored by IDE hovers and autocompletion, so the documentation becomes invisible to callers. Moving the block above the declaration keeps the docs attached and also preserves decorator ordering on class fields.

## Rule Details

### ❌ Incorrect

```ts
export type User = {
  phone?: string; /** @remarks stored as +15551234567 */
};

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
