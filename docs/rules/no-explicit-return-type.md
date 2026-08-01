# Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity (`@blumintinc/blumint/no-explicit-return-type`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule matters

- Type annotations duplicate what TypeScript can already infer, which bloats signatures and slows code review.
- When the implementation changes, explicit return types can drift from the actual value returned, hiding bugs behind an out-of-date annotation.
- Relying on inference keeps the function signature synchronized automatically and makes the true return shape obvious to readers and tooling.

## Rule details

This rule reports explicit return type annotations on functions that include an implementation body where TypeScript can infer the return value. The fixer (`--fix`) removes only the return type annotation while keeping the rest of the signature intact. Interface method signatures and abstract methods are allowed by default because they lack bodies for inference; setting `allowInterfaceMethodSignatures` or `allowAbstractMethodSignatures` to `false` makes the rule report these signatures (no auto-fix) instead of treating them as allowed. The rule keeps the annotation for cases where the annotation conveys additional meaning:

- Type predicates (`value is Type`) and assertion functions (`asserts value is Type`) where the return type changes control flow.
- Recursive functions, overloads, interface method signatures, and abstract methods when those allowances are enabled.
- `.d.ts` declaration files and `.f.ts` Firestore function files when configured to allow them.

### Recursion: the annotation is mandatory, not redundant

TypeScript cannot infer the return type of a function that is referenced from inside its own return expression. It gives up and reports:

> **TS7023**: `'buildQuery'` implicitly has return type `'any'` because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.

Deleting the annotation there does not simplify the code — it stops it compiling. The rule therefore stays silent when it can see the self-reference syntactically:

- The function has a resolvable name: its own `id`, the identifier of the `VariableDeclarator` it initialises, or the key of the object property / class member / assignment target it is attached to (reached as `this.name`, `Owner.name`).
- That name is referenced somewhere inside one of the function's own `return` expressions, or inside a concise arrow body. Nested closures inside the returned expression count, because their types are part of the return type.
- Or the function takes part in a **cycle of module-scope functions** — `a` returns something referencing `b`, and `b` returns something referencing `a` — which triggers the same TS7023.

The search is deliberately restricted to return expressions. A function that calls itself only for side effects (inside a `forEach` callback, say) still has an inferable return type, so its annotation is still reported.

### `void` and `Promise<void>`: the annotation cannot drift

The case against an explicit return type is that it restates what the implementation returns and can drift from it. That case does not reach `void` or `Promise<void>`: such an annotation is not a restatement of a result, it is a declaration that there is **no** result, and TypeScript enforces it — adding `return <expr>` under a `Promise<void>` annotation is a compile error. It cannot drift into a lie, so deleting it destroys information instead of removing redundancy.

That information is also read by other rules. [`enforce-memoize-async`](./enforce-memoize-async.md) skips a method declared `Promise<void>`, because caching a call that yields nothing turns a repeatable side effect into a once-per-instance one. Since `eslint --fix` re-lints until the output settles, stripping the annotation and memoizing the now-unannotated method happen in a single unattended run.

So by default (`allowVoidReturnTypes`) the rule leaves these annotations alone on functions, arrow functions and class methods. The match is exact: a union (`Promise<void | string>`), a wrapper (`Promise<Awaited<void>>`), an array (`void[]`) or any other type-argument arity can carry a value, so those annotations are still reported.

Signature-only declarations are outside this allowance: an interface method, an abstract method or a `declare function` has no body to infer from, so its annotation is mandatory rather than redundant, it is reported only when its own `allow*` option is turned off, and no fixer ever strips it.

Limitations, all of which err toward silence or toward the status quo:

- A self-reference inside a closure in the returned value counts, even though TypeScript can sometimes still break the cycle (it depends on how the returned value is contextually typed, which needs type information this rule does not have).
- Mutual recursion is resolved among module-scope functions only. A mutually recursive pair declared inside another function body is still reported.
- Annotating *either* member of a mutually recursive pair is enough for TypeScript; the rule exempts both rather than picking one.
- A function with no resolvable name (an anonymous callback) cannot be self-referential by name, so it is always reported.

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
  // Allow explicit return types on interface method signatures
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

### `allowInterfaceMethodSignatures`

When set to `true` (default), allows explicit return types on interface method signatures. This helps with interface documentation and type clarity.

### `allowAbstractMethodSignatures`

When set to `true` (default), allows explicit return types on abstract method signatures in abstract classes. This helps with method signature clarity.

### `allowDtsFiles`

When set to `true` (default), allows explicit return types in `.d.ts` declaration files. Declaration files typically benefit from explicit type annotations.

### `allowFirestoreFunctionFiles`

When set to `true` (default), allows explicit return types in `.f.ts` files, which are typically used for Firestore functions. This can help with documenting Firestore function return types.

### `allowVoidReturnTypes`

When set to `true` (default), allows a `void` or `Promise<void>` return type on a function, arrow function or class method. Such an annotation declares that the function produces no value — TypeScript enforces it, so it cannot drift from the implementation — and other rules read it as a declaration of intent, so removing it destroys information rather than redundancy. See [`void` and `Promise<void>`: the annotation cannot drift](#void-and-promisevoid-the-annotation-cannot-drift) above.

Set it to `false` to report and auto-fix these annotations like any other. Note that doing so lets `--fix` strip the annotation that stops [`enforce-memoize-async`](./enforce-memoize-async.md) memoizing a side-effecting method.
