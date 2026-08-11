# Require @Memoize() decorator on instance members that return JSX or JSX factories (`@blumintinc/blumint/require-memoize-jsx-returners`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why

Getters and methods that return JSX (or factories that produce JSX) create a brand-new component function on every access. That new reference forces React to treat the result as a different component, triggering unnecessary renders and sometimes full remounts. Decorating these factories with `@Memoize()` preserves a stable reference so components only re-render when their inputs change.

## Bad

```ts
class ProviderFactory {
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}
```

## Good

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class ProviderFactory {
  @Memoize()
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}
```

## Notes

- Applies to instance getters and methods that return JSX directly or return functions that produce JSX (including nested `() => () => <div />` patterns).
- Skips static members, so it does not conflict with `no-memoize-on-static`.
- Skips members declared in a class **expression** (`const Widget = class { … }`), where no decorator is legal at all (see below).
- Functions inside React components that rely on hooks (e.g., `useCallback`, `useMemo`) are out of scope because the rule only inspects class members.
- Recognizes `@Memoize`, aliased imports, and namespaced forms like `@memoize.Memoize()`. Auto-fix reuses existing aliases and inserts `import { Memoize } from '@blumintinc/typescript-memoize';` if missing.
- When other decorators exist, `@Memoize()` is added without removing them; multiple violations in a file share a single inserted import.

### Members declared in a class expression

A getter or method inside a class **expression** is never reported. Under
`experimentalDecorators` — the mode this plugin's consumers compile in —
TypeScript rejects a decorator on **every** member of a class expression with
**TS1206**, "Decorators are not valid here.", whatever the member is named and
wherever the decorator is written. The remedy this rule prescribes cannot be
written in place, and a report naming an edit its reader cannot make is worse
than silence. The carve-out covers each spelling of the shape — anonymous,
named, returned from a factory, passed as an argument, or held in an object
property, a class property or a parameter default:

```ts
// Not reported: `@Memoize()` cannot be written on any of these members.
export const Widget = class {
  public get Component() {
    return () => <div />;
  }
};

export const Named = class Inner {
  public render() {
    return <div />;
  }
};

export function build() {
  return class {
    public render() {
      return <div />;
    }
  };
}
```

To memoize such a member, give the class a **declaration**, which takes
decorators normally:

```ts
import { Memoize } from '@blumintinc/typescript-memoize';

class Widget {
  @Memoize()
  public get Component() {
    return () => <div />;
  }
}

export { Widget };
```

The carve-out is keyed on the member's own enclosing class rather than on any
ancestor: a class declaration nested inside a class expression's method is still
reported and still fixed, and `export default class { … }` is a declaration
despite having no name, so it is reported too.

Should this plugin ever target standard (TC39) decorators —
`experimentalDecorators: false`, where a class expression's members do accept
decorators — this carve-out becomes mode-dependent and needs revisiting.

### Interaction with inline disable comments

The `import { Memoize } from '@blumintinc/typescript-memoize';` statement is
added once per file, attached to the fix of the first violation that is **not**
suppressed by an inline `eslint-disable` directive. Suppressing an individual
member therefore never strands the remaining `@Memoize()` decorators without
their import:

```tsx
class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get Alpha() {
    return () => <div />;
  } // left alone

  get Beta() {
    return () => <span />;
  } // fixed, and carries the import
}
```

A member's reported location spans its decorators, so a disable comment must sit
**above** the first decorator to suppress the report; one placed between a
decorator and the member signature does not.
