# Enforce @Memoize() decorator on private class getters to avoid re-instantiation and preserve state across accesses (`@blumintinc/blumint/enforce-memoize-getters`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why

Getters are often used as lazy factories for objects like fetchers, clients, or adapters. Without memoization, each access produces a new instance, causing state loss and redundant setup. Memoizing private getters ensures stable instances across accesses.

## Bad

```ts
class Example {
  private get fetcher() {
    return createFetcher(); // New instance each access
  }
}
```

## Good

```ts
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  private get fetcher() {
    return createFetcher(); // Stable instance
  }
}
```

## Notes
- Applies only to private instance getters (`get` accessors with `private` accessibility`).
- Ignores static getters.
- Recognizes `@Memoize`, `@Memoize()`, and namespaced forms like `@ns.Memoize()`.
- Auto-fix adds `@Memoize()` and imports `Memoize` from `@blumintinc/typescript-memoize` if missing, without duplicating existing imports or aliases.
- For ephemeral getters by design, use a targeted disable comment on the getter.

```ts
// eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters -- ephemeral by design
private get timestamp() { return Date.now(); }
```