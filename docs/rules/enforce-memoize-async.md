# Enforce @Memoize() decorator on async methods with 0-1 parameters to cache results and prevent redundant API calls or expensive computations. This improves performance by reusing previous results when the same parameters are provided, particularly useful for data fetching methods (`@blumintinc/blumint/enforce-memoize-async`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Async methods that hit the network or perform heavy work should not repeat identical calls. This rule requires decorating async instance methods with zero or one parameter with `@Memoize()` (from `@blumintinc/typescript-memoize`) so results are cached per argument. The fixer adds the import and decorator for you.

## Rule Details

This rule reports when:

- An async, non-static class method with 0–1 parameters lacks a `@Memoize()` decorator.
- The method already has decorators, but none are `Memoize` (any alias imported from `@blumintinc/typescript-memoize` or the legacy `typescript-memoize` is respected for backward compatibility).

The rule skips:

- Methods with two or more parameters (caching would be ambiguous).
- Static methods.
- Methods already decorated with `@Memoize()` or a namespaced equivalent (e.g., `@memo.Memoize()`).

### Examples of **incorrect** code for this rule:

```ts
class UserRepo {
  async fetchUser(id: string) { return api.getUser(id); }          // ❌
  async currentUser() { return api.getCurrent(); }                 // ❌
}
```

### Examples of **correct** code for this rule:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class UserRepo {
  @Memoize()
  async fetchUser(id: string) { return api.getUser(id); }

  @Memoize()
  async currentUser() { return api.getCurrent(); }
}
```

## When Not To Use It

- Methods whose results must always be fresh (e.g., real-time data or mutation calls).
- Codebases that use a different memoization strategy; disable locally if another decorator already caches results.

## Further Reading

- [`@blumintinc/typescript-memoize` documentation](https://www.npmjs.com/package/@blumintinc/typescript-memoize)
