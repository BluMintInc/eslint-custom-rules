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
- Skips members with a **private name** (`#view() { … }`, `get #view() { … }`), where no decorator is legal either (see below).
- Functions inside React components that rely on hooks (e.g., `useCallback`, `useMemo`) are out of scope because the rule only inspects class members.
- Recognizes `@Memoize`, aliased imports, and namespaced forms like `@memoize.Memoize()`. Auto-fix reuses existing aliases and inserts `import { Memoize } from '@blumintinc/typescript-memoize';` if missing.
- When other decorators exist, `@Memoize()` is added without removing them; multiple violations in a file share a single inserted import.
- The decorator attaches to the member itself, so a member that shares its line receives it inline (see below).

### Where the decorator is written

The decorator attaches to the **member**, ahead of its modifiers and of any
decorator it already carries — not to the start of the line the member happens
to sit on. A member that owns its line receives the decorator on a line of its
own at the member's indentation; a member that shares its line — a single-line
class body, a member following a property or the class's own `{` — receives it
inline, a spelling the grammar accepts just as readily:

```tsx
class ProviderFactory {
  @Memoize()
  public get Component() {
    return () => <div />;
  }
}

class Compact { @Memoize() public get Component() { return () => <div />; } }
```

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

### Members with a private name

A getter or method whose key is a **private name** — `#view`, the `#` form of
privacy — is never reported. Under `experimentalDecorators` TypeScript rejects a
decorator on such a member outright: `@Memoize()` written above it, or inline
ahead of it, is **TS1206**, "Decorators are not valid here." The message's only
remedy — "Add @Memoize() to …" — cannot be written on that member at all, so
report and fix are both withheld; a report naming an edit its reader cannot make
is worse than silence. Both member kinds this rule governs are covered, and so is
every placement, since the decorator is rejected wherever it is written:

```tsx
// Not reported: `@Memoize()` cannot be written on any of these members.
export class Widget {
  #view() {
    return <div />;
  }

  get #Component() {
    return () => <div />;
  }
}

export class Compact { #view() { return <div />; } }
```

The restriction is on the member's **name**, not on privacy. The `private`
modifier leaves an ordinary member name as far as decorators are concerned, so it
keeps reporting and fixing, as do `protected` and public members:

```tsx
import { Memoize } from '@blumintinc/typescript-memoize';

export class Widget {
  @Memoize()
  private get view() {
    return <div />;
  }

  @Memoize()
  protected render() {
    return <span />;
  }
}
```

That is also the remedy for a `#private` member whose JSX is worth memoizing:
express its privacy with the modifier. Nothing is lost by the silence otherwise —
a `#private` member is unnameable outside its class, so no caller elsewhere holds
the reference this rule stabilizes.

The carve-out reads the member's key, so a member whose name merely contains a
`#` — a string-literal key spelled `'#view'` — is an ordinary member name and
keeps reporting and fixing. A `#private` **property** is not a member this rule
inspects and is irrelevant to the getters and methods declared beside it.

Because such a member never reports, it never claims the file's import carrier
either: the single injected
`import { Memoize } from '@blumintinc/typescript-memoize';` rides on a violation
that does fix, and a file whose only candidates are private-named is left
untouched — no report, no decorator, no orphan import:

```tsx
import { Memoize } from '@blumintinc/typescript-memoize';

export class Widget {
  #view() {
    return <div />;
  }

  @Memoize()
  public get other() {
    return <span />;
  }
}
```

This matches `enforce-memoize-getters` and `enforce-memoize-async`, which
withhold report and fix on the same ground. The carve-out is mode-dependent in
the same way the class-expression one is: standard (TC39) decorators do accept a
private-named member, so targeting `experimentalDecorators: false` calls for
revisiting it.

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
