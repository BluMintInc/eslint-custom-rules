# Enforce useDeepCompareMemo instead of useMemo when dependency arrays contain non-primitive values that are not already memoized. This prevents unnecessary re-renders caused by reference equality checks failing for structurally identical but newly created objects, arrays, or functions (`@blumintinc/blumint/enforce-use-deep-compare-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->
