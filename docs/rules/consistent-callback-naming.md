# Enforce consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Callback naming should communicate intent at call sites. This rule enforces two conventions:

- **Props that accept functions** must use the `onX` pattern (`onClick`, `onSubmit`) so consumers immediately know a prop is a callback.
- **Callback implementations** should use action verbs (`submitOrder`, `saveDraft`) rather than the vague `handle` prefix, which hides what the function actually does.

> The rule requires parser `project` settings so it can use TypeScript type info to detect function-typed props.

## Rule Details

The rule reports when:

- A JSX prop is a function-typed expression but its name does not start with `on` (excluding built-in React handlers and common non-callback props like `className`, `style`, `ref`, `sx`, `css`, etc.).
- A function, method, class property, or parameter has a name like `handleSubmit` or `handleClick` — `handle` immediately followed by a **capitalized** word — because the name should describe the action instead of the generic prefix. Ordinary words that merely begin with those six letters are **not** flagged: the past participle `handled` (and derived names such as `handledFingerprints`), the nouns `handler`/`handlers`, `handles`, `handling`, the adjective `handleable`, and the bare word `handle`. The distinction is the capital letter after `handle`, so autofix never strips the prefix from a plain data identifier.
- React component props or PascalCase prop names are skipped to avoid renaming component references.

Props whose type is a **union that mixes a function with a non-function** (for example `Validate<T> | readonly T[]`) are configuration props that merely accept a function as one option, not event handlers, so they are **not** flagged — even when a plain function value is passed. Both the value's own type and the prop's declared (contextual) type are inspected, and `undefined`/`null` members are ignored so plain optional callbacks (`(() => void) | undefined`) are still treated as exclusively functions.

### Examples of **incorrect** code for this rule:

```tsx
// Props
<Dialog submit={onSubmit} />          // prop is a function but not prefixed with on
<Form changeHandler={onChange} />

// Implementations
const handleSubmit = () => save();    // prefer describe action
class Modal {
  handleClose() { this.hide(); }
}
```

### Examples of **correct** code for this rule:

```tsx
<Dialog onSubmit={submitOrder} />
<Form onChange={onFormChange} />

const submitOrder = () => save();
class Modal {
  closeModal() { this.hide(); }
  get isOpen() { return this.visible; } // getter allowed
}
```

## When Not To Use It

- Codebases that intentionally use `handle*` naming for callbacks and do not want automatic renames.
- Projects that cannot enable TypeScript `project` settings for linting (the rule will throw without type information).

## Further Reading

- React docs: [Passing Functions to Components](https://react.dev/learn/passing-props-to-a-component#passing-event-handlers)
