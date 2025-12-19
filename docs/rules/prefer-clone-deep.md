# Prefer using cloneDeep over nested spread copying (`@blumintinc/blumint/prefer-clone-deep`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Prefer `cloneDeep` from `functions/src/util/cloneDeep.ts` instead of chaining nested spread operators for deep copies.

## Rule Details

Chained spreads only clone one level of an object. Every deeper property still points at the original structure, so later mutations leak back into the source state/config and invalidate assumptions about immutability. `cloneDeep(base, overrides)` deep-clones the base object first and then applies overrides in one place, keeping referential stability and preserving literal type inference.

### Why cloneDeep instead of nested spreads

- Nested spreads leave inner references shared, so mutations to the "copy" also mutate the source.
- Deep spread chains are hard to read and easy to miss optional branches, especially with conditional spreads.
- `cloneDeep` applies overrides in one call, which keeps TypeScript literal types and avoids brittle spread ordering.

### How to fix violations

1. Identify the base object being spread (the first `...base` entry).
2. Call `cloneDeep(baseObject, { /* overrides */ } as const)` instead of chaining nested spreads.
3. Move only the overridden leaves into the overrides object; the rest is cloned by `cloneDeep`.

### ❌ Incorrect

```ts
const result = {
  ...baseObj,
  data: {
    ...baseObj.data,
    nested: {
      ...baseObj.data.nested,
      value: 42
    }
  }
};

const membership = {
  sender: 'unchanged',
  receiver: 'unchanged',
  membership: {
    ...membershipIncomplete,
    sender: {
      ...membershipIncomplete.sender,
      request: {
        ...membershipIncomplete.sender.request,
        status: 'accepted',
      },
    },
    receiver: {
      ...membershipIncomplete.receiver,
      request: {
        ...membershipIncomplete.receiver.request,
        status: 'accepted',
      },
    },
  },
};
```

### ✅ Correct

```ts
const result = cloneDeep(baseObj, {
  data: {
    nested: {
      value: 42
    }
  }
} as const);

const membership = {
  sender: 'unchanged',
  receiver: 'unchanged',
  membership: cloneDeep(membershipIncomplete, {
    sender: {
      request: {
        status: 'accepted',
      },
    },
    receiver: {
      request: {
        status: 'accepted',
      },
    },
  } as const),
};
```

## When Not To Use It

- Objects that contain functions or symbols, which `cloneDeep` does not clone safely
- Single-level, shallow copies where nested references are intentionally shared
- Scenarios that need a custom mix of shallow and deep copying for performance or semantics

## Version

This rule was introduced in v1.0.0

## Further Reading

- [Spread syntax (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Deep cloning objects in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#deep_clone)
