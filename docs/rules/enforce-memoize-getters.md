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
- Ignores getters named with an ECMAScript private name (`get #fetcher()`), which admit no decorator (see below).
- Ignores getters declared in a class **expression** (`const Service = class { … }`), where no decorator is legal either (see below).
- Recognizes `@Memoize`, `@Memoize()`, and namespaced forms like `@ns.Memoize()`.
- Auto-fix adds `@Memoize()` and imports `Memoize` from `@blumintinc/typescript-memoize` if missing, without duplicating existing imports or aliases.
- Getters that sample live external state are exempt automatically (see below).
- Getters declared to hand back a resource handle — an object carrying the
  closure that releases what the read allocated — are exempt automatically (see
  below).

### Where the decorator is written

The decorator attaches to the **member**, ahead of its modifiers and of any
decorator it already carries — not to the start of the line the member happens
to sit on. A getter that owns its line receives the decorator on a line of its
own at the getter's indentation; a getter that shares its line receives it
inline, a spelling the grammar accepts just as readily:

```ts
class UserAccount {
  @Memoize()
  private get isLocked() { return true; }
}

class Compact { @Memoize() private get isLocked() { return true; } }
```

A getter that already carries a decorator of its own gets one more, and that
changes the layout: a formatter keeps a **single** decorator wherever the author
put it, but gives **each** of two or more a line of its own. So a decorator
written inline is broken out along with the insertion, rather than left for a
formatter to move on its next run:

```ts
// Before
import { Memoize } from '@blumintinc/typescript-memoize';

class UserAccount {
  @Log() private get isLocked() { return true; }
}

// After --fix
import { Memoize } from '@blumintinc/typescript-memoize';

class UserAccount {
  @Memoize()
  @Log()
  private get isLocked() { return true; }
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
class Session {
  @Memoize()
  private get isLocked() { return true; }
}
```

### Getters named with a private name

`get #fetcher()` is never reported. TypeScript's `experimentalDecorators` mode —
the mode `@blumintinc/typescript-memoize` requires — rejects a decorator on a
`#private` member with **TS1206**, so the remedy this rule prescribes cannot be
written there. `private get #fetcher()` is doubly out of reach: an accessibility
modifier beside a private name is itself a grammar error (**TS18010**). Rename
the getter, or hold the memoized value in a `#private` field the getter reads.

### Getters declared in a class expression

A getter inside a class **expression** is never reported, for the same reason
one level out: under `experimentalDecorators`, TypeScript rejects a decorator on
**every** member of a class expression with **TS1206**, whatever the member is
named. The carve-out covers each spelling of the shape — anonymous, named,
returned from a factory, passed as an argument, or held in an object or class
property:

```ts
// Not reported: `@Memoize()` cannot be written on any of these members.
export const Service = class {
  private get fetcher() { return createFetcher(); }
};

export const Named = class Inner {
  private get fetcher() { return createFetcher(); }
};

export function build() {
  return class {
    private get fetcher() { return createFetcher(); }
  };
}
```

To memoize such a getter, give the class a **declaration**, which takes
decorators normally:

```ts
class Service {
  @Memoize()
  private get fetcher() { return createFetcher(); }
}

export { Service };
```

The carve-out is keyed on the getter's own enclosing class, not on any ancestor:
a class declaration nested inside a class expression's method is still reported
and still fixed, and `export default class { … }` is a declaration despite
having no name, so it is reported too.

If this plugin ever targets standard (TC39) decorators — `experimentalDecorators:
false`, where class expressions do accept decorators — this carve-out becomes
mode-dependent and should be revisited alongside the private-name one.

### Getters that read live external state

Memoizing a getter whose value is a fresh observation of the outside world is
not an optimization — it pins the first observation for the life of the
instance, and every later access reads a value that stopped tracking reality:

```ts
let externalState = 'screen A';
class Probe {
  @Memoize()
  private get screen() { return externalState; }
}
```

Because the fix lands unattended under `eslint --fix`, the rule declines to
report a getter whose body reaches:

- a call through a binding imported from a Node I/O module — `child_process`,
  `fs`, `fs/promises`, `net`, `http`, `https`, `dns`, with or without the
  `node:` prefix;
- a non-deterministic builtin: `Date.now()`, a bare `new Date()`,
  `Math.random()`, `performance.now()`, `crypto.randomUUID()`,
  `crypto.getRandomValues()`, or `process.hrtime()`;
- a read of `process.env`.

The analysis is class-local and transitive: a getter that delegates to a sibling
member which itself delegates further is exempt too, however long the chain.

```ts
import { execFileSync } from 'node:child_process';

class PageProbe {
  private run(args: readonly string[]) {
    return execFileSync('agent-browser', [...args], { encoding: 'utf8' });
  }

  // exempt: `this.run` shells out, so each access must take a fresh snapshot
  private get snapshot() { return this.run(['snapshot', '-i']); }

  // still reported: a lazy factory with a stable result
  private get fetcher() { return new FirestoreFetcher(this.ref); }
}
```

