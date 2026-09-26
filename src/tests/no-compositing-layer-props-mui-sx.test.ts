import { ruleTesterTs } from '../utils/ruleTester';
import { noCompositingLayerProps } from '../rules/no-compositing-layer-props';

const jsx = {
  ecmaFeatures: {
    jsx: true,
  },
};

ruleTesterTs.run('no-compositing-layer-props-mui-sx', noCompositingLayerProps, {
  valid: [
    // Non-compositing properties in sx prop
    {
      code: `
        const Component = () => (
          <Box
            sx={{
              backgroundColor: 'blue',
              marginTop: '10px',
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // A theme variant whose whole style is a hover lift and its transition.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiCard: {
              variants: [
                {
                  props: { variant: 'elevated' },
                  style: {
                    transition: 'transform 150ms',
                    '&:hover': { transform: 'translateY(-2px)' },
                  },
                },
              ],
            },
          },
        });
      `,
    },
    // The same lift under a slot's styleOverrides.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiIconButton: {
              styleOverrides: {
                root: {
                  '&:active': { transform: 'scale(0.96)' },
                },
              },
            },
          },
        });
      `,
    },
    // A function-form override toggling a transform from ownerState.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiSvgIcon: {
              styleOverrides: {
                root: ({ ownerState }) => ({
                  transition: 'transform 200ms',
                  ...(ownerState.open && { transform: 'rotate(180deg)' }),
                }),
              },
            },
          },
        });
      `,
    },
    // The Accordion expand icon: an `.Mui-expanded` state class composed onto
    // the icon wrapper, whose own object carries the transition.
    {
      code: `
        const Summary = ({ theme }) => (
          <AccordionSummary
            sx={{
              '& .MuiAccordionSummary-expandIconWrapper': {
                transition: theme.transitions.create('transform'),
                '&.Mui-expanded': { transform: 'rotate(180deg)' },
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A breakpoint key compiles to @media and is skipped like one.
    {
      code: `
        const Card = ({ theme }) => (
          <Box
            sx={{
              '&:hover': {
                [theme.breakpoints.up('md')]: { transform: 'translateY(-4px)' },
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // An interpolated MUI class in a selector key is read around the
    // interpolation.
    {
      code: `
        const Button = () => (
          <Box
            sx={{
              [\`&:hover .\${svgIconClasses.root}\`]: { transform: 'translateX(2px)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // The Switch thumb slides on `.Mui-checked` once the slot declares the
    // transition MUI otherwise keeps internal.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiSwitch: {
              styleOverrides: {
                switchBase: {
                  transition: TRANSITIONS.transform,
                  '&.Mui-checked': { transform: 'translateX(18px)' },
                },
              },
            },
          },
        });
      `,
    },
    // sx nested inside slotProps is its own style root.
    {
      code: `
        const Actions = () => (
          <Menu
            slotProps={{
              paper: { sx: { '&:focus-within': { transform: 'scale(1.01)' } } },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
  ],
  invalid: [
    // Transform in standalone style object
    {
      code: `
        const PULSATE_STYLE = {
          borderRadius: '50%',
          padding: '10px',
          transform: 'translate(-5px, -4px)',
        } as const;

        const Component = () => (
          <Pulsate style={PULSATE_STYLE}>
            <SomeIcon />
          </Pulsate>
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [{ messageId: 'compositingLayer' }],
    },
    // Transform in MUI sx prop should also be flagged
    {
      code: `
        const Component = () => (
          <PushPinIcon
            sx={{
              width: '14px',
              height: '14px',
              color: 'primary.dark',
              transform: 'rotate(45deg)',
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [{ messageId: 'compositingLayer' }],
    },
    // Multiple compositing properties in sx prop
    {
      code: `
        const Component = () => (
          <Box
            sx={{
              opacity: 0.8,
              transform: 'scale(1.1)',
              filter: 'blur(2px)',
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        { messageId: 'compositingLayer' },
        { messageId: 'compositingLayer' },
        { messageId: 'compositingLayer' },
      ],
    },
    // A slot selector with no state applies the transform at rest.
    {
      code: `
        const Tip = () => (
          <Tooltip
            componentsProps={{
              tooltip: { sx: { '& .MuiTooltip-arrow': { transform: 'scale(1.2)' } } },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // An Autocomplete option renderer runs once per option, so a toggled
    // transform there animates every matching option together.
    {
      code: `
        const Picker = ({ options }) => (
          <Autocomplete
            options={options}
            renderOption={(props, option, { selected }) => (
              <Box
                {...props}
                sx={{
                  transform: selected ? 'translateX(4px)' : 'none',
                  transition: 'transform 150ms',
                }}
              />
            )}
          />
        );
      `,
      parserOptions: jsx,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // A DataGrid cell renderer, written as a column-definition property.
    {
      code: `
        const COLUMNS = [
          {
            field: 'status',
            renderCell: (params) => (
              <Box
                sx={{
                  transition: 'opacity 150ms',
                  ...(params.row.isStale && { opacity: 0.5 }),
                }}
              />
            ),
          },
        ];
      `,
      parserOptions: jsx,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // A state selector with no transition anywhere holds the value at rest
    // whenever the state is on.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiSwitch: {
              styleOverrides: {
                root: {
                  '&.Mui-checked': { transform: 'translateX(4px)' },
                },
              },
            },
          },
        });
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // A theme override's ancestor-hover shift moves every item of the list.
    {
      code: `
        const theme = createTheme({
          components: {
            MuiListItemIcon: {
              styleOverrides: {
                root: {
                  '.MuiListItemButton-root:hover &': { transform: 'translateX(2px)' },
                },
              },
            },
          },
        });
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
  ],
});
