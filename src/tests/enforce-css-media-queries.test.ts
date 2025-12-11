import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceCssMediaQueries } from '../rules/enforce-css-media-queries';

const error = (source: string) => ({
  messageId: 'enforceCssMediaQueries' as const,
  data: { source },
});

ruleTesterJsx.run('enforce-css-media-queries', enforceCssMediaQueries, {
  valid: [
    // Valid component using CSS for responsive design
    {
      code: `
        function Component() {
          return (
            <div className="responsive-container">
              Small screen
            </div>
          );
        }
      `,
    },
    // Valid component not using any breakpoint detection
    {
      code: `
        import { useState } from 'react';

        function Component() {
          const [isOpen, setIsOpen] = useState(false);
          return <div>{isOpen ? 'Open' : 'Closed'}</div>;
        }
      `,
    },
    // Valid component using other hooks
    {
      code: `
        import { useEffect, useState } from 'react';
        import { useTheme } from '@mui/material';

        function Component() {
          const theme = useTheme();
          const [state, setState] = useState(false);

          useEffect(() => {
            // Some effect
          }, []);

          return <div style={{ color: theme.palette.primary.main }}>Content</div>;
        }
      `,
    },
  ],
  invalid: [
    // Invalid component using Material-UI's useMediaQuery
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const isSmallScreen = useMediaQuery('(max-width:600px)');
          return <div>{isSmallScreen ? 'Small screen' : 'Large screen'}</div>;
        }
      `,
      errors: [
        error('useMediaQuery import from @mui/material'),
        error('useMediaQuery call'),
      ],
    },
    // Invalid component using useMediaQuery from a destructured import
    {
      code: `
        import { useMediaQuery, Button } from '@mui/material';

        function Component() {
          const isSmallScreen = useMediaQuery('(max-width:600px)');
          return <Button>{isSmallScreen ? 'Small' : 'Large'}</Button>;
        }
      `,
      errors: [
        error('useMediaQuery import from @mui/material'),
        error('useMediaQuery call'),
      ],
    },
    // Invalid component using react-responsive
    {
      code: `
        import { useMediaQuery } from 'react-responsive';

        function Component() {
          const isMobile = useMediaQuery({ maxWidth: 767 });
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [
        error('react-responsive import "react-responsive"'),
        error('useMediaQuery call'),
      ],
    },
    // Invalid component using useMobile hook
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Component() {
          const isMobile = useMobile();
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [
        error('useMobile import from ../hooks/useMobile'),
        error('useMobile call'),
      ],
    },
    // Invalid component using useMobile from a different path
    {
      code: `
        import { useMobile } from 'src/hooks/useMobile';

        function Component() {
          const isMobile = useMobile();
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [
        error('useMobile import from src/hooks/useMobile'),
        error('useMobile call'),
      ],
    },
    // Invalid component using useMediaQuery directly
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const matches = useMediaQuery('(min-width:600px)');

          return (
            <div>
              {matches ? (
                <div>Desktop layout</div>
              ) : (
                <div>Mobile layout</div>
              )}
            </div>
          );
        }
      `,
      errors: [
        error('useMediaQuery import from @mui/material'),
        error('useMediaQuery call'),
      ],
    },
  ],
});
