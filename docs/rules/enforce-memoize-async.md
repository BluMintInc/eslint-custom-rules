# Enforce @Memoize() decorator on async methods with 0-1 parameters to cache results and prevent redundant API calls or expensive computations. Without memoization, repeated calls trigger redundant requests or expensive computations, increasing latency. @Memoize() caches results by parameter, ensuring subsequent calls with identical inputs return immediately (`@blumintinc/blumint/enforce-memoize-async`)

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
- Methods whose **declared** return type is `void` or `Promise<void>` (see
  [Methods declared to produce no value](#methods-declared-to-produce-no-value)).

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

  // Declared to produce no value, so there is nothing to cache
  async invalidate(): Promise<void> { await api.purge(); }
}
```

### Methods declared to produce no value

A method annotated `void` or `Promise<void>` is exempt. Memoizing one is not an
optimisation, it is a behaviour change:

- **There is nothing to cache.** The rule's stated benefit — returning a stored
  result to the next caller — is unobtainable when the method promises no
  result.
- **The side effect stops repeating.** `@Memoize()` caches the promise, so the
  body runs once per instance and every later call resolves the stored promise
  without doing the work. A flush, a commit, a retry, or a token re-mint
  silently becomes a no-op after its first invocation.

Because this rule is fixable, `--fix` would apply that change unattended, so the
exemption keeps the fixer away from these methods entirely:

```ts
class OutboxWriter {
  // ✅ not reported: each call must actually commit
  public async flushPendingWrites(): Promise<void> {
    await this.batch.commit();
  }

  // ✅ not reported
  private async cleanStagingTable(tableId: string): Promise<void> {
    await this.bq.dataset(tableId).delete();
  }

  // ❌ still reported: it returns a value worth caching
  public async pendingCount(): Promise<number> {
    return this.batch.size;
  }
}
```

The exemption reads the **declared annotation** from the AST — this rule is
syntactic and does not require `parserOptions.project`, so it cannot consult
inferred types. Two consequences:

- Whitespace and line breaks inside the annotation are irrelevant, since the
  decision comes from the type node rather than its text.
- A method that merely lacks a `return <expr>` in its body is **not** exempt.
  Without an annotation there is no declaration of intent to honour, and
  inferring one would silently drop methods the author never marked value-less.

Anything that can carry a value keeps reporting, including `Promise<void | undefined>`,
`Promise<undefined>`, a bare `Promise`, a type parameter such as `Promise<T>`, and
any wrapper other than `Promise`. To exempt one of those, annotate the method
`Promise<void>` or suppress the report deliberately:

```ts
class TokenClient {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async -- the 401 path must re-mint on every 401
  public async mintToken(): Promise<string> { return api.mint(); }
}
```

### Interaction with inline disable comments

The `import { Memoize } from '@blumintinc/typescript-memoize';` statement is
added once per file, attached to the fix of the first violation that is **not**
suppressed by an inline `eslint-disable` directive. Suppressing an individual
method therefore never strands the remaining `@Memoize()` decorators without
their import:

```ts
class UserRepo {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  async currentUser() { return api.getCurrent(); }  // left alone

  async fetchUser(id: string) { return api.getUser(id); }  // fixed, and carries the import
}
```

### When the fix is withheld

The fix emits a bare `@Memoize()` decorator and inserts
`import { Memoize } from '@blumintinc/typescript-memoize';`. Both halves break
when the name `Memoize` already resolves to something else at the method:

- A module-scope `const`/`function`/`class` named `Memoize`, or an import of
  that name from another module, collides with the inserted import
  (TS2440 / TS2300).
- A shadowing parameter, a block-scoped binding, or an enclosing
  `class Memoize` captures the emitted decorator with **no** compile error at
  all, so the method is decorated with the shadow rather than the memoizer.
- A type-only import erases at compile time and cannot back a decorator.

The rule resolves `Memoize` through the scope chain at the method and withholds
the fix whenever the visible binding is anything other than a named, value
`Memoize` specifier imported from `@blumintinc/typescript-memoize` or
`typescript-memoize` (a namespace or default import binds a different value, so
it counts as a collision too). The `requireMemoize` report still fires; only the
automated edit is skipped, leaving the clash for the author to resolve:

```ts
const Memoize = 1; // a local of the same name

export class Service {
  async load() { return Memoize; } // reported, but left untouched by --fix
}
```

A file that already imports the decorator reuses that import instead of gaining
a second one, and an aliased import (`import { Memoize as Cache }`) emits
`@Cache()` — which references no bare `Memoize` — so an unrelated `Memoize`
binding never blocks it.

## When Not To Use It

- Methods whose results must always be fresh (e.g., real-time data or mutation calls).
- Codebases that use a different memoization strategy; disable locally if another decorator already caches results.

## Further Reading

- [`@blumintinc/typescript-memoize` documentation](https://www.npmjs.com/package/@blumintinc/typescript-memoize)
