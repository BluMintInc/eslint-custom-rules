# Prevent using @Memoize() decorator on static methods (`@blumintinc/blumint/no-memoize-on-static`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why

Static memoization shares one cache across every caller for the lifetime of the process. When a static method depends on request-specific context (tenant, locale, user role, or environment flags), caching the result at the class level leaks data between callers and hides configuration changes because the cache never resets with a new instance. Memoization belongs on per-request or per-instance code paths where the lifecycle is scoped and cache invalidation is predictable.

## Rule Details

The rule reports any `@Memoize` decorator (with or without parentheses and including imported aliases) applied to static methods, getters, or setters. Static memoization is treated as unsafe because the cache outlives the callers that produced it. Prefer instance methods or explicit static caches with intentional invalidation.

### ❌ Bad

```ts
import { Memoize } from 'typescript-memoize';

class ConfigLoader {
  @Memoize()
  static load() {
    return fetchConfigFor(requestTenant()); // shared cache mixes tenants
  }
}
```

### ✅ Good

```ts
import { Memoize } from 'typescript-memoize';

class ConfigLoader {
  constructor(private readonly tenant: string) {}

  @Memoize()
  load() {
    return fetchConfigFor(this.tenant); // cache scoped to the instance/request
  }
}
```

### ✅ Good

```ts
class MathUtils {
  static cachedFactorials: Record<number, number> = {};

  static factorial(n: number) {
    const cached = MathUtils.cachedFactorials[n];
    if (cached !== undefined) {
      return cached; // explicit static cache with intentional invalidation point
    }

    const result = computeFactorial(n);
    MathUtils.cachedFactorials[n] = result;
    return result;
  }
}
```

## Notes

- Flags `@Memoize` and any imported alias used on static methods, getters, or setters; instance members are allowed.
- Handles both decorator forms: `@Memoize` and `@Memoize()` with arguments.
- Other decorators on static members do not trigger this rule unless they resolve to `Memoize`.
- For a static cache that truly must be process-wide, add a targeted disable comment with justification.
