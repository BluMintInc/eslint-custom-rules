# Enforce abstraction of private static methods into utility functions (`@blumintinc/blumint/prefer-utility-function-over-private-static`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Private static methods that do not touch class state are really module-level utilities hidden inside a class. Keeping them private and static signals unnecessary coupling to the class, makes them harder to reuse, and makes isolated unit testing awkward. Extracting these helpers into standalone utility functions keeps classes lean and clarifies which code truly depends on class state.

## Rule Details

This rule flags private static methods that:

- Do not reach their own class anywhere in their body (including nested callbacks)
- Have a non-trivial body — **two or more statements**

The size threshold is measured in statements, not lines. A line count moves with
formatting: a JSDoc block, a line comment or a blank line inside the body would
push a one-statement helper over the threshold, a single statement wrapped
across several lines would do the same, and several statements joined onto one
line would slip under it. None of those change how much work the helper does.

Statements nested inside blocks, control flow and inner functions count toward
the total, so a helper whose whole body sits inside one `try`, `if` or `for`, or
that returns the result of one multi-statement callback, is measured by what it
contains rather than by its outermost statement. An empty body and a body of a
single statement are trivial and never reported, whatever their shape.

A function body holding only a `return` or a single expression is the block
spelling of a concise arrow — `(x) => { return x * 2; }` is `(x) => x * 2` — so
it contributes nothing beyond the statement it sits in. A chained call whose
callbacks are one-expression functions therefore stays one statement in either
spelling.

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

```ts
// Joining the statements onto one line does not make the helper trivial
export class Example {
  private static compute(value: number) { const doubled = value * 2; const squared = value * value; return doubled + squared; }
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
// Reading class state is allowed at any size. `withClassState` is over the
// statement threshold and escapes on `this.multiplier`; the getter escapes
// separately, as a single-statement body.
export class Example {
  private static withClassState(values: number[]) {
    const scaled = values.map((value) => value * this.multiplier);
    return scaled.filter((value) => value > 0);
  }

  private static get multiplier() {
    return 2;
  }
}
```

```ts
// A single statement is trivial however it is documented or wrapped
export class Slugger {
  private static toSlug(title: string) {
    // Comments and line breaks do not count toward the threshold.
    return title.trim().toLowerCase().replace(/\s+/g, '-');
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
