# Enforce consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> **What is auto-fixed:** only the `handle` prefix removal on functions, methods and object properties. **Callback prop renames are reported but never auto-fixed** — see [Why prop renames are not auto-fixed](#why-prop-renames-are-not-auto-fixed).

Callback naming should communicate intent at call sites. This rule enforces two conventions:

- **Props that accept functions** must use the `onX` pattern (`onClick`, `onSubmit`) so consumers immediately know a prop is a callback.
- **Callback implementations** should use action verbs (`submitOrder`, `saveDraft`) rather than the vague `handle` prefix, which hides what the function actually does.

> The rule uses TypeScript type info (via parser `project` settings) to detect function-typed props. Files parsed without type information — plain-Node `.mjs` scripts, config files, or anything outside the TS project — are silently skipped rather than causing an error, so mixing them into a lint run is safe.

## Rule Details

The rule reports when:

- A JSX prop is a function-typed expression but its name does not start with `on` (excluding built-in React handlers and common non-callback props like `className`, `style`, `ref`, `sx`, `css`, etc.).
- A function, method, class property, or parameter has a name like `handleSubmit` or `handleClick` — `handle` immediately followed by a **capitalized** word — because the name should describe the action instead of the generic prefix. Ordinary words that merely begin with those six letters are **not** flagged: the past participle `handled` (and derived names such as `handledFingerprints`), the nouns `handler`/`handlers`, `handles`, `handling`, the adjective `handleable`, and the bare word `handle`. The distinction is the capital letter after `handle`, so autofix never strips the prefix from a plain data identifier.
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

## When Not To Use It

- Codebases that intentionally use `handle*` naming for callbacks and do not want automatic renames.
- Projects that cannot enable TypeScript `project` settings for linting (without type information the rule cannot detect function-typed props, so it skips every file and enforces nothing).

## Further Reading

- React docs: [Passing Functions to Components](https://react.dev/learn/passing-props-to-a-component#passing-event-handlers)
