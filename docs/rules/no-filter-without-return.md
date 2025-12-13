# Disallow Array.filter callbacks without an explicit return (if part of a block statement) (`@blumintinc/blumint/no-filter-without-return`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows `Array.filter` callbacks that use braces but never return a boolean. A block-bodied arrow function defaults to returning `undefined`, which `filter` treats as `false` for every element. That silently drops all items and hides the actual intent of the predicate.

## Rule Details

`Array.filter` keeps an element only when the callback returns a truthy value. If the callback has a block body and does not return, the predicate always produces `undefined`, so the filtered array becomes empty even if the callback contains side effects like logging or metric collection. This rule ensures block-bodied callbacks return the boolean condition they mean to evaluate, or that you use a concise arrow for implicit returns.

### Why this matters

- A missing `return` in a block-bodied predicate turns the filter into "drop everything," which is hard to notice because the callback still executes.
- Explicitly returning the condition documents the keep/remove rule and avoids subtle bugs when the code later adds logic branches.

### How to fix

- Add `return <condition>` inside the block.
- Or switch to a concise arrow when the body is a single expression, e.g., `array.filter((item) => condition(item))`.

Examples of **incorrect** code for this rule:

```typescript
['a'].filter((x) => { console.log(x) })

['a'].filter((x) => {
  if (x) {
    return true
  } else {
    // forgot to return in the else branch
  }
})

['a'].filter((x) => {
  if (x !== 'a') {
    console.log(x)
  } else {
    return true
  }
})
```

Examples of **correct** code for this rule:

```typescript
['a'].filter((x) => !x)
['a'].filter((x) => !!x)
['a'].filter((x) => {
    if (x === 'test') {
        return true
    }
    else {
        return false
    }
})
['a'].filter(function (x) {
  return true
})
['a'].filter((x) => x === 'a' ? true : false)
['a'].filter((x) => x !== 'a')
```