import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    // Test case for the bug scenario - getter method with complex return type
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
  ],
  invalid: [
    // Test case with negative naming
    {
      code: `
        class BadClass {
          public get isNotValid() {
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
