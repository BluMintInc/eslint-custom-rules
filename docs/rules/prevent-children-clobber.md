# Prevent JSX spreads from silently discarding props.children (`@blumintinc/blumint/prevent-children-clobber`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Prevent JSX spreads from silently discarding `props.children` when explicit children are also provided in the element body. Spreading a props object that still contains `children` and then supplying JSX children overwrites the incoming children without any runtime warning. The rule uses TypeScript type analysis when available to avoid false positives (e.g., when the props type already excludes children via `Omit<..., 'children'>`).

## Rule Details

- What goes wrong: `<Dialog {...props}>…</Dialog>` overwrites `props.children` when the component also supplies its own children, so callers that pass children never see them rendered.
- Why it matters: The omission is silent—callers think their children render because the props type allows it, but the component discards them.
- How to fix: Either destructure and render `children` explicitly or exclude `children` from the props type with `Omit<..., 'children'>` when the component should not accept children.

The rule reports when:
- A JSX element spreads a props/rest identifier that may include `children`.
- The element also has explicit JSX children (elements, text, or expressions).
- The spread source has not explicitly removed `children` (via destructuring or `Omit<..., 'children'>`).

The rule only flags spreads of identifiers introduced as rest-objects in the current function scope (e.g., `...rest` in a parameter list), not re-exported identifiers from outer scopes.

## Examples

**Bad examples** – The following patterns spread a props object that may contain `children` while also providing explicit JSX children in the element body. The spread overwrites any incoming `children`, silently discarding them:

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

**Good examples** – These patterns avoid the issue by either destructuring and rendering children explicitly, or by excluding children from the props type:

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

Already forwarding children explicitly (allowed):

```tsx
const Passthrough = (props: DialogProps) => (
  <Dialog {...props}>{props.children}</Dialog>
);
```

## When Not To Use It

- **Self-closing elements:** The rule does not report for self-closing JSX elements (e.g., `<Input {...props} />`), as they cannot have children.
- **Type already excludes children:** If the props type explicitly excludes `children` (e.g., `Omit<DialogProps, 'children'>` or `children?: never`), the rule will not report, even if the element spreads props and has children. TypeScript type analysis helps avoid false positives here.
- **Rare intentional discarding:** For edge cases where you deliberately discard incoming `children`, add an inline ESLint disable (`// eslint-disable-next-line @blumintinc/blumint/prevent-children-clobber`) with a clear comment explaining the intent.
