# Disallow Array.forEach with async callbacks because forEach ignores returned promises, leading to parallel execution and unhandled rejections. Use a for...of loop when you need to await each iteration or map with Promise.all when concurrency is intended (`@blumintinc/blumint/no-async-foreach`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Passing an async function to `Array.forEach` does not behave like a sequential loop. `forEach` ignores returned promises, so async work runs in parallel, iterations finish before awaits complete, and rejected promises become unhandled. Use `for...of` when you need to await each item or `map` with `Promise.all` when you want deliberate concurrency.

## Rule Details

This rule reports any async callback passed to `Array.forEach`, including inline async callbacks and async functions referenced by name.

Examples of **incorrect** code for this rule:

```typescript
['a', 'b', 'c'].forEach(async (letter) => {
  await someAsyncFunction(letter);
  console.log(letter);
});

['foo', 'bar'].forEach(async function logLetter(letter) {
  await someAsyncFunction(letter);
  await audit(letter);
});

async function handle(letter: string) {
  await someAsyncFunction(letter);
}

['a', 'b'].forEach(handle);
```

Examples of **correct** code for this rule:

```typescript
for (const letter of ['a', 'b', 'c']) {
  await someAsyncFunction(letter);
  console.log(letter);
}

await Promise.all(
  ['foo', 'bar'].map(async (letter) => someAsyncFunction(letter)),
);

['a', 'b', 'c'].forEach((letter) => {
  someSyncFunction(letter);
  console.log(letter);
});
```
