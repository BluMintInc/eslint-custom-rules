# Disallow Array.forEach with an async callback function (`@blumintinc/blumint/no-async-foreach`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows the use of `Array.forEach` callbacks with the async keyword. These are typically found when sequential promise execution is desired, but in fact these will execute almost concurrently. The use of a standard `for` loop is suggested instead, which will execute sequentially. If concurrent execution is required, `Promise.all` or `Promise.allSettled` should be used.

## Rule Details

This rule is aimed at ensuring that the async keyword is not used in an `Array.forEach` callback.

Examples of **incorrect** code for this rule:

```typescript
['a','b','c'].forEach(async (letter) => {
    await someAsyncFunction(letter)
    console.log(letter)
    })
['foo','bar'].forEach(async function (letter) {
    await someAsyncFunction(letter)
    console.log(letter)
})
```

Examples of **correct** code for this rule:

```typescript
['a','b','c'].forEach(letter) => {
    someSyncFunction(letter)
    console.log(letter)
    })
['foo','bar'].forEach(function (letter) {
    someSyncFunction(letter)
    console.log(letter)
})
for (const letter of ['a', 'b', 'c']) {             
    someSyncFunction(letter);
    console.log(letter); 
 }
```