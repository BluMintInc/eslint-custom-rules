# Enforce abstraction of private static methods into utility functions (`@blumintinc/blumint/prefer-utility-function-over-private-static`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Private static methods that do not touch class state are really module-level utilities hidden inside a class. Keeping them private and static signals unnecessary coupling to the class, makes them harder to reuse, and makes isolated unit testing awkward. Extracting these helpers into standalone utility functions keeps classes lean and clarifies which code truly depends on class state.

## Rule Details

This rule flags private static members that:

- Are declared as a **method**, a **getter**, or a **property holding a function** — setters and properties holding anything else are out of scope, see below
- Do not reach their own class anywhere in their body (including nested callbacks)
- Have a non-trivial body — **two or more statements**

### Member kinds in scope

Both member spellings are covered. Which syntax an author picked does not change
whether the logic is class-agnostic, so it does not change the verdict either.

| Member kind | In scope | Why |
| --- | --- | --- |
| `private static method()` | Yes | Moves to module scope as-is. |
| `private static member = () => {}` | Yes | Moves to module scope as-is; module scope holds the arrow form. |
| `private static member = function () {}` | Yes | Same helper as the arrow spelling. |
| `private static get member()` | Yes | The body moves to a module-level function the getter calls, or that the call sites call directly. |
| `private static set member(value)` | No | The prescribed extraction cannot be performed. |
| `private static MEMBER = 10` | No | A property holding no function holds no logic to extract. |

A function-valued property is in scope because it is the same hidden utility a
method is, with the same remedy: module scope holds the arrow and function-
expression forms a property holds, so the helper moves out unchanged. Examining
only the method spelling would leave a one-character evasion — writing `=` in
front of a helper would silence the rule without changing anything about the
logic it flags.

The property arm matches `private static` exactly as the method arm does. Every
other modifier — `protected static`, `public static`, bare `static`, and any
non-static member — is out of scope for both spellings.

A getter is in scope because a class-agnostic getter body is the same hidden
utility a class-agnostic method body is, and it has the same remedy one step
removed: extract the body into a module-level function and call it from the
getter, or from the call sites directly. Excluding getters would leave a
one-keyword evasion — writing `get` in front of a helper would silence the rule
without changing anything about the logic it flags.

A setter is excluded because the remedy cannot be carried out. A setter has no
return value and module scope has no setter form, so there is no module-level
function that replaces it: the accessor has to stay to receive the assignment.
A rule that reports a member whose prescribed rewrite is unavailable is
unenforceable, so setters are silent at any size and whatever their body reads.

Reports name the member kind they found, so an accessor reads as
`Private static getter "x"` and a function-valued property reads as
`Private static property "x"`, rather than either reading as a method — a
developer told a "method" is at fault would search for a declaration the class
does not hold.

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

### What counts as reading class state

**A member reads class state when it dereferences a member of its class.** The
dereference is what decides, not the spelling of the receiver: inside a static
member `this` *is* the class, so `this` and the class name are two spellings of
one receiver and get one answer. The definition applies to a function-valued
property just as it does to a method, since `this` inside a static property
initializer is the class too.

These all count as using class state:

- `this.member`, including the computed `this['member']`
- `<ClassName>.member`, where `ClassName` is the enclosing class — including the
  optional-chained `<ClassName>?.member` and the computed `<ClassName>['member']`
- `owner.member`, where `owner` is a binding holding the class or `this`
  (`const owner = ClassName`, `const self = this`)
- `const { member } = ClassName`, `const { member } = this` and
  `const { member } = owner` — the pattern is the dereference, provided it names
  at least one property
- `super.member`
- `new.target`

The class name is matched by binding, not by text: a local variable or parameter
that shadows the class name reads as an unrelated value, and another class's
static member (`OtherClass.MEMBER`) leaves the report standing. A member reading
a `private static` member of its own class is never reported, because such a
member is unreachable from module scope and so the extraction this rule
prescribes is impossible for it.

### Aliases of the class binding

Binding the class to a local first changes the syntax that reaches a member, not
which member is read, so `const owner = ClassName; owner.MEMBER` counts exactly
as `ClassName.MEMBER` does. The alias is resolved by binding as well: a local
initialized from anything else is not the class even if it is named like one,
and an alias of a local that shadows the class name resolves to the shadow.

Chains are followed to a fixpoint — `const a = ClassName; const b = a; b.MEMBER`
reads the same member — because no chain length changes the answer, so any fixed
depth would misreport the read one hop past it.

An alias is credited only when it provably still holds the class wherever it is
dereferenced: it has one declaration, that declaration initializes it from the
class, and nothing writes to it afterwards. A binding reassigned anywhere in the
file may hold something else by the time it is used, so it is not credited and
the report stands.

