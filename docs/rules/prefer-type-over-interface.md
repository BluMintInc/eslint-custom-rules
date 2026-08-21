# Prefer using type alias over interface (`@blumintinc/blumint/prefer-type-over-interface`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces `type` aliases instead of `interface` declarations so object shapes stay closed and predictable.

Interfaces can merge across files and dependencies, which means a shape may change without edits to the file that declared it. Extends chains can spread properties across multiple declarations, making the resulting surface harder to trace. Using `type` aliases keeps the contract sealed and uses intersections explicitly when you need to compose shapes, so readers see exactly what is included.

## Rule Details

The rule reports each `interface` declaration that a `type` alias can replace, and offers an autofix that rewrites it. When an interface extends other interfaces, the fix converts the whole heritage list to an intersection so the composed shape stays explicit, including when several interfaces are extended at once:

```typescript
// before
interface TeamMember extends UserProfile, Auditable, Archivable {
  role: string;
}

// after
type TeamMember = UserProfile &
  Auditable &
  Archivable & {
    role: string;
  };
```

The fix also terminates the declaration. An interface body's closing `}` ends the declaration on its own, while a type alias is an assignment that needs a statement terminator, so the rewrite appends `;` after the body. Automatic semicolon insertion would cover the omission — the emission parses either way, which is why no linter can see it — but a formatter writes the terminator, so leaving it out puts every converted declaration out of format. When the source already terminated the declaration (`interface Options { ... };`, where TypeScript reads the `;` as an empty statement), the token after the body is read and no second `;` is added.

### Intersection layout with two or more heritage clauses

Prettier lays out an intersection whose last member is an object literal one arm per line, indenting the object, once there are two or more preceding arms — whether or not the joined line fits inside `printWidth`. That layout belongs to the shape rather than to an overflow, so the fix emits it directly and the output passes `prettier --check` without a formatter run.

One heritage clause stays on the alias line (`type Member = Profile & {`), as does a conversion with no heritage clause at all. An object literal the author kept hugged never joins the per-line layout either, so an empty body or a body written on one line keeps the joined form:

```typescript
// before
interface Blank extends Auditable, Archivable {}

// after
type Blank = Auditable & Archivable & {};
```

The body shifts one level to follow the object, and it shifts by insertion rather than by being reprinted, so every byte the author wrote survives. Two interiors are exempt from the shift because their whitespace is content, not layout: a multi-line template literal — where an inserted space would change the string the program computes — and a block comment whose continuation lines do not open with `*`, which the formatter also leaves alone. A JSDoc block is realigned with the member it annotates, which is what the formatter does with it.

```typescript
// before
interface Templated extends Auditable, Archivable {
  query: `SELECT
  *
FROM t`;
}

// after
type Templated = Auditable &
  Archivable & {
    query: `SELECT
  *
FROM t`;
  };
```

### Autofix limitation: an alias line wider than `printWidth`

The layout above is width-independent, which is what lets the fix emit it. Prettier answers one case differently: when the alias line itself — `type Name = firstClause &` — passes `printWidth`, it drops the first clause onto its own line and indents the whole chain a level deeper. That answer is a response to the width, and the width belongs to the consumer's formatter configuration, which a lint rule cannot read. Keying the emission on 80 columns would emit the deeper layout for a project formatting at 100, so the fix leaves this one to the formatter: a heritage clause long enough to overflow the alias line on its own is reflowed by the next `prettier --write`.

### Autofix limitation: comments in the declaration header

The fix rewrites the text spanning the `interface` keyword, the name and the heritage list in one step, so a comment placed inside that span has nowhere to go. Rather than delete it, the rule reports the declaration without offering a fix when a comment sits between `interface` and the opening brace:

```typescript
// reported, but not autofixed
interface TeamMember /* audited quarterly */ extends UserProfile {
  role: string;
}
```

Move the comment above the declaration or inside the body to make the declaration autofixable.

### Autofix limitation: default-exported interfaces

`export default interface X { ... }` is reported without a fix. TypeScript has no default-exported type alias — `export default type X = ...` is a syntax error in every form — so the keyword swap the fix performs has nowhere to land, and applying it would leave a file that no longer parses.

The conversion is still available, as a two-statement restructure the autofix cannot express:

```typescript
// reported, but not autofixed
export default interface Options {
  retries: number;
}
```

```typescript
// the conversion, applied by hand
type Options = {
  retries: number;
};
export type { Options as default };
```

