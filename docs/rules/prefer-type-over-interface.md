# Prefer using type alias over interface (`@blumintinc/blumint/prefer-type-over-interface`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces `type` aliases instead of `interface` declarations so object shapes stay closed and predictable.

Interfaces can merge across files and dependencies, which means a shape may change without edits to the file that declared it. Extends chains can also reorder properties, making the resulting surface less obvious. Using `type` aliases keeps the contract sealed and uses intersections explicitly when you need to compose shapes, so readers see exactly what is included.

## Rule Details

The rule reports every `interface` declaration and offers an autofix that rewrites it to a `type` alias. When an interface extends another interface, the fix converts `extends` to an intersection so the composed shape stays explicit.

Examples of **incorrect** code for this rule:

```typescript
interface UserProfile {
  id: string;
}

interface TeamMember extends UserProfile {
  role: string;
}
```

Examples of **correct** code for this rule:

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

## Options

This rule does not have any configuration options.
