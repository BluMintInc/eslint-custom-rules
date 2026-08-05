import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceCssMediaQueries } from '../rules/enforce-css-media-queries';

const error = (source: string) => ({
  messageId: 'enforceCssMediaQueries' as const,
  data: { source },
});

/**
 * Pinning the reported node's type and line is what proves the one-report-per-usage
 * behavior: a file whose hook is called earns its single report on the call, so a
 * regression that also reports the import shows up as a count and a node mismatch
 * rather than passing on message text alone.
 */
const callError = (source: string, line: number) => ({
  ...error(source),
  type: AST_NODE_TYPES.CallExpression,
  line,
});

const importError = (source: string, type: AST_NODE_TYPES, line: number) => ({
  ...error(source),
  type,
  line,
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
    // Capability probe: no class name can tell a hook whether the device hovers
    {
      code: `
        import { useMediaQuery } from '@mui/material';
        export const useHoverCapable = () => useMediaQuery('(hover: hover) and (pointer: fine)');
      `,
    },
    // Preference query resolved through a local const binding
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

        function Component() {
          const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
          return <Fade timeout={reducedMotion ? 0 : 300}>Content</Fade>;
        }
      `,
    },
    // Preference query gating JavaScript branching
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
          return <Theme mode={prefersDark ? 'dark' : 'light'} />;
        }
      `,
    },
    // Template literal without expressions resolves like a string literal
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const coarse = useMediaQuery(\`(any-pointer: coarse)\`);
          return <div>{coarse ? 'touch' : 'mouse'}</div>;
        }
      `,
    },
    // Orientation is a device capability, not a breakpoint
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const isLandscape = useMediaQuery('(orientation: landscape)');
          return <Player rotate={isLandscape} />;
        }
      `,
    },
    // An import whose every call is exempt earns no report of its own
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const canHover = useMediaQuery('(hover: hover)');
          const prefersContrast = useMediaQuery('(prefers-contrast: more)');
          return <Tooltip disabled={!canHover} highContrast={prefersContrast} />;
        }
      `,
    },
    // `as const` only annotates the query it wraps
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        const FORCED_COLORS = '(forced-colors: active)' as const;

        function Component() {
          const forced = useMediaQuery(FORCED_COLORS);
          return <Icon outlined={forced} />;
        }
      `,
    },
    // Boolean feature form behind a media type
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const canHover = useMediaQuery('screen and (hover)');
          return <div>{canHover ? 'hover' : 'tap'}</div>;
        }
      `,
    },
    // Comma-separated list of capability queries
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const coarse = useMediaQuery('(pointer: coarse), (any-hover: none)');
          return <Controls large={coarse} />;
        }
      `,
    },
    // Any `prefers-*` feature counts as a preference, listed or not
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const lean = useMediaQuery('(prefers-reduced-transparency: reduce)');
          return <Panel blur={!lean} />;
        }
      `,
    },
    // Environment capabilities gate behaviour, not layout
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const standalone = useMediaQuery('(display-mode: standalone)');
          const slowPaint = useMediaQuery('(update: slow)');
          return <Shell chrome={!standalone} animate={!slowPaint} />;
        }
      `,
    },
    // The exemption follows the query, not the library that carries it
    {
      code: `
        import { useMediaQuery } from 'react-responsive';

        function Component() {
          const canHover = useMediaQuery('(any-hover: hover)');
          return <div>{canHover ? 'hover' : 'tap'}</div>;
        }
      `,
    },
    // A viewport breakpoint whose result reaches only a JS-only prop has no CSS
    // remedy: no @media rule and no class name can select an `anchorOrigin`
    // object. Same principle as the capability-query exemption above, reached
    // via the value's destination rather than the query string.
    {
      code: `
        import Popover from '@mui/material/Popover';
        import { useMobile } from '../hooks/useMobile';

        function CrewDock() {
          const isMobile = useMobile();
          const anchorOrigin = isMobile
            ? { vertical: 'bottom', horizontal: 'center' }
            : { vertical: 'top', horizontal: 'right' };
          return <Popover anchorOrigin={anchorOrigin} open />;
        }
      `,
    },
    // Direct JS-only prop, no intermediate binding.
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        function Reveal() {
          const isMobile = useMobile();
          return <Fade timeout={isMobile ? 0 : 300} />;
        }
      `,
    },
    // The trail survives any number of `const` hops
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        function Reveal() {
          const isMobile = useMobile();
          const compact = isMobile;
          const timeout = compact ? 0 : 300;
          return <Fade timeout={timeout} />;
        }
      `,
    },
    // The destination axis judges a width query the same way: a stylesheet has
    // no selector for a Snackbar's anchor position either
    {
      code: `
        import Snackbar from '@mui/material/Snackbar';
        import { useMediaQuery } from '@mui/material';

        function Toast() {
          const isSmall = useMediaQuery('(max-width: 600px)');
          return (
            <Snackbar
              anchorOrigin={{ vertical: isSmall ? 'bottom' : 'top', horizontal: 'center' }}
            />
          );
        }
      `,
    },
    // Every read has to clear, and here both do
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        function Reveal() {
          const isMobile = useMobile();
          return <Fade timeout={isMobile ? 0 : 300} appear={!isMobile} mountOnEnter />;
        }
      `,
    },
    // `as const` annotates the object the branch produces, nothing more
    {
      code: `
        import Popover from '@mui/material/Popover';
        import { useMobile } from '../hooks/useMobile';

        export const CrewDock = () => {
          const isMobile = useMobile();
          const anchorOrigin = isMobile
            ? ({ vertical: 'bottom', horizontal: 'center' } as const)
            : ({ vertical: 'top', horizontal: 'right' } as const);
          return <Popover anchorOrigin={anchorOrigin} open />;
        };
      `,
    },
    // A template literal carries the value to the same non-style prop
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Player() {
          const isMobile = useMobile();
          return <Video label={\`\${isMobile ? 'Small' : 'Large'} view\`} />;
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
      errors: [callError('useMediaQuery call', 5)],
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
      errors: [callError('useMediaQuery call', 5)],
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
      errors: [callError('useMediaQuery call', 5)],
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
      errors: [callError('useMobile call', 5)],
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
      errors: [callError('useMobile call', 5)],
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
      errors: [callError('useMediaQuery call', 5)],
    },
    // A width query earns exactly one report, on the call rather than the import
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const isDesktop = useMediaQuery('(min-width: 600px)');
          return <div>{isDesktop ? 'Desktop' : 'Mobile'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // A layout feature anywhere in a mixed query keeps the call reportable
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const wideHover = useMediaQuery('(hover: hover) and (min-width: 600px)');
          return <div>{wideHover ? 'Desktop' : 'Compact'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // Breakpoint helpers are layout by definition
    {
      code: `
        import { useMediaQuery, useTheme } from '@mui/material';

        function Component() {
          const theme = useTheme();
          const isSmall = useMediaQuery(theme.breakpoints.down('md'));
          return <div>{isSmall ? 'Small' : 'Large'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 6)],
    },
    // A query the rule cannot resolve keeps the current behavior
    {
      code: `
        import { useMediaQuery } from '@mui/material';
        import { MOBILE_QUERY } from '../styles/queries';

        function Component() {
          const isMobile = useMediaQuery(MOBILE_QUERY);
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 6)],
    },
    // A reassignable binding may hold a breakpoint by the time the hook runs
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        let query = '(hover: hover)';

        function Component() {
          const canHover = useMediaQuery(query);
          return <div>{canHover ? 'hover' : 'tap'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 7)],
    },
    // An interpolated template hides part of the query
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component({ breakpoint }) {
          const matches = useMediaQuery(\`(min-width: \${breakpoint}px)\`);
          return <div>{matches ? 'Desktop' : 'Mobile'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // A const resolving to a width query is still a breakpoint
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        const DESKTOP_QUERY = '(min-width: 900px)';

        function Component() {
          const isDesktop = useMediaQuery(DESKTOP_QUERY);
          return <div>{isDesktop ? 'Desktop' : 'Mobile'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 7)],
    },
    // An unrecognized feature is not provably free of layout
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const mono = useMediaQuery('(monochrome)');
          return <div>{mono ? 'Mono' : 'Color'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // Range syntax leaves the feature ambiguous to the scanner
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const wide = useMediaQuery('(width >= 600px)');
          return <div>{wide ? 'Wide' : 'Narrow'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // A query naming no feature at all stays reportable
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const matches = useMediaQuery('');
          return <div>{matches ? 'Yes' : 'No'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 5)],
    },
    // Two reportable calls earn two reports - the import adds no third
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const isSmall = useMediaQuery('(max-width: 600px)');
          const isTall = useMediaQuery('(min-height: 800px)');
          return <div>{isSmall && isTall ? 'Tall phone' : 'Other'}</div>;
        }
      `,
      errors: [
        callError('useMediaQuery call', 5),
        callError('useMediaQuery call', 6),
      ],
    },
    // An exempt call alongside a breakpoint call leaves only the breakpoint report
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        function Component() {
          const canHover = useMediaQuery('(hover: hover)');
          const isSmall = useMediaQuery('(max-width: 600px)');
          return <div>{canHover && isSmall ? 'Compact' : 'Roomy'}</div>;
        }
      `,
      errors: [callError('useMediaQuery call', 6)],
    },
    // An import with no call has no call to carry the report
    {
      code: `
        import { useMediaQuery } from '@mui/material';

        const useBreakpoint = useMediaQuery;
        export default useBreakpoint;
      `,
      errors: [
        importError(
          'useMediaQuery import from @mui/material',
          AST_NODE_TYPES.ImportSpecifier,
          2,
        ),
      ],
    },
    // An aliased hook is never matched at the call, so the import keeps its report
    {
      code: `
        import { useMobile as useIsMobile } from '../hooks/useMobile';

        function Component() {
          const isMobile = useIsMobile();
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [
        importError(
          'useMobile import from ../hooks/useMobile',
          AST_NODE_TYPES.ImportSpecifier,
          2,
        ),
      ],
    },
    // A react-responsive import with no call is reported at the declaration
    {
      code: `
        import 'react-responsive';

        function Component() {
          return <div>Content</div>;
        }
      `,
      errors: [
        importError(
          'react-responsive import "react-responsive"',
          AST_NODE_TYPES.ImportDeclaration,
          2,
        ),
      ],
    },
    // A namespaced react-responsive call is not matched, so the import reports
    {
      code: `
        import * as responsive from 'react-responsive';

        function Component() {
          const isMobile = responsive.useMediaQuery({ maxWidth: 767 });
          return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
        }
      `,
      errors: [
        importError(
          'react-responsive import "react-responsive"',
          AST_NODE_TYPES.ImportDeclaration,
          2,
        ),
      ],
    },
    // useMobile takes no query, so nothing proves it free of layout
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Component() {
          const isMobile = useMobile();
          const label = isMobile ? 'Mobile' : 'Desktop';
          return <div>{label}</div>;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // MUST KEEP FIRING - the whole point of the rule. A viewport breakpoint
    // reaching `sx` has a CSS remedy, so the destination exemption must not
    // swallow it.
    {
      code: `
        import Box from '@mui/material/Box';
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <Box sx={{ display: isMobile ? 'none' : 'block' }} />;
        }
      `,
      errors: [callError('useMobile call', 6)],
    },
    // An inline style is a style destination
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <div style={{ display: isMobile ? 'none' : 'block' }} />;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // Swapping the class name is the remedy the message prescribes
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <div className={isMobile ? 'stack' : 'inline'}>Content</div>;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // A class name interpolated into a template reaches the same destination
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <div className={\`panel \${isMobile ? 'stack' : 'inline'}\`}>Content</div>;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // `classes` carries class names too
    {
      code: `
        import Tabs from '@mui/material/Tabs';
        import { useMobile } from '../hooks/useMobile';

        function Nav() {
          const isMobile = useMobile();
          return <Tabs classes={{ root: isMobile ? 'compact' : 'wide' }} />;
        }
      `,
      errors: [callError('useMobile call', 6)],
    },
    // Spreading the branch into sx still lands in sx
    {
      code: `
        import Box from '@mui/material/Box';
        import { useMobile } from '../hooks/useMobile';

        const COMPACT = { display: 'grid' };
        const WIDE = { display: 'flex' };

        function Panel() {
          const isMobile = useMobile();
          return <Box sx={{ ...(isMobile ? COMPACT : WIDE) }} />;
        }
      `,
      errors: [callError('useMobile call', 9)],
    },
    // An `sx` key names a style destination wherever the object ends up
    {
      code: `
        import Box from '@mui/material/Box';
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          const props = { sx: { display: isMobile ? 'none' : 'block' } };
          return <Box {...props} />;
        }
      `,
      errors: [callError('useMobile call', 6)],
    },
    // A value the component returns is read where this rule cannot look
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        export function useIsCompact() {
          const isMobile = useMobile();
          return isMobile;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // An exported binding is read in files this rule cannot open
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        export const isMobile = useMobile();

        export function Panel() {
          return <Fade timeout={isMobile ? 0 : 300} />;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // A binding exported after the fact escapes just as far
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        const isMobile = useMobile();

        export const Panel = () => <Fade timeout={isMobile ? 0 : 300} />;

        export { isMobile };
      `,
      errors: [callError('useMobile call', 5)],
    },
    // Assigning to a binding outside the component escapes the walk, even
    // though the other read is a JS-only prop
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        let lastIsMobile = false;

        function Panel() {
          const isMobile = useMobile();
          lastIsMobile = isMobile;
          return <Fade timeout={isMobile ? 0 : 300} />;
        }
      `,
      errors: [callError('useMobile call', 8)],
    },
    // A call hides where the value goes - here it comes back out as a class
    {
      code: `
        import clsx from 'clsx';
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          const classes = clsx(isMobile && 'stack');
          return <div className={classes}>Content</div>;
        }
      `,
      errors: [callError('useMobile call', 6)],
    },
    // A spread attribute may carry any prop, style included
    {
      code: `
        import Box from '@mui/material/Box';
        import { useMobile } from '../hooks/useMobile';

        const COMPACT = { sx: { display: 'grid' } };
        const WIDE = { sx: { display: 'flex' } };

        function Panel() {
          const isMobile = useMobile();
          return <Box {...(isMobile ? COMPACT : WIDE)} />;
        }
      `,
      errors: [callError('useMobile call', 9)],
    },
    // One style read is enough, however many JS-only reads accompany it
    {
      code: `
        import Box from '@mui/material/Box';
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return (
            <Fade timeout={isMobile ? 0 : 300}>
              <Box sx={{ display: isMobile ? 'none' : 'block' }} />
            </Fade>
          );
        }
      `,
      errors: [callError('useMobile call', 7)],
    },
    // A reassignable binding may hold something else by the time a style reads it
    {
      code: `
        import Fade from '@mui/material/Fade';
        import { useMobile } from '../hooks/useMobile';

        function Reveal() {
          let isMobile = useMobile();
          return <Fade timeout={isMobile ? 0 : 300} />;
        }
      `,
      errors: [callError('useMobile call', 6)],
    },
    // A value going nowhere proves nothing, exactly as a query naming no
    // feature does
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <div>Content</div>;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // A handler body is a destination the walk does not model
    {
      code: `
        import { useMobile } from '../hooks/useMobile';

        function Panel() {
          const isMobile = useMobile();
          return <button onClick={() => track(isMobile)}>Go</button>;
        }
      `,
      errors: [callError('useMobile call', 5)],
    },
    // The destination axis does not rescue a breakpoint helper that styles
    {
      code: `
        import Box from '@mui/material/Box';
        import { useMediaQuery, useTheme } from '@mui/material';

        function Panel() {
          const theme = useTheme();
          const isSmall = useMediaQuery(theme.breakpoints.down('md'));
          return <Box sx={{ display: isSmall ? 'none' : 'block' }} />;
        }
      `,
      errors: [callError('useMediaQuery call', 7)],
    },
  ],
});
