import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    // Test case for the bug scenario - getter method with complex return type
    // This should be valid since it's not a boolean
    {
      code: `
        export interface GitHubIssueRequest {
          milestone: components['schemas']['issue']['milestone'];
        }

        export class DatadogGitHubIssue implements GitHubIssueRequest {
          private payload: any;

          public get milestone(): components['schemas']['issue']['milestone'] {
            return this.payload && null;
          }
        }
      `,
    },
    // Regular valid case
    {
      code: `
        class GoodClass {
          public get validProperty() {
            return true;
          }
        }
      `,
    },
    // Non-boolean property with negative-sounding name should be valid
    {
      code: `
        class ErrorHandler {
          public get errorMessages(): string[] {
            return this.errors.map(e => e.message);
          }
        }
      `,
    },
  ],
  invalid: [
    // Test case with boolean negative naming
    {
      code: `
        class BadClass {
          public get isNotValid(): boolean {
            return false;
          }
        }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
        },
      ],
    },
  ],
});
