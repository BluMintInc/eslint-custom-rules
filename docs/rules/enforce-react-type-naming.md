# Enforce naming conventions for React types (`@blumintinc/blumint/enforce-react-type-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces naming conventions for variables and parameters based on their React type, which a variable declares either as an annotation or as a type assertion:

- Variables and parameters of type `ReactNode` or `JSX.Element` must have **lowercase** names.
- Variables and parameters of type `ComponentType` or `FC` (FunctionComponent) must have **uppercase** names.

This ensures consistency with React's conventions, improving readability and maintainability. By distinguishing between rendered elements (which should be treated as values) and component definitions (which are typically PascalCase), the rule helps prevent common mistakes and aligns with best practices.

## Rule Details

### Examples of **incorrect** code for this rule:

```tsx
function Panel() {
  const MyComponent: JSX.Element = <div>Hello</div>; // ❌ Should be lowercase
  return MyComponent;
}
const element: ComponentType = () => <div />; // ❌ Should be uppercase

function useCustomHook(Component: ReactNode) { // ❌ Should be lowercase
  return <Component />;
}

export const config = {} as FC; // ❌ Should be uppercase — the assertion is the type
```

### Examples of **correct** code for this rule:

```tsx
function Panel() {
  const myComponent: JSX.Element = <div>Hello</div>; // ✅ Lowercase for JSX.Element
  return myComponent;
}
const Element: ComponentType = () => <div />; // ✅ Uppercase for ComponentType

function useCustomHook(component: ReactNode) { // ✅ Lowercase for ReactNode
  return <component />;
}

const Enhanced = memoized as ComponentType<TProps>; // ✅ Uppercase for ComponentType
```

The element examples are written inside a component on purpose: at module scope a
`const` is named by `global-const-style`, not by this rule — see below.

## Module-scope constants belong to `global-const-style`

The rule does **not** name a module-scope `const`, exported or not. That
identifier is [`global-const-style`](./global-const-style.md)'s, and it demands
`UPPER_SNAKE_CASE`:

```tsx
// neither reported here nor renamed here — `global-const-style` names it
const element: JSX.Element = <div>Hello</div>;

// after --fix
const ELEMENT: JSX.Element = <div>Hello</div>;
```

The two contracts cannot both be met on one identifier: every lowercase-initial
spelling violates `global-const-style` and every uppercase-initial spelling used
to violate this rule. Since both autofix, `--fix` oscillated
(`element` → `ELEMENT` → `eLEMENT` → `E_LEMENT` → `e_LEMENT` → …) until ESLint's
ten-pass cap and wrote the mangled name to disk. This rule yields because
module-scope constant naming is the sibling's universal contract, while telling
an element *value* apart from a *component* is a local- and parameter-naming
question.

**Exported constants are included.** `global-const-style` withholds only its
*rename* for an exported binding — the name is a cross-file contract — but it
still reports `upperSnakeCase` on it. Governance follows which rule reports on
the name, not which one fixes it, so this rule yields there too:

```tsx
// clean under both rules
export const ELEMENT: JSX.Element = <div>Hello</div>;
```

Nothing oscillates on an export, because neither rule renames one; before the
carve-out reached exports the damage was simply that no spelling was acceptable
to both (`element` → `upperSnakeCase`, `ELEMENT` → `reactNodeShouldBeLowercase`,
`Element` → both).

The carve-out tracks what `global-const-style` actually governs, so a
declaration it declines is still this rule's:

| shape | named by |
| --- | --- |
| `const element: JSX.Element = …`, exported or not | `global-const-style` |
| `const element = {} as JSX.Element` (type from an assertion) | `global-const-style` |
| `let` / `var`, or any non-module scope | this rule |
| `const button: FC = () => …` (function value) | this rule |
| dynamic initializer, binding alias, no initializer, `jest.Mock*` cast | this rule |
| `export const config: FC = …` (Next.js reserved export name) | this rule |
| `export const config = {} as FC` (the same, type from an assertion) | this rule |

The `let`/`var`, function-value and dynamic-initializer rows hold whether or not
the declaration is exported, and each row reads the same whichever way the type
is written. The reserved-export rows are the only ones the export itself
creates: `global-const-style`
declines to rename `config`, `getServerSideProps`, `getStaticProps`,
`getStaticPaths`, `getInitialProps` and `middleware` when they are exported,
because Next.js matches those identifiers literally. Nothing over there governs
the name, so this rule keeps its report rather than leaving the declaration
governed by nothing — report-only, so `--fix` never touches the framework
contract. The exemption is keyed on the export, exactly as the sibling keys it:
a module-scope `const config` that is *not* exported is still renamed to
`CONFIG` by `global-const-style`.

