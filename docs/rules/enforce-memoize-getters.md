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

- Applies only to private instance getters (`get` accessors with `private` accessibility).
- Ignores static getters.
- Recognizes `@Memoize`, `@Memoize()`, and namespaced forms like `@ns.Memoize()`.
- Auto-fix adds `@Memoize()` and imports `Memoize` from `@blumintinc/typescript-memoize` if missing, without duplicating existing imports or aliases.
- For ephemeral getters by design, use a targeted disable comment on the getter.

```ts
// eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters -- ephemeral by design
private get timestamp() { return Date.now(); }
```

### Interaction with inline disable comments

The `import { Memoize } from '@blumintinc/typescript-memoize';` statement is
added once per file, attached to the fix of the first violation that is **not**
suppressed by an inline `eslint-disable` directive. Suppressing an individual
getter therefore never strands the remaining `@Memoize()` decorators without
their import:

```ts
class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get timestamp() { return Date.now(); }  // left alone

  private get fetcher() { return createFetcher(); }  // fixed, and carries the import
}
```
