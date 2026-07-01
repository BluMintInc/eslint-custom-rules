import { ruleTesterJsx } from '../utils/ruleTester';
import { noPortalInsideTooltip } from '../rules/no-portal-inside-tooltip';

ruleTesterJsx.run('no-portal-inside-tooltip', noPortalInsideTooltip, {
  valid: [
    // Portal as a sibling of the tooltip — the canonical correct shape
    `
const C = () => (
  <Fragment>
    <MatchPayoutTooltip>
      <ChipView onClick={open} />
    </MatchPayoutTooltip>
    {Portal}
  </Fragment>
);
    `,

    // SchedulerMenu as a sibling of WYSIWYGTooltip
    `
const C = () => (
  <Fragment>
    <WYSIWYGTooltip tooltipContent={CONTENT}>
      <SchedulerChipView onClick={openMenu} />
    </WYSIWYGTooltip>
    <SchedulerMenu anchorEl={anchor} onClose={close}>{items}</SchedulerMenu>
  </Fragment>
);
    `,

    // Tooltip with only a chip child — no portal at all
    `
const C = () => (
  <Tooltip title="Open settings">
    <Chip onClick={openDialogElsewhere} />
  </Tooltip>
);
    `,

    // MatchPayoutTooltip with no portal child
    `
const C = () => (
  <MatchPayoutTooltip>
    <ChipView onClick={openDialog} />
  </MatchPayoutTooltip>
);
    `,

    // Tooltip with a non-portal child (icon inside chip)
    `
const C = () => (
  <Tooltip title="Saved">
    <Chip>
      <CheckIcon />
      Saved
    </Chip>
  </Tooltip>
);
    `,

    // Dialog NOT inside any tooltip — rendered independently
    `
const C = () => (
  <div>
    <Tooltip title="Edit">
      <Chip onClick={open} />
    </Tooltip>
    <Dialog open={isOpen} onClose={close}>{content}</Dialog>
  </div>
);
    `,

    // MUI Tooltip title prop contains JSX — NOT a child, so not flagged
    `
const C = () => (
  <Tooltip title={<Typography>Click to edit</Typography>}>
    <Chip onClick={open} />
  </Tooltip>
);
    `,

    // Component whose name contains "tip" but is NOT a tooltip suffix
    `
const C = () => (
  <Tooltip title="hi">
    <div>
      <MultiTipSection />
      <TipCard title="hint" />
    </div>
  </Tooltip>
);
    `,

    // A portal in a completely separate branch not inside any tooltip
    `
const C = () => (
  <div>
    <section>
      <Tooltip title="hover">
        <span>trigger</span>
      </Tooltip>
    </section>
    <aside>
      <Dialog open={isOpen} onClose={close}>{settings}</Dialog>
    </aside>
  </div>
);
    `,

    // detectTooltipSuffix: false — only exact names in the default+option list are checked.
    // "CustomHintBox" does not match any default or suffix, so no violation.
    {
      code: `
const C = () => (
  <CustomHintBox>
    <><Chip /><Dialog open={isOpen} /></>
  </CustomHintBox>
);
      `,
      options: [
        {
          detectTooltipSuffix: false,
        },
      ],
    },

    // detectPortalSuffix: false — only exact portal names are checked; SchedulerMenu not flagged
    {
      code: `
const C = () => (
  <Tooltip title="hi">
    <><Chip /><SchedulerMenu /></>
  </Tooltip>
);
      `,
      options: [
        {
          detectPortalSuffix: false,
          portalComponents: [
            'Dialog',
            'Drawer',
            'Portal',
            'Menu',
            'Popover',
            'Modal',
          ],
        },
      ],
    },

    // CallExpression inside expression container — out of scope, must not crash
    `
const C = () => (
  <WYSIWYGTooltip tooltipContent="Compose">
    <>
      <ChipView onClick={open} />
      {renderDialog()}
    </>
  </WYSIWYGTooltip>
);
    `,

    // Spread children — out of scope, must not crash
    `
const C = () => (
  <Tooltip title="hi" {...{ children: <span>text</span> }} />
);
    `,

    // Portal is inside an outer Fragment that is sibling to the tooltip, not inside it
    `
const C = () => (
  <>
    <Tooltip title="Edit">
      <Chip onClick={open} />
    </Tooltip>
    <>
      <Dialog open={isOpen} onClose={close}>{content}</Dialog>
    </>
  </>
);
    `,

    // Custom tooltip wrapper via explicit list — not a suffix match, no violation
    {
      code: `
const C = () => (
  <CustomWrapper>
    <><Chip /><Dialog open={isOpen} /></>
  </CustomWrapper>
);
      `,
      options: [
        {
          tooltipComponents: ['Tooltip'],
          detectTooltipSuffix: false,
        },
      ],
    },
  ],

  invalid: [
    // Issue's primary bad example: {Portal} identifier inside MatchPayoutTooltip > Fragment
    {
      code: `
const C = () => (
  <MatchPayoutTooltip>
    <Fragment>
      <ChipView isEditable={isClickable} isEditing={isOpen} onClick={open} />
      {Portal}
    </Fragment>
  </MatchPayoutTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Issue's second bad example: SchedulerMenu inside WYSIWYGTooltip
    {
      code: `
const C = () => (
  <WYSIWYGTooltip tooltipContent={SCHEDULER_TOOLTIP_CONTENT}>
    <Fragment>
      <SchedulerChipView onClick={openMenu} />
      <SchedulerMenu anchorEl={menuAnchor} onClose={closeMenu} />
    </Fragment>
  </WYSIWYGTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Issue's third bad example: conditionally-rendered Dialog inside Tooltip
    {
      code: `
const C = () => (
  <Tooltip title="Click to set prize">
    <>
      <ChipView onClick={open} />
      {isOpen && <Dialog open onClose={close}>{content}</Dialog>}
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Direct Dialog child nested inside Tooltip > Fragment
    {
      code: `
const C = () => (
  <Tooltip title="Edit">
    <Fragment>
      <Chip onClick={open} />
      <Dialog open={isOpen} onClose={close} />
    </Fragment>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Drawer inside MatchPayoutTooltip using shorthand fragment
    {
      code: `
const C = () => (
  <MatchPayoutTooltip>
    <>
      <Chip />
      <Drawer open={isOpen} onClose={close}>{content}</Drawer>
    </>
  </MatchPayoutTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Popover inside Tooltip
    {
      code: `
const C = () => (
  <Tooltip title="settings">
    <>
      <Chip onClick={open} />
      <Popover open={isOpen} onClose={close}>{items}</Popover>
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Menu inside WYSIWYGTooltip > Fragment
    {
      code: `
const C = () => (
  <WYSIWYGTooltip tooltipContent="Pick option">
    <Fragment>
      <Chip onClick={openMenu} />
      <Menu anchorEl={anchor} onClose={close}>{items}</Menu>
    </Fragment>
  </WYSIWYGTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // TeamDisplayTooltip wrapping DialogCentered (project-specific portal)
    {
      code: `
const C = () => (
  <TeamDisplayTooltip teamDisplayProps={teamProps}>
    <>
      <UsernameChip onClick={openDetails} />
      <DialogCentered open={isOpen} onClose={close}>{detail}</DialogCentered>
    </>
  </TeamDisplayTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Ternary-gated Dialog inside Tooltip
    {
      code: `
const C = () => (
  <Tooltip title="Settings">
    <>
      <ChipView onClick={open} />
      {isOpen ? <Dialog>{settings}</Dialog> : null}
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Deeply nested portal — two fragments deep
    {
      code: `
const C = () => (
  <Tooltip title="Edit">
    <>
      <>
        <Chip onClick={open} />
        <Portal>{dialog}</Portal>
      </>
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Mixed Fragment forms — named Fragment wrapping shorthand containing portal identifier
    {
      code: `
const C = () => (
  <MatchPayoutTooltip>
    <Fragment>
      <ChipView onClick={open} />
      <>
        {Portal}
      </>
    </Fragment>
  </MatchPayoutTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Suffix-matched tooltip (ComingSoonTooltip) with Dialog child
    {
      code: `
const C = () => (
  <ComingSoonTooltip title="Coming soon">
    <Fragment>
      <FeatureChip onClick={open} />
      <Dialog open={isOpen} onClose={close}>{form}</Dialog>
    </Fragment>
  </ComingSoonTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // WizardPortal (project-specific portal) inside Tooltip
    {
      code: `
const C = () => (
  <Tooltip title="Open wizard">
    <Fragment>
      <Button onClick={open} />
      <WizardPortal isOpen={isOpen} onClose={close}>{steps}</WizardPortal>
    </Fragment>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // AlertDialog (project-specific portal) inside OptionalTooltip
    {
      code: `
const C = () => (
  <OptionalTooltip title="Warning">
    <>
      <WarningChip onClick={open} />
      <AlertDialog open={isOpen} onClose={close}>{message}</AlertDialog>
    </>
  </OptionalTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Custom tooltipComponents option picks up non-suffix component
    {
      code: `
const C = () => (
  <MyTooltip title="hi">
    <>
      <Trigger />
      <Dialog open={isOpen} />
    </>
  </MyTooltip>
);
      `,
      options: [{ tooltipComponents: ['MyTooltip'] }],
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Custom portalComponents option picks up non-suffix component
    {
      code: `
const C = () => (
  <Tooltip title="hi">
    <>
      <Chip />
      <MyPortalThing open={isOpen} />
    </>
  </Tooltip>
);
      `,
      options: [{ portalComponents: ['MyPortalThing'] }],
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Modal inside Tooltip (Modal is in the default portal list)
    {
      code: `
const C = () => (
  <Tooltip title="Details">
    <>
      <Chip onClick={open} />
      <Modal open={isOpen} onClose={close}>{content}</Modal>
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // ValidationTooltip with Dialog child
    {
      code: `
const C = () => (
  <ValidationTooltip message="Invalid input">
    <Fragment>
      <InputChip onClick={open} />
      <Dialog open={isOpen} onClose={close}>{form}</Dialog>
    </Fragment>
  </ValidationTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Suffix-based portal detection: FooDialog inside Tooltip
    {
      code: `
const C = () => (
  <Tooltip title="Open dialog">
    <>
      <Chip onClick={open} />
      <FooDialog open={isOpen} onClose={close}>{content}</FooDialog>
    </>
  </Tooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // Suffix-based tooltip detection: any *Tooltip component
    {
      code: `
const C = () => (
  <SomeCustomTooltip title="hover">
    <>
      <Chip onClick={open} />
      <Dialog open={isOpen} onClose={close}>{content}</Dialog>
    </>
  </SomeCustomTooltip>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },

    // TooltipDynamicDelay with Portal identifier inside nested fragment
    {
      code: `
const C = () => (
  <TooltipDynamicDelay title="slow">
    <Fragment>
      <ChipView onClick={open} />
      <Fragment>
        {Portal}
      </Fragment>
    </Fragment>
  </TooltipDynamicDelay>
);
      `,
      errors: [{ messageId: 'portalInsideTooltip' }],
    },
  ],
});
