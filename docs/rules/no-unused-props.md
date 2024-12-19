# Detect Unused Props in React Component Type Definitions (no-unused-props)

This rule ensures that all props defined in a React component's type definition are actively used within the component's implementation. This helps maintain cleaner code by preventing unused props from lingering in type definitions.

## Rule Details

This rule aims to prevent the anti-pattern where props are defined in a component's type definition but never used in the component implementation. This can lead to confusion, maintenance overhead, and mismatched documentation.

Examples of **incorrect** code for this rule:

```tsx
type MyComponentProps = {
  title: string;
  subtitle: string;  // subtitle is defined but never used
};

const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  return <h1>{title}</h1>;
};
```

Examples of **correct** code for this rule:

```tsx
// All props are used
type MyComponentProps = {
  title: string;
  subtitle: string;
};

const MyComponent: React.FC<MyComponentProps> = ({ title, subtitle }) => {
  return (
    <div>
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
    </div>
  );
};

// Props passed via spread operator
type MyComponentProps = {
  title: string;
  subtitle: string;
};

const MyComponent: React.FC<MyComponentProps> = (props) => {
  return <ChildComponent {...props} />;
};

// Props used in conditional logic
type MyComponentProps = {
  isVisible: boolean;
  content: string;
};

const MyComponent: React.FC<MyComponentProps> = ({ isVisible, content }) => {
  if (isVisible) {
    return <div>{content}</div>;
  }
  return null;
};
```

## When Not To Use It

You might want to disable this rule if:

1. You're building a library where some props might be used by higher-order components or other wrappers.
2. You have props that are used for TypeScript type checking but don't directly appear in the component implementation.
3. You're in the process of deprecating certain props and want to maintain backward compatibility.

## Version

This rule was introduced in eslint-plugin-blumint 1.0.4
