# Enforce that any generic type parameter named TTime is explicitly set to Date in frontend code (`@blumintinc/blumint/enforce-date-ttime`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce that any generic type parameter named `TTime` is explicitly set to `Date` in frontend code.

## Rationale

Our Firestore converters automatically translate `Timestamp` to `Date` on the client. Leaving `TTime` unspecified (which usually defaults to `Timestamp`) forces defensive, unnecessary type checks and conversions in frontend code. By requiring `TTime = Date`, frontend types stay accurate and code stays clean.

- Prevents `Timestamp`/`Date` ambiguity in frontend code.
- Reinforces the Firestore Frontend Hooks contract.
- Reduces type-safe workarounds like `instanceof Timestamp` usage.
- Keeps frontend type definitions aligned with actual runtime values.

## Examples

### Incorrect

```typescript
// BAD: defaults to Timestamp (incorrect for client)
type Foo = Notification;

// BAD: explicitly set to Timestamp
type Foo = Notification<Timestamp>;

// BAD: set to a union or alias
type Foo = Notification<Date | null>;
```

### Correct

```typescript
// GOOD: explicit Date
type Foo = Notification<Date>;

// GOOD: explicit Date for TTime in any position
type Doc = PendingWalletToken<'offchain', Date>;
```

## When to Use This Rule

This rule should be applied to frontend code (e.g., `src/**`) via ESLint overrides. It is not intended for backend code where `Timestamp` is the appropriate default.
