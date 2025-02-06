# Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity (`@blumintinc/blumint/no-explicit-return-type`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Options

This rule accepts an options object with the following properties:

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
