# Disallow explicit return type annotations when TypeScript can infer them (`@blumintinc/blumint/no-explicit-return-type`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule matters

- Type annotations duplicate what TypeScript can already infer, which bloats signatures and slows code review.
- When the implementation changes, explicit return types can drift from the actual value returned, hiding bugs behind an out-of-date annotation.
- Relying on inference keeps the function signature synchronized automatically and makes the true return shape obvious to readers and tooling.

## Rule details

This rule reports explicit return type annotations on functions where TypeScript can infer the return value. It keeps the annotation for cases where the annotation conveys additional meaning:

- Type predicates (`value is Type`) and assertion functions (`asserts value is Type`) where the return type changes control flow.
- Recursive functions, overloads, interface method signatures, and abstract methods when those allowances are enabled.
- `.d.ts` declaration files and `.f.ts` Firestore function files when configured to allow them.

The rule is fixable: `--fix` deletes only the return type annotation and preserves the rest of the signature.

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
