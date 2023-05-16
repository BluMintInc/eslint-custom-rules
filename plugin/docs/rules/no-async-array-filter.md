# Disallow async callbacks for Array.filter (`blumint/no-async-array-filter`)

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