## The type may be written as an assertion

A type assertion declares the binding's type as bindingly as an annotation does,
so the rule reads it too. `tsc --declaration --emitDeclarationOnly` emits the
same `export declare const config: FC;` for both spellings:

```tsx
// both report `componentTypeShouldBeUppercase`
export const config: FC = {} as FC;
export const config = {} as FC;
```

Reading both carriers is what keeps the report stable under the recommended
config's own `--fix`. [`no-redundant-annotation-assertion`](./no-redundant-annotation-assertion.md)
removes the redundant *annotation* and keeps the *assertion* — the type-safe
direction, since removing the assertion instead leaves `const config: FC = {}`,
which does not typecheck — so an annotation-only reader loses its report the
moment a consumer runs `--fix`.

Which assertion answers, and which carries nothing:

- The **outermost** assertion applied to the initializer, read through `!` and
  through parentheses. `const Widget = thing as unknown as FC` reads `FC`.
- A **nested** assertion describes a sub-expression, not the binding:
  `const x = (e as FC)()` holds FC's *return* value, so the rule is silent.
- **`as const`** names no React type, and **`satisfies`** leaves the
  expression's type alone (`{} satisfies FC` is still `{}`). Neither carries.
- When a declaration has **both**, the annotation is the declared type and wins:
  `const x: unknown = {} as FC` reads `unknown`.
- A **parameter** takes no assertion, so parameters read their annotation only.

The `global-const-style` carve-out above is applied first, so a module-scope
`const` typed by an assertion belongs to that rule exactly as an annotated one
does:

```tsx
// `global-const-style` names this; --fix makes it `const WIDGET = {} as FC;`
const widget = {} as FC;
```

## Autofix

The autofix is a scope-aware rename. It rewrites **only the name token**, so the
annotation or assertion that triggered the report — along with any `?` or `!`
marker — survives, and it rewrites **every in-file reference** to the renamed
binding, so the fixed code still resolves.

```tsx
// before
let Content: ReactNode = null;
render(Content);

// after --fix
let content: ReactNode = null;
render(content);
```

Object-literal shorthand is expanded rather than rewritten wholesale, so the
property key (part of the object's public shape) is left alone:

```tsx
// before
let Content: ReactNode = null;
const wrapper = { Content };

// after --fix
let content: ReactNode = null;
const wrapper = { Content: content };
```

The fix is **withheld** (the violation is still reported) whenever a complete,
semantics-preserving rename is impossible:

- **Collision** — the target name is already bound in the declaration scope, or a
  binding of that name sits between a reference and the declaration, or the
  declaration's scope subtree already uses the target name for something else.
- **Exported declaration** — `export let Content: ReactNode = …`. The name is a
  cross-file contract whose importers a single-file fixer cannot reach. The
  hazard lives in those other files, so it applies to a bare exported binding
  with no in-file use site just as much as to one referenced locally. (An
  exported `const` never reaches this guard: `global-const-style` names it, per
  the section above.)
- **Re-export specifier** — `export { Content }` binds the public export name to
  that identifier, so rewriting it would rename the export itself.
- **A JSX element name that would be lowercased** — a variable referenced as
  `<Content />`. Rewriting it to `<content />` does not carry the reference
  across: a lowercase JSX element name is an intrinsic host element, so the
  binding ends up unreferenced and an unknown HTML tag is rendered in its place.

```tsx
// reported, not fixed — the author decides how to spell the element
function Page() {
  const Content: JSX.Element = getContent();
  return <Content />;
}
```

A JSX element name is a reference only while it starts uppercase, so the
directions are not symmetric. Uppercasing is safe and is applied:
`const content: FC = …` renames to `Content`, leaving an already-intrinsic
`<content />` alone. A value reference inside a JSX expression container
(`{Content}`) is a plain reference and follows the rename either way. A
PARAMETER keeps the rewrite — an unused parameter is an ordinary
signature-driven shape rather than dead code the fix created.

## When Not To Use It

You might want to disable this rule if your project follows different naming conventions for React components and elements.

## Further Reading

- [React Components and Elements](https://reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html)
