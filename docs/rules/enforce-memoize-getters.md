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

### When the fix is withheld

The fix emits a bare `@Memoize()` decorator and inserts
`import { Memoize } from '@blumintinc/typescript-memoize';`. Both halves break
when the name `Memoize` already resolves to something else at the getter:

- A module-scope `const`/`function`/`class` named `Memoize`, or an import of
  that name from another module, collides with the inserted import
  (TS2440 / TS2300).
- A shadowing parameter, a block-scoped binding, or an enclosing
  `class Memoize` captures the emitted decorator with **no** compile error at
  all, so the getter is decorated with the shadow rather than the memoizer.
- A type-only import erases at compile time and cannot back a decorator.

The rule resolves `Memoize` through the scope chain at the getter and withholds
the fix whenever the visible binding is anything other than a named, value
`Memoize` specifier imported from `@blumintinc/typescript-memoize` or
`typescript-memoize` (a namespace or default import binds a different value, so
it counts as a collision too). The `requireMemoizeGetter` report still fires;
only the automated edit is skipped, leaving the clash for the author to resolve:

```ts
const Memoize = 1; // a local of the same name

export class Service {
  private get fetcher() { return Memoize; } // reported, but left untouched by --fix
}
```

A file that already imports the decorator reuses that import instead of gaining
a second one, and an aliased or namespaced decorator (`@Cache()`,
`@Memo.Memoize()`) references no bare `Memoize`, so an unrelated `Memoize`
binding never blocks it.
