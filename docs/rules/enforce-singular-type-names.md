# Suggest TypeScript type names to be singular (`@blumintinc/blumint/enforce-singular-type-names`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Type names should ideally describe a single concept. Plural identifiers can imply that a declaration models a collection, which might mislead readers into treating single-instance types as arrays, maps, or lists. Keeping type aliases, interfaces, and enums singular makes it obvious when code works with one entity and reserves plural names for actual container shapes.

## Rule Details

The rule checks TypeScript type aliases, interfaces, and enums. It uses `pluralize` to detect plural identifiers and suggests names that are singular. To avoid false positives on accepted conventions and mass nouns, the rule ignores names ending with `Props`, `Params`, `Options`, `Settings`, or `Data` (any casing).

Why singular names matter:
- Plural identifiers hide whether the symbol models one value or many, which can lead to misuse as a container type.
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
```

Example message:

```text
Type name "Users" appears to be plural, which might suggest a collection instead of a single instance. This rule is a suggestion and its pluralization heuristics may have false positives for irregular words or domain jargon. If "Users" is intended to be plural or is a false positive, please use an // eslint-disable-next-line @blumintinc/blumint/enforce-singular-type-names comment. Otherwise, consider the singular form "User".
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

### ✅ Correct (With disable comment if naming is intentional)

```ts
// eslint-disable-next-line @blumintinc/blumint/enforce-singular-type-names
type Criteria = string[];
```

## When Not To Use It

Disable this rule if your project intentionally names types after collections (e.g., a domain object that is inherently plural) or you prefer a different naming convention. If the rule incorrectly flags an irregular word, use an `// eslint-disable-next-line @blumintinc/blumint/enforce-singular-type-names` comment.

## Further Reading

- [TypeScript Naming Conventions](https://github.com/basarat/typescript-book/blob/master/docs/styleguide/styleguide.md#naming)
