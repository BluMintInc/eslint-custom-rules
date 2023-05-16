# Disallow async callbacks for Array.filter (`blumint/no-async-array-filter`)

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Async callbacks in array filters are dangerous and not picked up by the standard eslint rules.

## Rule Details

This rule prevents the use of async callbacks in Array.filter. These will return a Promise object, which is truthy, thus rendering the filter function useless.

Examples of **incorrect** code for this rule:

```js

['a'].filter(async (x) => true)
['a'].filter(async function(x) {
        return true
      })
```

Examples of **correct** code for this rule:

```js

['a'].filter((x) => true)
['a'].filter(function (x) {
      return true
    })
```

