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
- Methods whose sole parameter is **annotated as a function type** (see
  [Methods keyed only by a callback](#methods-keyed-only-by-a-callback)).
- Methods declared in a class **expression** (`const Loader = class { … }`),
  where no decorator is legal at all (see
  [Methods on a class expression](#methods-on-a-class-expression)).

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

  // Keyed only by a callback, which cannot serve as a cache key
  async authorize(presentUrl: (url: string) => Promise<void>) {
    return api.authorize(presentUrl);
  }
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

### Methods keyed only by a callback

A method whose sole parameter is annotated as a function type — a callback, a
continuation, a visitor — is exempt. `@Memoize()` keys the cache on the argument
value, compared against the stored entries by deep equality, and a function
argument answers that comparison in exactly two ways. Both defeat the decorator:

| the caller passes | what happens |
|---|---|
| a **stable** reference (a module-level function, a bound method, `this.handler`) | the second call returns the first call's result and the method body never runs again |
| a **fresh arrow per call** — the common shape | every lookup misses, the map accumulates one dead closure per call, and each later call pays a longer deep-equal scan |

Neither is an optimisation, and `--fix` would apply it unattended. The failure is
silent and can be severe: a method that mints a credential per account, driven by
one shared presenter callback, hands every account the first account's
credential.

```ts
class IsolatedLogin {
  // ✅ not reported: each call mints a credential for a different account
  public async run(presentAuthorizeUrl: (url: string) => Promise<void>) {
    await presentAuthorizeUrl(this.authorizeUrl);
    return this.readCredential();
  }

  // ❌ still reported: an account id is a usable cache key
  public async credential(accountId: string) {
    return this.store.get(accountId);
  }
}
```

The parameter's wrapper shape does not matter — an optional parameter
(`onUrl?: (u: string) => void`), a default value
(`onUrl: (u: string) => void = () => {}`), and a rest element are each read
through to the same annotation.

Like the return-type exemption, this reads the **declared annotation**: the rule
is syntactic and cannot resolve a name to the type behind it. So the carve-out is
deliberately limited to an annotation written as a function type, and everything
else keeps reporting:

- A callback behind a **type alias** (`onUrl: UrlPresenter`) is
  indistinguishable from any other type reference.
- A **union** (`cb: string | (() => void)`) is not categorically a function — the
  caller may pass the string, which keys a cache fine.
- A **constructor type** (`ctor: new () => Thing`), an **array** of callbacks,
  and an **unannotated** parameter likewise declare nothing the rule can honour.

To exempt one of those, annotate the parameter with the function type itself or
suppress the report deliberately.

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

### Methods inside a `jest.mock` factory

The fix is withheld for one more reason: a method inside a `jest.mock`,
`jest.doMock` or `jest.setMock` **module factory**. Jest hoists that factory
above every import in the file, and permits it to read only globals and bindings
whose name begins with `mock` — a `Memoize` reference there fails the transform
(`Invalid variable access: Memoize`) and takes the whole suite down with it. The
report still fires, and two remedies the factory can hold are available to the
author:

```ts
jest.mock('../FirestoreFetcher', () => {
  // Legal: the decorator is loaded inside the hoisted factory.
  const { Memoize } = jest.requireActual('@blumintinc/typescript-memoize');

  class FirestoreFetcherMock {
    @Memoize()
    public async fetch() {
      return [];
    }
  }

  return { FirestoreFetcher: FirestoreFetcherMock };
});
```

```ts
// Legal: the `mock` prefix puts the alias on Jest's allowlist.
import { Memoize as mockMemoize } from '@blumintinc/typescript-memoize';

jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    @mockMemoize()
    public async fetch() {
      return [];
    }
  }

  return { FirestoreFetcher: FirestoreFetcherMock };
});
```

A mock is usually a stand-in whose caching is beside the point, so an inline
`eslint-disable-next-line` on the method is equally appropriate.

Only the factory — the registrar's second argument — declines on this ground. A
method in the module specifier position, inside a `jest.fn` callback, or
anywhere else in the file is fixed as usual, and a declining factory never
claims the import: the injected
`import { Memoize } from '@blumintinc/typescript-memoize';` rides on the first
violation that does fix.

### Methods on a class expression

A method inside a class **expression** is never reported. Under
`experimentalDecorators` — the mode this plugin's consumers compile in —
TypeScript accepts a member decorator only inside a class **declaration**: the
same `@Memoize()` that compiles inside `class C {}` is
`TS1206: Decorators are not valid here.` inside a class expression, whatever the
member is named and wherever the decorator is written. The only remedy this
rule's message offers is "add `@Memoize()` above the method", which cannot be
written there at all, and a report naming an edit its reader cannot make is
worse than silence.

The carve-out covers every spelling of the shape — anonymous, named, returned
from a factory, passed as an argument, instantiated in place, or held in an
object property, a class property or a parameter default:

```ts
// Not reported: `@Memoize()` cannot be written on any of these members.
const Loader = class {
  public async load() {
    return 1;
  }
};

export const Named = class NamedLoader {
  public async load() {
    return 1;
  }
};

export function build() {
  return class {
    public async load() {
      return 1;
    }
  };
}

register(
  class Arg {
    public async load() {
      return 1;
    }
  },
);
```

To memoize such a method, give the class a **declaration**, which takes
decorators normally:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}

export { Loader };
```

Every declaration form is reported and fixed, including an anonymous
`export default class {}`, which is a declaration despite having no name:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

export default class {
  @Memoize()
  public async load() {
    return 1;
  }
}
```

The carve-out is keyed on the method's own enclosing class rather than on any
ancestor, so a class declaration nested inside a class expression's method is
still reported and still fixed:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

const Outer = class {
  public build() {
    class Inner {
      @Memoize()
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
};
```

Because such a method never reports, it never claims the file's import carrier
either: the single injected
`import { Memoize } from '@blumintinc/typescript-memoize';` rides on a violation
that does fix, and a file whose only candidates sit in class expressions is left
untouched — no report, no decorator, no orphan import.

This matches the sibling rules `enforce-memoize-getters` and
`require-memoize-jsx-returners`, which withhold report and fix on the same
ground. Should this plugin ever target standard (TC39) decorators —
`experimentalDecorators: false`, where a class expression's members do accept
decorators — the carve-out becomes mode-dependent and needs revisiting.

## When Not To Use It

- Methods whose results must always be fresh (e.g., real-time data or mutation calls).
- Codebases that use a different memoization strategy; disable locally if another decorator already caches results.

## Further Reading

- [`@blumintinc/typescript-memoize` documentation](https://www.npmjs.com/package/@blumintinc/typescript-memoize)
