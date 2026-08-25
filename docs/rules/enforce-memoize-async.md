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
- Methods that **take part in a database transaction** — one that opens a
  `runTransaction(…)` call, or one handed the attempt's `Transaction` handle
  (see [Methods that take part in a transaction](#methods-that-take-part-in-a-transaction)).
- Methods declared in a class **expression** (`const Loader = class { … }`),
  where no decorator is legal at all (see
  [Methods on a class expression](#methods-on-a-class-expression)).
- Methods with a **private name** (`async #load() { … }`), where no decorator is
  legal either (see [Methods with a private name](#methods-with-a-private-name)).

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

### Where the decorator is written

The auto-fix attaches `@Memoize()` to the **method**, ahead of its modifiers and
of any decorator it already carries — not to the start of the line the method
happens to sit on. A method that owns its line receives the decorator on a line
of its own at the method's indentation; a method that shares its line — a
single-line class body, a method following the class's own `{` or a property
declaration — receives it inline, a spelling the grammar accepts just as
readily:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class UserRepo {
  @Memoize()
  async currentUser() { return api.getCurrent(); }
}

class Compact { @Memoize() async currentUser() { return api.getCurrent(); } }
```

A method that already carries a decorator of its own gets one more, and that
changes the layout: a formatter keeps a **single** decorator wherever the author
put it, but gives **each** of two or more a line of its own. So a decorator
written inline is broken out along with the insertion, rather than left for a
formatter to move on its next run:

```ts
// Before
import { Memoize } from '@blumintinc/typescript-memoize';

class UserRepo {
  @Log() async currentUser() { return api.getCurrent(); }
}

// After --fix
import { Memoize } from '@blumintinc/typescript-memoize';

class UserRepo {
  @Memoize()
  @Log()
  async currentUser() { return api.getCurrent(); }
}
```

A comment trailing the existing decorator stays with it — that is where it was
attached — so the break lands after the comment (`@Log() /* c */`), never
between the decorator and it.

### Where the injected import is written

The `import { Memoize } …` the fix adds when the file lacks one is placed below
the file's prologue — a `'use client'` / `'use server'` directive, a `#!`
shebang, a header comment — and above the first existing import. A directive is
a directive only while it is the **first** statement, so an import spliced above
one would silently demote it to an ordinary expression statement: still valid
TypeScript, still reported clean by ESLint, but no longer read by the bundler.

Where the anchor owns its line the import takes that line and the displaced
statement keeps its indentation. Where the anchor shares its line with the
prologue, the import is written inline after it rather than above it:

```ts
'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
class UserRepo {
  @Memoize()
  async currentUser() { return api.getCurrent(); }
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

### Methods that hand back a resource handle

A method whose declared result is an object carrying a **function-valued
member** — the closure that releases what the call allocated — is exempt. Such a
method is the allocation point for a resource its caller owns, and caching it is
not a performance win with a staleness caveat, it is a correctness failure:

- **The handle is unique per call.** Two concurrent callers must hold two
  distinct leases, or the pool's accounting under-counts and overcommits the
  machine.
- **The handle belongs to the caller that asked for it.** The returned closure
  disposes one specific resource, so a `finally { admission.release(); }` in
  caller A deletes caller B's lease.
- **The result is stateful over time.** A second call minutes later must
  re-evaluate a pool whose contents have changed entirely.

With `@Memoize()` applied, N concurrent callers share one lease and one release
closure. The first `release()` frees it, and the remaining N-1 keep running
against budget nobody accounts for. The failure is silent and load-dependent, so
`--fix` ships it past a green concurrency suite: the tests that protect the
invariant keep passing while the invariant is gone. The `Promise<void>`
exemption cannot reach this shape, because the method returns a value — and the
value is the problem.

```ts
type Admission = { readonly reservedMb: number; readonly release: () => void };

class ExecutionGovernor {
  // ✅ not reported: each caller needs its own lease and its own release
  public async admit(spec: JobSpec): Promise<Admission> {
    while (!this.hasRoom(spec)) {
      await delay(750);
    }
    const release = this.store.claim(spec);
    return { reservedMb: spec.reservedMb, release };
  }

  // ❌ still reported: a quota reading is data, and data is what a cache is for
  public async quota(poolId: string): Promise<{ reservedMb: number; limitMb: number }> {
    return this.store.quota(poolId);
  }
}
```

The shapes the annotation can take:

| annotation | read as a handle |
|---|---|
| `Promise<{ id: string; release: () => void }>` | yes |
| `Promise<{ id: string; release(): void }>` — a method signature | yes |
| `Promise<{ path: string; [Symbol.dispose](): void }>` | yes |
| `readonly release: () => void`, `release?: () => void`, `release: (() => void) \| undefined` | yes |
| `Promise<Admission>`, where `Admission` is a `type` or `interface` declared in the same file | yes |
| `Promise<Admission[]>`, `Promise<readonly Admission[]>`, `Promise<Readonly<Admission>>` | yes |
| `Promise<Base & { release: () => void }>`, `Promise<Admission \| null>` | yes |
| `Promise<{ spec: JobSpec; admission: { release: () => void } }>` — nested | yes |
| `Promise<{ id: string; name: string }>` | no |
| `Promise<() => void>` | no |
| `Promise<Map<string, Admission>>` | no |

A union arm carrying the closure is enough, which is the opposite of the reading
the [callback-parameter carve-out](#methods-keyed-only-by-a-callback) gives a
union — and for a reason the two questions do not share. There, the question is
whether an argument can key a cache, and `cb: string | (() => void)` need not be
the arm that cannot. Here, the question is whether a caller can be handed
somebody else's closure, and the caller who receives the callable arm is handed
exactly that. One hazardous arm is enough, as it is for a
[transaction handle](#methods-that-take-part-in-a-transaction).

The test is **structural, not a list of member names.** `release`, `dispose`,
`close` and `unsubscribe` are the spellings that come to mind, but `free`,
`cancel`, `destroy`, `abort` and `[Symbol.dispose]` are the same member, and a
list omitting any of them re-reports the very method the carve-out exists for —
the harmful direction, since the report carries a fixer that applies unattended.
Reading the shape instead costs the opposite error: an object that merely bundles
a callback with its data goes unreported. That is the cheaper error, and a small
one, because an async method whose result carries a closure is already sharing
that closure's captured state with every caller a cache would serve.

Because the decision is read off the annotation, the annotation has to survive
the same `eslint --fix` run.
[`no-explicit-return-type`](./no-explicit-return-type.md) preserves a
handle-shaped return type for exactly this reason, from the same predicate
(`src/utils/resourceHandleType.ts`), so the two rules cannot disagree about what
a handle is. Without that, `--fix` would strip the annotation and then memoize
the method it had just stopped being able to recognise, in one unattended pass.

Like the other carve-outs, this reads the **declared annotation**: the rule is
syntactic and does not require `parserOptions.project`. These therefore keep
reporting:

- A **bare callable result** (`Promise<() => string>`). The closure is the whole
  result, with no resource paired to it whose accounting a shared reference
  corrupts. It is how a compiled template, a prepared query or a resolved
  renderer comes back, and computing one once is the point of asking.
- A handle type **imported from another module**
  (`import { Admission } from './types'`). Resolution is lexical and same-file, so
  a name declared elsewhere is unreadable here.
- An **unannotated** method whose body happens to build a handle. Without an
  annotation there is no declaration of intent to honour, and inferring one would
  need type information this rule does not take.
- An **index signature** of callables (`{ [event: string]: () => void }`), which
  is a lookup table of handlers a second caller shares without losing anything the
  first one owned, and a **getter signature** (`{ get name(): string }`), which is
  a property access wearing a parameter list.
- A **two-argument container** (`Promise<Map<string, Admission>>`), which
  describes a registry the method looked handles up in rather than a handle the
  call allocated.

To exempt one of those, declare the handle type in the file that returns it, or
suppress the report deliberately:

```ts
import { Admission } from './types';

class Governor {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async -- every call claims its own lease
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
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

### Methods that take part in a transaction

A transaction handle is valid only for the **attempt** that created it, and an
attempt is re-run whenever the driver retries — Firestore retries an attempt
whose reads a concurrent write invalidated. `@Memoize()` on a transaction body
hands the retry the first attempt's cached promise, so the retry queues no
writes on its own handle, commits empty, and the caller reads the first
attempt's return value and reports success. The failure is silent and defeats
the very concurrency the transaction was written for. Memoizing the method that
**owns** the call is the same defect one level up: the whole transaction, writes
included, then runs once per instance.

Three shapes are exempt:

| shape | example |
|---|---|
| a parameter typed as the handle | `apply(transaction: Transaction)`, `apply({ transaction }: { transaction: Transaction })`, `apply(tx: FirebaseFirestore.Transaction)` |
| a method that opens a transaction | `create() { return db.runTransaction(async (t) => …); }` |
| a method the callback hands the attempt to | `db.runTransaction((t) => this.body(t))`, `db.runTransaction(this.body)` |

```ts
class MembershipSecretary {
  // ✅ not reported: memoizing the owner would run the whole transaction,
  // writes included, once per instance
  public async create() {
    return db.runTransaction(async (transaction) => {
      return this.applyMembership({ transaction });
    });
  }

  // ✅ not reported: a retried attempt must re-run this body against its own
  // handle, and a cached promise would let the retry commit empty
  private async applyMembership({ transaction }: { transaction: Transaction }) {
    transaction.set(this.membershipRef, { joined: true });
    return true;
  }

  // ❌ still reported: it neither opens a transaction nor receives a handle
  public async loadPlan() {
    return this.api.getPlan();
  }
}
```

The qualified spellings (`FirebaseFirestore.Transaction`,
`admin.firestore.Transaction`) and an aliased import
(`import { Transaction as Txn }`) are read as the handle they name. Where the
handle's type is behind an alias the rule cannot resolve (`args: MembershipArgs`),
the call site inside the callback is what recognises the method — passing the
handle on is the signal, so a helper the callback calls **without** it keeps
reporting and stays worth caching.

Like the other carve-outs, this reads the **declared annotation** rather than the
parameter's name: a parameter merely named `transaction` is as likely to hold a
payment or a ledger entry, and those key a cache perfectly well. So
`record(transaction: PaymentTransaction)` and an **unannotated**
`apply(transaction)` both keep reporting, as does a method that merely produces a
handle (`open(): Promise<Transaction>`) or holds a collection of them
(`summarize(byId: Map<string, Transaction>)`).

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

### Methods with a private name

A method whose key is a **private name** — `#load`, the `#` form of privacy — is
never reported. Under `experimentalDecorators` TypeScript rejects a decorator on
such a member outright: `@Memoize()` written above it, or inline ahead of it, is
`TS1206: Decorators are not valid here.` The message's only remedy is "add
`@Memoize()` above the method", which cannot be written on that member at all,
so report and fix are both withheld — a report naming an edit its reader cannot
make is worse than silence.

```ts
// Not reported: `@Memoize()` cannot be written on any of these members.
export class Loader {
  async #load() {
    return 1;
  }

  async #fetch(id: string) {
    return id;
  }
}

export class Compact {
  #cache = 1;
  async #warm() {
    return this.#cache;
  }
}
```

The restriction is on the member's **name**, not on privacy. The `private`
modifier is an ordinary member name as far as decorators are concerned, so it
keeps reporting and fixing, as do `protected` and public methods:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

export class Loader {
  @Memoize()
  private async load() {
    return 1;
  }

  @Memoize()
  protected async fetch() {
    return 2;
  }
}
```

That is also the remedy for a `#private` method whose result is worth caching:
express its privacy with the modifier. Nothing is lost by the silence otherwise
— a `#private` member is unnameable outside its class, so no caller elsewhere
depends on the cache.

The carve-out reads the member's key, so a member whose name merely contains a
`#` — a string-literal key spelled `'#load'` — is an ordinary member name and
keeps reporting and fixing. A `#private` **property** is not a method and is
irrelevant to the methods declared beside it.

Because such a method never reports, it never claims the file's import carrier
either: the single injected
`import { Memoize } from '@blumintinc/typescript-memoize';` rides on a violation
that does fix, and a file whose only candidates are private-named is left
untouched — no report, no decorator, no orphan import:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

export class Loader {
  async #load() {
    return 1;
  }

  @Memoize()
  public async fetch() {
    return 2;
  }
}
```

This matches `enforce-memoize-getters`, which withholds report and fix on the
same ground. The carve-out is mode-dependent in the same way the
class-expression one is: standard (TC39) decorators do accept a private-named
member, so targeting `experimentalDecorators: false` calls for revisiting it.

## When Not To Use It

- Methods whose results must always be fresh (e.g., real-time data or mutation calls).
- Codebases that use a different memoization strategy; disable locally if another decorator already caches results.

## Further Reading

- [`@blumintinc/typescript-memoize` documentation](https://www.npmjs.com/package/@blumintinc/typescript-memoize)
