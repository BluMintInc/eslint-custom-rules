# Enforce consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Callback entry points should be obvious by name. This rule keeps callback props easy to spot and callback implementations descriptive:
- Function props that expect callables must use the `on*` prefix so callers cannot confuse them with data or component props.
- Callback functions and methods should describe their action instead of using the generic `handle*` prefix.

## Rule Details

This rule reports when:
- A JSX attribute receives a function prop whose name does not start with `on` and is not a React component prop.
- A function, method, or constructor parameter property starts with `handle` instead of a verb phrase that explains the side effect. The rule still reports `handler`/`handlers` names but does not auto-fix them.

Autofix behavior:
- For props, the fixer rewrites the JSX attribute to `on<PropName>` and expects you to align the prop definition.
- For functions and methods, the fixer removes the `handle` prefix when it is safe to rename references.

### Examples of incorrect code for this rule:

```tsx
type Props = {
  submitForm: (data: FormData) => Promise<void>;
};

const Form = ({ submitForm }: Props) => (
  <button onClick={() => submitForm(new FormData())}>Submit</button>
);

const handleSubmit = (data: FormData) => submitForm(data);
```

### Examples of correct code for this rule:

```tsx
type Props = {
  onSubmit: (data: FormData) => Promise<void>;
};

const Form = ({ onSubmit }: Props) => (
  <button onClick={() => onSubmit(new FormData())}>Submit</button>
);

const submit = (data: FormData) => onSubmit(data);
```

## When Not To Use It

Skip this rule if your project uses a different naming convention for callback props or prefers the `handle*` prefix for functions.
