# Enforce consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> **What is auto-fixed:** only the `handle` prefix removal on functions, methods and object members the file itself owns. **Callback prop renames are reported but never auto-fixed** — see [Why prop renames are not auto-fixed](#why-prop-renames-are-not-auto-fixed) — and neither are destructuring keys, shorthand bindings, members of an exported or returned object literal, members of a class that `extends` or `implements` something, abstract member declarations, or any rename that would emit a reserved word; see [Renames the autofix withholds](#renames-the-autofix-withholds).

Callback naming should communicate intent at call sites. This rule enforces two conventions:

- **Props that accept functions** must use the `onX` pattern (`onClick`, `onSubmit`) so consumers immediately know a prop is a callback.
- **Callback implementations** should use action verbs (`submitOrder`, `saveDraft`) rather than the vague `handle` prefix, which hides what the function actually does.

> The rule uses TypeScript type info (via parser `project` settings) to detect function-typed props. Files parsed without type information — plain-Node `.mjs` scripts, config files, or anything outside the TS project — are silently skipped rather than causing an error, so mixing them into a lint run is safe.

## Rule Details

The rule reports when:

- A JSX prop is a function-typed expression but its name does not start with `on` (excluding built-in React handlers and common non-callback props like `className`, `style`, `ref`, `sx`, `css`, etc.).
- A function, method, class property, or parameter has a name like `handleSubmit` or `handleClick` — `handle` immediately followed by a **capitalized** word — because the name should describe the action instead of the generic prefix. An **abstract** member (`abstract handleSubmit(): T`, `abstract handleSubmit: () => T`) is a method or class property too, so it is reported at its declaration as well — report-only, because every implementor of that declaration has to move with it and implementors live in other files. Members of an `interface` or type literal are **not** reported by this half of the rule: a member of a type is a prop declaration, whose remedy is the opposite one (`onSubmit`, not `submit`) and belongs to `callbackPropPrefix`. Ordinary words that merely begin with those six letters are **not** flagged: the past participle `handled` (and derived names such as `handledFingerprints`), the nouns `handler`/`handlers`, `handles`, `handling`, the adjective `handleable`, and the bare word `handle`. The distinction is the capital letter after `handle`, so autofix never strips the prefix from a plain data identifier.
- React component props or PascalCase prop names are skipped to avoid renaming component references.

### Why prop renames are not auto-fixed

A JSX attribute name is one end of a props contract. The other end is the declaration that binds the name — a props `type`/`interface`, or a `JSX.IntrinsicElements` augmentation for host elements — together with every reader of that member and every other call site of the component. All of those live outside the range a single-file fixer may edit:

```tsx
type ChildProps = { validate: (value: string) => void };
const Child = (props: ChildProps) => <div>{String(props.validate)}</div>;
const Parent = () => <Child validate={fn} />;
```

Rewriting only the attribute yields `TS2322: Property 'onValidate' does not exist on type 'ChildProps'`. Renaming the local declaration as well only relocates the break: `props.validate` then fails with `TS2551`, and call sites of an exported component in other files fail with `TS2322` — a fixer cannot see those files, let alone edit them atomically. Because no subset of the rename is safe in isolation, the rule reports the violation and names every site the rename must cover, leaving the refactor to an editor rename or a codemod.

Props whose type is a **union that mixes a function with a non-function** (for example `Validate<T> | readonly T[]`) are configuration props that merely accept a function as one option, not event handlers, so they are **not** flagged — even when a plain function value is passed. Both the value's own type and the prop's declared (contextual) type are inspected, and `undefined`/`null` members are ignored so plain optional callbacks (`(() => void) | undefined`) are still treated as exclusively functions.

### Examples of **incorrect** code for this rule:

Props:

```tsx
<Dialog submit={onSubmit} /> // prop is a function but not prefixed with on
```

```tsx
<Form changeHandler={onChange} />
```

Implementations:

```tsx
const handleSubmit = () => save(); // prefer describing the action
```

