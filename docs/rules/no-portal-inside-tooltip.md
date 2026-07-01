# Disallow portal-rendering components (Dialog, Drawer, Menu, Popover, Portal, Modal) inside Tooltip wrapper components. React Portals preserve React-tree event bubbling, so a portal nested under a Tooltip leaves the tooltip orphaned over the modal (`@blumintinc/blumint/no-portal-inside-tooltip`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Prevent JSX patterns where a portal-rendering component (Dialog, Drawer, Menu, Popover, Portal, Modal, or project-specific equivalents) is nested anywhere in the descendant subtree of a Tooltip wrapper component.

## Rule Details

React Portals preserve React-tree event bubbling even though they move their DOM output to `document.body`. When a `<Dialog>` (or any other portal) is rendered inside a `<Tooltip>`, the dialog's full-viewport Backdrop becomes a *logical descendant* of the tooltip wrapper in the React tree. Moving the cursor from the trigger onto the Backdrop never fires `onMouseLeave` on the tooltip's wrapper because the cursor "stays inside" the tooltip from React's perspective. The result is an orphaned tooltip floating over the modal until the cursor physically exits the tooltip's bounding box.

The fix is structural: the portal must be rendered as a **sibling** of the tooltip wrapper, not a child. This rule detects the anti-pattern statically across the entire JSX descendant subtree of any matched tooltip element — including portals nested inside Fragments, conditional expressions (`&&`, ternary), and deeply nested elements.

The rule is purely syntactic (no type checker required) and works with both `@typescript-eslint/parser` and any plain JSX parser.

**Detection scope**

- **Tooltip wrappers** are detected by exact name match (default list includes `Tooltip`, `WYSIWYGTooltip`, `MatchPayoutTooltip`, `TeamDisplayTooltip`, `OptionalTooltip`, `ComingSoonTooltip`, `TooltipDynamicDelay`, `ValidationTooltip`) or by name suffix `Tooltip` (configurable).
- **Portal components** are detected by exact name match (default list includes `Dialog`, `Drawer`, `Menu`, `Popover`, `Portal`, `Modal`, `WizardPortal`, `DialogCentered`, `AlertDialog`) or by name suffix matching `Portal`, `Dialog`, `Drawer`, `Menu`, `Popover` (configurable).
- The special `{Portal}` pattern — a JSX expression container whose expression is an `Identifier` matching a portal name — is also detected.
- Only the tooltip's **children** are inspected; the `title` prop and other attributes are intentionally excluded to avoid false positives on MUI Tooltip's own internal Popper.

**Out of scope (no false positives)**

- Portals rendered outside any tooltip are not flagged.
- `CallExpression` results inside expression containers (e.g. `{renderDialog()}`) cannot be statically analyzed and are silently skipped.
- Spread children (`{...props}`) and `React.cloneElement` patterns are out of scope.

### Examples

#### ❌ Incorrect

```jsx
/* Portal identifier inside tooltip > Fragment */
<MatchPayoutTooltip>
  <Fragment>
    <ChipView isEditable={isClickable} isEditing={isOpen} onClick={open} />
    {Portal}
  </Fragment>
</MatchPayoutTooltip>

/* Menu nested inside WYSIWYGTooltip */
<WYSIWYGTooltip tooltipContent={SCHEDULER_TOOLTIP_CONTENT}>
  <Fragment>
    <SchedulerChipView onClick={openMenu} />
    <SchedulerMenu anchorEl={menuAnchor} onClose={closeMenu} />
  </Fragment>
</WYSIWYGTooltip>

/* Conditionally-rendered Dialog inside Tooltip */
<Tooltip title="Click to set prize">
  <>
    <ChipView onClick={open} />
    {isOpen && <Dialog open onClose={close}>{content}</Dialog>}
  </>
</Tooltip>
```

#### ✅ Correct

```jsx
/* Portal as sibling of the tooltip */
<Fragment>
  <MatchPayoutTooltip>
    <ChipView isEditable={isClickable} isEditing={isOpen} onClick={open} />
  </MatchPayoutTooltip>
  {Portal}
</Fragment>

/* SchedulerMenu as sibling */
<Fragment>
  <WYSIWYGTooltip tooltipContent={SCHEDULER_TOOLTIP_CONTENT}>
    <SchedulerChipView onClick={openMenu} />
  </WYSIWYGTooltip>
  <SchedulerMenu anchorEl={menuAnchor} onClose={closeMenu} />
</Fragment>

/* Tooltip with no portal child — always fine */
<Tooltip title="Open settings">
  <Chip onClick={openDialogElsewhere} />
</Tooltip>
```

## Options

```js
'@blumintinc/blumint/no-portal-inside-tooltip': ['error', {
  /**
   * Extra tooltip wrapper component names to detect (extends the built-in defaults).
   * Default built-ins: Tooltip, WYSIWYGTooltip, MatchPayoutTooltip, TeamDisplayTooltip,
   *   OptionalTooltip, ComingSoonTooltip, TooltipDynamicDelay, ValidationTooltip
   */
  tooltipComponents: [],

  /**
   * Extra portal-rendering component names to detect (extends the built-in defaults).
   * Default built-ins: Dialog, Drawer, Menu, Popover, Portal, Modal,
   *   WizardPortal, DialogCentered, AlertDialog
   */
  portalComponents: [],

  /**
   * When true (default), any component whose name ends in "Tooltip" is treated
   * as a tooltip wrapper without adding it to `tooltipComponents`.
   */
  detectTooltipSuffix: true,

  /**
   * When true (default), any component whose name ends in Portal, Dialog,
   * Drawer, Menu, or Popover is treated as a portal renderer.
   */
  detectPortalSuffix: true,
}]
```

## When Not To Use It

Disable this rule only if your tooltip component explicitly handles the portal-occlusion problem internally (e.g., by closing itself on Backdrop click via a custom event mechanism). In virtually all cases the structural fix — rendering the portal as a sibling — is simpler and more correct.

## Further Reading

- Motivating bug: [BluMintInc/agora#41625](https://github.com/BluMintInc/agora/issues/41625)
- Fix PR: [BluMintInc/agora#41700](https://github.com/BluMintInc/agora/pull/41700)
- [React Portals and event bubbling](https://reactjs.org/docs/portals.html#event-bubbling-through-portals)
