# Clean Code Naming

This rule enforces clean code naming conventions as outlined by Martin Fowler. The rule checks the names of variables, functions, classes, etc. for violations of these conventions and flags any violations.

## Rule Details

This rule enforces that all identifiers (variables, functions, classes, etc.) should have names that are between 3 and 20 characters long.

### Examples of incorrect code for this rule:

```typescript
let x = 1;
function f() {}
class C {}
```

In the incorrect examples, each identifier has a name that is less than 3 characters long, which violates the clean code naming rules.

### Examples of correct code for this rule:

```typescript
let myVariable = 1;
function myFunction() {}
class MyClass {}
```

In the correct examples, each identifier has a name that is between 3 and 20 characters long, which complies with the clean code naming rules.
```


