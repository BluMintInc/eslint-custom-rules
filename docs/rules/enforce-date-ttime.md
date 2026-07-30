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

The rule resolves the referenced type and looks for a type parameter literally named `TTime`, so both examples declare the types they reference. A name that resolves to something else — an ambient global such as the DOM's `Notification`, for instance — carries no `TTime` parameter and is left alone.

### Incorrect

```typescript
// File: src/types/notifications.ts
type Timestamp = { seconds: number; nanoseconds: number };
interface Notification<TTime = Timestamp> {
  createdAt: TTime;
}
type PendingWalletToken<TType extends string, TTime = Timestamp> = {
  type: TType;
  updatedAt: TTime;
};

// BAD: defaults to Timestamp (incorrect for client)
type NotificationDefaulted = Notification;

// BAD: explicitly set to Timestamp
type NotificationStamped = Notification<Timestamp>;

// BAD: set to a union or alias
type NotificationUnion = Notification<Date | null>;
```

### Correct

```typescript
// File: src/types/notifications.ts
type Timestamp = { seconds: number; nanoseconds: number };
interface Notification<TTime = Timestamp> {
  createdAt: TTime;
}
type PendingWalletToken<TType extends string, TTime = Timestamp> = {
  type: TType;
  updatedAt: TTime;
};

// GOOD: explicit Date
type NotificationDate = Notification<Date>;

// GOOD: explicit Date for TTime in any position
type WalletDoc = PendingWalletToken<'offchain', Date>;
```

## When to Use This Rule

This rule should be applied to frontend code (e.g., `src/**`) via ESLint overrides. It is not intended for backend code where `Timestamp` is the appropriate default.
