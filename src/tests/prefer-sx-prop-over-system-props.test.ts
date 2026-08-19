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

      // --- Issue #1966: `maxWidth` on Container is a breakpoint KEY selecting a
      // width from theme.breakpoints.values, not a CSS length. Moving it to sx
      // emits `max-width: xl`, which is dropped as invalid and silently unbounds
      // the container. ---
      `
import Container from '@mui/material/Container';
import type { ContainerProps } from '@mui/material/Container';

type Props = { maxWidth?: ContainerProps['maxWidth'] };

export const Wrapper = ({ maxWidth }: Props) => (
  <Container component="main" maxWidth={maxWidth}>
    content
  </Container>
);
`,
      `<Container maxWidth="xl">x</Container>`,
      `<Container maxWidth={false}>x</Container>`,

      // The owned prop coexists with an sx the rule has nothing to merge into.
      `<Container maxWidth="md" sx={{ py: 4 }} />`,
      // `Dialog` reads the same breakpoint key for its Paper.
      `<Dialog open maxWidth="sm" fullWidth />`,
      // `AppBar` picks a background shade from its `color` enum.
      `<AppBar color="primary" />`,

      // The exemption is a property of the component itself, so restricting the
      // `components` option does not re-arm it.
      {
        code: `<Container maxWidth="lg" />`,
        options: [{ components: ['Container'] }],
      },

      // A namespaced element name has no component name to match against.
      `<svg:rect mt={2} />`,

      // The wrapped output of the fixture below is itself clean, so a second
      // pass over an already-fixed file reports nothing.
      `
export const C = () => {
  return (
    <Stack
      sx={{
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        bgcolor: 'red',
      }}
      padding={4}
    />
  );
};
`,
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
        // The merged element no longer fits on one line, so it takes the shape
        // a formatter would give it: one attribute per line, and — since the
        // sx attribute alone still overflows — one property per line.
        output: `<Stack
  direction="row"
  spacing={2}
  sx={{
    width: '100%',
    height: '42px',
    '.MuiOutlinedInput-root': { height: '42px' },
  }}
/>`,
      },

      // --- Issue example 4: multiple system props on Stack, direction stays ---
      {
        code: `<Stack direction="row" flexWrap="wrap" gap={4} alignItems="flex-start" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'flexWrap' } },
          { messageId: 'preferSxProp', data: { prop: 'gap' } },
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
        ],
        // 85 columns on one line, so the attributes break apart; the sx object
        // itself fits at the attribute indentation and stays inline.
        output: `<Stack
  direction="row"
  sx={{ flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' }}
/>`,
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
        output: `<Box
  sx={{
    pt: 2,
    display: 'flex',
    backgroundColor: 'primary.main',
    '&:hover': { opacity: 0.8 },
  }}
/>`,
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
        // 83 columns on one line: only the attributes break, the object stays
        // inline because it fits once it has a line of its own.
        output: `<Box
  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
/>`,
      },

      // --- The same statement with its trailing semicolon (the spelling
      // Prettier always writes): the semicolon sits outside the opening
      // element's range, so the element still breaks apart and the `;` lands
      // after the closing `/>`. ---
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
          { messageId: 'preferSxProp', data: { prop: 'whiteSpace' } },
        ],
        output: `<Box
  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
/>;`,
      },

      // --- A trailing semicolon on a merge that fits stays on one line: the
      // punctuation tail must not force the element apart. ---
      {
        code: `<Box mt={2} mb={1} />;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'mt' } },
          { messageId: 'preferSxProp', data: { prop: 'mb' } },
        ],
        output: `<Box sx={{ mt: 2, mb: 1 }} />;`,
      },

      // --- An array element: the trailing comma sits outside the opening
      // element's range, so the element breaks apart and the `,` follows the
      // closing `/>`. ---
      {
        code: `
const items = [
  <Box display="flex" alignItems="center" justifyContent="center" key="a" />,
];
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'display' } },
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
        ],
        output: `
const items = [
  <Box
    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    key="a"
  />,
];
`,
      },

      // --- An array element whose merge fits stays on one line. ---
      {
        code: `const items = [<Box mt={2} mb={1} key="a" />];`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'mt' } },
          { messageId: 'preferSxProp', data: { prop: 'mb' } },
        ],
        output: `const items = [<Box sx={{ mt: 2, mb: 1 }} key="a" />];`,
      },

      // --- An element that does not start its own line (`const el = <Box`):
      // the only prettier-stable rewrite parenthesizes the whole element,
      // which is outside the opening element's range, so the report carries no
      // fix rather than emit a 95-column line. ---
      {
        code: `const el = <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
          { messageId: 'preferSxProp', data: { prop: 'whiteSpace' } },
        ],
        output: null,
      },

      // --- Same shape when the merge fits: the fix still applies. ---
      {
        code: `const el = <Box mt={2} mb={1} />;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'mt' } },
          { messageId: 'preferSxProp', data: { prop: 'mb' } },
        ],
        output: `const el = <Box sx={{ mt: 2, mb: 1 }} />;`,
      },

      // --- `return <Box ... />;` behaves like `const el =`: no safe wrap
      // exists inside the opening element's range, so the over-wide merge is
      // reported without a fix. ---
      {
        code: `
export function Panel() {
  return <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />;
}
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
          { messageId: 'preferSxProp', data: { prop: 'whiteSpace' } },
        ],
        output: null,
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

      // --- Issue #1966: the exemption is keyed on the (component, prop) pair,
      // so `maxWidth` stays a CSS system prop everywhere Container does not own
      // it. Exempting the bare prop name would blind the rule on these. ---
      {
        code: `<Box maxWidth="640px" />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'maxWidth' } }],
        output: `<Box sx={{ maxWidth: '640px' }} />`,
      },
      {
        code: `<Stack maxWidth={400} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'maxWidth' } }],
        output: `<Stack sx={{ maxWidth: 400 }} />`,
      },
      {
        code: `<Paper maxWidth="100%" sx={{ p: 2 }} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'maxWidth' } }],
        output: `<Paper sx={{ maxWidth: '100%', p: 2 }} />`,
      },
      // A breakpoint key on a component that does NOT own `maxWidth` is still a
      // system prop: the value is wrong there, but that is the author's bug and
      // moving it into sx does not change what the browser sees.
      {
        code: `<Box maxWidth="xl" />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'maxWidth' } }],
        output: `<Box sx={{ maxWidth: 'xl' }} />`,
      },

      // --- Container owns `maxWidth` only; every other system prop on it is
      // still reported and still moves into sx. ---
      {
        code: `<Container mt={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Container sx={{ mt: 2 }} />`,
      },
      {
        code: `<Container maxWidth="xl" mt={2} minWidth="320px" />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'mt' } },
          { messageId: 'preferSxProp', data: { prop: 'minWidth' } },
        ],
        output: `<Container maxWidth="xl" sx={{ mt: 2, minWidth: '320px' }} />`,
      },
      // The exempt prop is left alone even when it sits ahead of the sx the
      // other props merge into.
      {
        code: `<Container maxWidth={false} p={3} sx={{ borderRadius: 2 }} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'p' } }],
        output: `<Container maxWidth={false} sx={{ p: 3, borderRadius: 2 }} />`,
      },

      // The fix rewrites the whole element when the attributes no longer fit on
      // one line; the owned prop has to come through that rewrite verbatim.
      {
        code: `
export const C = () => (
  <Container maxWidth="lg" alignItems="center" justifyContent="center" bgcolor="red" />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const C = () => (
  <Container
    maxWidth="lg"
    sx={{ alignItems: 'center', justifyContent: 'center', bgcolor: 'red' }}
  />
);
`,
      },

      // --- Dialog owns `maxWidth` (the same breakpoint key) but nothing else. ---
      {
        code: `<Dialog open maxWidth="sm" mb={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mb' } }],
        output: `<Dialog open maxWidth="sm" sx={{ mb: 2 }} />`,
      },

      // --- AppBar owns `color` (it picks a background shade); the CSS system
      // props sitting beside it still move. ---
      {
        code: `<AppBar color="transparent" px={2} boxShadow={0} />`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'px' } },
          { messageId: 'preferSxProp', data: { prop: 'boxShadow' } },
        ],
        output: `<AppBar color="transparent" sx={{ px: 2, boxShadow: 0 }} />`,
      },

      // --- Issue #1565 shape 1: a new sx object that would overflow the print
      // width is emitted one property per line. ---
      {
        code: `
import { Stack } from '@mui/material';

export const C = () => {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      width="100%"
      bgcolor="red"
      padding={4}
    />
  );
};
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'width' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
import { Stack } from '@mui/material';

