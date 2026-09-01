# Prevent JSX spreads from silently discarding props.children (`@blumintinc/blumint/prevent-children-clobber`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Prevent JSX spreads from silently discarding `props.children` when explicit children are also provided in the element body. Spreading a props object that still contains `children` and then supplying JSX children overwrites the incoming children without any runtime warning. The rule uses TypeScript type analysis when available, and falls back to a syntactic proof when it is not, to avoid false positives (e.g., when the props type already excludes children via `Omit<..., 'children'>`).

## Rule Details

- What goes wrong: `<Dialog {...props}>…</Dialog>` overwrites `props.children` when the component also supplies its own children, so callers that pass children never see them rendered.
- Why it matters: The omission is silent—callers think their children render because the props type allows it, but the component discards them.
- How to fix: Either destructure and render `children` explicitly or exclude `children` from the props type when the component should not accept children — with `Omit<..., 'children'>`, with a `Pick<...>` keep-list that does not name it, or by declaring a closed object type without it.

The rule reports when:
- A JSX element spreads a props/rest identifier that may include `children`.
- The element also has explicit JSX children (elements, text, or expressions).
- The spread source has not provably removed `children` (via destructuring, or via a props type that excludes it).

The rule only flags spreads of identifiers introduced as rest-objects in the current function scope (e.g., `...rest` in a parameter list), not re-exported identifiers from outer scopes.

The enclosing function must also be component-like: either it carries a
component name, or it returns JSX. That second test reads the function's value
the same way whichever way its body is spelled — a concise arrow body and the
`return` of a block body are the same value — and a function is not a JSX value.
A camelCase factory such as `const buildDialog = ({ title, ...props }) => () => <Dialog {...props}>…</Dialog>`
therefore returns a render function rather than an element, is not component-like,
and its rest binding is left alone in both spellings. Naming it `BuildDialog`
satisfies the name test and brings the spread back into scope.

## Examples

### Examples of incorrect code

The following patterns spread a props object that may contain `children` while also providing explicit JSX children in the element body. The spread overwrites any incoming `children`, silently discarding them:

```tsx
type AlertDialogProps = DialogProps;

const AlertDialog = ({ title, ...props }: AlertDialogProps) => (
  <Dialog {...props}>
    <AlertStandard message={title} />
  </Dialog>
);
```

```tsx
const Wrapper = (props: DialogProps) => (
  <Dialog {...props}>
    {props.renderDefault()}
  </Dialog>
);
```

```tsx
const FragmentWrapper = (props: DialogProps) => (
  <Dialog {...props}>
    <>
      <Header />
      <Content />
    </>
  </Dialog>
);
```

```tsx
const ConditionalWrapper = (props: DialogProps) => (
  <Dialog {...props}>
    {condition && <Fallback />}
  </Dialog>
);
```

### Examples of correct code

These patterns avoid the issue by either destructuring and rendering children explicitly, or by excluding children from the props type:

```tsx
// Safe: children are destructured separately and rendered explicitly.
const AlertDialog = ({ title, children, ...props }: DialogProps) => (
  <Dialog {...props}>
    <AlertStandard message={title} />
    {children}
  </Dialog>
);
```

```tsx
type AccordionProps = Omit<MuiAccordionProps, 'children'>;

const Accordion = (props: AccordionProps) => (
  <AccordionRoot disableGutters {...props}>
    <AccordionSummary />
    <AccordionDetails />
  </AccordionRoot>
);
```

The props alias is resolved lexically, so exporting it or declaring it inside a
function, arrow, `namespace`, `static` block or `switch` case makes no
difference. An alias declared in an inner scope shadows a same-named outer one,
and because type aliases hoist, a component written above its own alias still
resolves it. A binder that holds no statement shadows as well, each in its own
space: an enclosing type parameter hides a same-named alias, and a parameter or
other value binding hides a same-named `as const` array, so a `Pick` keep-list
built from `(typeof KEYS)[number]` is undecidable wherever `KEYS` denotes
something other than that array.

```tsx
export type DialogAccordionProps = Readonly<
  Omit<MuiAccordionProps, 'children'>
>;

const DialogAccordion = (props: DialogAccordionProps) => (
  <AccordionRoot {...props}>
    <AccordionDetails />
  </AccordionRoot>
);
```

