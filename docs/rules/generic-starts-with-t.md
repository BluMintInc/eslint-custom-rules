# Enforce TypeScript generic type parameters to start with T so they stand out from runtime values (`@blumintinc/blumint/generic-starts-with-t`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces that all TypeScript generic type parameters start with the letter `T`.

## Rule Details

Generic parameters represent type placeholders. When they are not prefixed with `T`, they can be mistaken for concrete types or runtime parameters, especially in signatures with both runtime arguments and type parameters. Requiring a leading `T` keeps generics visually distinct, helps reviewers spot type placeholders quickly, and reduces misreadings that lead to incorrect refactors.

If a generic type parameter does not start with `T`, the rule reports an error suggesting a `T`-prefixed alternative so you can rename it consistently (e.g., `Param` → `TParam`, `P` → `TP`).

Examples of **incorrect** code for this rule:

```typescript
type GenericType<Param> = Param[];
type GenericType<TParam, Param> = [TParam, Param];
type GenericType<P> = P[];
```

Examples of **correct** code for this rule:

```typescript
type GenericType<TParam> = TParam[];
type GenericType<TParam1, TParam2> = [TParam1, TParam2];
type GenericType<T> = T[];
```

## How to Fix

- Rename generic parameters to start with `T`, preserving the rest of the name to keep intent clear (e.g., `Param` → `TParam`, `ResponseType` → `TResponseType`).
- Apply the same prefix to every generic in a declaration so readers can instantly recognize them as type placeholders.

## When Not To Use It
If you have a different convention for naming generic types in your codebase, you may want to disable this rule.
