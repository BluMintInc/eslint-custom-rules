import { ruleTesterJsx } from '../utils/ruleTester';
import { preferSxPropOverSystemProps } from '../rules/prefer-sx-prop-over-system-props';

ruleTesterJsx.run(
  'prefer-sx-prop-over-system-props',
  preferSxPropOverSystemProps,
  {
    valid: [
      // Already using sx — no system props remaining
      `<Box sx={{ mt: 2, display: 'flex' }} />`,

      // Stack with real component props only (spacing and direction are NOT system props)
      `<Stack spacing={2} direction="row" />`,

      // Stack with real props plus sx — no standalone system props
      `<Stack spacing={2} direction="row" sx={{ alignItems: 'center' }} />`,

      // Host (lowercase) element — rule never touches non-MUI elements
      `<div mt={2} display="flex" />`,

      // Component not in the default MUI list
      `<CustomWidget mt={2} display="flex" />`,

      // No system props at all — only real props
      `<Button variant="contained" onClick={() => {}} disabled />`,

      // sx as a variable reference, no system props alongside
      `<Box sx={styles} />`,

      // sx is an array, no system props alongside
      `<Box sx={[baseStyles, isActive && activeStyles]} />`,

      // Grid with breakpoint props (xs, sm, md) — those are Grid API props
      `<Grid container spacing={3} xs={12} sm={6} md={4} />`,

      // Stack divider is a real prop
      `<Stack divider={<Divider />} spacing={1} />`,

      // Component not in list — should not flag even with system props
      {
        code: `<MyCustomBox mt={2} />`,
        options: [{ components: ['Box', 'Stack'] }],
      },

      // Allowed prop overridden via options — extra user-supplied allowed prop
      {
        code: `<Box mt={2} />`,
        options: [{ components: ['Box'], allowedProps: ['mt'] }],
      },

      // Event handlers are never system props
      `<Stack onClick={() => {}} onMouseEnter={() => {}} />`,

      // aria-* and data-* are always allowed
      `<Box aria-label="test" data-testid="box" />`,

      // No attributes at all
      `<Box />`,

      // Typography with variant (real prop) and no system props
      `<Typography variant="h1" />`,

      // color on Stack is in MUI_SYSTEM_PROPS but if user provides explicit
      // allowedProps that include color, it should be allowed
      {
        code: `<Typography color="primary" />`,
        options: [{ components: ['Typography'], allowedProps: ['color'] }],
      },

      // `color` on components whose prop API defines it as a semantic enum
      // (palette/variant selector) — NOT a CSS system prop. Must not be moved.
      `<Button color="warning" variant="contained" sx={{ flexShrink: 0 }} />`,
      `<Button color="error" variant="text" />`, // no sx present — still valid
      `<IconButton color="primary" />`,
      `<Chip color="secondary" />`,
      `<Badge color="success" />`,

      // Semantic `color` alongside other first-class props (variant, onClick):
      // nothing to move into sx.
      `<Chip color="secondary" variant="outlined" onClick={() => {}} />`,
    ],

    invalid: [
      // --- Issue example 1: Stack with mixed real + system props ---
      // spacing and direction are kept; alignItems and pb move to sx
      {
        code: `<Stack spacing={2} alignItems="center" pb={6} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'pb' } },
        ],
        output: `<Stack spacing={2} sx={{ alignItems: 'center', pb: 6 }} />`,
      },

      // --- Issue example 2: Stack direction/spacing kept, alignItems/mb to sx ---
      {
        code: `<Stack direction="row" spacing={1} alignItems="center" mb={2} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'mb' } },
        ],
        output: `<Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }} />`,
      },

      // --- Issue example 3: merge into existing sx object with selector key ---
      {
        code: `<Stack direction="row" spacing={2} width="100%" height="42px" sx={{ '.MuiOutlinedInput-root': { height: '42px' } }} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'width' } },
          { messageId: 'preferSxProp', data: { prop: 'height' } },
        ],
        output: `<Stack direction="row" spacing={2} sx={{ width: '100%', height: '42px', '.MuiOutlinedInput-root': { height: '42px' } }} />`,
      },

      // --- Issue example 4: multiple system props on Stack, direction stays ---
      {
        code: `<Stack direction="row" flexWrap="wrap" gap={4} alignItems="flex-start" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'flexWrap' } },
          { messageId: 'preferSxProp', data: { prop: 'gap' } },
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
        ],
        output: `<Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' }} />`,
      },

      // --- Issue example 5: system props + existing sx variable (spread pattern) ---
      {
        code: `<Stack spacing={1} alignItems="flex-start" pt={1} sx={sx} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'pt' } },
        ],
        output: `<Stack spacing={1} sx={{ alignItems: 'flex-start', pt: 1, ...sx }} />`,
      },

      // --- Numeric value: mt={2} → mt: 2 ---
      {
        code: `<Box mt={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Box sx={{ mt: 2 }} />`,
      },

      // --- String value: display="flex" → display: 'flex' ---
      {
        code: `<Box display="flex" />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'display' } }],
        output: `<Box sx={{ display: 'flex' }} />`,
      },

      // --- Float value: pt={1.5} → pt: 1.5 ---
      {
        code: `<Stack flex="0 1 auto" pt={1.5} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'flex' } },
          { messageId: 'preferSxProp', data: { prop: 'pt' } },
        ],
        output: `<Stack sx={{ flex: '0 1 auto', pt: 1.5 }} />`,
      },

      // --- Expression value: m={x} → m: x ---
      {
        code: `<Box m={x} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'm' } }],
        output: `<Box sx={{ m: x }} />`,
      },

      // --- Conditional expression: pt={isExpanded ? 4 : 2} preserved ---
      {
        code: `<Box pt={isExpanded ? 4 : 2} display={isVisible ? 'block' : 'none'} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'pt' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
        ],
        output: `<Box sx={{ pt: isExpanded ? 4 : 2, display: isVisible ? 'block' : 'none' }} />`,
      },

      // --- width="100%" string: width → '100%' ---
      {
        code: `<Box width="100%" height="42px" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'width' } },
          { messageId: 'preferSxProp', data: { prop: 'height' } },
        ],
        output: `<Box sx={{ width: '100%', height: '42px' }} />`,
      },

      // --- Merge into existing sx={{}} empty object ---
      {
        code: `<Box mt={2} sx={{}} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Box sx={{ mt: 2 }} />`,
      },

      // --- Merge into existing sx object with existing keys ---
      {
        code: `<Box pt={2} display="flex" sx={{ backgroundColor: 'primary.main', '&:hover': { opacity: 0.8 } }} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'pt' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
        ],
        output: `<Box sx={{ pt: 2, display: 'flex', backgroundColor: 'primary.main', '&:hover': { opacity: 0.8 } }} />`,
      },

      // --- sx is array expression — prepend object ---
      {
        code: `<Box pt={2} sx={[baseStyles, isActive && activeStyles]} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'pt' } }],
        output: `<Box sx={[{ pt: 2 }, baseStyles, isActive && activeStyles]} />`,
      },

      // --- sx is a function call expression — use spread ---
      {
        code: `<Box mt={2} sx={getStyles()} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Box sx={{ mt: 2, ...getStyles() }} />`,
      },

      // --- Responsive array value: pt={[2, 4, 6]} → pt: [2, 4, 6] ---
      {
        code: `<Box pt={[2, 4, 6]} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'pt' } }],
        output: `<Box sx={{ pt: [2, 4, 6] }} />`,
      },

      // --- Responsive object value: pt={{ xs: 2, sm: 4 }} → pt: { xs: 2, sm: 4 } ---
      {
        code: `<Box pt={{ xs: 2, sm: 4, md: 6 }} display="flex" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'pt' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
        ],
        output: `<Box sx={{ pt: { xs: 2, sm: 4, md: 6 }, display: 'flex' }} />`,
      },

      // --- bgcolor system prop ---
      {
        code: `<Box bgcolor="primary.main" />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'bgcolor' } }],
        output: `<Box sx={{ bgcolor: 'primary.main' }} />`,
      },

      // --- zIndex system prop ---
      {
        code: `<Box position="absolute" top={0} left={0} zIndex={10} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'position' } },
          { messageId: 'preferSxProp', data: { prop: 'top' } },
          { messageId: 'preferSxProp', data: { prop: 'left' } },
          { messageId: 'preferSxProp', data: { prop: 'zIndex' } },
        ],
        output: `<Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }} />`,
      },

      // --- Multiple MUI components in the same file ---
      {
        code: `
function A() { return <Stack alignItems="center" pb={6} />; }
function B() { return <Box mt={2} display="flex" />; }
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'pb' } },
          { messageId: 'preferSxProp', data: { prop: 'mt' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
        ],
        output: `
function A() { return <Stack sx={{ alignItems: 'center', pb: 6 }} />; }
function B() { return <Box sx={{ mt: 2, display: 'flex' }} />; }
`,
      },

      // --- Typography with system props ---
      {
        code: `<Typography fontSize={14} fontWeight="bold" lineHeight={1.5} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'fontSize' } },
          { messageId: 'preferSxProp', data: { prop: 'fontWeight' } },
          { messageId: 'preferSxProp', data: { prop: 'lineHeight' } },
        ],
        output: `<Typography sx={{ fontSize: 14, fontWeight: 'bold', lineHeight: 1.5 }} />`,
      },

      // --- borderRadius system prop ---
      {
        code: `<Paper borderRadius={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'borderRadius' } }],
        output: `<Paper sx={{ borderRadius: 2 }} />`,
      },

      // --- Idempotence check: output after first fix should not be flagged ---
      // (Verifying that the output `<Box sx={{ mt: 2 }} />` passes the valid test)
      // covered by valid tests above; this ensures a second pass doesn't re-report.
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
          { messageId: 'preferSxProp', data: { prop: 'whiteSpace' } },
        ],
        output: `<Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />`,
      },

      // --- Custom component list via options ---
      {
        code: `<CustomBox mt={2} />`,
        options: [{ components: ['CustomBox'] }],
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<CustomBox sx={{ mt: 2 }} />`,
      },

      // --- color system prop (when not in allowedProps for this component) ---
      {
        code: `<Box color="#ff0000" />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'color' } }],
        output: `<Box sx={{ color: '#ff0000' }} />`,
      },

      // --- Regression guard: `color` on a true system/layout component IS a
      // CSS passthrough and must still be flagged + merged into sx. The fix
      // must NOT drop `color` from MUI_SYSTEM_PROPS globally. ---
      {
        code: `<Box color="#ff0000" sx={{ p: 2 }} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'color' } }],
        output: `<Box sx={{ color: '#ff0000', p: 2 }} />`,
      },

      // --- Semantic `color` is exempt on Button, but a genuine system prop on
      // the SAME element (mt) still moves into sx; `color` is left untouched. ---
      {
        code: `<Button color="warning" mt={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Button color="warning" sx={{ mt: 2 }} />`,
      },
    ],
  },
);
