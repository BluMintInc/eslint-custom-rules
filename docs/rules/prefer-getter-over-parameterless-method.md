# Enforce getter syntax for synchronous parameterless methods that return values, improving semantic clarity and avoiding accidental method invocation without parentheses (`@blumintinc/blumint/prefer-getter-over-parameterless-method`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule helps you use getter syntax for synchronous class methods that take no parameters and return a value. Methods with parentheses communicate an action, while getters communicate that you are accessing a computed value. Converting eligible methods to getters improves API ergonomics: you declare `methodName()` as `get <name>()` and then access it as `instance.<name>` with no parentheses, which avoids accidental omission of a call.

## Rule Details

This rule reports parameterless, non-abstract, synchronous methods that return a value and are not in the ignore lists. "Synchronous" is decided by what the method returns, not by whether it carries the `async` keyword — see [Promise-returning methods](#promise-returning-methods). It auto-fixes safe cases by:

- Converting the method declaration `methodName()` to the getter declaration `get <suggestedName>()`, so you use it as `instance.<suggestedName>` without parentheses
- Preserving access modifiers, `static`, decorators, and return type annotations
- Stripping configurable verb prefixes (for example, `getUser()` becomes the getter `get user()` and is accessed as `instance.user`)
- Keeping boolean prefixes intact (`isValid()` → `get isValid()`)

The fixer is withheld unless the method is declared `private`. A `public`, `protected`, or unspecified-accessibility method is API surface whose `instance.method()` call sites may live in other files, and this rule only inspects the current file — it does not attempt project-wide call-site discovery. Auto-converting such a method to a getter would silently break every external caller (the call would invoke the getter's return value), so the rule reports but leaves the change to the developer. Only `private` methods (whose call sites cannot escape the class) are eligible for the automatic fix.

### Promise-returning methods

A parameterless method that hands the caller a promise is exempt, whether or not the `async` keyword is written. TypeScript does not require `async` to return one, so `fetchToken(): Promise<string>` and `readEpoch() { return this.evaluate(); }` are both asynchronous methods; the rule reads what the method returns rather than the keyword. Such a method is never reported and never auto-fixed. A getter would turn a call that *starts* work into a property read, so `session.epoch` would spawn the work on what reads as a field access, and a reflective call site (`(session as any).readEpoch()`) would throw `TypeError: session.readEpoch is not a function`. For an asynchronous member the call parentheses are the honest signal, and the getter is what creates the disguise.

The exemption is decided syntactically, because this rule requests no type information. It recognizes a `Promise`/`PromiseLike` return annotation — including a qualified spelling (`globalThis.Promise<T>`, `bluebird.Promise<T>`) and one nested in a union or intersection (`Promise<T> | undefined`) — and, for a method carrying no annotation, a body that returns `Promise.resolve/reject/all/allSettled/race/any(...)`, a `.then`/`.catch`/`.finally` chain, an `await`ed value, or a promise-returning sibling member of the same class (a called method or function-valued field, a getter, or a promise-typed field). A type alias that merely resolves to a promise is out of reach without a type checker, so the rule reports it; an explicit return annotation is the method's whole contract, so a non-thenable one (`(): string`) keeps the method reportable no matter what its body mentions.

### ECMA private names (`#method()`)

A method keyed by an ECMA private name is treated exactly like one carrying the `private` modifier — the two spell the same privacy and are mutually exclusive, since `private #method` is a TypeScript error (`TS18010`). It is reported, and it is eligible for the fix on the same terms: `#method` is unreachable outside the class body at runtime, so every call site is in the file under lint by construction, which satisfies the fixer's privacy premise more strongly than the erased `private` modifier does.

The emitted getter keeps the sigil, and the prefix is stripped from the name as usual:

```ts
class IndexSpecCanonicalizer {
  #computeFingerprint(): string {
    return createHash('sha256').update(this.#json).digest('hex');
  }
}
```

becomes

```ts
class IndexSpecCanonicalizer {
  get #fingerprint(): string {
    return createHash('sha256').update(this.#json).digest('hex');
  }
}
```

`#name` and `name` are two distinct members of one class, so they never mask each other: a sibling `fingerprint` field does not block `get #fingerprint()`, and a `#fingerprint` field does. Conversely, an ECMA private name lives in a *single* namespace per class — `static #x` and `#x` in one class body is a duplicate declaration — so a static sibling collides with an instance one, unlike the plainly-named case.

Two further withholdings are specific to this spelling. An ergonomic brand check (`#method in candidate`) names the member without a member expression, so the rule holds the fix rather than leave the check pointing at a member that was renamed away. And a decorated `#method()` is never converted: a decorator cannot be applied to a private-named member under `experimentalDecorators` (`TS1206`), so no legal getter form exists to convert to.

A heritage clause never constrains an ECMA private member — a base class's `#x` is a different member, and no interface or type can declare one — so the whole-class exemption for unresolvable heritage described below does not reach it.

The fixer is also withheld when mutations are detected (assignments, `delete`, `++/--`, mutating array calls such as `fill`/`copyWithin`, or mutating collection calls like `set`/`add`/`delete`/`clear`), when the method name is used as a callable or stored as a function reference in the same file (including via optional chaining and when passed as a callback argument), when the method body already reads `this.<suggestedName>` which would create a self-referential getter, or when the suggested getter name would collide with an existing class member. In these cases the rule still reports but leaves the change to the developer to avoid breaking call sites or creating duplicate identifiers.

Implementations that accompany overload signatures are skipped entirely because getters cannot have overload declarations; leaving those signatures in place would produce invalid TypeScript.

### Methods bound by a heritage clause

A method that satisfies an `implements` clause or overrides a base-class member cannot become a getter: the heritage type declares a *method*, so the conversion is a `TS2416`/`TS2417` compile error (`Type 'number' is not assignable to type '() => number'`). The rule therefore never reports such a method:

```ts
export interface Countable {
  count(): number;
}

export class Counter implements Countable {
  public count(): number {
    return 1;
  }
}
```

The exemption is resolved from the file under lint alone, and its breadth depends on how much of the contract that file can see:

- **Every heritage reference resolves in-file** — the skip is per method. The rule walks each `implements`/`extends` reference to its same-file declaration (interface, type alias to a type literal or intersection, or class), follows those declarations' own `extends`/`implements` chains, and spares only the methods whose names the contract declares. A method the class invents itself still reports. A contract member declared as a method binds, and so does one typed as a function (`handler: () => number`), because a getter returning that function's result is not assignable to the function type. An `implements` clause constrains only the instance side, so a `static` method sharing a contract member's name still reports.
- **Any heritage reference leaves the file** — an imported or global type, a third-party `.d.ts`, a qualified name (`ns.Contract`), a utility type (`Pick<Full, 'data'>`), or a mixin base (`extends withLogging(Base)`) — the contract's members are unknowable, so no method of that class can be proven convertible and every method of the class is skipped. Reporting them would prescribe a remedy that does not compile and, for a third-party contract, one the developer cannot apply at all.
- **No heritage clause at all** — the class is analyzed exactly as before.

This subsumes the abstract case: a concrete method implementing an abstract member declared by a same-file base class is contract-bound (however many links up the `extends` chain the declaration sits), so it is skipped too. The `ignoreAbstract` option covers only the abstract *declaration* itself.

### Class fields that hold a function

A member written as a field — `fullName = () => { ... }` — is invoked exactly as its method twin is, `instance.fullName()`, so writing `=` does not exempt it. Both spellings answer the same questions: parameterless, non-abstract, synchronous, value-returning, outside the ignore lists, and unconstrained by a heritage clause.

```ts
class IndexSpecCanonicalizer {
  private computeFingerprint = () => {
    return createHash('sha256').update(this.json).digest('hex');
  };
}
```

becomes

```ts
class IndexSpecCanonicalizer {
  private get fingerprint() {
    return createHash('sha256').update(this.json).digest('hex');
  }
}
```

Three behaviours are specific to this spelling:

- **The field spelling is never auto-fixed**, whatever its accessibility. The rewrite has to consume the `= (`…`) =>` and the terminating `;`, reshape a concise body into a block, and drop a `readonly` modifier a getter cannot carry — and even done perfectly it turns an own enumerable per-instance property into a prototype accessor, so the key leaves `Object.keys(instance)` and object spread. No gate models that, so the rule reports and leaves the edit to the developer. (`readonly` is not itself a reason to stay a field: a getter with no setter is read-only by construction.)
- **A field is judged the same whichever way its body is spelled.** `refresh = () => this.reload()` and `refresh = () => { return this.reload(); }` are one member, so both are in scope. Reading a concise call as a command and a block-bodied call as a value would split that member in two on a distinction the syntax does not carry — `hash(this.json)` and `this.reload()` are the same shape. What separates a command from a value is the rule's own side-effect evidence (a JSDoc side-effect tag, a top-level `throw`, or a mutation the body performs), and those gates apply to both spellings alike.
- **A member handed around as a function is left alone.** `store.on('change', this.getSnapshot)`, `const snapshot = this.getSnapshot` and the JSX form `<this.Panel />` all want the function itself, which is what the arrow spelling exists to provide; a getter would run the body on that read and hand back its result instead. Calling the member (`this.fullName()`) is not detachment and does not withhold the report.

Fields that hold no function are outside the rule entirely: data fields, `declare` fields, `abstract` declarations, computed keys, generator-valued fields and generic (`<T>`) arrows have no parameterless getter form to convert to.

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
- `factoryMethods` (string[]): builder/factory terminal method names that are exempt (never converted), because they are imperative actions whose external callers would break as getters. Default `['build', 'create', 'make']`. (Independently, a parameterless method whose body can `throw` at the top level is always exempt — a getter must be a pure, non-throwing property read.)
- `ignoreAsync` (boolean): skip asynchronous methods — both those bearing the `async` keyword and those returning a promise without it. Default `true`. See [Promise-returning methods](#promise-returning-methods). The fixer never converts a promise-returning method even when this is `false`, because the rewrite cannot work at any call site.
- `ignoreVoidReturn` (boolean): skip methods that only return `void`/`undefined`. Default `true`. Explicit `void`/`undefined` return types are always treated as non-value-returning and are not auto-fixed.
- `ignoreAbstract` (boolean): skip abstract method declarations. Default `true`. Concrete implementations of an abstract member are exempt regardless of this option, under the heritage-clause rule above.
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

```ts
class UserProfile {
  public fullName = () => {
    return this.first + this.last;
  };
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

```ts
class UserProfile {
  public get fullName() {
    return this.first + this.last;
  }
}
```

A field that holds a function stays a field when it is handed around as one:

```ts
class Watcher {
  private getSnapshot = () => {
    return this.state;
  };

  public attach(store: Store) {
    store.on('change', this.getSnapshot);
  }
}
```

Promise-returning members stay methods, keyword or no keyword:

```ts
class Session {
  private evaluate(): Promise<string> {
    return Promise.resolve('epoch');
  }

  public readEpoch() {
    return this.evaluate();
  }

  public async fetchToken(): Promise<string> {
    return 'token';
  }
}
```

### ❕ Not Auto-Fixed (reported without fixer)

```ts
class Counter {
  private count = 0;

  getNextId() {
    return ++this.count;
  }
}
```

`getNextId` reads like a computed value but mutates state, so the rule reports it and withholds the fix: as a getter, every `instance.nextId` read would silently increment the counter. Renaming it to something more imperative (`incrementId`) does not clear the report — the rule keys on the mutations in the body, not on how action-like the name sounds. Two remedies clear it:

- The side effect is unintentional: remove it and convert the method to `get nextId()`. (Removing it alone leaves the method reported under `preferGetter`, which asks for the getter conversion.)
- The side effect is intentional: declare it with an `@sideEffect` (or `@mutates`) tag inside a `/** */` JSDoc block placed immediately above the method, with no blank line in between. The tag warns callers that this value performs work, and `respectJsDocSideEffects` (default `true`) exempts the method:

```ts
class Counter {
  private count = 0;

  /**
   * @sideEffect increments internal counter
   */
  getNextId() {
    return ++this.count;
  }
}
```

```ts
export class OverlayAlertComposer {
  public compose(): string | undefined {
    return this.template;
  }
}
```

`compose` is `public`, so `instance.compose()` callers may exist in other files. The rule reports it but withholds the fix; convert it (and update the call sites) by hand. Only `private` methods are auto-converted.
