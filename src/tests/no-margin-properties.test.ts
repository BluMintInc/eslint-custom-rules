import { ruleTesterTs } from '../utils/ruleTester';
import { noMarginProperties } from '../rules/no-margin-properties';

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
  ],
  invalid: [
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
      ],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
    },
    // Invalid margins in theme overrides
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
      errors: [{ messageId: 'noMarginProperties' }],
    },
    // Invalid margins in MUI's css function
    {
      code: `
        import { css } from '@mui/system';

        const styles = css({
          margin: 2,
        });
      `,
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
      ],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
      errors: [{ messageId: 'noMarginProperties' }],
    },
    // Invalid margins in complex nested theme structure
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
      errors: [
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
      ],
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
      errors: [{ messageId: 'noMarginProperties' }],
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
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
        { messageId: 'noMarginProperties' },
      ],
    },
  ],
});
