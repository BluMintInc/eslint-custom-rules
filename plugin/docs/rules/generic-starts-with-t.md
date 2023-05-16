# Enforce TypeScript generic types to start with T (`blumint/generic-starts-with-t`)

<!-- end auto-generated rule header -->

This rule enforces that all TypeScript generic types start with the letter "T".

## Rule Details

Generics are a way of creating reusable code components that work with a variety of types as opposed to a single one. By convention, generic type parameters often start with the letter "T". This makes it easier to recognize them as generic types and not regular variables or types.

This rule enforces that all TypeScript generic types start with the letter "T".

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

## When Not To Use It
If you have a different convention for naming generic types in your codebase, you may want to disable this rule.