```tsx
function createAccordion() {
  type LocalAccordionProps = Omit<MuiAccordionProps, 'children'>;

  return (props: LocalAccordionProps) => (
    <AccordionRoot {...props}>
      <AccordionDetails />
    </AccordionRoot>
  );
}
```

An alias the rule cannot resolve — one imported from another module, for
instance — is treated as still carrying `children`, so the exemption never
widens to names whose shape is unknown.

#### Keep-lists

A `Pick<T, K>` keep-list is a stronger guarantee than an omit-list: it drops
every member it does not name. A keep-list whose keys are all string literals,
written inline or through an alias, and none of which is `children`, therefore
excludes children outright.

```tsx
export type WithdrawButtonProps = Readonly<
  Pick<LoadingButtonProps, 'sx' | 'size'>
>;

const WithdrawButton = (props: WithdrawButtonProps) => (
  <LoadingButton {...props}>Withdraw</LoadingButton>
);
```

A keep-list the rule cannot enumerate proves nothing and still reports:
`Pick<T, K>` for a type parameter `K`, `Pick<T, keyof T>`, a template-literal
key type, and any union with one undecidable member all leave `children`
possible.

#### Closed object types

An object type declares its whole surface, so one without a `children` member
provably cannot carry one.

```tsx
type BadgeProps = { label: string; sx?: SxProps };

const Badge = (props: BadgeProps) => (
  <Chip {...props}>
    <Dot />
  </Chip>
);
```

This is what makes an intersection exempt as a whole — every arm must exclude
`children`, and the component's own literal is usually one of the arms.

```tsx
type TestMenuProps = Readonly<
  Omit<MenuProps, 'children'> & { onClose: () => void }
>;

const TestMenu = (props: TestMenuProps) => (
  <Menu {...props}>
    <MenuItem>Replace</MenuItem>
  </Menu>
);
```

An index signature disqualifies the type: `{ [key: string]: unknown }` admits
every name, `children` among them, so the object is not closed and the proof is
unavailable. A computed key the rule cannot evaluate disqualifies it for the
same reason — the constant behind `[SLOT_KEY]` may itself be `'children'`.

Both proofs describe the type they sit on, so they carry outward only through
constructs that contribute no members of their own: a union or intersection arm,
an alias, and the argument of `Readonly`, `Required`, `Partial` or
`NonNullable`. Under any other generic they stop, because the wrapper may add
what the argument lacks — `PropsWithChildren<{ sx?: SxProps }>` adds `children`
itself, and `Record<string, { a: number }>` admits it through an index
signature. Both still report.

#### `forwardRef` type arguments

The render callback of `forwardRef<Element, Props>` takes its props type from
the call's second type argument rather than from a parameter annotation, and
that type is read the same way an annotation is.

```tsx
export type WithdrawProps = Readonly<Omit<LoadingButtonProps, 'children'>>;

const Withdraw = forwardRef<HTMLButtonElement, WithdrawProps>((props, ref) => (
  <LoadingButton {...props} ref={ref}>
    Withdraw
  </LoadingButton>
));
```

A parameter that annotates itself wins over the type argument, since that
annotation is the type its body is checked against.

#### Already forwarding children explicitly (allowed)

```tsx
const Passthrough = (props: DialogProps) => (
  <Dialog {...props}>{props.children}</Dialog>
);
```

```tsx
const PassthroughAliased = (props: DialogProps) => {
  const content = props.children;
  return <Dialog {...props}>{content}</Dialog>;
};
```

## When Not To Use It

- **Self-closing elements:** The rule does not report for self-closing JSX elements (e.g., `<Input {...props} />`), as they cannot have children.
- **Type already excludes children:** If the props type provably excludes `children` (e.g., `Omit<DialogProps, 'children'>`, `Pick<DialogProps, 'sx'>`, or a closed object type declaring no `children` member), the rule will not report, even if the element spreads props and has children. TypeScript type analysis helps avoid false positives here.
- **Rare intentional discarding:** For edge cases where you deliberately discard incoming `children`, add an inline ESLint disable (`// eslint-disable-next-line @blumintinc/blumint/prevent-children-clobber`) with a clear comment explaining the intent.
