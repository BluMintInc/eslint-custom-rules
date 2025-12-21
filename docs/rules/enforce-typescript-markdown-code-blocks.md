# Ensure Markdown fenced code blocks without a language specifier default to typescript for consistent highlighting (`@blumintinc/blumint/enforce-typescript-markdown-code-blocks`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

TypeScript snippets in Markdown lose syntax highlighting when the fenced code block lacks a language specifier. This rule labels unlabeled triple-backtick blocks in `.md` files as `typescript` so readers keep type annotations and keywords highlighted.

### Examples

#### ❌ Incorrect

<!-- markdownlint-disable MD031 MD040 -->
````markdown
```
const example = 'TypeScript code without a language specifier';
```
````

````markdown
  ```
  const underList = 'still needs a language specifier';
  ```
````
<!-- markdownlint-enable MD031 MD040 -->

#### ✅ Correct

````markdown
```typescript
const example = 'TypeScript code with proper highlighting';
```
````

````markdown
```javascript
const jsExample = 'Other languages stay untouched';
```
````

Empty fenced blocks stay unlabeled because no content needs highlighting:

````markdown
```
```
````

## Options

This rule does not have any options.

## When Not To Use It

Disable this rule if your documentation intentionally leaves fenced blocks untyped (for example, when demonstrating plain text) or if you do not lint Markdown files with ESLint.
