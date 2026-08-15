# Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity (`@blumintinc/blumint/no-explicit-return-type`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule matters

- Type annotations duplicate what TypeScript can already infer, which bloats signatures and slows code review.
- When the implementation changes, explicit return types can drift from the actual value returned, hiding bugs behind an out-of-date annotation.
- Relying on inference keeps the function signature synchronized automatically and makes the true return shape obvious to readers and tooling.

## Rule details

This rule reports explicit return type annotations on functions that include an implementation body where TypeScript can infer the return value. The fixer (`--fix`) removes the return type annotation, along with any binding the annotations it deletes were the only consumers of (see [The fix takes the bindings it strands with it](#the-fix-takes-the-bindings-it-strands-with-it)). Interface method signatures and abstract methods are allowed by default because they lack bodies for inference; setting `allowInterfaceMethodSignatures` or `allowAbstractMethodSignatures` to `false` makes the rule report these signatures (no auto-fix) instead of treating them as allowed. The rule keeps the annotation for cases where the annotation conveys additional meaning:

- Type predicates (`value is Type`) and assertion functions (`asserts value is Type`) where the return type changes control flow.
- Recursive functions, overloads, interface method signatures, and abstract methods when those allowances are enabled.
- `.d.ts` declaration files and `.f.ts` Firestore function files when configured to allow them.

### Interfaces and type literals are treated identically

`interface X { f(): void }` and `type X = { f(): void }` declare the same members; only the keyword introducing the container differs. [`prefer-type-over-interface`](./prefer-type-over-interface.md) ships in the same `recommended` config and is fixable, so a single `eslint --fix` pass rewrites every interface into a type alias without touching its members.

A member's inferability cannot depend on which keyword declared its container, so every method-signature allowance applies to both containers — a member of an interface body, of a type literal, and of a type literal nested anywhere (an object property's type, a parameter type, a generic argument) is judged the same way. `allowInterfaceMethodSignatures` governs all of them, and overloads are detected among the siblings of either container. Otherwise the automatic interface-to-type rewrite would turn silent code into a violation whose remedy is unavailable: restoring the `interface` keyword is undone by the next `--fix`, and a method signature cannot drop its return type without becoming a different declaration.

### Recursion: the annotation is mandatory, not redundant

TypeScript cannot infer the return type of a function that is referenced from inside its own return expression. It gives up and reports:

> **TS7023**: `'buildQuery'` implicitly has return type `'any'` because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.

Deleting the annotation there does not simplify the code — it stops it compiling. The rule therefore stays silent when it can see the self-reference syntactically:

- The function has a resolvable name: its own `id`, the identifier of the `VariableDeclarator` it initialises, or the key of the object property / class member / assignment target it is attached to (reached as `this.name`, `Owner.name`).
- That name is referenced somewhere inside one of the function's own `return` expressions, or inside a concise arrow body. Nested closures inside the returned expression count, because their types are part of the return type.
- Or the function takes part in a **cycle** — `a` returns something referencing `b`, and `b` returns something referencing `a` — which triggers the same TS7023.

The search is deliberately restricted to return expressions. A function that calls itself only for side effects (inside a `forEach` callback, say) still has an inferable return type, so its annotation is still reported.

#### Mutual recursion is resolved through the scope chain

Each name in a return expression is resolved from the referencing function's own body outward, through every enclosing statement container — a function body, an arrow body, a bare block, a `namespace`, a `switch` case, a class `static` block, and finally the module — with the nearest declaration shadowing a same-named outer one. That is the resolution TypeScript itself performs, and TS7023 does not care how deeply a pair is nested:

```ts
// Silent: removing either annotation makes tsc fail with TS7023 on both.
export function makeParity() {
  const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
  return { isEven, isOdd };
}
```

Two consequences follow from resolving names rather than matching them:

- Two same-named functions in **sibling** scopes cannot see each other, so they are not a mutually recursive pair and both annotations are still reported.
- A cycle that **crosses** a scope boundary — an inner function returning a call to the enclosing one, which returns a call to the inner — is a cycle, and both annotations are kept.

```ts
// Reported: `isEven` and `isOdd` are declared in scopes that cannot see each
// other, so neither annotation breaks an inference cycle.
export function first() {
  const isEven = (n: number): boolean => n === 0;
  return isEven;
}
export function second() {
  const isOdd = (n: number): boolean => n !== 0;
  return isOdd;
}
```

### `void` and `Promise<void>`: the annotation cannot drift

The case against an explicit return type is that it restates what the implementation returns and can drift from it. That case does not reach `void` or `Promise<void>`: such an annotation is not a restatement of a result, it is a declaration that there is **no** result, and TypeScript enforces it — adding `return <expr>` under a `Promise<void>` annotation is a compile error. It cannot drift into a lie, so deleting it destroys information instead of removing redundancy.

That information is also read by other rules. [`enforce-memoize-async`](./enforce-memoize-async.md) skips a method declared `Promise<void>`, because caching a call that yields nothing turns a repeatable side effect into a once-per-instance one. Since `eslint --fix` re-lints until the output settles, stripping the annotation and memoizing the now-unannotated method happen in a single unattended run.

So by default (`allowVoidReturnTypes`) the rule leaves these annotations alone on functions, arrow functions and class methods. The match is exact: a union (`Promise<void | string>`), a wrapper (`Promise<Awaited<void>>`), an array (`void[]`) or any other type-argument arity can carry a value, so those annotations are still reported.

Signature-only declarations are outside this allowance: an interface method, an abstract method or a `declare function` has no body to infer from, so its annotation is mandatory rather than redundant, it is reported only when its own `allow*` option is turned off, and no fixer ever strips it.

### Decorator factories: the annotation is what makes the factory usable

A function whose return value is applied as a decorator is the one shape where the annotation is **wider** than what inference produces rather than a restatement of it. `MethodDecorator` declares three parameters; `return () => {};` infers `() => void`. A decoration site passes what the declared signature promises, so removing the annotation is not meaning-preserving — every use of the factory becomes `TS1329: 'Log()' accepts too few arguments to be used as a decorator here`:

```ts
// Not reported: the annotation is load-bearing at the decoration site.
function Log(): MethodDecorator {
  return () => {};
}

class Reporter {
  @Log()
  compute() {
    return 1;
  }
}
```

The question is answered syntactically, since a decorator factory is recognisable without type information:

- The annotation names one of TypeScript's decorator types — `ClassDecorator`, `MethodDecorator`, `PropertyDecorator`, `ParameterDecorator` — including through a qualified name (`ts.MethodDecorator`) and as a member of a union or intersection. The match is on the resolved right-most identifier, so an unrelated user type such as `MyMethodDecoratorConfig` is still reported.
- Or a decorator in the same file **calls** the function: `@Memoize()` exempts the `Memoize` its identifier resolves to, which covers a factory annotated with a user-defined decorator type that no name can identify. The identifier is resolved through scope analysis, so a same-named binding elsewhere cannot silence a function no decorator reaches.

A **bare** `@Freeze` names the decorator itself rather than a factory, and such a function's annotation restates exactly what inference produces, so it stays reported.

### Overload implementations: the annotation is what the overloads are checked against

TypeScript checks each overload signature against the **implementation signature**, not against the body. The implementation's annotation is therefore not a restatement of what the body returns — it is the type the overloads above it are measured against. Removing it makes TypeScript infer the body's own type, which need not accept those overloads:

```ts
// Not reported: stripping `: void | string` infers `void`, and the `: string`
// overload above it becomes TS2394: This overload signature is not compatible
// with its implementation signature.
function get(): void;
function get(param: string): string;
function get(param?: string): void | string {}
```

An overload set is read from the statement list that directly holds it, so the same silence applies at any depth — a function body, a bare block, a `switch` case, a `namespace` or the module — and to class methods, whose body-less members are the signatures:

```ts
class Reader {
  read(): void;
  read(key: string): string;
  read(key?: string): void | string {}
}
```

An overload set cannot span containers, so the exemption does not follow the name out of the scope that declares the set: a same-named function in a sibling or enclosing scope overloads nothing and is still reported. `static read` and `read` are likewise different members that merely spell the same name.

This carve-out is not governed by `allowOverloadedFunctions`. That option decides whether the declaration-only signatures are reported, and those reports carry no fixer; here the report would ship a fix that does not compile, which no option may ask for.

### The fix takes the bindings it strands with it

An annotation is often the only thing in a file that names its type. Deleting it on its own leaves the binding that type came from — an import specifier, a local `type` alias — bound to nothing, so a file that linted clean fails `no-unused-vars` afterwards, and a build with `noUnusedLocals` fails outright. Because the rule's own report is resolved by the fix, nothing re-reports the debt.

The annotation and the binding therefore go together, as **one** fix:

```ts
// before
import type { User } from './User';

export const buildUser = (id: string): User => {
  return { id };
};

// after --fix
export const buildUser = (id: string) => {
  return { id };
};
```

A module-scope `type` alias or `interface` the annotations were the only consumers of goes the same way:

```ts
// before
type Wrapper = { id: string };

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Wrapper => ({ id: '2' });

// after --fix
export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
```

Only a binding proven dead is unbound, using scope analysis rather than a text search, and confirmed by a whole-file scan for the name — where the two disagree the removal is not attempted:

- Any remaining reference keeps the binding — another annotation, a variable's type, a value use, a re-export (`export { User }`, `export type { Wrapper }`), a reference from a nested scope, an `export` keyword on the declaration itself.
- A specifier with surviving siblings is removed on its own (`import type { Role, User }` → `import type { Role }`); a declaration that loses its last specifier is removed whole, never left as `import type {} from './User';`.
- A comment among the specifiers is **carried** into the surviving text rather than deleted with the separators around it, and rather than deciding whether the annotations are stripped at all. A comment whose meaning is its position (an `eslint-disable` directive, `@ts-expect-error`) cannot be moved, so it withholds the fix instead.

Orphanhood is judged against **one fix's own deletions**, never against what the rest of the `--fix` run might also delete. ESLint applies a fix whole or not at all, so a fix may only count on a deletion it performs itself: an edit that *assumed* a sibling annotation would also be stripped would delete the import whenever that sibling turned out to be `eslint-disable`d or its own fix dropped, leaving a type reference bound to nothing — trading an unused-import warning for a compile error.

A binding named by **two or more** strippable annotations therefore has no single last consumer, and waiting for one does not help: once every annotation is stripped the rule has nothing left to report, so no later fix exists to carry the cleanup and the binding stays orphaned for good. Those annotations are instead removed **together, by one fix**:

```ts
// before
import type { PrizePoolTarget, Tournament } from './Tournament';

const selfFund = (id: string): PrizePoolTarget => ({ id });
const crowdfund = (id: string): PrizePoolTarget => ({ id });

export const of = (t: Tournament) => [selfFund, crowdfund, t];

// after --fix
import type { Tournament } from './Tournament';

const selfFund = (id: string) => ({ id });
const crowdfund = (id: string) => ({ id });

export const of = (t: Tournament) => [selfFund, crowdfund, t];
```

Every report in such a set carries that same fix, so whichever one ESLint applies does the whole job and the rest are dropped as conflicting. Two things keep this sound:

- The fix deletes each annotation itself rather than assuming a sibling report's fix lands.
- Annotations whose reports ESLint will discard are excluded. Suppression is applied to reports *after* a rule emits them, so the rule resolves inline `eslint-disable` directives itself (the same way ESLint does) and leaves a suppressed annotation out of the set. Its type reference outlives the pass, so the import stays:

```ts
import type { User } from './User';

export const buildUser = (id: string): User => ({ id });

// eslint-disable-next-line @blumintinc/blumint/no-explicit-return-type
export const cloneUser = (id: string): User => ({ id });
```

Here only `buildUser`'s annotation goes; `cloneUser` keeps both its annotation and the import it needs.

When the deletion would strand a binding that cannot be unbound cleanly, the **whole fix is declined** and the annotation stays: the report remains for a human, which is strictly better than trading it for an unused-variable error. That happens when the binding is a type parameter, a class, an `enum` or a value declaration (none of which this fixer will delete), when a type alias is nested inside a block or merged across several declarations, when the file has no top-level `import` or `export` (a script's type declarations are visible to the whole program), when deleting the alias would in turn strand something its own body names, when a directive comment (`// eslint-disable-next-line`, `// @ts-expect-error`) is bound to the declaration's line, or when a same-named binding elsewhere makes the deletion unprovable.

A set of annotations whose joint removal cannot be completed this way declines **as a set**. Stripping them one at a time is not the harmless status quo it looks like: `--fix` applies those strips in the same run, the last one leaves the binding referenced by nothing, and no report survives to clean it up.

Limitations, all of which err toward silence or toward the status quo:

- The cleanup reaches one deletion deep. An alias whose body names an import is left alone rather than deleting both, since the second deletion is a question this fix does not re-ask.
- A self-reference inside a closure in the returned value counts, even though TypeScript can sometimes still break the cycle (it depends on how the returned value is contextually typed, which needs type information this rule does not have).
- Mutual recursion is resolved syntactically, by name through the scope chain. A pair linked through a value this rule cannot follow — a re-export, a property of an imported object, a dynamically keyed lookup — is still reported.
- Annotating *either* member of a mutually recursive pair is enough for TypeScript; the rule exempts both rather than picking one.
- A function with no resolvable name (an anonymous callback) cannot be self-referential by name, so it is always reported.
- A decorator factory is recognised syntactically. A factory annotated with a user-defined decorator type and used only in another file matches neither guard, so it is still reported; an owner-qualified decoration site (`@registry.log()`) names a property rather than a binding, and matching it by property name would silence the rule on every unrelated method of that name, so it is not matched either.
- An annotation whose removal would strand a declaration the fixer cannot delete is reported without a fix rather than fixed halfway.

### The fix carries the comments the annotation was sitting among

A comment written inside the annotation belongs to the span the strip deletes, so it is **re-emitted** where the annotation was rather than going with it:

```ts
// before
export function computeCount(): /** the count */ number {
  return 1;
}

// after --fix
export function computeCount() /** the count */ {
  return 1;
}
```

An **arrow** is the one subject whose annotation sits inside a restricted production. `ArrowParameters [no LineTerminator here] =>` forbids a line terminator between the parameter list and the arrow, and a block comment containing a line terminator *is* a LineTerminator to the syntactic grammar — as is the newline a line comment ends on. A comment left in that gap makes the file a hard `SyntaxError`, which no parser in the lint pipeline reports: `@typescript-eslint/parser` and the TypeScript parser both accept the text, and only V8 (`node --check`) refuses it. Such a comment is therefore re-emitted **past the `=>`**, the nearest position outside the restricted gap that cannot begin one of its own:

```ts
// before
export const buildCount = () /**
 * the count
 */: number => 1;

// after --fix
export const buildCount = () => /**
 * the count
 */ 1;
```

Hoisting it above the enclosing line instead would anchor an insertion at a column zero that can sit inside a template literal or JSX text, where the comment becomes content rather than code.

A comment that fits on one line trips no restricted production and is left exactly where it was written (`() /* doc */: number => 1` → `() /* doc */ => 1`), and a function declaration, method or function expression ends its parameter list at a body rather than an arrow, so its comments never move.

A directive comment (`// eslint-disable-next-line`, `@ts-expect-error`) inside an arrow's restricted gap withholds the fix when that gap has to be rewritten, since the rewrite collapses the lines it spanned and would leave the directive pointing at a different line. A directive that shares its gap with nothing else keeps both its position and the fix.

### Examples of incorrect code

```ts
function add(a: number, b: number): number {
  return a + b;
}

const multiply = (a: number, b: number): number => a * b;

const obj = {
  method(value: string): string {
    return value.trim();
  },
};

// Computed class method with an explicit return type is flagged
class Service {
  [Symbol.toStringTag](): string {
    return 'Service';
  }
}

// Calling itself only for side effects leaves the return type inferable, so
// TS7023 does not apply and the annotation is still redundant
const walkTree = (nodes: number[][], depth: number): number => {
  nodes.forEach((child) => walkTree([child], depth + 1));
  return depth;
};

// A union can carry a value, so it is not covered by `allowVoidReturnTypes`
async function maybe(): Promise<void | string> {
  return undefined;
}

// Same-named helpers in sibling scopes cannot see each other, so neither
// annotation breaks an inference cycle and both are reported
export function firstScope() {
  const isEvenSibling = (n: number): boolean => n === 0;
  return isEvenSibling;
}
export function secondScope() {
  const isOddSibling = (n: number): boolean => n !== 0;
  return isOddSibling;
}
```

### Examples of correct code

```ts
function add(a: number, b: number) {
  return a + b;
}

const multiply = (a: number, b: number) => a * b;

// Type predicate: annotation is required to narrow callers
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Interface method annotations are allowed by default
interface Logger {
  log(message: string): void;
}

// The equivalent type literal is treated identically
type Reporter = {
  report(message: string): void;
};

// Overloads are detected in either container, so both of these stay silent
// even with `allowInterfaceMethodSignatures: false`
type Converter = {
  convert(input: string): number;
  convert(input: number): string;
};

// The implementation signature of an overload set: the overloads above it are
// checked against this annotation, so removing it is TS2394
function parse(source: string): number;
function parse(source: number): string;
function parse(source: string | number): number | string {
  return typeof source === 'string' ? Number(source) : String(source);
}

// Recursion: without the annotation this is TS7023, so it is kept
const countdown = (n: number): number => {
  if (n <= 0) {
    return 0;
  }
  return countdown(n - 1);
};

// The self-reference may sit inside a closure in the returned value
type FakeQuery = { orderBy: () => FakeQuery };
const buildQuery = (p?: string): FakeQuery => {
  return { orderBy: () => buildQuery(p) };
};

// Mutual recursion between module-scope functions is TS7023 for both
const isEvenNumber = (n: number): boolean =>
  n === 0 ? true : isOddNumber(n - 1);
const isOddNumber = (n: number): boolean =>
  n === 0 ? false : isEvenNumber(n - 1);

// Nesting does not change that verdict: the pair is resolved through the scope
// chain, so a mutually recursive pair local to a factory is kept too
export function makeParityChecks() {
  const isEvenLocal = (n: number): boolean =>
    n === 0 ? true : isOddLocal(n - 1);
  const isOddLocal = (n: number): boolean =>
    n === 0 ? false : isEvenLocal(n - 1);
  return { isEvenLocal, isOddLocal };
}

// `Promise<void>` declares the absence of a result: it cannot drift, and
// `enforce-memoize-async` reads it to leave a side-effecting method uncached
export class Authorizer {
  public async present(url: string): Promise<void> {
    await this.open(url);
  }
}

// A bare `void` is kept for the same reason
const log = (message: string): void => {
  console.log(message);
};
```

## Options

This rule accepts an options object:

```ts
{
  // Allow explicit return types on recursive functions
  allowRecursiveFunctions?: boolean;
  // Allow explicit return types on overloaded functions
  allowOverloadedFunctions?: boolean;
  // Allow explicit return types on method signatures, in an interface body or
  // in a type literal
  allowInterfaceMethodSignatures?: boolean;
  // Allow explicit return types on abstract method signatures
  allowAbstractMethodSignatures?: boolean;
  // Allow explicit return types in .d.ts files
  allowDtsFiles?: boolean;
  // Allow explicit return types in .f.ts files (Firestore function files)
  allowFirestoreFunctionFiles?: boolean;
  // Allow `void` and `Promise<void>` return types
  allowVoidReturnTypes?: boolean;
}
```

### `allowRecursiveFunctions`

When set to `true` (default), allows explicit return types on recursive functions. This can improve code clarity by making the return type explicit at the function declaration.

### `allowOverloadedFunctions`

When set to `true` (default), allows explicit return types on overloaded functions. This is useful for function overloads where the return type might not be obvious from the implementation.

Overloaded method signatures are recognised by their sibling members, in an interface body (`interface X { f(a: string): void; f(a: number): void }`) and in a type literal (`type X = { f(a: string): void; f(a: number): void }`) alike. See [Interfaces and type literals are treated identically](#interfaces-and-type-literals-are-treated-identically).

This option reaches the declaration-only signatures — interface and type-literal members, `declare function` declarations, and body-less class members — whose reports carry no fixer. The **implementation** of an overload set is exempt either way, because its annotation is what those signatures are checked against; see [Overload implementations: the annotation is what the overloads are checked against](#overload-implementations-the-annotation-is-what-the-overloads-are-checked-against).

### `allowInterfaceMethodSignatures`

When set to `true` (default), allows explicit return types on method signatures. This helps with interface documentation and type clarity.

Despite the name, the option is not limited to members of an `interface`: it governs every method signature, including those declared in a type literal (`type X = { f(): void }`) and in type literals nested inside other types. A type literal declares the same members an interface body does — and `prefer-type-over-interface` rewrites the latter into the former automatically — so the two forms behave identically under every setting of this option. The name is kept for backwards compatibility with existing configurations.

### `allowAbstractMethodSignatures`

When set to `true` (default), allows explicit return types on abstract method signatures in abstract classes. This helps with method signature clarity.

### `allowDtsFiles`

When set to `true` (default), allows explicit return types in `.d.ts` declaration files. Declaration files typically benefit from explicit type annotations.

### `allowFirestoreFunctionFiles`

When set to `true` (default), allows explicit return types in `.f.ts` files, which are typically used for Firestore functions. This can help with documenting Firestore function return types.

### `allowVoidReturnTypes`

When set to `true` (default), allows a `void` or `Promise<void>` return type on a function, arrow function or class method. Such an annotation declares that the function produces no value — TypeScript enforces it, so it cannot drift from the implementation — and other rules read it as a declaration of intent, so removing it destroys information rather than redundancy. See [`void` and `Promise<void>`: the annotation cannot drift](#void-and-promisevoid-the-annotation-cannot-drift) above.

Set it to `false` to report and auto-fix these annotations like any other. Note that doing so lets `--fix` strip the annotation that stops [`enforce-memoize-async`](./enforce-memoize-async.md) memoizing a side-effecting method.
