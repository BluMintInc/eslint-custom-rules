# Disallow the use of "index.html" in URLs (`@blumintinc/blumint/omit-index-html`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Explicitly naming `index.html` in URLs is redundant because web servers already serve the directory index by default. Keeping the file name produces multiple URLs for the same page (`/index.html` vs `/`), which fragments caching, canonical links, and analytics. This rule enforces the canonical, trailing-slash form so links stay stable for browsers, CDNs, and search engines.

### Why this rule matters

- Reduces duplicate URLs: `/index.html` and `/` become a single canonical address.
- Prevents cache fragmentation: CDNs treat each URL as a separate asset.
- Keeps deep links stable: relative asset paths and router rewrites expect directory roots, not the index file name.

### Examples

#### ❌ Incorrect

```js
const homepage = "https://example.com/index.html";
const aboutPage = "https://example.com/about/index.html";
const withParams = "https://example.com/index.html?ref=source"; // when allowWithQueryOrHash is false
const dynamic = `https://example.com/${page}/index.html`;
```

#### ✅ Correct

```js
const homepage = "https://example.com/";
const aboutPage = "https://example.com/about/";
const withParams = "https://example.com/?ref=source"; // when allowWithQueryOrHash is false
const dynamic = `https://example.com/${page}/`; // drop index.html from the static parts
```

## Options

This rule has an object option:

- `"allowWithQueryOrHash": true` (default) - Allows `index.html` when a query or hash is present. Use this if your router requires the file name when parameters are involved.
- `"allowWithQueryOrHash": false` - Enforces the canonical form even when a query or hash is present, keeping cache keys and analytics consistent.

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

## Template literals

- The rule flags `/index.html` that appears in the static portions of a template literal, even when expressions are present.
- Template literals are not auto-fixed; adjust the static pieces so the rendered URL resolves to the directory path (error messages include a backticked example such as `` `https://example.com/${page}/` ``).

## When Not To Use It

If your project requires explicit `index.html` references for compatibility with specific systems or frameworks, you may want to disable this rule.
