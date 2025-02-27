# Disallow async callbacks in Array.filter() as they lead to incorrect filtering. Since async functions return Promises which are always truthy, the filter will keep all elements regardless of the async check's result. Use Promise.all() with map() first, then filter based on the resolved results (`@blumintinc/blumint/no-async-array-filter`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Async callbacks in array filters are dangerous and not picked up by the standard eslint rules.

## Rule Details

This rule prevents the use of async callbacks in Array.filter. These will return a Promise object, which is truthy, thus rendering the filter function useless.

Examples of **incorrect** code for this rule:

```typescript

['a'].filter(async (x) => true)
['a'].filter(async function(x) {
        return true
      })
```

Examples of **correct** code for this rule:

```typescript

['a'].filter((x) => true)
['a'].filter(function (x) {
      return true
    })
```

