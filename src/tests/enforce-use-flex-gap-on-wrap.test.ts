import { enforceUseFlexGapOnWrap } from '../rules/enforce-use-flex-gap-on-wrap';
import { ruleTesterJsx } from '../utils/ruleTester';

/**
 * Every inline-`sx` case carries a hoisted-module-constant twin, in both the
 * `as const` and the plainly annotated spelling. Four of the six wrapping
 * Stacks in the consuming codebase hoist their `sx`, including both live
 * violations, so a rule exercised only against inline object literals would
 * report nothing on the code that motivated it.
 */
const STACK_IMPORT = "import Stack from '@mui/material/Stack';";

ruleTesterJsx.run('enforce-use-flex-gap-on-wrap', enforceUseFlexGapOnWrap, {
  valid: [
    // The pairing stated, inline.
    `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
    // Its hoisted `as const` twin.
    `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap' } as const;

const Row = () => <Stack spacing={2} sx={ROW_SX} useFlexGap />;
`,
    // Its hoisted, plainly annotated twin: a resolver keyed on TSAsExpression
    // alone would miss this shape.
    `
${STACK_IMPORT}

const ROW_SX: SxProps = { flexWrap: 'wrap' };

const Row = () => <Stack spacing={2} sx={ROW_SX} useFlexGap />;
`,
    // RegistrationHeader, the reference compliant site.
    `
${STACK_IMPORT}

const HEADER_ROW_SX = {
  minWidth: 0,
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

const Row = () => (
  <Stack
    data-testid="registration-header-row"
    direction="row"
    spacing={2}
    sx={HEADER_ROW_SX}
    useFlexGap
  />
);
`,
    // AuthenticationStack: the same contract with `flexWrap` as a shorthand
    // prop and a hoisted responsive `spacing`.
    `
${STACK_IMPORT}

const STACK_SPACING = { xs: 1, sm: 2 } as const;

const Row = () => (
  <Stack
    alignItems={'center'}
    direction="row"
    flexWrap="wrap"
    justifyContent={'space-between'}
    spacing={STACK_SPACING}
    sx={TOP_OPTIONS_ROW_SX}
    useFlexGap
  />
);
`,
    // `useFlexGap` written as an explicit opt-out is a decision, not an
    // oversight.
    `
${STACK_IMPORT}

const Row = ({ isWide }) => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap={isWide} />
);
`,
    // Edge case 1: `gap` in place of `spacing` is already correct, hoisted.
    `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap', gap: SPACING.space1 } as const;

const Row = () => (
  <Stack aria-label="Insert a token" direction="row" role="group" sx={ROW_SX} />
);
`,
    // Edge case 1: `gap` as a shorthand prop while `flexWrap` lives in `sx`.
    `
${STACK_IMPORT}

const Row = ({ isMine }) => (
  <Stack
    direction="row"
    gap={1}
    justifyContent={isMine ? 'flex-end' : 'flex-start'}
    sx={{ flexWrap: 'wrap', pt: 1 }}
  />
);
`,
    // Edge case 6: `gap` and `flexWrap` both as shorthand props, no `spacing`.
    `
${STACK_IMPORT}

const Row = () => (
  <Stack alignItems="flex-start" direction="row" flexWrap="wrap" gap={4} />
);
`,
    // Edge case 2: `rowGap` without `spacing` has nothing to correct.
    `
${STACK_IMPORT}

const Row = () => <Stack direction="row" sx={{ flexWrap: 'wrap', rowGap: 1 }} />;
`,
    // Edge case 3: `flexWrap: 'nowrap'`, hoisted.
    `
${STACK_IMPORT}

const HEADER_SX = {
  alignItems: 'center',
  flexWrap: 'nowrap',
  ...SECTION_HEADER_INSET_SX,
} as const;

const Row = () => <Stack spacing={2} sx={HEADER_SX} />;
`,
    // Edge case 3: the same value inline.
    `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'nowrap' }} />;
`,
    // Edge case 3: `spacing={0}` exists so the `sx` gap owns the rhythm.
    `
${STACK_IMPORT}

const Row = () => <Stack spacing={0} sx={{ flexWrap: 'wrap', gap: '6px' }} />;
`,
    // The same zero reached through a constant.
    `
${STACK_IMPORT}

const NO_SPACING = 0 as const;

const Row = () => <Stack spacing={NO_SPACING} sx={{ flexWrap: 'wrap' }} />;
`,
    // Edge case 3: props assembled as a plain object rather than as JSX.
    `
${STACK_IMPORT}

const WRAPPER_PROPS: StackProps = {
  direction: 'row',
  spacing: 0,
  sx: { alignItems: 'baseline', gap: '6px' },
};
`,
    // Edge case 5: the copy-paste defect. The binding named Stack is Typography.
    `
import Stack from '@mui/material/Typography';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
    // Edge case 5: a local component shadowing the name.
    `
const Stack = (props) => <div {...props} />;

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
    // Edge case 5: another library's Stack.
    `
import { Stack } from '@chakra-ui/react';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
    // Edge case 5: a name that merely ends in Stack.
    `
import { AuthenticationStack } from './AuthenticationStack';

const Row = () => (
  <AuthenticationStack spacing={2} sx={{ flexWrap: 'wrap' }} />
);
`,
    // An unresolvable element name proves nothing about the component.
    `
const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
    // A namespace import is reached as a member expression, which is out of
    // scope.
    `
import * as Mui from '@mui/material';

const Row = () => <Mui.Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
    // Edge case 8: no breakpoint wraps.
    `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: { xs: 'nowrap', md: 'nowrap' } }} />
);
`,
    // Edge case 7: a call-expression `sx` is opaque and is skipped silently.
    `
${STACK_IMPORT}

const Row = ({ sx, surfaceSx }) => (
  <Stack spacing={2} sx={sxWithBase(surfaceSx, sx)} />
);
`,
    // Edge case 6: the attribute wins where the two spellings disagree.
    //
    // The inline-`sx` twin of this case is WITHHELD rather than written (#2296). Its
    // shape is `<Stack flexWrap="nowrap" sx={{ flexWrap: 'wrap' }} />`, and
    // `prefer-sx-prop-over-system-props` autofixes any system prop into the
    // `sx` object without checking whether that object already declares the
    // same key, emitting `sx={{ flexWrap: 'nowrap', flexWrap: 'wrap' }}` —
    // TS1117, a duplicate property in an object literal. The defect is that
    // rule's and reproduces with no Stack in sight
    // (`<Box display="flex" sx={{ display: 'block' }} />`), so pinning a
    // fixture on it here would sign off a sibling's bug in this rule's suite.
    // The hoisted spelling below covers the same precedence path and takes the
    // sibling's spread branch, which is well formed.
    `
${STACK_IMPORT}

const WRAPPING_SX = { flexWrap: 'wrap' } as const;

const Row = () => (
  <Stack flexWrap="nowrap" spacing={2} sx={WRAPPING_SX} />
);
`,
    // Edge case 9: `divider` without any wrap.
    `
${STACK_IMPORT}

const Row = () => (
  <Stack direction="row" divider={ROW_DIVIDER} spacing={SPACING.space1} />
);
`,
    // A function `sx` that does not wrap.
    `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={(theme) => ({ flexWrap: 'nowrap', color: theme.palette.text.primary })} />
);
`,
    // Edge case 7: a conditional `sx` neither of whose branches wraps.
    `
${STACK_IMPORT}

const ICON_ROW_SUPPRESSED_SX = { flexWrap: 'nowrap' } as const;
const ICON_ROW_SX = { flexWrap: 'nowrap' } as const;

const Row = ({ isSearchExpanded }) => (
  <Stack
    spacing={2}
    sx={isSearchExpanded ? ICON_ROW_SUPPRESSED_SX : ICON_ROW_SX}
  />
);
`,
    // An empty `stackComponents` governs nothing.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
      options: [{ stackComponents: [] }],
    },
    // Narrowing `importSources` to the deep path leaves the barrel ungoverned.
    {
      code: `
import { Stack } from '@mui/material';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
      options: [{ importSources: ['@mui/material/Stack'] }],
    },
  ],
  invalid: [
    // The base violation, inline.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
    <div />
  </Stack>
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
    <div />
  </Stack>
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Its hoisted `as const` twin.
    {
      code: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap' } as const;

const Row = () => <Stack direction="row" spacing={2} sx={ROW_SX} />;
`,
      output: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap' } as const;

const Row = () => <Stack direction="row" spacing={2} sx={ROW_SX} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Its hoisted, plainly annotated twin.
    {
      code: `
${STACK_IMPORT}

const DEFAULT_SX: SxProps = { display: 'flex', flexWrap: 'wrap', gap: 2 };

const Row = () => <Stack spacing={2} sx={DEFAULT_SX} />;
`,
      output: `
${STACK_IMPORT}

const DEFAULT_SX: SxProps = { display: 'flex', flexWrap: 'wrap', gap: 2 };

const Row = () => <Stack spacing={2} sx={DEFAULT_SX} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Its `satisfies`-wrapped twin.
    {
      code: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap' } satisfies Record<string, unknown>;

const Row = () => <Stack spacing={2} sx={ROW_SX} />;
`,
      output: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: 'wrap' } satisfies Record<string, unknown>;

const Row = () => <Stack spacing={2} sx={ROW_SX} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 2 / BracketLegend: `rowGap` reads as a fix and is not one, so
    // it must not exempt. The constant is hoisted above the component that
    // renders it, which is the shape both live violations take.
    {
      code: `
${STACK_IMPORT}

const LEGEND_SX = {
  alignItems: 'center',
  color: 'text.secondary',
  flexWrap: 'wrap',
  paddingBottom: SPACING.space2,
  rowGap: SPACING.space1,
  width: '100%',
} as const;

export const BracketLegend = () => {
  const items = useLegendItems();
  return (
    <Stack direction="row" spacing={SPACING.space2} sx={LEGEND_SX}>
      {items}
    </Stack>
  );
};
`,
      output: `
${STACK_IMPORT}

const LEGEND_SX = {
  alignItems: 'center',
  color: 'text.secondary',
  flexWrap: 'wrap',
  paddingBottom: SPACING.space2,
  rowGap: SPACING.space1,
  width: '100%',
} as const;

export const BracketLegend = () => {
  const items = useLegendItems();
  return (
    <Stack direction="row" spacing={SPACING.space2} sx={LEGEND_SX} useFlexGap>
      {items}
    </Stack>
  );
};
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // The same `rowGap` shape written inline.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // BluBotCadenceControl: the unmitigated live violation, comments included.
    {
      code: `
${STACK_IMPORT}

const ROW_SX = {
  alignItems: 'center',
  flexWrap: 'wrap',
  /** Aligns with the row's title/description column. */
  pl: SETTINGS_ROW_TEXT_COLUMN_INSET,
  pb: SPACING.space2,
} as const;

const Row = () => (
  <Stack direction="row" spacing={SPACING.space3} sx={ROW_SX}>
    <div />
  </Stack>
);
`,
      output: `
${STACK_IMPORT}

const ROW_SX = {
  alignItems: 'center',
  flexWrap: 'wrap',
  /** Aligns with the row's title/description column. */
  pl: SETTINGS_ROW_TEXT_COLUMN_INSET,
  pb: SPACING.space2,
} as const;

const Row = () => (
  <Stack direction="row" spacing={SPACING.space3} sx={ROW_SX} useFlexGap>
    <div />
  </Stack>
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // GroupHeader: an `sx` `gap` beside a live `spacing` is two spacing systems
    // at two unrelated values, so `gap` must not exempt either.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    alignItems={'center'}
    direction="row"
    spacing={4}
    sx={{
      flexWrap: 'wrap',
      gap: 1,
    }}
  >
    <div />
  </Stack>
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    alignItems={'center'}
    direction="row"
    spacing={4}
    sx={{
      flexWrap: 'wrap',
      gap: 1,
    }}
    useFlexGap
  >
    <div />
  </Stack>
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 6: `flexWrap` as a shorthand prop.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack direction="row" flexWrap="wrap" spacing={2} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 8: any breakpoint that wraps makes the seam real.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Its hoisted twin.
    {
      code: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: { xs: 'wrap', md: 'nowrap' } } as const;

const Row = () => <Stack spacing={2} sx={ROW_SX} />;
`,
      output: `
${STACK_IMPORT}

const ROW_SX = { flexWrap: { xs: 'wrap', md: 'nowrap' } } as const;

const Row = () => <Stack spacing={2} sx={ROW_SX} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 8: a hoisted responsive `spacing` is still a `spacing`.
    {
      code: `
${STACK_IMPORT}

const STACK_SPACING = { xs: 1, sm: 2 } as const;

const Row = () => (
  <Stack flexWrap="wrap" spacing={STACK_SPACING} />
);
`,
      output: `
${STACK_IMPORT}

const STACK_SPACING = { xs: 1, sm: 2 } as const;

const Row = () => (
  <Stack flexWrap="wrap" spacing={STACK_SPACING} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 9: a wrapping column Stack has the symmetric defect.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack direction="column" spacing={2} sx={{ flexWrap: 'wrap' }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack direction="column" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 9: `divider` is not special-cased.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack divider={ROW_DIVIDER} spacing={1} sx={{ flexWrap: 'wrap' }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack divider={ROW_DIVIDER} spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // `wrap-reverse` wraps too.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap-reverse' }} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap-reverse' }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 7: a locally written property is read through a trailing
    // spread of a caller-supplied value.
    {
      code: `
${STACK_IMPORT}

const Row = ({ sx }) => (
  <Stack spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', ...sx }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = ({ sx }) => (
  <Stack spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', ...sx }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 7: a spread of a local constant is read through.
    {
      code: `
${STACK_IMPORT}

const ICON_ROW_SX = { flexWrap: 'wrap', alignItems: 'center' } as const;

const Row = () => <Stack spacing={2} sx={{ ...ICON_ROW_SX, pt: 1 }} />;
`,
      output: `
${STACK_IMPORT}

const ICON_ROW_SX = { flexWrap: 'wrap', alignItems: 'center' } as const;

const Row = () => <Stack spacing={2} sx={{ ...ICON_ROW_SX, pt: 1 }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 7: a conditional `sx` whose branches are hoisted constants,
    // one of which wraps.
    {
      code: `
${STACK_IMPORT}

const ICON_ROW_SUPPRESSED_SX = { flexWrap: 'nowrap' } as const;
const ICON_ROW_SX = { flexWrap: 'wrap' } as const;

const Row = ({ isSearchExpanded }) => (
  <Stack
    spacing={2}
    sx={isSearchExpanded ? ICON_ROW_SUPPRESSED_SX : ICON_ROW_SX}
  />
);
`,
      output: `
${STACK_IMPORT}

const ICON_ROW_SUPPRESSED_SX = { flexWrap: 'nowrap' } as const;
const ICON_ROW_SX = { flexWrap: 'wrap' } as const;

const Row = ({ isSearchExpanded }) => (
  <Stack
    spacing={2}
    sx={isSearchExpanded ? ICON_ROW_SUPPRESSED_SX : ICON_ROW_SX}
    useFlexGap
  />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Edge case 5: the barrel import is the second legitimate form.
    {
      code: `
import { Stack, Typography, ButtonBase } from '@mui/material';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
      output: `
import { Stack, Typography, ButtonBase } from '@mui/material';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A function `sx` with an expression body.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={(theme) => ({ flexWrap: 'wrap', color: theme.palette.text.primary })} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={(theme) => ({ flexWrap: 'wrap', color: theme.palette.text.primary })} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A function `sx` with a block body.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    spacing={2}
    sx={() => {
      return { flexWrap: 'wrap' };
    }}
  />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    spacing={2}
    sx={() => {
      return { flexWrap: 'wrap' };
    }}
    useFlexGap
  />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // MUI merges an array of `sx` entries left to right.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={[{ flexWrap: 'wrap' }, { pt: 1 }]} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={[{ flexWrap: 'wrap' }, { pt: 1 }]} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A quoted `spacing` is still a spacing.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing="2" sx={{ flexWrap: 'wrap' }} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack spacing="2" sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A computed string key names the same property.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ ['flexWrap']: 'wrap' }} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack spacing={2} sx={{ ['flexWrap']: 'wrap' }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A bare `spacing` attribute is not zero.
    {
      code: `
${STACK_IMPORT}

const Row = () => <Stack spacing sx={{ flexWrap: 'wrap' }} />;
`,
      output: `
${STACK_IMPORT}

const Row = () => <Stack spacing sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // The insert lands in alphabetical position rather than at the end, so a
    // JSX-attribute-sorting rule does not report on top of the fix.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} width={1} />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap width={1} />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A spread that precedes the named run: the insert joins the run, so the
    // explicit prop still wins over anything the spread supplies.
    {
      code: `
${STACK_IMPORT}

const Row = ({ rest }) => (
  <Stack {...rest} spacing={2} sx={{ flexWrap: 'wrap' }} />
);
`,
      output: `
${STACK_IMPORT}

const Row = ({ rest }) => (
  <Stack {...rest} spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A trailing spread leaves no named run, so the insert goes after it for
    // the same reason.
    {
      code: `
${STACK_IMPORT}

const Row = ({ rest }) => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} {...rest} />
);
`,
      output: `
${STACK_IMPORT}

const Row = ({ rest }) => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} {...rest} useFlexGap />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // A comment between attributes survives the insert intact.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    // The row wraps on narrow viewports.
    spacing={2}
    sx={{ flexWrap: 'wrap' }}
  />
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack
    // The row wraps on narrow viewports.
    spacing={2}
    sx={{ flexWrap: 'wrap' }}
    useFlexGap
  />
);
`,
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // Nested violations are reported and fixed independently.
    {
      code: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }}>
    <Stack direction="column" spacing={1} sx={{ flexWrap: 'wrap' }} />
  </Stack>
);
`,
      output: `
${STACK_IMPORT}

const Row = () => (
  <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
    <Stack direction="column" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap />
  </Stack>
);
`,
      errors: [
        { messageId: 'useFlexGapRequired' },
        { messageId: 'useFlexGapRequired' },
      ],
    },
    // `stackComponents` extends the governed set.
    {
      code: `
import { FlexRow } from '@mui/material';

const Row = () => <FlexRow spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
      output: `
import { FlexRow } from '@mui/material';

const Row = () => <FlexRow spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
      options: [{ stackComponents: ['Stack', 'FlexRow'] }],
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
    // `importSources` extends the governed sources, for a barrel that
    // re-exports MUI's Stack.
    {
      code: `
import { Stack } from 'src/components/ui';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} />;
`,
      output: `
import { Stack } from 'src/components/ui';

const Row = () => <Stack spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap />;
`,
      options: [
        {
          importSources: [
            '@mui/material/Stack',
            '@mui/material',
            'src/components/ui',
          ],
        },
      ],
      errors: [{ messageId: 'useFlexGapRequired' }],
    },
  ],
});
