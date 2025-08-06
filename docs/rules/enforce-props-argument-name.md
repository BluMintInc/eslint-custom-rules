# Enforce that parameters with types ending in "Props" should be named "props" (`@blumintinc/blumint/enforce-props-argument-name`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Options

This rule accepts an options object with the following properties:

```js
{
  // If true, enforces destructuring of props objects in function parameters
  "enforceDestructuring": false,
  // If true, ignores interfaces that extend from external libraries
  "ignoreExternalInterfaces": true
}
```
