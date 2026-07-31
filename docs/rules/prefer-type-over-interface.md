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
