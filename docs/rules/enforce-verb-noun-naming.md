# Enforce verb phrases for functions and methods (`@blumintinc/blumint/enforce-verb-noun-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Functions and methods are actions, so their names should start with an action verb followed by the thing they act on. Verb-first naming keeps callable APIs predictable, separates behaviors from data holders, and prevents teams from shipping symbols whose purpose is unclear at the call site.

## Why this rule?

- Verb-first names signal behavior and reduce ambiguity between functions and plain data.
- Consistent verb-noun phrasing makes call sites self-documenting and easier to scan in reviews and search results.
- Naming the action clarifies intent (fetch/process/validate) and avoids accidental misuse of a function that looks like a value.

## What this rule checks

- Function declarations, function expressions, and arrow functions assigned to identifiers.
- Class methods (excluding constructors and getters). A method that is a React component is exempt on exactly the evidence any other spelling of a component is — `Panel() { return <div />; }` is the same member as `Panel = () => <div />` with one token changed, so the carve-out cannot depend on which token was written. `set` accessors stay checked: an assignment target is not a callable and can never be a component.
- Callable class fields. `data = () => {}` is the same member as `data() {}` with one token changed — `this.data()` reads identically at either call site — so writing `=` is not a way to opt out of the naming rule. Static, `private`/`protected`/`public`, `readonly`, `async`, decorated and function-expression spellings all count.
- A class field holding a **value** rather than a function (`retryCount = 3`, `listeners = new Map()`) is a noun-phrased datum and is left alone, exactly as an assigned variable is. Computed keys and `declare` fields carry no name to judge.
- Object methods (`const helper = { data() {} }`) are a known gap: no visitor reaches them, so they go unreported. Tracked separately from the class-field coverage above.
- Converter and wrapper patterns starting with prepositions such as `to`, `with`, `by`, `from`, `of`, or `at` are allowed (e.g., `toNumber`, `withLogging`).
- React components are exempted so component names can stay noun-based — see [React component recognition](#react-component-recognition).
- The rule validates the first word against a curated verb list and falls back to NLP tagging; it only reports when a verb phrase is not detected.

## Examples

### ❌ Incorrect

```ts
function userData() { return null; }
const data = () => null;
const user = () => fetchUser();          // name is noun-only
class Service { data() {} }
class Repo {
  items() { return this.cache; }         // method lacks verb
  handler() {}                           // method name is noun-only
}
class Cache {
  data = () => this.entries;             // callable field lacks verb
  static entry = async () => null;       // static callable field lacks verb
}
class Centralizer {
  panelRows() { return this.rows; }      // method lacks verb, and renders nothing
  set panel(value) { this.value = value; } // setter is an assignment target, not a component
}
```

Example message:

```text
Function "userData" should start with an action verb followed by the thing it acts on. Verb-first names tell readers this symbol performs work instead of representing data, which keeps APIs predictable and prevents accidental misuse. Rename "userData" to a verb-noun phrase such as "fetchUsers" or "processRequest".
```

### ✅ Correct

```ts
function fetchUserData() { return null; }
const processRequest = () => null;
const buildUser = () => fetchUser();
const withRetry = (fn: () => Promise<void>) => { /* ... */ }; // helper pattern allowed
class Service { processData() {} }
class Repo {
  loadItems() { return this.cache; }
  updateCache() { /* ... */ }
  get items() { return this.cache; } // getter is allowed
}
class Cache {
  loadData = () => this.entries;     // callable field, verb first
  retryCount = 3;                    // data field keeps its noun
  listeners = new Map();             // data field keeps its noun
}

function toNumber(value) { return +value; } // converter pattern allowed
```

React components are allowed:

```tsx
const UserCard = ({ user }: { user: User }) => <Card>{user.name}</Card>;

class Centralizer {
  // A member's key is its name, so a component held in a class is recognized on
  // the same evidence as one assigned to a `const` — under either spelling.
  public EditableArray = ({ items }: { items: Item[] }) => <List items={items} />;

  public Panel() {
    return <List items={this.items} />;
  }
}
```

## React component recognition

A component's name is a noun by convention, and JSX requires it to be capitalized, so components are exempt from the verb-phrase requirement. In a `.tsx`/`.jsx` file every PascalCase function qualifies. A `.ts` file needs evidence, because PascalCase is also how a plain helper or a factory gets named, so the rule looks for any of:

- **What it renders.** Every return path yields JSX, a `createElement`/`cloneElement` call, or `null`/`undefined` — the "renders nothing" case a component reaches through an early return. One ordinary return value among them is enough to disqualify it.
- **What it calls.** It calls a React hook (`useState`, `useMemo`, …), wherever in its own scope the call sits. An arrow whose concise body *is* the hook call — `const Panel = () => useMemo(…)` — reads the same as the `{ return … }` spelling of it, so adding or removing the braces never changes the verdict. Own scope is the limit in both directions: a hook called inside a function the candidate returns belongs to that returned function, so `const Panel = () => () => useMemo(…)` is a factory rather than a component and reports, matching its `{ return … }` and `wrap(…)` spellings.
- **What it declares.** It carries a React type annotation (`: React.FC`, `: React.JSX.Element`, `: ReactElement`, …). A class field carries that annotation on the member — `public Panel: React.FC = () => …` — and a method carries it as its return type — `public Panel(): React.JSX.Element` — both of which count the same. The two are not equally durable, though: a member type annotation survives `--fix`, while a method's return annotation is exactly what `no-explicit-return-type` strips, so a component method should rest on what it renders as well.
- **How the file uses it.** It is rendered as `<MyComponent />`, or handed to `memo(...)` / `forwardRef(...)`. This one evidence is unavailable to a class member: a member name is not a lexical binding, so a same-named variable in scope belongs to a different symbol and `<this.Panel />` records no reference to resolve. A field or method falls back to the other three.

The annotation is deliberately not the sole carrier. `no-explicit-return-type` ships in the same `recommended` config and deletes return-type annotations on `--fix`, so a component recognized only by `(): React.JSX.Element` would start reporting the moment a fix pass ran — proposing a rename that breaks every JSX call site and that restoring the annotation cannot silence, because the next fix pass strips it again.

A PascalCase function that produces an ordinary value is still a function and keeps reporting:

```ts
// src/util/helper.ts
function ConfigParser() { return { parsed: true }; }        // reports: returns data
function DataSnapshot(input) {                              // reports: only one branch renders nothing
  if (!input) { return null; }
  return buildSnapshot(input);
}
function MyComponent() { return null; }                     // exempt: renders nothing
function StatusPanel(props) {                               // exempt: renders via createElement
  return React.createElement('div', null, props.label);
}
```

The same evidence decides a class method, so the two spellings of one member never disagree. A member spelled as an overload set answers once as well: a type-only signature carries no body and so no evidence of its own, and is judged by the implementation that gives the member its body.

```ts
// src/util/helper.ts
class Centralizer {
  Panel(): React.JSX.Element { return null; }           // exempt: renders nothing, and declares a React type
  PanelField: React.FC = () => null;                    // exempt: the field spelling of the same member
  Frame(): React.JSX.Element;                           // exempt: the signature defers to its implementation
  Frame(props?: FrameProps) {                           // exempt: renders via createElement
    return React.createElement('div', null, props);
  }
  Snapshot() { return { rows: this.rows }; }            // reports: returns data
  SnapshotField = () => ({ rows: this.rows });          // reports: the field spelling agrees
}
```

## Options

### `externallyNamedExports`

An array of glob patterns matched against the linted file's path. In a file that matches, **exported** symbols are exempt from the verb-phrase requirement.

Some symbol names are not a naming choice: they are specified outside the module and the module merely has to agree with them. A runtime registry key (`OP_REGISTRY.axisProfile`), a CLI verb (`describe-op --op axisProfile`), or an artifact path (`measures/axisProfile__<hash>.json`) are noun-phrase quantities by contract, and renaming the symbol to `computeAxisProfile` desynchronizes it from the specification that names it.

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-verb-noun-naming": [
      "error",
      { "externallyNamedExports": ["scripts/design/proxy/ops/*.mjs"] }
    ]
  }
}
```

Semantics:

- **File-scoped.** A pattern is matched against the file path with `matchBase` and `dot` enabled, so a leading `**` matches both repo-relative and absolute paths. A file matching no pattern is checked exactly as before, and the default (`[]`) exempts nothing.
- **Export-scoped.** Only exported symbols are exempt. Inline exports (`export const axisProfile = …`, `export function glyphPopulation() {}`), default exports (`export default function contourDelta() {}`), and deferred exports (`export { axisProfile }`, `export { axisProfile as ops_axisProfile }`, `export default axisProfile`) all qualify; for a renamed export the **local** name is the one that is exempt, since that is the binding the module publishes. Local helpers and nested functions in the same file stay under the rule.
- **Class members stay checked.** A method or callable-field name inside an exported class is a local API choice rather than an externally specified identifier, so neither the method nor the class-field arm is affected by this option.

For a whole tree that should not be checked at all — not just its exported names — a directory-scoped `off` in an `.eslintrc` `overrides` entry remains the right tool; this option is for the narrower case where the file's *exported* names are dictated elsewhere while its internal code should still follow the convention.

## When not to use it

- If your project intentionally names command functions with nouns or uses a different naming convention for functions and methods.
- Files that intentionally expose React components or values only—disable locally with ESLint directives when needed: use `/* eslint-disable @blumintinc/blumint/enforce-verb-noun-naming */` for a file or `/* eslint-disable-next-line @blumintinc/blumint/enforce-verb-noun-naming */` for a single line. Repository-wide exceptions can be added through `.eslintrc` overrides when entire paths should be exempt.

## Further reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
- [Google JavaScript Style Guide: Naming](https://google.github.io/styleguide/jsguide.html#naming)
- [TypeScript Deep Dive: Naming conventions](https://basarat.gitbook.io/typescript/styleguide#naming)
