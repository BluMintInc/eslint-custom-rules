# Disallow logical OR in switch case labels (`@blumintinc/blumint/no-misused-switch-case`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Using `case a || b` looks like it matches two values, but `||` collapses to a single operand. That makes one value unreachable and hides the intent of the switch. This rule flags logical OR inside a `case` label so each value stays explicit and readable.

## Rule Details

`switch` expects each `case` label to be a single value. When you write `case x || y:`, JavaScript evaluates the expression and keeps only the first truthy operand, so one of the operands never triggers the branch. The rule reports any `case` label that uses `||` and expects both operands to be matched.


### Why this matters
- Logical OR returns one operand, so `case x || y` silently ignores one of the values you tried to cover.
- Explicit sequential cases keep every value reachable and make the control flow obvious to readers and AI tools.
- Avoids subtle bugs where an input appears handled but still falls through to `default`.

### Examples of incorrect code

```typescript
switch (value) {
  case 'a' || 'b':
    console.log('It is a or b');
    break;
  default:
    console.log('Unknown value');
}
```

```typescript
switch (value) {
  case computePrimary() || computeFallback():
    doThing();
    break;
}
```

### Examples of correct code

```typescript
switch (value) {
  case 'a':
  case 'b':
    console.log('It is a or b');
    break;
  default:
    console.log('Unknown value');
}
```

```typescript
switch (value) {
  case computePrimary():
    doThing();
    break;
  case computeFallback():
    doThing();
    break;
}
```


### How to fix violations
- Replace `case x || y:` with sequential `case x:` / `case y:` labels.
- If both operands share the same body, keep the shared statements under the final case label.
