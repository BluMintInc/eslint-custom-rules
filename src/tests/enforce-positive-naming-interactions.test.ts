import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run(
  'enforce-positive-naming-interactions',
  enforcePositiveNaming,
  {
    valid: [
      // Valid cases with "interactions" in the name
      'const isInteractionsShown = true;',
      'const hasInteractionsEnabled = true;',
      'const canInteractionsBeDisplayed = true;',
      'function isInteractionsVisible() { return true; }',
      `
    interface MessageContextProps {
      isInteractionsShown: boolean;
    }
    `,
      `
    type MessageContextProps = {
      isInteractionsShown: boolean;
      hasInteractionsEnabled: boolean;
    };
    `,
      `
    class InteractionsManager {
      isInteractionsEnabled(): boolean {
        return true;
      }
    }
    `,
    ],
    invalid: [],
  },
);