Written this way the module keeps its default export, so every existing `import Options from './options'` goes on resolving exactly as it did against the interface, and the declaration type-checks under `isolatedModules` and `verbatimModuleSyntax` alike. A named export (`export type Options = { ... }`) is equally valid and often clearer, at the cost of updating each import site to `import type { Options }`.

Unlike a merged declaration, this shape is not exempted outright: the report is actionable, because the author can perform the conversion — only the mechanical rewrite is unavailable.

### Exemption: module augmentations

Interfaces inside a module augmentation are not reported. Declaration merging is the entire purpose of such a block and only `interface` can merge, so the rewrite is not a style change: the alias stops augmenting anything, collides with the declaration it was meant to extend (`TS2300: Duplicate identifier`), and the added members silently disappear (`TS2339: Property ... does not exist`).

A block is treated as an augmentation when it targets an external module (`declare module 'pkg'`, whose name is a string literal) or the global scope (`declare global`, including the bare `global { ... }` form nested inside an ambient module). The interface may sit anywhere inside the block, not just as a direct child.

```typescript
// allowed: merges into the DOM's Window
export {};
declare global {
  interface Window {
    blumintFlag: string;
  }
}

// allowed: merges into MUI's own Theme
declare module '@mui/material/styles' {
  interface Theme {
    border: string;
  }
  interface Palette extends PaletteDynamic {}
}
```

The exemption is deliberately keyed on the augmentation shape rather than on the `.d.ts` file extension, because a declaration file can also hold ordinary interfaces that merge with nothing and should still be reported.

A plain namespace is not an augmentation — it declares its own scope instead of extending one another file owns — so interfaces inside it are still reported, and a type alias is a working replacement there. The same holds for `declare namespace X` and its legacy spelling `declare module X` (an identifier name, not a module specifier), where `declare` only marks the body as ambient:

```typescript
// reported and autofixed
namespace Internal {
  interface Helper {
    id: string;
  }
}
```

### Exemption: merged declarations

A name that carries more than one declaration in the same scope is **not** reported, because merging is precisely the thing a `type` alias cannot express. Rewriting one half of a merge emits two declarations of the same name (`TS2300: Duplicate identifier`) and splits the shape, so members that used to coexist no longer do:

```typescript
// allowed: one merged type, not two declarations to convert
interface QueryLike {
  limit: (count: number) => void;
}
interface QueryLike {
  orderBy: (field: string) => void;
}
```

Converting either half above yields `type QueryLike = ...` twice, which does not compile, and `q.limit` and `q.orderBy` stop being properties of the same type. There is no fix a developer could apply by hand either, so the declaration is exempted outright rather than reported without a fix — an unactionable report only produces an `eslint-disable`.

The same applies to an interface merged into a class, since `class` already owns the type-space slot the alias would claim:

```typescript
// allowed: `label` merges onto Widget's instance type
class Widget {
  id = '';
}
interface Widget {
  label: string;
}
```

The check is keyed on the **declaring scope**, not on a count of the name across the file, because merging is a property of the declaration space. Two same-named interfaces in different function bodies, blocks or namespaces are distinct types that never merge, and each is still reported and autofixed:

```typescript
// reported and autofixed: these two never merge
function one() {
  interface Config {
    a: string;
  }
  return null as unknown as Config;
}
function two() {
  interface Config {
    b: string;
  }
  return null as unknown as Config;
}
```

The exemption is per name, so an unmerged interface sharing a file with a merged pair is still reported. It is also deliberately broader than TypeScript's merging table: a same-named *value* such as `function Adapter() {}` alongside `interface Adapter` would in fact survive the rewrite, but it is exempted anyway. Modelling every merging combination would risk a fix that breaks the build, and this rule prefers a missed report to that.

### Examples of **incorrect** code for this rule:

The following interface declarations are reported and autofixed:

```typescript
interface UserProfile {
  id: string;
}

interface TeamMember extends UserProfile {
  role: string;
}
```

### Examples of **correct** code for this rule:

Equivalent shapes written as type aliases (allowed):

```typescript
type UserProfile = {
  id: string;
};

type TeamMember = UserProfile & {
  role: string;
};
```

## Why prefer types over interfaces?

- Prevent declaration merging from silently altering an exported shape in another file or dependency.
- Keep composition explicit with intersections so consumers see the full contract in one place.
- Align with intersection-heavy patterns where property order and exact shape predictability matter.

Merging is exactly what a module augmentation asks for, which is why those blocks are exempt: there the merge is the deliberate, declared intent rather than an accident of an open shape. The same reasoning exempts a name already declared more than once in one scope — the merge has already happened, and no `type` alias can reproduce it.
