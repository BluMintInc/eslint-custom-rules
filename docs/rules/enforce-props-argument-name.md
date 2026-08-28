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

### Autofix behavior

The autofix is a scope-aware rename: it rewrites the parameter declaration **and every in-scope reference to it**, so the fixed code still compiles.

```typescript
// before --fix
const build = () => {
  return (runnerProps: RunnerProps) => {
    return runnerProps.isDryRun;
  };
};

// after --fix
const build = () => {
  return (props: RunnerProps) => {
    return props.isDryRun;
  };
};
```

Two details the fixer handles explicitly:

- A reference used as object-literal shorthand is expanded rather than replaced, so the property key keeps its name and the object's shape is unchanged: `return { runnerProps };` becomes `return { runnerProps: props };`.
- Type annotations and optional markers survive the rename, because only the identifier's name token is rewritten: `(widgetConfig?: WidgetProps)` becomes `(props?: WidgetProps)`.

The fix is suppressed (the violation is still reported) whenever the rename cannot be applied safely everywhere:

- The suggested name is already bound in the parameter's own scope, so the rename would be a redeclaration.
- A scope between a reference and the declaration binds the suggested name, so the rewritten reference would resolve to that binding instead.
- The parameter's scope (or a nested one) already uses the suggested name for something else, which the rename would capture.
- The parameter is a constructor parameter property whose name is referenced elsewhere — as `this.<name>`, as `this['<name>']`, as a plain identifier, or as a member read on an instance (`widget.settings`). A parameter property declares a class field as well as a constructor-local binding, and those field reads are not part of the parameter's binding, so a declaration-only rename would strand them.

  How far that scan reaches follows the field's visibility, because visibility is what bounds its legal readers: for a `private` parameter property the enclosing class is a complete scan, while a `public`, `protected`, or modifier-less `readonly` parameter property publishes the field to the whole file, so the scan covers the file. Scanning only the class let a `public` field's external reader survive the rename and point at a member the class no longer had.

When several `*Props` parameters in one signature must be renamed, their rewrites span overlapping regions, so ESLint applies one per pass; a normal `--fix` run converges over its usual multi-pass loop.

### Known Limitations

- **Rest parameters**: a rest parameter attaches its type annotation to the `RestElement` rather than to the inner identifier, so `function collect(...argList: ArgsProps)` is never reported.

- **Subclass constructor parameter properties**: the rule does not report on a `*Props`-typed constructor parameter property (e.g. `constructor(private readonly fullProps: ExtendedManagerProps)`) when the enclosing class has an `extends` clause. The rule is purely syntactic and has no visibility into whether the base class already declares a `props` field; renaming the subclass parameter to `props` in that case is unsafe (it can produce a `TS2415` private-property collision) or outright impossible to do correctly. A distinct name on a subclass parameter property is treated as intentional.
