# Disallow certain properties on certain objects, with special handling for Object.keys() and Object.values() (`@blumintinc/blumint/no-restricted-properties-fix`)

<!-- end auto-generated rule header -->

> Disallow certain properties on certain objects, with special handling for Object.keys() and Object.values()

This rule is a wrapper around the core ESLint [no-restricted-properties](https://eslint.org/docs/latest/rules/no-restricted-properties) rule that adds special handling for `Object.keys()` and `Object.values()` results.

## Rule Details

The `no-restricted-properties-fix` rule prevents false positives when accessing standard array properties/methods on the arrays returned by `Object.keys()` and `Object.values()`.

This rule is particularly useful when you want to restrict certain properties on specific objects but don't want to inadvertently restrict common array operations on the results of `Object.keys()` and `Object.values()`.

Examples of **correct** code with this rule:

```js
// These should not be flagged even if 'length' is restricted
const myObject = { a: 1, b: 2, c: 3 };
const keyCount = Object.keys(myObject).length;
const valueCount = Object.values(myObject).length;

// These should not be flagged even if 'sort' is restricted
const sortedKeys = Object.keys(myObject).sort();
const sortedValues = Object.values(myObject).sort((a, b) => a - b);

// This should not be flagged even with optional chaining
const exampleAggregation = { teams: { teamA: {}, teamB: {} } };
const teamCount = Object.keys(exampleAggregation.teams ?? {}).length;
```

Examples of **incorrect** code with this rule:

```js
/* eslint @blumintinc/blumint/no-restricted-properties-fix: ["error", [{ "object": "disallowedObject", "property": "disallowedProperty" }]] */
const disallowedObject = { disallowedProperty: 'value' };
const value = disallowedObject.disallowedProperty; // Error: Disallowed object property: 'disallowedObject.disallowedProperty'

/* eslint @blumintinc/blumint/no-restricted-properties-fix: ["error", [{ "property": "push" }]] */
const myArray = [1, 2, 3];
myArray.push(4); // Error: Disallowed object property: 'myArray.push'
```

## Options

This rule accepts an array of objects, where each object specifies the restrictions:

```js
{
  "rules": {
    "@blumintinc/blumint/no-restricted-properties-fix": ["error", [
      {
        "object": "disallowedObjectName",
        "property": "disallowedPropertyName"
      },
      {
        "property": "disallowedPropertyName",
        "allowObjects": ["allowedObjectName1", "allowedObjectName2"]
      }
    ]]
  }
}
```

Each object in the array can have the following properties:

- `object` (string): The name of the object to restrict.
- `property` (string): The name of the property to restrict.
- `message` (string): Optional custom error message.
- `allowObjects` (string[]): Optional array of object names that are allowed to use the restricted property.

## When Not To Use It

If you don't have any object/property combinations to restrict, you should not use this rule.

## Related Rules

- [no-restricted-properties](https://eslint.org/docs/latest/rules/no-restricted-properties) (ESLint core rule)
