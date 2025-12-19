# Disallow Array.filter callbacks without an explicit return (if part of a block statement) (`@blumintinc/blumint/no-filter-without-return`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows the use of `Array.filter` callbacks that are part of a block statement but do not contain an explicit return statement. When using `Array.filter`, it's common to return a boolean value directly from a concise arrow function. However, if you're using a block statement (enclosed in `{}`), an explicit `return` statement is required.

## Rule Details

This rule is aimed at ensuring that there is an explicit return statement in `Array.filter` callbacks that are part of a block statement.

Examples of **incorrect** code for this rule:

```typescript
['a'].filter((x) => {console.log(x)})
['a'].filter((x) => {if (x) {
    return true
}
else {}
}
)
['a'].filter((x) => { if (x !== 'a') { console.log(x) } else { return true } })
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
```