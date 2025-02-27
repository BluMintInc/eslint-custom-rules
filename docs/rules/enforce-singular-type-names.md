# enforce-singular-type-names

This rule enforces a naming convention where type names are singular. This convention enhances readability, maintainability, and consistency across the codebase. It prevents confusion between individual items and collections, improving developer experience.

## Rule Details

This rule aims to ensure that all TypeScript type names (type aliases, interfaces, and enums) use singular form rather than plural.

To detect whether a name is singular or plural, this rule utilizes the `pluralize` npm package, which efficiently determines word forms based on predefined rules.

Examples of **incorrect** code for this rule:

```ts
// Type name is plural (incorrect)
type Users = {
  id: number;
  name: string;
};

// Incorrect type name for union type
type Phases = 'not-ready' | 'ready';

// Plural interface name
interface People {
  id: number;
  name: string;
}

// Plural enum name
enum Colors {
  RED,
  GREEN,
  BLUE
}
```

Examples of **correct** code for this rule:

```ts
// Type name is singular (correct)
type User = {
  id: number;
  name: string;
};

// Corrected singular type name
type Phase = 'not-ready' | 'ready';

// Singular interface name
interface Person {
  id: number;
  name: string;
}

// Singular enum name
enum Color {
  RED,
  GREEN,
  BLUE
}
```

## When Not To Use It

If you don't care about the naming convention of your types or if you have a different naming convention for types in your project, you can disable this rule.

## Further Reading

- [TypeScript Naming Conventions](https://github.com/basarat/typescript-book/blob/master/docs/styleguide/styleguide.md#naming)
