# Prefer using type alias over interface (`@blumintinc/blumint/prefer-type-over-interface`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces `type` aliases instead of `interface` declarations so object shapes stay closed and predictable.

Interfaces can merge across files and dependencies, which means a shape may change without edits to the file that declared it. Extends chains can spread properties across multiple declarations, making the resulting surface harder to trace. Using `type` aliases keeps the contract sealed and uses intersections explicitly when you need to compose shapes, so readers see exactly what is included.

## Rule Details

The rule reports every `interface` declaration and offers an autofix that rewrites it to a `type` alias. When an interface extends other interfaces, the fix converts the whole heritage list to an intersection so the composed shape stays explicit, including when several interfaces are extended at once:

```typescript
// before
interface TeamMember extends UserProfile, Auditable, Archivable {
  role: string;
}

// after
type TeamMember = UserProfile & Auditable & Archivable & {
  role: string;
};
```

### Autofix limitation: comments in the declaration header

The fix rewrites the text spanning the `interface` keyword, the name and the heritage list in one step, so a comment placed inside that span has nowhere to go. Rather than delete it, the rule reports the declaration without offering a fix when a comment sits between `interface` and the opening brace:

```typescript
// reported, but not autofixed
interface TeamMember /* audited quarterly */ extends UserProfile {
  role: string;
}
```

Move the comment above the declaration or inside the body to make the declaration autofixable.

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

Merging is exactly what a module augmentation asks for, which is why those blocks are exempt: there the merge is the deliberate, declared intent rather than an accident of an open shape.
