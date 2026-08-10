# Enforce abstraction of private static methods into utility functions (`@blumintinc/blumint/prefer-utility-function-over-private-static`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Private static methods that do not touch class state are really module-level utilities hidden inside a class. Keeping them private and static signals unnecessary coupling to the class, makes them harder to reuse, and makes isolated unit testing awkward. Extracting these helpers into standalone utility functions keeps classes lean and clarifies which code truly depends on class state.

## Rule Details

This rule flags private static methods that:

- Do not reach their own class anywhere in their body (including nested callbacks)
- Have a non-trivial body (four or more lines including braces)

A method reaches its class through any of these spellings, all of which count as
using class state:

- `this.member`
- `<ClassName>.member`, where `ClassName` is the enclosing class — including the
  optional-chained `<ClassName>?.member` and the computed `<ClassName>['member']`
- `super.member`
- `new.target`

The class name is matched by binding, not by text: a local variable or parameter
that shadows the class name reads as an unrelated value, and another class's
static member (`OtherClass.MEMBER`) leaves the report standing. A method reading
a `private static` member of its own class is never reported, because such a
member is unreachable from module scope and so the extraction this rule
prescribes is impossible for it.

Why this matters:

- Private statics suggest the logic needs class context even when it does not, which encourages future edits to add hidden coupling.
- Moving class-agnostic helpers to utilities makes them reusable across files and simpler to unit test in isolation.
- Keeping the class surface focused on behavior that truly depends on its state improves readability and refactoring safety.

## Examples

### Examples of **incorrect** code for this rule:

```ts
export class DataProcessor {
  private static processData(data: Item[]) {
    const filtered = data.filter((item) => item.active);
    return filtered.map((item) => item.value);
  }
}
```

```ts
export class JsonParser {
  private static safeParseJson(input: string, fallback: unknown = null) {
    try {
      return JSON.parse(input);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      return fallback;
    }
  }
}
```

### Examples of **correct** code for this rule:

```ts
// Extracted to a reusable utility
export const processData = (data: Item[]) => {
  const filtered = data.filter((item) => item.active);
  return filtered.map((item) => item.value);
};

export class DataProcessor {
  static process(data: Item[]) {
    return processData(data);
  }
}
```

```ts
// Using class state is allowed
export class Example {
  private static withClassState(value: number) {
    return value * this.multiplier;
  }

  private static get multiplier() {
    return 2;
  }
}
```

```ts
// The class-name-qualified spelling reaches the same state as `this`
export class PriceTotals {
  private static readonly EMPTY_PRICES: readonly number[] = [];

  private static sumActivePrices(items: Item[]) {
    const active = items.filter((item) => item.active);
    const prices = active.length
      ? active.map((item) => item.price)
      : PriceTotals.EMPTY_PRICES;
    return prices.reduce((sum, price) => sum + price, 0);
  }
}
```
