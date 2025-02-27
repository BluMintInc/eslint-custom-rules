# Enforce using safe-stable-stringify instead of JSON.stringify to handle circular references and ensure deterministic output. JSON.stringify can throw errors on circular references and produce inconsistent output for objects with the same properties in different orders. safe-stable-stringify handles these cases safely (`@blumintinc/blumint/enforce-safe-stringify`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->
