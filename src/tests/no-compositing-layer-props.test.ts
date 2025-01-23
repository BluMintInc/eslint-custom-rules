import { ruleTesterTs } from '../utils/ruleTester';
import { noCompositingLayerProps } from '../rules/no-compositing-layer-props';

ruleTesterTs.run('no-compositing-layer-props', noCompositingLayerProps, {
  valid: [
    // Valid inline styles
    {
      code: `
        const style = {
          backgroundColor: 'blue',
          transition: '0.15s ease-out all',
        };
      `,
    },
    // Valid opacity values
    {
      code: `
        const style = {
          opacity: 1,
        };
      `,
    },
    {
      code: `
        const style = {
          opacity: 0,
        };
      `,
    },
    // Valid JSX styles
    {
      code: `
        const Component = () => (
          <div style={{
            backgroundColor: 'blue',
            marginTop: '10px',
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
    // Invalid inline styles
    {
      code: `
        const style = {
          filter: 'brightness(110%)',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          backdropFilter: 'blur(10px)',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          transform: 'translate3d(0, 0, 0)',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          willChange: 'transform',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          perspective: '1000px',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          backfaceVisibility: 'hidden',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          mixBlendMode: 'multiply',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    {
      code: `
        const style = {
          backgroundColor: 'transparent',
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // Invalid fractional opacity
    {
      code: `
        const style = {
          opacity: 0.99,
        };
      `,
      errors: [{ messageId: 'compositingLayer' }],
    },
    // Invalid JSX styles
    {
      code: `
        const Component = () => (
          <div style={{
            filter: 'brightness(110%)',
            transform: 'translate3d(0, 0, 0)',
          }} />
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
      ],
    },
  ],
});
