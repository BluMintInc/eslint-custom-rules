# Enforce TypeScript type names to be singular (`@blumintinc/blumint/enforce-singular-type-names`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Type names should describe a single concept. Plural identifiers imply the declaration models a collection, which misleads readers into treating single-instance types as arrays, maps, or lists. Keeping type aliases, interfaces, and enums singular makes it obvious when code works with one entity and reserves plural names for actual container shapes.

## Rule Details

The rule checks TypeScript type aliases, interfaces, and enums. It uses `pluralize` to detect plural identifiers and reports names that are not singular. To avoid false positives on accepted conventions and mass nouns, the rule ignores names ending with `Props`, `Params`, `Options`, `Settings`, or `Data` (any casing).

Why singular names matter:
- Plural identifiers hide whether the symbol models one value or many, which leads to misuse as a container type.
- Singling out cardinality in the name keeps public APIs self-documenting and reduces accidental collection handling bugs.
- Reserving plural names for arrays/maps keeps naming consistent across variable declarations and type definitions.

Examples of **incorrect** code for this rule:

```ts
type Users = {
  id: number;
  name: string;
};

type Phases = 'not-ready' | 'ready';

interface People {
  id: number;
  name: string;
}

enum Colors {
  RED,
  GREEN,
  BLUE
}
// Reported message example:
// Type name 'Users' is plural, which signals a collection and hides whether this alias, interface, or enum represents one value or many. Plural type identifiers push callers to misuse the symbol for arrays or maps. Rename it to a singular noun such as 'User' so the declaration clearly models a single instance and leaves plural names for container types.
```

Examples of **correct** code for this rule:

```ts
type User = {
  id: number;
  name: string;
};

type Phase = 'not-ready' | 'ready';

interface Person {
  id: number;
  name: string;
}

enum Color {
  RED,
  GREEN,
  BLUE
}

// Accepted suffixes that intentionally remain plural-like
type UsersListProps = { users: User[] };
type SearchParams = { query: string };
type RequestOptions = { timeout: number };
type UserData = { name: string; age: number };
```

## When Not To Use It

Disable this rule if your project intentionally names types after collections (e.g., a domain object that is inherently plural) or you prefer a different naming convention. Otherwise, keep it enabled to preserve consistent, self-explanatory type names.

## Further Reading

- [TypeScript Naming Conventions](https://github.com/basarat/typescript-book/blob/master/docs/styleguide/styleguide.md#naming)
