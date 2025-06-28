import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-positive-naming-display', enforcePositiveNaming, {
  valid: [
    // Test that 'display' is not flagged as a negative term
    {
      code: `
        interface TimerProps {
          shouldDisplayTimer: boolean;
        }

        const Timer = ({ shouldDisplayTimer }: TimerProps) => {
          // Component implementation
          return shouldDisplayTimer ? <div>Timer</div> : null;
        };
      `,
      filename: 'Timer.tsx',
    },
    // Test other common technical terms containing 'dis' that should not be flagged
    {
      code: `
        function dispatchEvent(event: Event): void {
          // Implementation
        }

        const discoverFeatures = () => {
          // Implementation
        };

        interface ModalProps {
          onDismiss: () => void;
        }

        const calculateDistance = (x1: number, y1: number, x2: number, y2: number): number => {
          return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        };

        class DataDistributor {
          distribute(data: any[]): void {
            // Implementation
          }
        }
      `,
      filename: 'Utils.ts',
    },
  ],
  invalid: [
    // Verify that actual negative terms are still flagged
    {
      code: `
        const isDisabled = true;
      `,
      filename: 'Component.tsx',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
        },
      ],
    },
  ],
});
