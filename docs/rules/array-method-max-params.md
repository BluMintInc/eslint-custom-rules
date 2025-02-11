# array-method-max-params

Enforce maximum number of parameters while allowing array method callbacks to use their standard parameters.

## Rule Details

This rule extends the functionality of ESLint's built-in `max-params` rule by making special allowances for array method callbacks. It recognizes that array methods like `reduce`, `map`, `filter`, etc. have standard parameters that should not count against the maximum parameter limit.

The following array methods are supported with their standard parameter counts:
- `reduce`, `reduceRight`: 4 parameters (accumulator, currentValue, index, array)
- `map`, `filter`, `forEach`, `every`, `some`, `find`, `findIndex`: 3 parameters (currentValue, index, array)

### Examples of **incorrect** code for this rule:

```ts
// With { max: 2 }

// Regular functions still follow max param limit
function foo(a, b, c) { // Error: too many parameters (3)
  return a + b + c;
}

// Array method callbacks can't exceed their standard parameter count
array.reduce((acc, curr, index, arr, extra) => acc + curr, 0); // Error: too many parameters (5)

array.map((item, index, arr, extra) => item * 2); // Error: too many parameters (4)
```

### Examples of **correct** code for this rule:

```ts
// With { max: 2 }

// Regular functions follow max param limit
function foo(a, b) {
  return a + b;
}

// Array method callbacks can use their standard parameters
array.reduce((acc, curr, index, arr) => acc + curr, 0);

array.map((item, index, arr) => item * 2);

array.filter((item, index, arr) => item > 0);

// Works with TypeScript types
const dayToEvents = hits.reduce(
  (prev: Record<string, EventKeyed[]>, curr: THit, index: number) => {
    return prev;
  },
  {} as Record<string, EventKeyed[]>
);
```

## Options

The rule accepts an options object with the following properties:

```ts
{
  "max": 2 // Maximum number of parameters for regular functions (default: 2)
}
```

## When Not To Use It

If you want to enforce a strict parameter limit regardless of the function's context, use ESLint's built-in `max-params` rule instead.
