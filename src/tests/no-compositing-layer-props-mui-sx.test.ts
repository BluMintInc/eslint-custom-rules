import { ruleTesterTs } from '../utils/ruleTester';
import { noCompositingLayerProps } from '../rules/no-compositing-layer-props';

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
  ],
});
