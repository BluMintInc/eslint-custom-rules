# Enforce naming conventions for React types (`@blumintinc/blumint/enforce-react-type-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces naming conventions for variables and parameters based on their React-related type annotations:

- Variables and parameters of type `ReactNode` or `JSX.Element` must start with a **lowercase** letter so they read as rendered values.
- Variables and parameters of type `ComponentType` or `FC` (FunctionComponent) must start with an **uppercase** letter so JSX treats them as components.

The rule unwraps unions, intersections, `readonly` wrappers, arrays (e.g., `ReactNode[]`), and generic wrappers like `ReadonlyArray<ReactNode>` to find the underlying React type before applying the naming rule.

This ensures consistency with React's conventions, improving readability and maintainability. By distinguishing between rendered elements (which should be treated as values) and component definitions (which are typically PascalCase), the rule helps prevent common mistakes and aligns with best practices.

## Rule Details

Examples of **incorrect** code for this rule:

```tsx
const MyComponent: JSX.Element = <div>Hello</div>; // ❌ Should be lowercase
const element: ComponentType = () => <div />; // ❌ Should be uppercase

function useCustomHook(Component: ReactNode) { // ❌ Should be lowercase
  return <Component />;
}
```

Examples of **correct** code for this rule:

```tsx
const myComponent: JSX.Element = <div>Hello</div>; // ✅ Lowercase for JSX.Element
const Element: ComponentType = () => <div />; // ✅ Uppercase for ComponentType

function useCustomHook(component: ReactNode) { // ✅ Lowercase for ReactNode
  return <component />;
}
```

## When Not To Use It

You might want to disable this rule if your project follows different naming conventions for React components and elements.

## Further Reading

- [React Components and Elements](https://reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html)
