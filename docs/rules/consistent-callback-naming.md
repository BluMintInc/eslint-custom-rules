# Suggest consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Callback naming should communicate intent at call sites. This rule suggests two conventions:

- **Props that accept functions** should ideally use the `onX` pattern (`onClick`, `onSubmit`) so consumers immediately know a prop is a callback.
- **Callback implementations** should ideally use action verbs (`submitOrder`, `saveDraft`) rather than the vague `handle` prefix, which hides what the function actually does.

> The rule requires parser `project` settings so it can use TypeScript type info to detect function-typed props.

## Rule Details

The rule reports when:

- A JSX prop is a function-typed expression but its name does not start with `on` (excluding built-in React handlers and common non-callback props like `className`, `style`, `ref`, `sx`, `css`, etc.).
- A function, method, class property, or parameter starts with `handle`/`handleX` (except plain `handler`/`handlers`), because the name should ideally describe the action instead of using the generic prefix.
- React component props or PascalCase prop names are skipped to avoid renaming component references.

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

Example message for props:

```text
Callback prop "submit" might need an "on" prefix (e.g., "onSubmit"). This rule is suggestive and might conflict with external library conventions. If "submit" is the correct name, please use an // eslint-disable-next-line @blumintinc/blumint/consistent-callback-naming comment.
```

Example message for implementations:

```text
Function "handleSubmit" uses the "handle" prefix, which might be less descriptive than a verb phrase. This is a suggested naming convention. If "handle" is preferred for this callback, please use an // eslint-disable-next-line @blumintinc/blumint/consistent-callback-naming comment. Otherwise, consider a descriptive verb phrase instead.
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

### ✅ Correct (With disable comment if naming is intentional)

```tsx
// eslint-disable-next-line @blumintinc/blumint/consistent-callback-naming
<ExternalComponent callback={myCallback} />

// eslint-disable-next-line @blumintinc/blumint/consistent-callback-naming
const handleGlobalEvent = () => { /* ... */ };
```

## When Not To Use It

- Codebases that intentionally use `handle*` naming for callbacks and do not want automatic renames.
- If the rule conflicts with an external API or library that you cannot change.
- Projects that cannot enable TypeScript `project` settings for linting (the rule will throw without type information).

## Further Reading

- React docs: [Passing Functions to Components](https://react.dev/learn/passing-props-to-a-component#passing-event-handlers)
