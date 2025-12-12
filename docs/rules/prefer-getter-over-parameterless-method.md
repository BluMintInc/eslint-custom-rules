# prefer-getter-over-parameterless-method

This rule helps you use getter syntax for synchronous class methods that take no parameters and return a value. Methods with parentheses communicate an action, while getters communicate that you are accessing a computed value. Converting eligible methods to getters improves API ergonomics: you declare `methodName()` as `get <name>()` and then access it as `instance.<name>` with no parentheses, which avoids accidental omission of a call.

## Rule Details

This rule reports parameterless, non-abstract, synchronous methods that return a value and are not in the ignore lists. It auto-fixes safe cases by:

- Converting the method declaration `methodName()` to the getter declaration `get <suggestedName>()`, so you use it as `instance.<suggestedName>` without parentheses
- Preserving access modifiers, `static`, decorators, and return type annotations
- Stripping configurable verb prefixes (for example, `getUser()` → `get user()`)
- Keeping boolean prefixes intact (`isValid()` → `get isValid()`)

The fixer is withheld when mutations are detected (assignments, `++/--`, or obvious mutating array calls including `fill`/`copyWithin`), when the method name is used as a callable or stored as a function reference (for example `instance.method()`, `instance.method.call(...)`, `bind`, `apply`, or `const fn = this.method`), or when the suggested getter name would collide with an existing class member. In these cases the rule still reports but leaves the change to the developer to avoid breaking call sites or creating duplicate identifiers.

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
- `respectJsDocSideEffects` (boolean): skip methods when the JSDoc block mentions side effects or mutation (including `@sideEffect`/`@mutates` tags and side-effect phrases anywhere in the block, @returns included). Default `true`.
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
