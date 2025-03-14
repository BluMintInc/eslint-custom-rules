import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

// This test specifically tests the exact example from the bug report
ruleTesterTs.run('enforce-positive-naming-bug-report', enforcePositiveNaming, {
  valid: [
    {
      code: `
        export type PulsateProps = {
          children: ReactNode;
          /**
           * This is the offending code
           */
          pulsate: boolean;
          opacityRange?: [number, number];
          color?: string;
          durationMs?: number;
          iterations?: number | 'infinite';
          style?: CSSProperties;
          spacing?: number;
        };
      `,
      filename: 'test.tsx',
    },
  ],
  invalid: [],
});