Aliasing `this` is resolved the same way, because `this` in a static member is
the class: `const self = this; self.MEMBER` reads that member, and
`const a = this; const b = a; b.MEMBER` does too. Mentioning `this` is not by
itself a state read — the dereference is.

A destructuring pattern counts only when it names a property. `const {} = C`
selects nothing, and `const { ...rest } = C` selects nothing either — that is
the shape `no-unnecessary-destructuring` reports and rewrites to the plain
assignment `const rest = C`, so it is an alias of the class rather than a read
of one of its members. `const { MEMBER, ...rest } = C` does name a member and so
counts.

**Construction and `instanceof` are not state reads.** `new ClassName()`,
`new owner()`, `x instanceof ClassName` and `x instanceof owner` all leave the
report standing, and so does handing the class to something else as a value
(`register(owner)`). A helper that only instantiates or type-tests the class
touches none of its state and works unchanged at module scope, which is the
helper this rule exists to surface. Only a dereference of a member makes a
helper unable to move.

The `this` spelling sits on the same boundary, since it is the same receiver:
`new this()`, `const self = this; new self()`, `x instanceof this` and
`register(this)` all leave the report standing, while `this.MEMBER` and
`const self = this; self.MEMBER` do not. Two spellings of one non-state use
cannot get opposite verdicts.

Inside a nested `function` written in the member body, `this` is the call-time
receiver rather than the class, but a dereference through it is still treated as
a class-state read: deciding the receiver needs the call sites, which the member
alone does not carry, and this rule prefers a missed report to a wrong one.

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

```ts
// Binding the class to a local does not turn construction into a state read:
// this helper works unchanged at module scope
export class Aliased {
  private static readonly LIMIT = 10;

  private static buildAll(values: number[]) {
    const owner = Aliased;
    const made = values.map(() => new owner());
    return made;
  }
}
```

```ts
// `this` in a static member is the class, so it sits on the same boundary the
// class name does: constructing through an alias of it reads no member
export class Aliased {
  private static readonly LIMIT = 10;

  private static buildAll(values: number[]) {
    const self = this;
    const made = values.map(() => new self());
    return made;
  }
}
```

```ts
// A getter is measured exactly as a method is
export class RequestDefaults {
  private static get config() {
    const base = { retries: 3 };
    const extra = { timeout: 1000 };
    return { ...base, ...extra };
  }
}
```

```ts
// A property holding a function is measured exactly as a method is
export class Repro {
  private static computeAlt = (v: number) => {
    const doubled = v * 2;
    const capped = Math.min(doubled, 10);
    return capped;
  };
}
```

```ts
// A function expression is the same helper as an arrow, and `readonly`
// restricts reassignment of the binding rather than what the function reaches
export class Repro {
  private static readonly computeAll = function (values: number[]) {
    const doubled = values.map((value) => value * 2);
    return doubled.filter((value) => value > 0);
  };
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
// statement threshold and escapes on `this.multiplier`; the getter is in scope
// as a getter and escapes on the same size rule a method would, as a
// single-statement body.
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
// The remedy for a reported getter: the body becomes a module-level function
// and the accessor calls it
export const buildConfig = () => {
  const base = { retries: 3 };
  const extra = { timeout: 1000 };
  return { ...base, ...extra };
};

export class RequestDefaults {
  private static get config() {
    return buildConfig();
  }
}
```

```ts
// A setter is never reported, whatever its size: no module-level function can
// take its place, so the extraction this rule prescribes is unavailable to it
export class Recorder {
  private static set payload(value: string[]) {
    const trimmed = value.map((entry) => entry.trim());
    const named = trimmed.filter((entry) => entry.length > 0);
    console.log(named);
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
// A local holding the class reaches the same member the qualified spelling does
export class Aliased {
  private static readonly LIMIT = 10;

  private static capAll(values: number[]) {
    const owner = Aliased;
    const capped = values.map((value) => Math.min(value, owner.LIMIT));
    return capped;
  }
}
```

```ts
// An alias of `this` reaches the same member `this.MEMBER` does
export class Aliased {
  private static readonly LIMIT = 10;

  private static capAll(values: number[]) {
    const self = this;
    const capped = values.map((value) => Math.min(value, self.LIMIT));
    return capped;
  }
}
```

```ts
// A property holding no function holds no logic to extract, whatever its
// modifiers
export class Limits {
  private static LIMIT = 10;
  private static readonly NAMES: string[] = ['first', 'second'];
}
```

```ts
// A function-valued property escapes on the same two rules a method does: the
// first is too small to be worth extracting, and the second reads class state
export class Repro {
  private static readonly LIMIT = 10;

  private static double = (value: number) => {
    return value * 2;
  };

  private static capAll = (values: number[]) => {
    const capped = values.map((value) => Math.min(value, Repro.LIMIT));
    return capped;
  };
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
