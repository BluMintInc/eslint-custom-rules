import type { TSESLint } from '@typescript-eslint/utils';
import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { noMarginProperties } from '../rules/no-margin-properties';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';
import globalConstStyle from '../rules/global-const-style';
import { preferUnionFromConstArray } from '../rules/prefer-union-from-const-array';

const marginMessage = (property: string) =>
  `Margin property "${property}" in MUI styling fights container-controlled spacing (Stack/Grid spacing, gap, responsive gutters) and produces double gutters, misalignment, and overflow as layouts shift. Keep spacing inside the component with padding or let the parent handle separation via gap/spacing so layout remains predictable.`;

const marginError = (property: string) =>
  ({
    message: marginMessage(property),
  } as unknown as TSESLint.TestCaseError<'noMarginProperties'>);

ruleTesterTs.run('no-margin-properties', noMarginProperties, {
  valid: [
    // Valid MUI component with padding
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ paddingLeft: 4 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid MUI Stack with spacing prop
    {
      code: `
        import Stack from '@mui/material/Stack';

        function App() {
          return <Stack spacing={2} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid MUI Grid with spacing
    {
      code: `
        import Grid from '@mui/material/Grid';

        function App() {
          return <Grid container spacing={3} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid non-MUI component with margin (should not be flagged)
    {
      code: `
        function App() {
          return <div style={{ margin: '10px' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid object with margin property but not in sx context
    {
      code: `
        const styles = {
          margin: '10px',
          marginTop: 2,
        };
      `,
    },
    // Valid TypeScript interface with margin properties
    {
      code: `
        interface StyleProps {
          margin: string;
          marginTop: number;
          mx: number;
        }
      `,
    },
    // Valid usage of padding in a function-based sx prop
    {
      code: `
        <Box sx={(theme) => ({ padding: theme.spacing(2) })} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage of gap in a conditional expression
    {
      code: `
        <Stack sx={{ gap: condition ? 2 : 4 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage of padding in a dynamic style object
    {
      code: `
        const styles = { padding: 2 };

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage of padding in theme overrides
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiButton: {
              styleOverrides: {
                root: {
                  padding: 8,
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: margin in createTheme styleOverrides is container-controlled theme styling, not sibling spacing
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiButton: {
              styleOverrides: {
                root: {
                  margin: 8,
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: margins across nested theme overrides (pseudo-selectors, multiple components) are theme styling
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiButton: {
              styleOverrides: {
                root: {
                  padding: 8,
                  '&:hover': {
                    marginTop: 2
                  }
                },
                startIcon: {
                  marginRight: 8
                }
              },
            },
            MuiTextField: {
              styleOverrides: {
                root: {
                  marginBottom: 16
                }
              }
            }
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: margins across multiple components/slots in createTheme are theme styling
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiButton: {
              styleOverrides: {
                root: { margin: 8 },
                outlined: { marginTop: 4 }
              },
            },
            MuiCard: {
              styleOverrides: {
                root: { marginBottom: 16 }
              }
            }
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: issue #1214 repro — MuiDialog paper margin is viewport-inset control, not sibling spacing
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiDialog: {
              styleOverrides: {
                paper: {
                  '& .MuiDialog-paper': {
                    margin: '32px',
                  },
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: issue #1214 repro — MuiAvatarGroup margin: 0 resets MUI's own built-in margin
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiAvatarGroup: {
              styleOverrides: {
                avatar: {
                  margin: 0,
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: issue #1214 repro — MuiFormHelperText marginTop is MUI internal layout
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiFormHelperText: {
              styleOverrides: {
                root: {
                  marginTop: 4,
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid: issue #1214 repro — MuiFormControlLabel margin: 0 resets MUI's own built-in margin
    {
      code: `
        import { createTheme } from '@mui/material/styles';

        const theme = createTheme({
          components: {
            MuiFormControlLabel: {
              styleOverrides: {
                root: {
                  margin: 0,
                },
              },
            },
          },
        });
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage of padding with MUI's css function
    {
      code: `
        import { css } from '@mui/system';

        const styles = css({
          padding: 2,
        });
      `,
    },
    // Valid usage with spread operator
    {
      code: `
        const baseStyles = { padding: 2 };
        const styles = { ...baseStyles, color: 'red' };

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Padding is the recommended replacement and must never be flagged
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ paddingLeft: 4 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with gap property
    {
      code: `
        import Stack from '@mui/material/Stack';

        function App() {
          return <Stack sx={{ gap: 2 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with border properties (should not be flagged)
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ border: '1px solid red', borderTop: 2 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with position properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ position: 'absolute', top: 0, left: 0 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with transform properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ transform: 'translateX(10px)' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage in regular CSS-in-JS (not MUI context)
    {
      code: `
        const styles = {
          container: {
            margin: '10px',
            marginTop: 5,
          }
        };
      `,
    },
    // Valid usage in styled-components (not MUI context)
    {
      code: `
        const StyledDiv = styled.div\`
          margin: 10px;
          margin-top: 5px;
        \`;
      `,
    },
    // Valid usage with non-margin properties that contain 'margin' in name
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ marginalia: 'some-value', marginalNote: 'test' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with computed property names that don't resolve to margin
    {
      code: `
        const prop = 'padding';
        const styles = {
          [\`\${prop}Top\`]: 2
        };

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with empty sx prop
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{}} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with null/undefined sx prop
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={null} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with array sx prop (MUI supports arrays)
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={[{ padding: 2 }, { color: 'red' }]} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with function returning non-margin properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={() => ({ padding: 2, color: 'blue' })} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with complex nested objects without margin
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return (
            <Box sx={{
              padding: 2,
              '&:hover': {
                backgroundColor: 'primary.main',
                '& .child': {
                  opacity: 0.8
                }
              },
              '@media (max-width: 600px)': {
                padding: 1
              }
            }} />
          );
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with CSS Grid properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ display: 'grid', gridGap: 2, gridTemplateColumns: '1fr 1fr' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with Flexbox properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with MUI spacing function
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={(theme) => ({ padding: theme.spacing(2) })} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid usage with CSS custom properties
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ '--custom-spacing': '16px', padding: 'var(--custom-spacing)' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // An assertion wrapper does not turn a non-MUI object into a styling
    // context: looking through `as const` must not widen WHERE the rule fires.
    `
    const styles = { margin: '10px', marginTop: 2 } as const;
    `,
    `
    const styles = <const>{ margin: '10px' };
    `,
    // A wrapped, margin-carrying object handed to a non-`css` call stays valid
    // even though the callee is now classified through its assertion.
    `
    const styles = (styled as any)({ margin: 2 });
    `,
    {
      code: `
        import Box from '@mui/material/Box';

        const styles = { padding: 8 } as const;

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ padding: 8 } satisfies Record<string, number>} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  ],
  invalid: [
    // Control: inline style object with margin assigned to sx still fires (non-theme)
    {
      code: `
        import Box from '@mui/material/Box';

        const styles = { margin: 8 };

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Control: JSX sx attribute object with margin still fires (non-theme)
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ margin: 2 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Control: sx object property with margin still fires (non-theme)
    {
      code: `
        const config = {
          sx: {
            margin: 2,
          },
        };
      `,
      errors: [marginError('margin')],
    },
    // Control: css() call with margin still fires (non-theme)
    {
      code: `
        import { css } from '@mui/system';

        const styles = css({ margin: 4 });
      `,
      errors: [marginError('margin')],
    },
    // Invalid MUI Box with marginLeft
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ marginLeft: 4 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginLeft')],
    },
    // Invalid MUI Stack with mx
    {
      code: `
        import Stack from '@mui/material/Stack';

        function App() {
          return <Stack sx={{ mx: 2 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mx')],
    },
    // Invalid MUI Container with mt and mb
    {
      code: `
        import Container from '@mui/material/Container';

        function App() {
          return <Container sx={{ mt: 3, mb: 2 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mt'), marginError('mb')],
    },
    // Invalid MUI Box with margin string value
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ margin: '10px' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid MUI Box with margin percentage value
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ margin: '5%' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid custom component with sx prop
    {
      code: `
        const CustomBox = (props) => <Box sx={{ ...props.sx, margin: 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid conditional styling with margins
    {
      code: `
        <Box sx={{ margin: condition ? 2 : 4 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins in dynamic style objects
    {
      code: `
        const styles = { margin: 2 };

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid function-based sx props with margin
    {
      code: `
        <Box sx={(theme) => ({ margin: theme.spacing(2) })} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins in MUI's css function
    {
      code: `
        import { css } from '@mui/system';

        const styles = css({
          margin: 2,
        });
      `,
      errors: [marginError('margin')],
    },
    // Invalid margins with direct props
    {
      code: `
        <Box margin={2} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins with multiple direct props
    {
      code: `
        <Box mt={2} mb={3} ml={1} mr={1} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('mt'),
        marginError('mb'),
        marginError('ml'),
        marginError('mr'),
      ],
    },
    // Invalid margins with spread operator - simplified test case
    {
      code: `
        const marginStyles = { margin: 2 };

        function App() {
          return <Box sx={marginStyles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins in nested objects
    {
      code: `
        <Box sx={{
          color: 'primary.main',
          '&:hover': {
            margin: 2
          }
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins in both branches of conditional
    {
      code: `
        <Box sx={isSmall ? { marginTop: 1 } : { marginBottom: 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginTop'), marginError('marginBottom')],
    },
    // Invalid margins in arrow function with block body
    {
      code: `
        <Box sx={(theme) => {
          return {
            marginTop: theme.spacing(2),
            color: theme.palette.primary.main
          };
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginTop')],
    },
    // Invalid margins with Object.assign
    {
      code: `
        const baseStyles = { margin: 2 };

        function App() {
          return <Box sx={Object.assign({}, baseStyles, { color: 'red' })} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins with string literals
    {
      code: `
        <Box sx={{ 'marginTop': 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginTop')],
    },
    // Invalid margins with multiple components in the same file
    {
      code: `
        function Header() {
          return <Box sx={{ marginBottom: 2 }} />;
        }

        function Footer() {
          return <Box sx={{ marginTop: 2 }} />;
        }

        function App() {
          return (
            <>
              <Header />
              <Box sx={{ margin: 2 }} />
              <Footer />
            </>
          );
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('marginBottom'),
        marginError('marginTop'),
        marginError('margin'),
      ],
    },
    // A bare JSX expression statement, outside any component
    {
      code: `
        <Box sx={{ margin: 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins with kebab-case properties
    {
      code: `
        <Box sx={{ 'margin-left': 2, 'margin-right': 3 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin-left'), marginError('margin-right')],
    },
    // Invalid margins with mixed case variations
    {
      code: `
        <Box sx={{ marginleft: 2, margintop: 3, marginbottom: 1 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('marginleft'),
        marginError('margintop'),
        marginError('marginbottom'),
      ],
    },
    // Invalid margins with numeric string values
    {
      code: `
        <Box sx={{ margin: '16', marginTop: '8px' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with CSS calc() values
    {
      code: `
        <Box sx={{ margin: 'calc(100% - 20px)', marginLeft: 'calc(50% + 10px)' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginLeft')],
    },
    // Invalid margins with CSS variables
    {
      code: `
        <Box sx={{ margin: 'var(--spacing-md)', marginTop: 'var(--spacing-sm)' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins in deeply nested pseudo-selectors
    {
      code: `
        <Box sx={{
          '&:hover': {
            '&::before': {
              margin: 2,
              '&:focus': {
                marginTop: 1
              }
            }
          }
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins in media queries
    {
      code: `
        <Box sx={{
          '@media (min-width: 600px)': {
            margin: 2,
            '@media (min-width: 900px)': {
              marginTop: 3
            }
          }
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with simple template literal property names
    {
      code: `
        <Box sx={{ [\`marginTop\`]: 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginTop')],
    },
    // Invalid margins in function with multiple return statements
    {
      code: `
        <Box sx={(theme) => {
          if (theme.breakpoints.up('md')) {
            return { margin: theme.spacing(2) };
          }
          return { marginTop: theme.spacing(1) };
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with ternary operator in values
    {
      code: `
        <Box sx={{ margin: condition ? 2 : 4, marginLeft: isSmall ? 1 : 2 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginLeft')],
    },
    // Invalid margins with logical operators in values
    {
      code: `
        <Box sx={{ margin: value || 2, marginTop: value && 3 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins in array-style sx prop
    {
      code: `
        <Box sx={[{ margin: 2 }, { marginTop: 3 }]} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with zero values
    {
      code: `
        <Box sx={{ margin: 0, marginTop: '0px', marginLeft: '0rem' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins with negative values
    {
      code: `
        <Box sx={{ margin: -2, marginTop: '-8px', marginLeft: 'calc(-100% + 20px)' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins in complex spread scenarios (only detects variables used in sx)
    {
      code: `
        const baseStyles = { margin: 2 };

        function App() {
          return <Box sx={{ ...baseStyles, color: 'red' }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins with MUI theme function calls
    {
      code: `
        <Box sx={(theme) => ({
          margin: theme.spacing(2),
          marginTop: theme.spacing.unit * 2,
          marginLeft: theme.spacing(1, 2, 3)
        })} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins with shorthand properties mixed with longhand
    {
      code: `
        <Box sx={{ m: 2, marginTop: 3, mx: 1, marginLeft: 4 }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('m'),
        marginError('marginTop'),
        marginError('mx'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins in component with multiple sx props (edge case)
    {
      code: `
        function CustomComponent({ sx, ...props }) {
          return <Box sx={[{ margin: 2 }, sx]} {...props} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins with function composition (current implementation limitation)
    // Note: The rule doesn't analyze function return values that aren't directly assigned to variables
    {
      code: `
        const marginStyles = { margin: 2 };

        function App() {
          return <Box sx={marginStyles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // Invalid margins in conditional with complex expressions
    {
      code: `
        <Box sx={{
          ...(condition && { margin: 2 }),
          ...(otherCondition ? { marginTop: 3 } : { marginBottom: 1 })
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginBottom'),
      ],
    },
    // Invalid margins with CSS units variations
    {
      code: `
        <Box sx={{
          margin: '1em',
          marginTop: '2rem',
          marginLeft: '3vh',
          marginRight: '4vw'
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
        marginError('marginRight'),
      ],
    },
    // Invalid margins with auto values
    {
      code: `
        <Box sx={{ margin: 'auto', marginLeft: 'auto', marginRight: 'auto' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginLeft'),
        marginError('marginRight'),
      ],
    },
    // Invalid margins with inherit/initial/unset values
    {
      code: `
        <Box sx={{ margin: 'inherit', marginTop: 'initial', marginLeft: 'unset' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins in responsive breakpoints
    {
      code: `
        <Box sx={{
          margin: { xs: 1, sm: 2, md: 3 },
          marginTop: { xs: 0, lg: 4 }
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with multiple MUI components in one file
    {
      code: `
        function Header() {
          return <AppBar sx={{ marginBottom: 2 }} />;
        }

        function Content() {
          return <Container sx={{ marginTop: 2, marginBottom: 3 }} />;
        }

        function Sidebar() {
          return <Drawer sx={{ marginRight: 1 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('marginBottom'),
        marginError('marginTop'),
        marginError('marginBottom'),
        marginError('marginRight'),
      ],
    },
    // Invalid margins with complex selector nesting
    {
      code: `
        <Box sx={{
          '& .MuiButton-root': {
            margin: 1,
            '&:hover': {
              marginTop: 2,
              '& .MuiButton-label': {
                marginLeft: 1
              }
            }
          }
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('margin'),
        marginError('marginTop'),
        marginError('marginLeft'),
      ],
    },
    // Invalid margins with CSS-in-JS styled function (current implementation limitation)
    // Note: The rule doesn't currently detect margin properties in styled() function calls
    // This would require additional AST traversal for styled-components patterns
    {
      code: `
        import { css } from '@mui/system';

        const styles = css({
          margin: 2,
          marginTop: 1
        });
      `,
      errors: [marginError('margin'), marginError('marginTop')],
    },
    // Invalid margins with mixed shorthand and longhand in same object
    {
      code: `
        <Box sx={{
          m: 2,
          marginTop: 3,
          mx: 1,
          marginLeft: 4,
          my: 2,
          marginBottom: 1
        }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [
        marginError('m'),
        marginError('marginTop'),
        marginError('mx'),
        marginError('marginLeft'),
        marginError('my'),
        marginError('marginBottom'),
      ],
    },
    // Every case below repeats a shape the suite already covers, with an
    // assertion wrapper (`as const`, `satisfies`, `!`, `<T>`) added around the
    // subject. The wrapper asserts a type and contributes no value, so the
    // report must be identical to the unwrapped spelling. This is not a
    // hypothetical spelling: `global-const-style`'s own autofix rewrites
    // `const styles = { margin: 8 }` into `const STYLES = { margin: 8 } as
    // const`, so a rule blind to the wrapper goes silent on code
    // `eslint --fix` had just reported (Issue #1805).
    {
      // The exact output of the sibling fixer named in the issue.
      code: `
        import Box from '@mui/material/Box';

        const STYLES = { margin: 8 } as const;

        function App() {
          return <Box sx={STYLES} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        const styles = { marginTop: 2 } satisfies Record<string, number>;

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginTop')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        const styles = ({ mx: 1 })!;

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mx')],
    },
    {
      // Chained assertions have to peel all the way down, not one layer.
      code: `
        import Box from '@mui/material/Box';

        const styles = { mb: 2 } as const satisfies Record<string, number>;

        function App() {
          return <Box sx={styles} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mb')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        const base = { marginLeft: 1 } as const;

        function App() {
          return <Box sx={{ ...base }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginLeft')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        const base = { marginRight: 1 } satisfies Record<string, number>;

        function App() {
          return <Box sx={Object.assign({}, base)} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('marginRight')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ margin: 8 } as const} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={(theme) => ({ mt: 2 } as const)} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mt')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={() => { return { mb: 1 } satisfies Record<string, number>; }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('mb')],
    },
    {
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={isCompact ? ({ my: 1 })! : ({ padding: 1 } as const)} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('my')],
    },
    {
      // The wrapper sits on the conditional itself, above both branches.
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={(isCompact ? { ml: 1 } : { padding: 1 }) as const} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('ml')],
    },
    {
      // A computed key carries its own assertion.
      code: `
        import Box from '@mui/material/Box';

        function App() {
          return <Box sx={{ ['margin' as const]: 8 }} />;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [marginError('margin')],
    },
    // `<T>x` only parses outside JSX, so its cases use the non-JSX styling
    // contexts: the `css()` call and the `sx` object property.
    {
      code: `
        import { css } from '@mui/system';

        const styles = css(<const>{ margin: 2 });
      `,
      errors: [marginError('margin')],
    },
    {
      code: `
        const props = { sx: <const>{ margin: 1 } };
      `,
      errors: [marginError('margin')],
    },
    {
      code: `
        const props = { sx: { marginTop: 1 } as const };
      `,
      errors: [marginError('marginTop')],
    },
    // The assertion can also sit on the callee, which is the same blindness
    // one level up: `css` still names MUI's css function.
    {
      code: `
        import { css } from '@mui/system';

        const styles = (css as any)({ marginTop: 1 });
      `,
      errors: [marginError('marginTop')],
    },
    {
      code: `
        import { css } from '@mui/system';

        const styles = css!({ mb: 2 });
      `,
      errors: [marginError('mb')],
    },
    {
      code: `
        import { css } from '@mui/system';

        const styles = (<any>css)({ ml: 3 });
      `,
      errors: [marginError('ml')],
    },
  ],
});

/**
 * The wrapped spellings above are reachable through the plugin's OWN `--fix`:
 * three shipped rules append ` as const` to object literals, and
 * `global-const-style` also renames the binding. Running them over the issue's
 * snippet produces exactly the code this rule used to go silent on, so
 * `eslint --fix` erased a report it had just made (Issue #1805).
 *
 * The shipped fix-closure guard counts reports a fixer INTRODUCES, so it is
 * structurally blind to one a fixer removes; this pins the deletion direction
 * for the pair.
 */
describe('no-margin-properties composed with the as-const-appending fixers', () => {
  const MARGIN_ID = '@blumintinc/blumint/no-margin-properties';
  const CULPRITS = {
    '@blumintinc/blumint/enforce-object-literal-as-const':
      enforceObjectLiteralAsConst,
    '@blumintinc/blumint/global-const-style': globalConstStyle,
    '@blumintinc/blumint/prefer-union-from-const-array':
      preferUnionFromConstArray,
  } as const;
  const FILENAME = 'src/components/App.tsx';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      MARGIN_ID,
      noMarginProperties as unknown as Rule.RuleModule,
    );
    Object.entries(CULPRITS).forEach(([id, culprit]) => {
      linter.defineRule(id, culprit as unknown as Rule.RuleModule);
    });
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules,
  });

  const CULPRIT_RULES = Object.fromEntries(
    Object.keys(CULPRITS).map((id) => [id, 'error']),
  ) as Linter.RulesRecord;

  const SOURCE = [
    `import Box from '@mui/material/Box';`,
    ``,
    `const styles = { margin: 8 };`,
    ``,
    `function App() {`,
    `  return <Box sx={styles} />;`,
    `}`,
    ``,
  ].join('\n');

  it('still reports the margin after the sibling fixers rewrite the source', () => {
    const linter = makeLinter();
    const marginReports = (code: string) =>
      linter
        .verify(code, configFor({ [MARGIN_ID]: 'error' }), FILENAME)
        .map((message) => message.messageId);

    expect(marginReports(SOURCE)).toEqual(['noMarginProperties']);

    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor(CULPRIT_RULES),
      FILENAME,
    );

    // Without these the case passes vacuously the moment a culprit stops
    // firing: the point is that the wrapper IS present in the linted input.
    expect(fixed.fixed).toBe(true);
    expect(fixed.output).toContain('as const');
    expect(fixed.output).toContain('{ margin: 8 }');

    expect(marginReports(fixed.output)).toEqual(['noMarginProperties']);

    // Causal isolation: the only textual difference between these two inputs is
    // the assertion, so a verdict that differs between them is the wrapper's
    // doing rather than the rename's.
    const withoutAssertion = fixed.output.replace(' as const', '');
    expect(withoutAssertion).not.toContain('as const');
    expect(marginReports(withoutAssertion)).toEqual(['noMarginProperties']);
  });

  it('converges: re-linting the fixed output changes nothing further', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor(CULPRIT_RULES),
      FILENAME,
    );
    const refixed = linter.verifyAndFix(
      fixed.output,
      configFor(CULPRIT_RULES),
      FILENAME,
    );

    expect(refixed.output).toBe(fixed.output);
  });
});
