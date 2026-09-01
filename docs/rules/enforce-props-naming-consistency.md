# Prefer naming single "Props"-typed parameters as "props"; enforcement defers to enforce-props-argument-name for multi-Props cases (`@blumintinc/blumint/enforce-props-naming-consistency`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce that when a class or function accepts a parameter with a type that has the suffix "Props", the parameter should be named `props` instead of alternatives like `settings`, `options`, etc.

## Rule Details

This rule enforces that parameters with types ending in "Props" should be consistently named `props`. This standardization improves code readability and establishes a consistent pattern across the codebase. When developers see a parameter named `props`, they'll immediately understand it represents a collection of properties being passed to that function or class.

This rule only applies to non-destructured parameters to avoid conflicts with destructuring patterns where individual properties are intentionally extracted.

### Type information

This rule requires type information (configure `parserOptions.project`).

### Examples of **incorrect** code for this rule:

```ts
// Function with Props type parameter named incorrectly
function createGame(options: GameCreationProps) {
  // ...
}

// Class constructor with Props type parameter named incorrectly
export class TournamentFactory {
  constructor(private readonly settings: TournamentFactoryProps) {}
  // ...
}

// Arrow function with Props type parameter named incorrectly
const renderUser = (data: UserProps) => {
  // ...
}

// Method with Props type parameter named incorrectly
class ComponentManager {
  initialize(config: ComponentProps) {
    // ...
  }
}
```

### Examples of **correct** code for this rule:

```ts
// Function with Props type parameter named correctly
function createGame(props: GameCreationProps) {
  // ...
}

// Class constructor with Props type parameter named correctly
export class TournamentFactory {
  constructor(private readonly props: TournamentFactoryProps) {}
  // ...
}

// Arrow function with Props type parameter named correctly
const renderUser = (props: UserProps) => {
  // ...
}

// Method with Props type parameter named correctly
class ComponentManager {
  initialize(props: ComponentProps) {
    // ...
  }
}

// Destructured parameters are allowed (rule doesn't apply)
function UserCard({ name, avatar, role }: UserCardProps) {
  // ...
}

// Parameters already named with a `Props`-aligned suffix are allowed (e.g., uiProps, dataProps)
function mergeConfigs(uiProps: UIProps, dataProps: DataProps) {
  // ...
}

// Parameters with types not ending in "Props" are not affected
function processData(settings: ConfigurationSettings) {
  // ...
}
```

### Special Cases

#### Multiple Parameters with Props Types

When a function or constructor has multiple parameters with types ending in "Props", the rule does not report and defers to `enforce-props-argument-name`, which names them without conflicting. A parameter counts toward that total however it is written: as a bare parameter, as a constructor parameter property (`private readonly settings: WidgetProps`), and with or without a default value (`settings: WidgetProps = FALLBACK`). In such cases, prefer descriptive names that retain the `Props` suffix:

```ts
// This will not trigger the rule due to multiple Props parameters
function mergeConfigs(uiProps: UIProps, dataProps: DataProps) {
  // Consistent with this rule's intent: keep the `Props` suffix in parameter names
}
```

#### Subclass Constructor Parameter Properties

The rule does not report on a `*Props`-typed constructor parameter property (e.g. `constructor(private readonly fullProps: ExtendedManagerProps)`) when the enclosing class has an `extends` clause, matching `enforce-props-argument-name`. Neither rule can inspect the base class, and renaming the subclass parameter to `props` there is unsafe: it can produce a `TS2415` private-property collision with a `props` field the base class already declares, and it strands `super(fullProps)` / `this.fullProps`. A distinct name on a subclass parameter property is treated as intentional.

#### Destructured Parameters

The rule does not apply to destructured parameters, as these are intentionally breaking apart the props object:

```ts
// This is allowed - destructuring is explicitly naming the pieces
function UserCard({ name, avatar, role }: UserCardProps) {
  // ...
}
```

#### Generic Types with Props Constraint

The rule applies to generic type parameters that are constrained to Props types:

```ts
// Incorrect
function process<T extends ComponentProps>(data: T) {
  // ...
}

// Correct
function process<T extends ComponentProps>(props: T) {
  // ...
}
```

## Autofix

The autofix renames the parameter **and every in-file reference to it**, rewriting only the name token so the `?` marker and the `: SomethingProps` annotation survive:

```ts
// Before
function C(input: FooProps) {
  return input.name;
}

// After --fix
function C(props: FooProps) {
  return props.name;
}
```

Object-literal shorthand is expanded rather than renamed wholesale, so the property key keeps its name:

```ts
// Before
function toEntry(settings: EntryProps) {
  return { settings };
}

// After --fix
function toEntry(props: EntryProps) {
  return { settings: props };
}
```

The fix is withheld (the violation is still reported) whenever the rename cannot be applied everywhere safely:

- **Name collision or capture** — `props` is already bound in a scope the rename touches, so renaming would redeclare or shadow an existing binding:

  ```ts
  // Reported, not fixed
  function render(settings: RenderProps) {
    const props = normalize(settings);
    return props;
  }
  ```

- **Constructor parameter properties whose name is used elsewhere** — `constructor(private readonly settings: WidgetProps)` declares both a constructor-local binding and a `this.settings` field. Scope analysis only models the binding, so a rename would leave the field read dangling — every static spelling of it, whether `this.settings`, `this['settings']`, a no-substitution template `` this[`settings`] ``, a plain `settings` use, or a `widget.settings` read on an instance:

  ```ts
  // Reported, not fixed
  class Widget {
    constructor(private readonly settings: WidgetProps) {}
    render() {
      return this.settings.label;
    }
  }
  ```

  How far that check reaches follows the field's visibility, because visibility is what bounds its legal readers: for a `private` parameter property the enclosing class is a complete scan, while a `public`, `protected`, or modifier-less `readonly` parameter property publishes the field to the whole file, so the scan covers the file — a `widget.settings` read in a sibling function, or a `this.settings` read in a subclass declared further down, withholds the fix just as an in-class read does. A parameter property whose name appears nowhere within reach of the field is renamed normally.

Parameters on body-less signatures (interface and object-type method members) are documentation-only and can never be referenced, so their declaration-only rename is complete:

```ts
// Before
interface Renderer {
  render(config: RenderProps): void;
}

// After --fix
interface Renderer {
  render(props: RenderProps): void;
}
```

## When Not To Use It

You might want to disable this rule if:

1. Your project has an established naming convention for Props parameters that differs from this rule
2. You frequently use multiple Props parameters in the same function and prefer more descriptive names
3. You don't want to enforce strict naming consistency for Props parameters

## Further Reading

- [React Props Naming Conventions](https://react.dev/learn/passing-props-to-a-component) - React's documentation on props
- [TypeScript Handbook - Interfaces](https://www.typescriptlang.org/docs/handbook/interfaces.html) - TypeScript interface naming conventions
