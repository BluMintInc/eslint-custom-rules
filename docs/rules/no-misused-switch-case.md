# Prevent misuse of logical OR (||) in switch case statements, which can lead to confusing and error-prone code. Instead of using OR operators in case expressions, use multiple case statements in sequence to handle multiple values. This improves code readability and follows the standard switch-case pattern (`@blumintinc/blumint/no-misused-switch-case`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule prevents the misuse of logical OR in switch case statements. Instead, cascading cases should be used. This improves code readability and understanding.

## Rule Details

This rule specifically targets `SwitchStatement` and issues a warning if a case uses a logical OR in its test.

### Examples of incorrect code for this rule:

```typescript
switch (value) {
  case 'a' || 'b':
    console.log('It is a or b');
    break;
  default:
    console.log('Unknown value');
}
```

### Examples of correct code for this rule:

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

In the correct example, instead of using a logical OR in the case test, cascading cases are used to capture the multiple possibilities. This is the standard way to handle multiple possibilities in a switch case and adheres to the rule.
