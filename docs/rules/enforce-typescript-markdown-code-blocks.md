# Ensure Markdown fenced code blocks without a language specifier default to typescript for consistent highlighting (`@blumintinc/blumint/enforce-typescript-markdown-code-blocks`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

TypeScript snippets in Markdown lose syntax highlighting when the fenced code block lacks a language specifier. This rule labels unlabeled triple-backtick blocks in `.md` files as `typescript` so readers keep type annotations and keywords highlighted.

### Scope

The rule labels a fence only when CommonMark agrees it is one, because anything else is literal document content that must not be rewritten. Declining to label a block also means declining to read it: every block below is skipped from its opening line to past its closing line, so a triple-backtick line inside one is never mistaken for a fence of its own.

- The opening fence may be indented at most **three columns**, a tab counting as an advance to the next multiple of four. At four or more columns the line opens an *indented code block*, and its backticks are text.
- Only a run of **exactly three** backticks, closed by a run of exactly three at the same indent, is labeled. A longer opening run — as in this page's own examples — or a longer closing run leaves the block unlabeled and unread.
- A `~~~` fence is skipped whole. Its interior is literal, and unlike a backtick fence its info string may itself contain backticks.
- A fence that already carries an info string, and an empty block, are left alone.
- A fence with no closing run reaches the end of the file, so the rule stops there rather than reading what the block encloses.

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

Four-column indentation makes an indented code block, so its backticks are content rather than a fence:

````markdown
    ```
    const literal = 'left exactly as written';
    ```
````

A run of four or more backticks, and a `~~~` fence, are skipped whole, so a triple-backtick block quoted inside either keeps its backticks:

`````markdown
````markdown
```
const quoted = 'part of the outer block, not a fence of its own';
```
````
`````

````markdown
~~~markdown
```
const alsoQuoted = 'inside the tildes, so not a fence either';
```
~~~
````

## When Not To Use It

Disable this rule if your documentation intentionally leaves fenced blocks untyped (for example, when demonstrating plain text) or if you do not lint Markdown files with ESLint.
