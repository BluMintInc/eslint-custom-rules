import { ruleTesterTs } from '../utils/ruleTester';
import { noCompositingLayerProps } from '../rules/no-compositing-layer-props';

const message = (property: string) =>
  `CSS property "${property}" promotes this element to its own GPU compositing layer. Extra layers allocate GPU memory and isolate painting, which slows scrolling and animation when used broadly. Remove "${property}" or keep it only when the layer promotion is intentional and documented (e.g., eslint-disable with a comment).`;

// RuleTester accepts `message`, but its typings only expose `messageId`; cast to
// any so we can assert the full string.
const error = (property: string) =>
  ({
    message: message(property),
  } as any);

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
    {
      code: `
        const style = {
          opacity: 'invalid',
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
    // Non-style objects with matching property names should be ignored
    {
      code: `
        const config = {
          transform: 'module-alias',
          filter: ['src/**/*.ts'],
          opacity: 0.5,
          perspective: 'test',
        };
      `,
    },
    // TypeScript type definitions with filter property should be ignored
    {
      code: `
        export type ListNotificationsProps = {
          status: DisplayableNotificationStatus;
          limit?: number;
          filter?: NotificationKind;
          negativeFilter?: NotificationKind;
          initialNotifications?: Notification<Date>[];
        };
      `,
    },
    {
      code: `
        interface FilterableProps {
          filter: string;
          transform: string;
          opacity: number;
        }
      `,
    },
    {
      code: `
        const jestConfig = {
          transform: {
            '^.+\\.tsx?$': 'ts-jest',
          },
          filter: ['src/**/*.ts'],
          opacity: 0.5,
          perspective: 'test',
        };
      `,
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
      errors: [error('filter')],
    },
    {
      code: `
        const style = {
          backdropFilter: 'blur(10px)',
        };
      `,
      errors: [error('backdropFilter')],
    },
    {
      code: `
        const style = {
          transform: 'translate3d(0, 0, 0)',
        };
      `,
      errors: [error('transform')],
    },
    {
      code: `
        const style = {
          willChange: 'transform',
        };
      `,
      errors: [error('willChange')],
    },
    {
      code: `
        const style = {
          perspective: '1000px',
        };
      `,
      errors: [error('perspective')],
    },
    {
      code: `
        const style = {
          backfaceVisibility: 'hidden',
        };
      `,
      errors: [error('backfaceVisibility')],
    },
    {
      code: `
        const style = {
          mixBlendMode: 'multiply',
        };
      `,
      errors: [error('mixBlendMode')],
    },
    {
      code: `
        const style = {
          backgroundColor: 'transparent',
        };
      `,
      errors: [error('backgroundColor')],
    },
    // Invalid fractional opacity
    {
      code: `
        const style = {
          opacity: 0.99,
        };
      `,
      errors: [error('opacity')],
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
        error('filter'),
        error('transform'),
      ],
    },
  ],
});
