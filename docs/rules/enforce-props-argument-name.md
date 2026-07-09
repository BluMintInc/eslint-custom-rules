# Authoritative rule: parameters with types ending in "Props" should be named "props" (or prefixed variants when multiple Props params exist) (`@blumintinc/blumint/enforce-props-argument-name`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule details

Parameters typed with a `*Props` type are shared conventions across our React codebase and tooling. Naming them `props` keeps call sites and refactors consistent, signals their purpose immediately, and aligns with common component patterns (including destructuring). Divergent names like `options` or `config` hide that the argument is a component props bag and create friction for linters, codemods, and readers.

## Examples

### ❌ Incorrect

```typescript
function Button(options: ButtonProps) {
  return <button>{options.label}</button>;
}

const Modal = function (config: ModalProps) {
  return <div>{config.title}</div>;
};
```

### ✅ Correct

```typescript
function Button(props: ButtonProps) {
  return <button>{props.label}</button>;
}

const Modal: React.FC<ModalProps> = (props) => {
  return <div>{props.title}</div>;
};
```

### Known Limitations

- **Subclass constructor parameter properties**: the rule does not report on a `*Props`-typed constructor parameter property (e.g. `constructor(private readonly fullProps: ExtendedManagerProps)`) when the enclosing class has an `extends` clause. The rule is purely syntactic and has no visibility into whether the base class already declares a `props` field; renaming the subclass parameter to `props` in that case is unsafe (it can produce a `TS2415` private-property collision) or outright impossible to do correctly. A distinct name on a subclass parameter property is treated as intentional.
