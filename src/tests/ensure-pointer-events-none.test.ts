import { ruleTesterTs } from '../utils/ruleTester';
import { ensurePointerEventsNone } from '../rules/ensure-pointer-events-none';

ruleTesterTs.run('ensure-pointer-events-none', ensurePointerEventsNone, {
  valid: [
    // Valid case: pseudo-element with position: absolute and pointer-events: none
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: fixed and pointer-events: none
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: relative (not absolute/fixed)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'relative',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: static (default)
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: auto (intentional)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'auto' // Intentionally interactive
          }
        };
      `,
    },
    // Valid case: not a pseudo-element
    {
      code: `
        const style = {
          button: {
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: styled-components with pointer-events: none
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
        \`;
      `,
    },
    // Valid case: JSX style with pointer-events: none
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  ],
  invalid: [
    // Invalid case: pseudo-element with position: absolute but no pointer-events
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [{ messageId: 'missingPointerEventsNone' }],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: fixed but no pointer-events
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0
          }
        };
      `,
      errors: [{ messageId: 'missingPointerEventsNone' }],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: styled-components without pointer-events
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
          }
        \`;
      `,
      errors: [{ messageId: 'missingPointerEventsNone' }],
    },
    // Invalid case: JSX style without pointer-events
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [{ messageId: 'missingPointerEventsNone' }],
      output: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }} />
        );
      `,
    },
  ],
});