```tsx
class Modal {
  handleClose() { this.hide(); }
}
```

### Examples of **correct** code for this rule:

Props:

```tsx
<Dialog onSubmit={submitOrder} />
```

```tsx
<Form onChange={onFormChange} />
```

Implementations:

```tsx
const submitOrder = () => save();
```

```tsx
class Modal {
  closeModal() { this.hide(); }
  get isOpen() { return this.visible; } // getter allowed
}
```

Destructuring another module's API — the `handle` prefix belongs to the property being read, not to this file, so nothing is reported:

```tsx
const { handleDelete: streamDeleteMessage } = useMessage('handleDelete');
const { handleClick } = props;
```

### Renames the autofix withholds

The rename is applied only where the file owns every site it must touch. Elsewhere the violation is reported and the rewrite is left to an editor rename or a codemod:

- **A destructuring key.** In `const { handleDelete: streamDeleteMessage } = useMessage('handleDelete')` the key names a property of the object being destructured — someone else's API — so rewriting it changes _which property is read_ and strands every reader of the old name. Keys in a pattern are therefore not reported at all. When a pattern binds a prefixed key to a local name that also carries the prefix, the **local** name is reported instead, and renaming it moves every reference with the declaration (withheld when the binding is exported or the new name is already taken).
- **A shorthand binding.** `const { handleClick } = props` is a single token serving as both the foreign property name and the local name, so no in-place edit can change one without the other; it is left alone. A shorthand in an object literal (`const api = { handleClick }`) is reported, but rewriting it would rename the member _and_ re-point it at a binding that need not exist, so no fix is offered.
- **A member of an exported or returned object literal.** `export const api = { handleOpenThread: openThread }` and `return { handleOpenThread: openThread }` are read by name in files a single-file fixer cannot edit, exactly as a JSX prop is.
- **A member the file reads by name.** `const o = { handleClick: fn }; o.handleClick()` — and the destructuring form `const { handleClick } = o` — has readers the rename would have to move with it, so the member keeps its name.
- **A rename that would collide with a sibling member.** `{ click: a, handleClick: b }` and `class C { click() {} handleClick() {} }` would collapse to two members of the same name, silently discarding one.
- **A member of a class that `extends` or `implements` something.** `class SubmitForm extends BaseForm { handleSubmit(d: string) {…} }` may be satisfying a declaration the fixer does not own. Renaming the implementation alone leaves the declaration behind and the class stops satisfying it: `TS2515: Non-abstract class 'SubmitForm' does not implement inherited abstract member 'handleSubmit'` for an abstract base, `TS2420: Class 'SubmitForm' incorrectly implements interface 'Submittable'` for an `implements` clause — all three measured turning a clean build into a broken one. Renaming both ends instead is safe only when every implementor is in this file, which the rule cannot know: the base is routinely imported, and sibling implementors of the same contract live in files a single-file fixer cannot see. The heritage clause itself therefore withholds the rename, not a declaration the rule managed to find — a member that overrides nothing loses its autofix, which is the price of never breaking a build. **An abstract declaration is likewise never rewritten**, for the same reason read from the other end.
- **A rename that would emit a reserved word.** `handleDelete` → `delete`, `handleNew` → `new`, `handleReturn` → `return`, `handleTrue` → `true`: none of those is a legal binding name, so `const delete = fn` and `const { delete } = api` do not even parse. The report is kept and the fix withheld rather than emitting a keyword — including in member positions where a keyword happens to be legal, because the rule cannot see whether the member is later destructured into a binding.

## When Not To Use It

- Codebases that intentionally use `handle*` naming for callbacks and do not want automatic renames.
- Projects that cannot enable TypeScript `project` settings for linting (without type information the rule cannot detect function-typed props, so it skips every file and enforces nothing).

## Further Reading

- React docs: [Passing Functions to Components](https://react.dev/learn/passing-props-to-a-component#passing-event-handlers)
