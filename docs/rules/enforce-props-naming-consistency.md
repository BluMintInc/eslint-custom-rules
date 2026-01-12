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

When a function has multiple parameters with types ending in "Props", the rule does not report to avoid naming conflicts. In such cases, prefer descriptive names that retain the `Props` suffix:

```ts
// This will not trigger the rule due to multiple Props parameters
function mergeConfigs(uiProps: UIProps, dataProps: DataProps) {
  // Consistent with this rule's intent: keep the `Props` suffix in parameter names
}
```

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

## When Not To Use It

You might want to disable this rule if:

1. Your project has an established naming convention for Props parameters that differs from this rule
1. You frequently use multiple Props parameters in the same function and prefer more descriptive names
1. You don't want to enforce strict naming consistency for Props parameters

## Further Reading

- [React Props Naming Conventions](https://react.dev/learn/passing-props-to-a-component) - React's documentation on props
- [TypeScript Handbook - Interfaces](https://www.typescriptlang.org/docs/handbook/interfaces.html) - TypeScript interface naming conventions
