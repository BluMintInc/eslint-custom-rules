# Enforce serializable parameters in Firebase Callable/HTTPS Cloud Functions to prevent runtime errors. Firebase Functions can only pass JSON-serializable data, so using non-serializable types like Date, DocumentReference, or Map will cause failures. Use primitive types, plain objects, and arrays instead, converting complex types to their serializable representations (e.g., Date to ISO string) (`@blumintinc/blumint/enforce-serializable-params`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Options

This rule accepts an options object with the following properties:

```ts
{
  // Additional types to consider as non-serializable
  additionalNonSerializableTypes: string[];
  // Function types to check for serializable parameters
  functionTypes: string[];
}
```

### `additionalNonSerializableTypes`

An array of additional type names to consider as non-serializable. By default, the following types are considered non-serializable:
- `Date`
- `DocumentReference`
- `Timestamp`
- `Map`
- `Set`
- `Symbol`
- `Function`
- `undefined`

### `functionTypes`

An array of function type names to check for serializable parameters. Defaults to `['CallableRequest']`.