The exemption is deliberately narrow and purely syntactic — the rule runs
without type information. A getter that reaches live state by some other route
(a global mutable module, an injected clock) is still reported; suppress it with
a targeted disable comment on the getter:

```ts
// eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters -- ephemeral by design
private get screen() { return externalState; }
```

### Getters that hand back a resource handle

A getter whose declared result carries a **function-valued member** — the
closure that releases whatever the read allocated — is never reported. Such a
getter allocates a lease for the reader taking it, so it must run per read.
Memoized, every later read receives the **first** reader's live lease and the
release closure bound to it: N readers hold one lease between them while the
pool accounts for N, the first `release()` frees it while the rest keep running
against budget nobody accounts for, and one reader's `finally` block disposes
another reader's resource. The failure is silent and load-dependent, so `--fix`
would ship it past a green concurrency suite. The
[live-state exemption](#getters-that-read-live-external-state) cannot reach this
shape: `this.store.claim(spec)` is neither I/O nor a non-deterministic builtin.

```ts
type Admission = { readonly reservedMb: number; readonly release: () => void };

class ExecutionGovernor {
  // ✅ not reported: each read needs its own lease and its own release
  private get admission(): Admission {
    return this.store.claim(this.spec);
  }

  // ✅ not reported: the same shape written inline
  private get lease(): { id: string; release: () => void } {
    const id = this.store.claim();
    return { id, release: () => this.store.free(id) };
  }

  // ❌ still reported: a quota reading is data, and data is what a cache is for
  private get quota(): { reservedMb: number; limitMb: number } {
    return this.store.quota(this.poolId);
  }
}
```

The shapes the annotation can take:

| annotation | read as a handle |
|---|---|
| `{ id: string; release: () => void }` | yes |
| `{ id: string; release(): void }` — a method signature | yes |
| `{ path: string; [Symbol.dispose](): void }` | yes |
| `readonly release: () => void`, `release?: () => void`, `release: (() => void) \| undefined` | yes |
| `Admission`, where `Admission` is a `type` or `interface` declared in the same file | yes |
| `Admission[]`, `readonly Admission[]`, `Readonly<Admission>`, `Promise<Admission>` | yes |
| `Base & { release: () => void }`, `Admission \| null` | yes |
| `{ spec: JobSpec; admission: { release: () => void } }` — nested | yes |
| `{ id: string; name: string }` | no |
| `() => string` | no |
| `Map<string, Admission>` | no |

The test is **structural, not a list of member names.** `release`, `dispose`,
`close` and `unsubscribe` are the spellings that come to mind, but `free`,
`cancel`, `destroy`, `abort` and `[Symbol.dispose]` are the same member, and a
list omitting any of them re-reports the very getter the carve-out exists for —
the harmful direction, since the report carries a fixer that applies unattended.
Reading the shape instead costs the opposite error: an object that merely
bundles a callback with its data goes unreported. That is the cheaper error, and
a small one, because a getter whose result carries a closure is already sharing
that closure's captured state with every reader a cache would serve. One union
arm carrying the closure is enough, because the reader handed that arm is the
one harmed.

Because the decision is read off the annotation, the annotation has to survive
the same `eslint --fix` run.
[`no-explicit-return-type`](./no-explicit-return-type.md) preserves a
handle-shaped return type for exactly this reason, from the same predicate
(`src/utils/resourceHandleType.ts`) that
[`enforce-memoize-async`](./enforce-memoize-async.md) reads, so the three rules
cannot disagree about what a handle is. Without that, `--fix` would strip the
annotation and then memoize the getter it had just stopped being able to
recognise, in one unattended pass.

Like the other carve-outs, this reads the **declared annotation**: the rule is
syntactic and does not require `parserOptions.project`. A written return type is
not itself an exemption — these all keep reporting:

- A **bare callable result** (`() => string`). The closure is the whole result,
  with no resource paired to it whose accounting a shared reference corrupts. It
  is how a compiled template, a prepared query or a resolved renderer comes
  back, and computing one once is the point of asking.
- A handle type **imported from another module**
  (`import { Admission } from './types'`). Resolution is lexical and same-file,
  so a name declared elsewhere is unreadable here.
- An **unannotated** getter whose body happens to build a handle. Without an
  annotation there is no declaration of intent to honour, and inferring one
  would need type information this rule does not take.
- An **index signature** of callables (`{ [event: string]: () => void }`), which
  is a lookup table of handlers a second reader shares without losing anything
  the first one owned, and a **getter signature** (`{ get name(): string }`),
  which is a property access wearing a parameter list.
- A **two-argument container** (`Map<string, Admission>`), which describes a
  registry the getter looked handles up in rather than a handle the read
  allocated.

To exempt one of those, declare the handle type in the file that returns it, or
suppress the report deliberately:

```ts
import { Admission } from './types';

class Governor {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters -- every read claims its own lease
  private get admission(): Admission {
    return this.store.claim(this.spec);
  }
}
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
  private get screen() { return externalState; }  // left alone

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
