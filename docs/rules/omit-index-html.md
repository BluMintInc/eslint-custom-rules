# Disallow the use of "index.html" in URLs (`@blumintinc/blumint/omit-index-html`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

The string `"index.html"` in URLs is usually unnecessary and can be omitted for cleaner, more user-friendly links. Many web servers automatically resolve a directory request to `index.html`, making the explicit inclusion redundant. This rule ensures URLs are optimally structured for improved readability and accessibility.

### Examples

#### ❌ Incorrect

```js
const homepage = "https://example.com/index.html";
const aboutPage = "https://example.com/about/index.html";
```

#### ✅ Correct

```js
const homepage = "https://example.com/";
const aboutPage = "https://example.com/about/";
```

## Options

This rule has an object option:

- `"allowWithQueryOrHash": true` (default) - Allows `index.html` in URLs with query parameters or hash fragments
- `"allowWithQueryOrHash": false` - Enforces removal of `index.html` even in URLs with query parameters or hash fragments

### allowWithQueryOrHash: true (default)

```js
// Allowed
const pageWithParams = "https://example.com/index.html?ref=source";
const pageWithHash = "https://example.com/index.html#section";
```

### allowWithQueryOrHash: false

```js
// Not allowed
const pageWithParams = "https://example.com/index.html?ref=source"; // Should be "https://example.com/?ref=source"
const pageWithHash = "https://example.com/index.html#section"; // Should be "https://example.com/#section"
```

## When Not To Use It

If your project requires explicit `index.html` references for compatibility with specific systems or frameworks, you may want to disable this rule.
