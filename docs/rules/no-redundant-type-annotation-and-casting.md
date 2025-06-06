# Disallow redundant type annotation and casting to the same type (`@blumintinc/blumint/no-redundant-type-annotation-and-casting`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule identifies and flags variable declarations that unnecessarily include both an explicit type annotation and a type assertion (cast) to the exact same type. This pattern is redundant because TypeScript's type inference can derive the type from the assertion, making the explicit annotation superfluous.

Enforcing this rule helps keep the codebase clean, readable, and less prone to errors where the type annotation and cast might become inconsistent.

## Examples

### ❌ Incorrect

```typescript
// Variable declaration with redundant type annotation and casting
const docRef: DocumentReference<ResultSummary> = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;

// Simple types
const value: string = getValue() as string;

// Generic types
const list: Array<string> = getList() as Array<string>;

// Union types
const value: string | number = getValue() as string | number;

// Class properties
class Example {
  prop: string = getValue() as string;
}

// Arrow function return types
const getUser = (): User => fetchUser() as User;
```

### ✅ Correct

```typescript
// Remove explicit type annotation (preferred)
const docRef = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;

// Or remove type cast
const docRef: DocumentReference<ResultSummary> = resultSummaryCollectionRef.doc(teamId);

// Different types (not redundant)
const myVar: any = "some string" as string;

// Only type annotation
const handler: EventHandler = createHandler();

// Only type assertion
const result = apiCall() as ApiResponse;
```

## When Not To Use It

This rule should not be disabled as it helps maintain code quality and consistency. However, you might want to disable it temporarily if you're working with complex type scenarios where the redundancy is intentional for documentation purposes.

## Implementation Notes

- The rule only flags cases where the type annotation and assertion are strictly identical
- The auto-fix removes the explicit type annotation, keeping the type cast
- Currently supports variable declarations, class properties, assignment expressions, and arrow function return types
- Destructuring assignments are ignored to keep the implementation simple
- Complex type comparisons are done via text comparison of the type expressions
