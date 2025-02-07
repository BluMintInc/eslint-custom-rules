# scopes-read-top-to-bottom

This rule enforces a "top-to-bottom" ordering for scopes in the code, ensuring a linear and readable flow of execution. Similar to `@blumintinc/blumint/class-methods-read-top-to-bottom`, this rule requires that variables and function calls be arranged such that dependencies appear before the code that relies on them.

## Rule Details

This rule aims to enhance readability by preventing scattered dependencies and requiring developers to move related pieces of code closer together.

### Special Considerations

1. React Hooks are never reordered to maintain React's rules of hooks
2. Conditional blocks with side effects are not reordered
3. For-loops with side effects are not reordered
4. The rule enforces a natural, logical flow rather than simply sorting declarations alphabetically

### Examples

Examples of **incorrect** code for this rule:

```ts
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};
```

```ts
const b = a + 2;
const a = 1;
```

Examples of **correct** code for this rule:

```ts
const group = useGroupDoc();
const { id } = group || {};

const { groupTabState } = useGroupRouter();
```

```ts
const a = 1;
const b = a + 2;
```

### Edge Cases

#### React Hooks Cannot Be Moved
React Hooks must be called in the same order on every render. The rule will never reorder hooks:

```ts
// This is valid and will not be reordered
const [state, setState] = useState(null);
const { id } = group || {};
```

#### If-Statements with Side Effects
If-statements that return early or mutate state will not be moved:

```ts
// This is valid and will not be reordered
const id = getId();
let data;
if (shouldFetch) {
  data = fetchData();
}
```

#### For-Loops with Side Effects
Loops that modify external state will not be reordered:

```ts
// This is valid and will not be reordered
console.log('Processing started');
let results = [];
for (const item of items) {
  results.push(processItem(item));
}
```

## When Not To Use It

If your codebase has a different organization pattern or if you prefer to group related code by functionality rather than dependency order, you might want to disable this rule.
