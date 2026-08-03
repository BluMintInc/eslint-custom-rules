# Ensure that the name field matches the func field in onWrite handlers (`@blumintinc/blumint/sync-onwrite-name-func`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## What this rule enforces

- Requires `name` literals inside onWrite handler configs to exactly match the function that `func` ultimately references.
- Resolves a local alias one hop: when `func` names a variable declared as `const funcRef = myFunction;`, the comparison target is the initializer's name (`myFunction`), not the alias written in `func`. The deployed label tracks the underlying function rather than whatever local name points at it.
- Applies when both `name` and `func` properties are present in the same object expression.
- Ignores objects without a `name` literal or where `func` is not an identifier, to avoid false positives.

### Limits of the alias resolution

- **Exactly one hop.** Given `const first = myFunction; const second = first;`, a `func: second` resolves to `first`, not `myFunction`. Chained aliases are not followed further.
- **Only identifier initializers.** When the alias is initialized with anything else (`const handler = () => {};`, a call, an object), the comparison target is the local name itself (`handler`).
- **Only `const x = y` aliases.** Import renames are not followed: with `import { myFunction as aliased } from './mod';`, a `func: aliased` expects `name: 'aliased'`, not `'myFunction'`. Function declarations and identifiers that resolve to nothing likewise compare against the name as written in `func`.

## Why keeping name and func in sync matters

- Deploy tooling, logs, and alerts label handlers using the `name` field; when it diverges from `func`, dashboards point to one name while a different implementation runs.
- Refactors that rename a function without updating `name` hide which code receives events, making incident response and rollbacks harder.
- Matching names keeps configuration, routing, and observability anchored to the same identifier.

## Examples

### Valid: aligned names keep deployments and monitoring consistent

```ts
const onWriteConfig = {
  name: 'processMatchMessages',
  func: processMatchMessages,
  region: 'us-central1',
};

// Through a one-hop alias, `name` tracks the underlying function, not `funcRef`.
const funcRef = notifyMatchChanges;
const viaAlias = {
  name: 'notifyMatchChanges',
  func: funcRef,
};
```

### Invalid: the rule reports the mismatch and suggests how to fix it

```ts
const config = {
  name: 'processMatchMessages',
  func: notifyMatchChanges,
};

// Error: OnWrite handler name "processMatchMessages" does not match func reference "notifyMatchChanges". The name field is what gets registered for deploys, logs, and alerts, so a mismatch hides which function is actually running. Rename the "name" value to "notifyMatchChanges" or point "func" to a function named "processMatchMessages" so the trigger label and implementation stay in sync.
```

## Auto-fix

- When both properties are present, the fixer rewrites the `name` literal to the resolved function name, keeping the handler label and implementation synchronized.
- Through an alias the fixer writes the resolved name, which may be a token that does not itself appear in the object literal: `const funcRef = myFunction;` with `{ name: 'wrongName', func: funcRef }` fixes to `name: 'myFunction'`, not `'funcRef'`.
