# prevent-children-clobber

Rule ID: `@blumintinc/blumint/prevent-children-clobber`

💼 This rule is enabled in the ✅ `recommended` config.

Type Information: 💭 Not required (AST-only).

<!-- end auto-generated rule header -->

Prevent JSX spreads from silently discarding `props.children` when explicit children are also provided in the element body. Spreading a props object that still contains `children` and then supplying JSX children overwrites the incoming children without any runtime warning.

## Rule Details

- What goes wrong: `<Dialog {...props}>…</Dialog>` overwrites `props.children` when the component also supplies its own children, so callers that pass children never see them rendered.
- Why it matters: The omission is silent—callers think their children render because the props type allows it, but the component discards them.
- How to fix: Either destructure and render `children` explicitly or exclude `children` from the props type with `Omit<..., 'children'>` when the component should not accept children.

The rule reports when:
- A JSX element spreads a props/rest identifier that may include `children`.
- The element also has explicit JSX children (elements, text, or expressions).
- The spread source has not explicitly removed `children` (via destructuring or `Omit<..., 'children'>`).

## Examples

Bad:

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

Good:

```tsx
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

- If a component intentionally ignores children and the type already omits them, this rule will not report. Otherwise, add an inline disable with justification for rare cases where you deliberately discard `children`.
