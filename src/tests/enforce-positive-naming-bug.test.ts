import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

// Use the existing ruleTesterTs

ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    {
      code: `
        export type PulsateProps = {
          children: ReactNode;
          pulsate: boolean;
          opacityRange?: [number, number];
          color?: string;
          durationMs?: number;
          iterations?: number | 'infinite';
          style?: CSSProperties;
          spacing?: number;
          ['computed-property']: boolean;
        };
      `,
      filename: 'test.tsx',
    },
  ],
  invalid: [],
});
