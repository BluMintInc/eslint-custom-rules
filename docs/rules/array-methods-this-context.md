# Prevent misuse of Array methods in OOP (`@blumintinc/blumint/array-methods-this-context`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule ensures array callbacks keep the class instance available. Passing a method reference such as `this.processItem` to `map` or `filter` strips the lexical `this`, which leads to runtime errors once the callback runs without a bound context. Using `.bind(this)` hides the dependency on the class and allocates a new function instead of using the natural lexical binding an arrow callback provides. Prefer arrow callbacks that call the method, so `this` stays stable and the code reads as instance-aware work.

## Rule Details

This rule reports when:

- A class method reference is passed directly to `map`, `filter`, `forEach`, `reduce`, `some`, or `every`, because the callback runs without the class `this` and can throw or mutate the wrong context.
- A callback is wrapped in `.bind(this)` for these array methods, because rebinding hides the reliance on the instance and creates extra functions instead of using an arrow to capture `this`.

Use an inline arrow callback to keep `this` intact and make the dependency on the instance explicit.

### Examples of incorrect code for this rule:

```typescript
['a', 'b', 'c'].map(this.processItem)
['a', 'b', 'c'].map(this.processItem, otherArgument)
['a', 'b', 'c'].map(this['processItem'])
['a', 'b', 'c'].filter(this.checkItem)
['a', 'b', 'c'].forEach(this.printItem)
['a', 'b', 'c'].some(this.testItem)
['a', 'b', 'c'].every(this.validateItem)
['a', 'b', 'c'].reduce(this.combineItems)
['a', 'b', 'c'].map(function(item) { return this.processItem(item) }.bind(this))
```

### Examples of correct code for this rule:
```typescript
['a', 'b', 'c'].map((item) => this.processItem(item))
['a', 'b', 'c'].filter((item) => this.checkItem(item))
['a', 'b', 'c'].map((item) => this['processItem'](item))
['a', 'b', 'c'].map(processItem)
```
