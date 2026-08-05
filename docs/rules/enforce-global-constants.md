# Enforce global static constants for React components/hooks (`@blumintinc/blumint/enforce-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule helps you identify instances where you use `useMemo` hooks with empty dependency arrays to return object literals, and where you use object/array literals for inline destructuring defaults in React components or hooks. Such usage is unnecessary and adds runtime memoization overhead and repeated object allocations instead of using global static constants.

## Rule Details

React's `useMemo` is intended for memoizing computationally expensive values that depend on props or state. When you use `useMemo` with an empty dependency array to return an object literal, you unnecessarily invoke the memoization mechanism on every render to return the same cached reference. This pattern adds runtime overhead without providing any benefit over a module-level constant, which provides a stable reference with zero runtime cost.

By identifying and refactoring these patterns, you can:
1. Reduce runtime memory consumption
2. Improve code clarity and maintainability
3. Encourage proper use of React hooks

### Examples of incorrect code for this rule:

> [!NOTE]
> The examples use the TypeScript `as const` assertion. This narrows literal types to readonly tuples or objects so values are treated as exact literals rather than widened types. This assertion is orthogonal to the rule—it ensures type safety but does not justify the inline object/array patterns shown below.

#### `useMemo` with empty dependency array

```tsx
const MyComponent = () => {
  // This useMemo unnecessarily invokes memoization logic on every render
  // to return the same cached object because the dependency array is empty
  const roomOptions = useMemo(() => {
    return {
      roomA: { label: 'Room A', icon: 'room-icon' },
      roomB: { label: 'Room B', icon: 'room-icon' },
    } as const;
  }, []);

  return (
    <div>
      {Object.entries(roomOptions).map(([key, option]) => (
        <Option key={key} label={option.label} icon={option.icon} />
      ))}
    </div>
  );
};
```

#### Inline destructuring defaults

```tsx
// Incorrect: inline default object/array in component props
const MyComponent = ({ config = { theme: 'light', size: 'medium' } }) => {
  return <div>{config.theme}</div>;
};

// Incorrect: inline default object/array in hook arguments
const useMyHook = (options = ['default-option']) => {
  return options;
};
```

### Examples of correct code for this rule:

#### Global constants for `useMemo` replacement

```tsx
// Define once at module scope - never recreated during renders
const ROOM_OPTIONS = {
  roomA: { label: 'Room A', icon: 'room-icon' },
  roomB: { label: 'Room B', icon: 'room-icon' },
} as const;

const MyComponent = () => {
  return (
    <div>
      {Object.entries(ROOM_OPTIONS).map(([key, option]) => (
        <Option key={key} label={option.label} icon={option.icon} />
      ))}
    </div>
  );
};
```

#### Global constants for destructuring defaults

```tsx
// Extract to global constant
const DEFAULT_CONFIG = { theme: 'light', size: 'medium' } as const;

const MyComponent = ({ config = DEFAULT_CONFIG }) => {
  return <div>{config.theme}</div>;
};

const DEFAULT_OPTIONS = ['default-option'] as const;

const useMyHook = (options = DEFAULT_OPTIONS) => {
  return options;
};
```

## Autofix safety

The autofix for a destructuring default extracts the value into a module-level
constant named `DEFAULT_<UPPER_SNAKE_CASE_NAME>` and points the default at it.
Because that name is generated rather than chosen, the fixer resolves it through
the scope chain at the report site before emitting anything:

- **Nothing owns the name** — the constant is declared at module scope and the
  default is rewritten to reference it.
- **A module-level `const` already holds the identical value** — that constant is
  reused and nothing is declared.
- **Anything else owns the name** — a module-level constant holding a *different*
  value, a `let`/`var`, a function, a class, an import, or any binding in an
  enclosing scope between the default and module scope — the fix is withheld for
  that default. Emitting it would silently swap the default's value, redeclare an
  existing binding, or bind the reference to the wrong constant.

A withheld fix does not silence the report: the violation is still reported and
is resolved by extracting the constant by hand under a name that does not clash.
Each default is decided independently, so a withheld default does not block the
fix for its siblings.

## When Not To Use It

You might want to disable this rule if:

1. Working with **generated code** that cannot be easily refactored (e.g., codegen output producing object literals).
2. Using **test utilities** that intentionally return fresh object instances each run for isolation.
3. Using specific **third-party framework patterns** that rely on `useMemo` with empty dependency arrays (e.g., certain legacy memoization techniques).
4. You need to maintain **legacy compatibility** where hoisting constants is constrained by existing tooling or architecture.

In most cases, however, you should prefer hoisting these literals to module-level constants to ensure stable references with zero runtime overhead.

## Further Reading

- [React useMemo Documentation](https://react.dev/reference/react/useMemo)
- [React Hooks Performance Optimization](https://react.dev/reference/react/useMemo#skipping-expensive-recalculations)

## Shebang files

Hoisted constants are placed below a `#!` shebang, the same way they are placed
below a `'use client'` directive prologue. A shebang is only a shebang at
character 0 — anywhere else it is a syntax error (`TS18026`) and the file stops
being executable.
