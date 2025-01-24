# Prevent misuse of Array methods in OOP (`@blumintinc/blumint/array-methods-this-context`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows the direct use of class methods in Array methods like 'map', 'filter', 'forEach', 'reduce', 'some', 'every'. Instead, arrow functions should be used to preserve the 'this' context.

## Rule Details

This rule enforces that no class methods are directly used in Array methods. It also prefers the use of arrow functions over `bind(this)`

### Examples of incorrect code for this rule:

```typescript
['a', 'b', 'c'].map(this.processItem)
['a', 'b', 'c'].map(this.processItem, otherArgument)
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
['a', 'b', 'c'].map(processItem)
```
