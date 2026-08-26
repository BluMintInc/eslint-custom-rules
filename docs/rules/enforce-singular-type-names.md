# Enforce TypeScript type names to be singular (`@blumintinc/blumint/enforce-singular-type-names`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Type names should describe a single concept. Plural identifiers imply the declaration models a collection, which misleads readers into treating single-instance types as arrays, maps, or lists. Keeping type aliases, interfaces, and enums singular makes it obvious when code works with one entity and reserves plural names for actual container shapes.

## Rule Details

The rule checks TypeScript type aliases, interfaces, and enums. It uses `pluralize` to detect plural identifiers and reports names that are not singular. To avoid false positives on accepted conventions and mass nouns, the rule ignores names ending with `Props`, `Params`, `Options`, `Settings`, or `Data` (any casing), and it ignores identifiers whose final word is a singular noun that merely ends in `s` (see below).

Why singular names matter:
- Plural identifiers hide whether the symbol models one value or many, which leads to misuse as a container type.
- Singling out cardinality in the name keeps public APIs self-documenting and reduces accidental collection handling bugs.
- Reserving plural names for arrays/maps keeps naming consistent across variable declarations and type definitions.

### Container type aliases keep their plural name

A type alias whose right-hand side is a container is exempt: `Foo[]`, a tuple such as `[A, B]`, `Array<T>`, and `ReadonlyArray<T>` all genuinely model a collection, so a plural name is the accurate, self-documenting choice. The exemption sees through wrappers that preserve the same shape — the `readonly` type operator, parentheses, and `Readonly<T>`.

Making that container nullable does not change what it models, so `T[] | null` and `T[] | undefined` keep the exemption too. A union is treated as a container when, after discarding its `null` and `undefined` members, **every** remaining member is a container. Two consequences follow from that rule:

- `T[]` and `T[] | null` never disagree. Adding `| null` to an existing alias is a change in optionality, not in cardinality, so it must not suddenly demand a rename.
- A mixed union stays reported. `Edge[] | Edge` can hold a single value, so a plural name there still misleads, and a union of only `null | undefined` holds no collection at all.

The exemption does not widen the set of recognised containers: keyed structures such as `Record<K, V>`, `Map<K, V>`, and `Set<T>` are reported whether or not they are nullable.

### Singular nouns that end in `s` keep their name

`pluralize` de-pluralizes by stripping a trailing `s`, so singular Latin and Greek nouns look plural to it. The rename it proposed was the tell that the identifier was never plural: `Axis` → `Axi`, `Basis` → `Basi`, `Lens` → `Len`, `Chaos` → `Chao`. These nouns are exempt.

Two classes are exempt by shape, because no English plural ends that way:

- **`-sis`** — `Analysis`, `Basis`, `Thesis`, `Diagnosis`, `Hypothesis`, `Synopsis`, `Parenthesis`, `Emphasis`, `Chassis`, `Genesis`, `Hysteresis`.
- **`-ss`** — `Address`, `Progress`, `Access`, `Process`, `Success`.

The neighbouring `-is`, `-us` and `-os` endings get no blanket exemption, because genuine plurals do end that way — `Emojis`, `Minis`, `Kiwis`, `Menus`, `Plateaus`, and `Taxis` (the plural of `taxi`, which is shaped exactly like `Axis`). Exempting those by shape would silence the rule on real collection names, so the nouns in them are enumerated instead: `Axis`, `Praxis`, `Iris`, `Metropolis`, `Status`, `Corpus`, `Census`, `Radius`, `Nucleus`, `Apparatus`, `Bonus`, `Consensus`, `Focus`, `Lens`, `Bias`, `Canvas`, `Chaos`, `Ethos`, and others.

The exemption matches the identifier's **final word**, so it composes with any prefix: `DeferAxis`, `ChartRenderAxis`, `TeamStatus`, and `HTTPStatus` are all exempt, not just the bare noun. The plural of an exempt noun is still reported, so `Statuses`, `Addresses`, and `Analyses` remain errors.

### Examples of **incorrect** code for this rule:

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

// A keyed structure is not a container shape this rule exempts, nullable or not
type Records = Record<string, number> | null;

// Mixed union: `Edge` alone can hold a single value, so the plural misleads
type Edges = Edge[] | Edge;

// Nullish members on their own carry no collection
type Things = null | undefined;

// A real plural that merely shares its shape with an exempt noun
type Emojis = { glyph: string };
type Menus = { items: string };

// The plural of an exempt noun is still plural
type Statuses = { code: number };
type Analyses = { score: number };
// Reported message example:
// Type name 'Users' is plural, which signals a collection and hides whether this alias, interface, or enum represents one value or many. Plural type identifiers push callers to misuse the symbol for arrays or maps. Rename it to a singular noun such as 'User' so the declaration clearly models a single instance and leaves plural names for container types.
```

### Examples of **correct** code for this rule:

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

// Container aliases keep a plural name, because they really are collections
type Users = User[];
type Coords = readonly [number, number];
type Phases = ReadonlyArray<Phase>;

// A nullable container is still a container, so `T[]` and `T[] | null` agree
type AllowedEdges = readonly Edge[] | null;
type Rows = Readonly<Row[]> | undefined;
type Entries = Entry[] | null | undefined;

// Singular nouns that merely end in `s`, and any identifier built on one
type Axis = { min: number; max: number };
type DeferAxis = Readonly<{ label: string; suppressesCensus: boolean }>;
type Analysis = { score: number };
type Address = { line1: string };
type HTTPStatus = { code: number };
type Lens = { get: () => unknown };
```

## When Not To Use It

Disable this rule if your project intentionally names types after collections (e.g., a domain object that is inherently plural) or you prefer a different naming convention. Otherwise, keep it enabled to preserve consistent, self-explanatory type names.

## Further Reading

- [TypeScript Naming Conventions](https://github.com/basarat/typescript-book/blob/master/docs/styleguide/styleguide.md#naming)
