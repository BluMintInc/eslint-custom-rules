# Enforces pinned dependencies (`@blumintinc/blumint/no-unpinned-dependencies`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Unpinned dependencies can cause problems, including hard to diagnose breaking changes.

## Rule Details

This rule aims to prevent the use of unpinned dependencies.

Examples of **incorrect** code for this rule:

```json

{dependencies: {eslint: "^8.19.0"}}
{dependencies: {eslint: "~8.19.0"}}

```

Examples of **correct** code for this rule:

```json

{dependencies: {eslint: "8.19.0"}}

```

## When Not To Use It

If pinned dependencies are ok in your codebase.
