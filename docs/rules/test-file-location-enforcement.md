# test-file-location-enforcement

> Enforce test files to be in the same directory as the file they are testing

## Rule Details

This rule enforces that test files (*.test.ts) should reside in the same directory as the file they are testing. If a test file is located elsewhere, ESLint will throw an error.

### ❌ Incorrect

```ts
// File structure:
// functions/src/util/X.ts
// functions/tests/X.test.ts  <-- Incorrectly placed test file
```

### ✅ Correct

```ts
// File structure:
// functions/src/util/X.ts
// functions/src/util/X.test.ts  <-- Correctly placed test file
```

## When Not To Use It

If your project has a different convention for organizing test files, you might want to disable this rule.

## Further Reading

- [Jest documentation on file structure](https://jestjs.io/docs/configuration)
