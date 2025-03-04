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
  ],
});
