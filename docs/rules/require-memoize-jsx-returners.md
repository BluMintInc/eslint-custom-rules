# Require @Memoize() for JSX-returning getters and methods (`@blumintinc/blumint/require-memoize-jsx-returners`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why

Getters and methods that return JSX (or factories that produce JSX) create a brand-new component function on every access. That new reference forces React to treat the result as a different component, triggering unnecessary renders and sometimes full remounts. Decorating these factories with `@Memoize()` preserves a stable reference so components only re-render when their inputs change.

## Bad

```ts
class ProviderFactory {
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}
```

## Good

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class ProviderFactory {
  @Memoize()
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}
```

## Notes

- Applies to instance getters and methods that return JSX directly or return functions that produce JSX (including nested `() => () => <div />` patterns).
- Skips static members, so it does not conflict with `no-memoize-on-static`.
- Functions inside React components that rely on hooks (e.g., `useCallback`, `useMemo`) are out of scope because the rule only inspects class members.
- Recognizes `@Memoize`, aliased imports, and namespaced forms like `@memoize.Memoize()`. Auto-fix reuses existing aliases and inserts `import { Memoize } from '@blumintinc/typescript-memoize';` if missing.
- When other decorators exist, `@Memoize()` is added without removing them; multiple violations in a file share a single inserted import.
