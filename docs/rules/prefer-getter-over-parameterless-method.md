# prefer-getter-over-parameterless-method

Enforce using getter syntax for synchronous class methods that take no parameters and return a value. Methods with parentheses communicate an action, while getters communicate that a computed value is being accessed. Converting eligible methods to getters improves API ergonomics (`instance.value` instead of `instance.value()`) and avoids accidental omission of parentheses.

## Rule Details

This rule reports parameterless, non-abstract, synchronous methods that return a value and are not in the ignore lists. It auto-fixes safe cases by:

- Converting `methodName()` to `get <suggestedName>`
- Preserving access modifiers, `static`, decorators, and return type annotations
- Stripping configurable verb prefixes (for example, `getUser()` → `get user`)
- Keeping boolean prefixes intact (`isValid()` → `get isValid`)

The fixer is withheld when mutations are detected (assignments, `++/--`, or obvious mutating array calls) so teams can keep intentional side-effect methods as-is.

### Default Options

```json
{
  "stripPrefixes": [
    "build",
    "get",
    "compute",
    "calculate",
    "retrieve",
    "extract",
    "create",
    "generate",
    "make",
    "fetch",
    "load",
    "derive",
    "resolve",
    "determine",
    "find",
    "obtain",
    "produce",
    "acquire"
  ],
  "ignoredMethods": [
    "toString",
    "toJSON",
    "valueOf",
    "clone",
    "copy",
    "serialize",
    "deserialize",
    "parse",
    "stringify"
  ],
  "ignoreAsync": true,
  "ignoreVoidReturn": true,
  "ignoreAbstract": true,
  "respectJsDocSideEffects": true,
  "minBodyLines": 0
}
```

### Options

- `stripPrefixes` (string[]): verb prefixes to drop when deriving the getter name. Boolean prefixes (`is/has/can/should/will/did/was`) are preserved.
- `ignoredMethods` (string[]): method names that should never be converted.
- `ignoreAsync` (boolean): skip `async` methods. Default `true`.
- `ignoreVoidReturn` (boolean): skip methods that only return `void`/`undefined`. Default `true`.
- `ignoreAbstract` (boolean): skip abstract methods. Default `true`.
- `respectJsDocSideEffects` (boolean): skip methods annotated with `@sideEffect`, `@mutates`, or `@returns` text mentioning side effects. Default `true`.
- `minBodyLines` (number): require at least this many body lines before reporting. Default `0`.

## Examples

### ❌ Incorrect

```ts
class IndexSpecCanonicalizer {
  public computeFingerprint() {
    const json = this.buildJson();
    return createHash('sha256').update(json).digest('hex');
  }

  public buildJson() {
    return stringify(this.canonical);
  }
}
```

```ts
class MatchPreviewer {
  public static computeBase() {
    return { mode: 'ranked' as const };
  }
}
```

### ✅ Correct

```ts
class IndexSpecCanonicalizer {
  public get fingerprint() {
    const json = this.buildJson();
    return createHash('sha256').update(json).digest('hex');
  }

  public get canonical() {
    return this.spec.normalize();
  }
}
```

```ts
class MatchPreviewer {
  public static get base() {
    return { mode: 'ranked' as const };
  }
}
```

### ❕ Not Auto-Fixed (reported without fixer)

```ts
class Counter {
  /**
   * @sideEffect increments internal counter
   */
  getNextId() {
    return ++this.count;
  }
}
```

This looks like a getter but mutates state. Remove the side effect or keep it as a method intentionally.
