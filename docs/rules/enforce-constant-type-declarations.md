# Enforce proper type declarations for global constants instead of using typeof on constants directly (`@blumintinc/blumint/enforce-constant-type-declarations`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces proper type declarations for global constants, specifically focusing on ensuring that types like `statusToCheck: typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;` are correctly typed as `statusToCheck: StatusExceeding | StatusSubceeding;`. This rule helps maintain type safety and prevents potential bugs by ensuring that constant types are properly extracted and reused.

The rule encourages defining explicit types first, then using those types for constants, rather than using `typeof` on constants directly.

## Examples

### ❌ Incorrect

```typescript
// Using typeof on constants directly in type alias
const STATUS_EXCEEDING = 'exceeding' as const;
const STATUS_SUBCEEDING = 'succeeding' as const;

type StatusToCheck = typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;

// Using typeof in function parameters
function checkStatus(statusToCheck: typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING) {
  // ...
}

// Using typeof in variable declarations
const status: typeof STATUS_EXCEEDING = 'exceeding';
```

### ✅ Correct

```typescript
// Define the type first
type StatusExceeding = 'exceeding';
type StatusSubceeding = 'succeeding';

// Then use the type for the constants
const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;
const STATUS_SUBCEEDING: StatusSubceeding = 'succeeding' as const;

// Use the types directly
type StatusToCheck = StatusExceeding | StatusSubceeding;

// Use the types in function parameters
function checkStatus(statusToCheck: StatusToCheck) {
  // ...
}
```

## When Not To Use It

- When working with imported constants from other files (the rule only applies to locally defined constants)
- When using `typeof` on complex objects or functions (not simple constants)
- When constants don't use `as const` assertion (these are not considered constants by this rule)

## Edge Cases Handled

1. **Imported Constants**: Constants imported from other files are allowed to use `typeof` since you can't control their type definitions locally.

2. **Complex Objects**: Using `typeof` on objects with methods or complex structures is allowed.

3. **Non-const Constants**: Constants without `as const` assertion are not flagged by this rule.

4. **Nested Types**: The rule handles typeof usage in object type properties and conditional types.

5. **Generic Types**: The rule allows complex generic type definitions.
