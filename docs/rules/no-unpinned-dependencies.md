# Enforces pinned dependencies (`@blumintinc/blumint/no-unpinned-dependencies`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Pinned versions keep dependency installs reproducible and auditable. Caret (`^`) and tilde (`~`) ranges let package managers upgrade without code review, which introduces unexpected breaking changes and makes build failures hard to diagnose. This rule flags range-based versions in `dependencies` and `devDependencies` and recommends pinning to exact versions.

## Rule Details

The rule inspects `package.json` (including JSON/JSONC) and reports any dependency version that starts with `^` or `~`. Exact versions ensure CI, local development, and deployments all resolve the same artifacts and that security/compliance audits match the versions that were reviewed.

### Why this matters

- Range specifiers resolve to newer releases at install time, bypassing code review.
- Non-deterministic installs create drift between environments and brittle rollbacks.
- Pinned versions keep lockfiles trustworthy and make dependency audits reliable.

Examples of **incorrect** code for this rule:

```json
{
  "dependencies": {
    "eslint": "^8.19.0"
  },
  "devDependencies": {
    "eslint-doc-generator": "~4.5.6"
  }
}
```

Examples of **correct** code for this rule:

```json
{
  "dependencies": {
    "eslint": "8.19.0"
  },
  "devDependencies": {
    "eslint-doc-generator": "4.5.6"
  }
}
```

### How to fix

- Remove `^` or `~` and pin to the exact version you intend to ship.
- Run `npm install` or `npm update <package>@<version>` to refresh your lockfile.
- ESLint `--fix` can strip the range prefixes automatically for this rule.

## When Not To Use It

Disable this rule only if your project intentionally floats dependency versions and accepts non-deterministic installs.