export const C = () => {
  return (
    <Stack
      sx={{
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        bgcolor: 'red',
      }}
      padding={4}
    />
  );
};
`,
      },

      // --- Boolean shorthand: the prop's value is `true`. ---
      {
        code: `<Box border />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'border' } }],
        output: `<Box sx={{ border: true }} />`,
      },

      // --- Namespaced component (Mui.Box) resolves to its property name. ---
      {
        code: `<Mui.Box mt={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Mui.Box sx={{ mt: 2 }} />`,
      },

      // --- `sx` with no value has nothing to merge into, so the prop is
      // reported but not moved. ---
      {
        code: `<Box sx mt={2} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: null,
      },

      // --- Empty array-form sx. ---
      {
        code: `<Box mt={2} sx={[]} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: `<Box sx={[{ mt: 2 }]} />`,
      },

      // --- A hole in the array has no node to anchor the merge on, so the fix
      // stands down rather than reading a missing element. ---
      {
        code: `<Box mt={2} sx={[, baseStyles]} />`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'mt' } }],
        output: null,
      },

      // --- Issue #1565: the same overflow three levels deeper. The emitted
      // object is indented relative to the attribute, not to a fixed column. ---
      {
        code: `
import { Box, Stack } from '@mui/material';

export const ItemList = ({ items, handleClick }: Props) => {
  return (
    <Stack spacing={2}>
      {items.map((item) => (
        <Box
          key={item.id}
          alignItems="center"
          justifyContent="space-between"
          bgcolor="background.paper"
          onClick={handleClick}
        />
      ))}
    </Stack>
  );
};
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
import { Box, Stack } from '@mui/material';

export const ItemList = ({ items, handleClick }: Props) => {
  return (
    <Stack spacing={2}>
      {items.map((item) => (
        <Box
          key={item.id}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'background.paper',
          }}
          onClick={handleClick}
        />
      ))}
    </Stack>
  );
};
`,
      },

      // --- Issue #1565: merging into a single-line sx object that no longer
      // fits breaks the whole object open, existing properties included. ---
      {
        code: `
import { Stack } from '@mui/material';

export const Panel = ({ theme }: Props) => (
  <Stack
    direction="row"
    width="100%"
    maxWidth="640px"
    sx={{ borderRadius: 2, background: theme.palette.background.level1 }}
  >
    <Child />
  </Stack>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'width' } },
          { messageId: 'preferSxProp', data: { prop: 'maxWidth' } },
        ],
        output: `
import { Stack } from '@mui/material';

export const Panel = ({ theme }: Props) => (
  <Stack
    direction="row"
    sx={{
      width: '100%',
      maxWidth: '640px',
      borderRadius: 2,
      background: theme.palette.background.level1,
    }}
  >
    <Child />
  </Stack>
);
`,
      },

      // --- Issue #1565 shape 2: an sx object the author already expanded keeps
      // that shape; new entries never splice onto the first property's line. ---
      {
        code: `
export const C = () => {
  return (
    <Stack
      sx={{
        borderRadius: 2,
        p: 4,
      }}
      height="100%"
      width="100%"
    />
  );
};
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'height' } },
          { messageId: 'preferSxProp', data: { prop: 'width' } },
        ],
        output: `
export const C = () => {
  return (
    <Stack
      sx={{
        height: '100%',
        width: '100%',
        borderRadius: 2,
        p: 4,
      }}
    />
  );
};
`,
      },

      // --- A multi-line template literal carries its own line breaks as string
      // DATA, so the interior line keeps the column the author wrote it at even
      // though the property around it moves one level deeper. ---
      {
        code: `
import { Box } from '@mui/material';

export const Layout = () => (
  <Box
    alignItems="center"
    display="grid"
    gridTemplateAreas={\`'header header'
  'sidebar main'\`}
  >
    <Child />
  </Box>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
          { messageId: 'preferSxProp', data: { prop: 'gridTemplateAreas' } },
        ],
        output: `
import { Box } from '@mui/material';

export const Layout = () => (
  <Box
    sx={{
      alignItems: 'center',
      display: 'grid',
      gridTemplateAreas: \`'header header'
  'sidebar main'\`,
    }}
  >
    <Child />
  </Box>
);
`,
      },

      // --- A value that is itself an object moves down a level with the
      // property, so its interior lines shift by the same delta. ---
      {
        code: `
export const Responsive = () => (
  <Stack
    alignItems="center"
    justifyContent="center"
    display={{
      xs: 'none',
      md: 'flex',
    }}
  >
    <Child />
  </Stack>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
        ],
        output: `
export const Responsive = () => (
  <Stack
    sx={{
      alignItems: 'center',
      justifyContent: 'center',
      display: {
        xs: 'none',
        md: 'flex',
      },
    }}
  >
    <Child />
  </Stack>
);
`,
      },

      // --- Array-form sx that the author already broke open: the new object
      // becomes an element of its own rather than joining the first element. ---
      {
        code: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    height="100%"
    width="100%"
    sx={[
      baseStyles,
      isActive && activeStyles,
    ]}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'height' } },
          { messageId: 'preferSxProp', data: { prop: 'width' } },
        ],
        output: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    sx={[
      { height: '100%', width: '100%' },
      baseStyles,
      isActive && activeStyles,
    ]}
  />
);
`,
      },

      // --- Array-form sx on one line that no longer fits: the array breaks
      // apart, one element per line. ---
      {
        code: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    alignItems="center"
    justifyContent="space-between"
    sx={[baseStyles, isActive && activeStyles]}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
        ],
        output: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    sx={[
      { alignItems: 'center', justifyContent: 'space-between' },
      baseStyles,
      isActive && activeStyles,
    ]}
  />
);
`,
      },

      // --- Array-form sx where the merged object overflows on its own: the
      // array breaks apart AND the new object breaks open inside it. ---
      {
        code: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    alignItems="center"
    justifyContent="space-between"
    bgcolor="background.paper"
    sx={[baseStyles, isActive && activeStyles]}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    sx={[
      {
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: 'background.paper',
      },
      baseStyles,
      isActive && activeStyles,
    ]}
  />
);
`,
      },

      // --- An array element that itself spans lines cannot be reproduced at a
      // new depth, and the compact splice would land on a 93-column line, so
      // the report carries no fix rather than emit past the print width. ---
      {
        code: `
export const Overlay = ({ isActive }: Props) => (
  <Box
    alignItems="center"
    justifyContent="space-between"
    sx={[baseStyles, isActive && {
      opacity: 0.5,
    }]}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
        ],
        output: null,
      },

      // --- sx as a variable: the spread stays last inside the broken-open
      // object. ---
      {
        code: `
export const Label = ({ isActive, typographySx }: Props) => (
  <Typography
    color={isActive ? 'text.primary' : 'text.secondary'}
    textAlign="center"
    sx={typographySx}
    variant="bodyLarge"
  >
    {label}
  </Typography>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'color' } },
          { messageId: 'preferSxProp', data: { prop: 'textAlign' } },
        ],
        output: `
export const Label = ({ isActive, typographySx }: Props) => (
  <Typography
    sx={{
      color: isActive ? 'text.primary' : 'text.secondary',
      textAlign: 'center',
      ...typographySx,
    }}
    variant="bodyLarge"
  >
    {label}
  </Typography>
);
`,
      },

      // --- An empty sx object takes the same width treatment as a new one. ---
      {
        code: `
export const Panel = () => (
  <Stack
    alignItems="flex-start"
    justifyContent="space-between"
    bgcolor="background.paper"
    sx={{}}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const Panel = () => (
  <Stack
    sx={{
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      bgcolor: 'background.paper',
    }}
  />
);
`,
      },

      // --- A tab-indented file gets tab-indented output: the nesting step is
      // read from the file rather than assumed to be two spaces. ---
      {
        code: `
export const Panel = () => (
\t<Stack
\t\talignItems="center"
\t\tjustifyContent="space-between"
\t\tbgcolor="background.paper"
\t\tonClick={handleClick}
\t/>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const Panel = () => (
\t<Stack
\t\tsx={{
\t\t\talignItems: 'center',
\t\t\tjustifyContent: 'space-between',
\t\t\tbgcolor: 'background.paper',
\t\t}}
\t\tonClick={handleClick}
\t/>
);
`,
      },

      // --- A JSDoc-heavy file still emits the two-space step it is written in.
      // A block comment's ` * ` continuation lines sit one column in from the
      // comment's own indentation, and counting those as nesting steps would
      // make the whole file look one-space indented. ---
      {
        code: `
/**
 * Steps the wallet wizard walks a user through.
 *
 * @remarks
 *   Ordered; the index doubles as the progress value.
 */
export const WIZARD_STEPS = ['connect', 'verify', 'fund'] as const;

/**
 * Copy shown beneath the wizard header.
 *
 * @example
 *   HEADER_COPY.connect === 'Connect a wallet'
 */
export const HEADER_COPY = { connect: 'Connect a wallet' };

/**
 * Whether the wizard may advance past its current step.
 *
 * @param step - the step the user is on
 */
export const canAdvance = (step: string) => step !== 'fund';

/**
 * The wizard shell.
 *
 * @remarks
 *   Layout only; each step renders its own content.
 */
export const WalletWizard = () => (
  <Stack
    alignItems="center"
    justifyContent="space-between"
    bgcolor="background.paper"
    onClick={handleClick}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
/**
 * Steps the wallet wizard walks a user through.
 *
 * @remarks
 *   Ordered; the index doubles as the progress value.
 */
export const WIZARD_STEPS = ['connect', 'verify', 'fund'] as const;

/**
 * Copy shown beneath the wizard header.
 *
 * @example
 *   HEADER_COPY.connect === 'Connect a wallet'
 */
export const HEADER_COPY = { connect: 'Connect a wallet' };

/**
 * Whether the wizard may advance past its current step.
 *
 * @param step - the step the user is on
 */
export const canAdvance = (step: string) => step !== 'fund';

/**
 * The wizard shell.
 *
 * @remarks
 *   Layout only; each step renders its own content.
 */
export const WalletWizard = () => (
  <Stack
    sx={{
      alignItems: 'center',
      justifyContent: 'space-between',
      bgcolor: 'background.paper',
    }}
    onClick={handleClick}
  />
);
`,
      },

      // --- A genuinely four-space file gets four-space output, so skipping
      // comment lines cannot degrade into a hard-coded two. ---
      {
        code: `
export const Panel = () => (
    <Stack
        alignItems="center"
        justifyContent="space-between"
        bgcolor="background.paper"
        onClick={handleClick}
    />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const Panel = () => (
    <Stack
        sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'background.paper',
        }}
        onClick={handleClick}
    />
);
`,
      },

      // --- Tabs survive JSDoc too: the space-aligned comment lines outnumber
      // the tab steps here, so a census that counted them would emit spaces
      // into a tab-indented file. ---
      {
        code: `
/**
 * The panel shell.
 *
 * @remarks
 *   Layout only.
 */
export const PANEL_ID = 'panel';

/**
 * Whether the panel is dismissible.
 */
export const IS_DISMISSIBLE = true;

/**
 * Renders the panel.
 *
 * @param props - the panel props
 */
export const Panel = () => (
\t<Stack
\t\talignItems="center"
\t\tjustifyContent="space-between"
\t\tbgcolor="background.paper"
\t\tonClick={handleClick}
\t/>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
/**
 * The panel shell.
 *
 * @remarks
 *   Layout only.
 */
export const PANEL_ID = 'panel';

/**
 * Whether the panel is dismissible.
 */
export const IS_DISMISSIBLE = true;

/**
 * Renders the panel.
 *
 * @param props - the panel props
 */
export const Panel = () => (
\t<Stack
\t\tsx={{
\t\t\talignItems: 'center',
\t\t\tjustifyContent: 'space-between',
\t\t\tbgcolor: 'background.paper',
\t\t}}
\t\tonClick={handleClick}
\t/>
);
`,
      },

      // --- Tabs against spaces give no delta that can be applied to the moved
      // value's interior lines, so the fix falls back to the compact splice
      // rather than guessing. A wrong guess would corrupt the layout. ---
      {
        code: `
export const Panel = () => (
  <Stack
    sx={{
      borderRadius: 2,
    }}
\t\tdisplay={{
\t\t\txs: 'none',
\t\t}}
  />
);
`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'display' } }],
        output: `
export const Panel = () => (
  <Stack
    sx={{
      display: {
\t\t\txs: 'none',
\t\t}, borderRadius: 2,
    }}
  />
);
`,
      },

      // --- A comment between attributes is not reachable from the attribute
      // list, so the element cannot be rebuilt without dropping it, and the
      // element head shares the merged attribute's line so the in-place wrap
      // does not apply either. The merged line would run past the print width,
      // so the report carries no fix. ---
      {
        code: `
export const Panel = () => (
  <Stack /* keep in sync with Sidebar */ alignItems="center" justifyContent="center" pb={6} />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'pb' } },
        ],
        output: null,
      },

      // --- The same comment at the front of the attribute's own line: only
      // the attribute's range is replaced, so the comment survives in place
      // and the literal breaks open. The width test charges for the columns
      // the comment already consumed, not just the indentation. ---
      {
        code: `
export const Panel = () => (
  <Stack
    /* keep in sync with Sidebar */ alignItems="center"
    justifyContent="center"
    pb={6}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'pb' } },
        ],
        output: `
export const Panel = () => (
  <Stack
    /* keep in sync with Sidebar */ sx={{
      alignItems: 'center',
      justifyContent: 'center',
      pb: 6,
    }}
  />
);
`,
      },

      // --- A leading comment whose line still fits inside the print width
      // keeps the compact form: the comment only matters when the merged line
      // overflows. ---
      {
        code: `
export const Panel = () => (
  <Stack
    /* keep in sync with Sidebar */ alignItems="center"
    pb={6}
  />
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'pb' } },
        ],
        output: `
export const Panel = () => (
  <Stack
    /* keep in sync with Sidebar */ sx={{ alignItems: 'center', pb: 6 }}
  />
);
`,
      },

      // --- Children sharing the opening element's line: breaking the element
      // apart is not the change a formatter would make here (it moves the
      // children instead, which sit outside the opening element's range), and
      // the merged line would land one column past the default print width, so
      // the report carries no fix. ---
      {
        code: `
export const Title = ({ theme }: Props) => (
  <Stack spacing={1}>
    <Typography color={theme.palette.primary.main}>Lock team</Typography>
  </Stack>
);
`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'color' } }],
        output: null,
      },

      // --- Children sharing the line, but the merged form fits: the compact
      // splice still applies. ---
      {
        code: `
export const Title = () => (
  <Stack spacing={1}>
    <Typography color={palette.main}>Lock team</Typography>
  </Stack>
);
`,
        errors: [{ messageId: 'preferSxProp', data: { prop: 'color' } }],
        output: `
export const Title = () => (
  <Stack spacing={1}>
    <Typography sx={{ color: palette.main }}>Lock team</Typography>
  </Stack>
);
`,
      },

      // --- printWidth: a narrower width breaks open an object that the default
      // leaves alone. ---
      {
        code: `
export const Panel = ({ onSelect }: Props) => (
  <Stack
    alignItems="center"
    justifyContent="center"
    onClick={onSelect}
    spacing={2}
  >
    <Child />
  </Stack>
);
`,
        options: [{ printWidth: 40 }],
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
        ],
        output: `
export const Panel = ({ onSelect }: Props) => (
  <Stack
    sx={{
      alignItems: 'center',
      justifyContent: 'center',
    }}
    onClick={onSelect}
    spacing={2}
  >
    <Child />
  </Stack>
);
`,
      },

      // --- The same source at the default width stays on one line. ---
      {
        code: `
export const Panel = ({ onSelect }: Props) => (
  <Stack
    alignItems="center"
    justifyContent="center"
    onClick={onSelect}
    spacing={2}
  >
    <Child />
  </Stack>
);
`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
        ],
        output: `
export const Panel = ({ onSelect }: Props) => (
  <Stack
    sx={{ alignItems: 'center', justifyContent: 'center' }}
    onClick={onSelect}
    spacing={2}
  >
    <Child />
  </Stack>
);
`,
      },

      // --- printWidth: a wider width keeps shape 1 on one line, proving the
      // option drives the decision rather than a hard-coded 80. ---
      {
        code: `
export const Panel = () => (
  <Stack
    alignItems="center"
    justifyContent="center"
    width="100%"
    bgcolor="red"
    padding={4}
  />
);
`,
        options: [{ printWidth: 200 }],
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
          { messageId: 'preferSxProp', data: { prop: 'justifyContent' } },
          { messageId: 'preferSxProp', data: { prop: 'width' } },
          { messageId: 'preferSxProp', data: { prop: 'bgcolor' } },
        ],
        output: `
export const Panel = () => (
  <Stack
    sx={{ alignItems: 'center', justifyContent: 'center', width: '100%', bgcolor: 'red' }}
    padding={4}
  />
);
`,
      },

      // --- #2058: Prettier breaks an element's children onto their own lines
      // whenever the opening element carries more than one attribute, whatever
      // the width. Merging every system prop into one `sx` drops the element to
      // exactly one attribute, so the children have to come back with it. ---
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis">
  hi
</Box>;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
        ],
        output: `<Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>hi</Box>;`,
      },

      // An attribute the merge does not consume keeps the element at two, so
      // the threshold is never crossed and the children stay where they are.
      // This is the collapse direction's other side: joining here would be the
      // mirror-image defect.
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis" id="x">
  hi
</Box>;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
        ],
        output: `<Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }} id="x">
  hi
</Box>;`,
      },

      // An element or fragment child forces Prettier's broken layout at any
      // attribute count (its `containsTag`), so the merge never moves it.
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis">
  <Inner />
</Box>;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
        ],
        output: `<Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
  <Inner />
</Box>;`,
      },

      // Past the print width the broken opening element is Prettier's own
      // answer, so the children stay broken with it.
      {
        code: `<Box overflow="hidden" textOverflow="ellipsis" display="flex" alignItems="center">
  some fairly long children text here indeed
</Box>;`,
        errors: [
          { messageId: 'preferSxProp', data: { prop: 'overflow' } },
          { messageId: 'preferSxProp', data: { prop: 'textOverflow' } },
          { messageId: 'preferSxProp', data: { prop: 'display' } },
          { messageId: 'preferSxProp', data: { prop: 'alignItems' } },
        ],
        output: `<Box
  sx={{
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'flex',
    alignItems: 'center',
  }}
>
  some fairly long children text here indeed
</Box>;`,
      },
    ],
  },
);
