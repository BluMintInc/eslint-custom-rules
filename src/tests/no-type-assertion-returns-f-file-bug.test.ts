import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

// This test reproduces the bug where the rule incorrectly flags explicit return type annotations
// in .f.ts files, even though similar patterns in other .f.ts files do not trigger an error.
ruleTesterTs.run('no-type-assertion-returns-f-file-bug', noTypeAssertionReturns, {
  valid: [
    // This should be valid - using a type alias for the return type in a .f.ts file
    {
      // Simulate a .f.ts file by using the code from the bug report
      code: `
      import { onCall } from '../../v2/https/onCall';
      import {
        exitChannelGroupInternal,
        ExitChannelGroupInternalProps,
      } from '../../util/messaging/channel-group/exitChannelGroupInternal';
      import {
        authenticatedOnly,
        AuthenticatedRequest,
      } from '../../util/user/assertAuthenticated';

      export type Props = Omit<ExitChannelGroupInternalProps, 'mainUserId'>;

      export type Response = Promise<void>;

      export const exitChannelGroup = async (
        request: AuthenticatedRequest<Props>,
      ): Response => {
        const { uid } = request.auth;
        return exitChannelGroupInternal({ ...request.data, mainUserId: uid });
      };

      export default onCall(authenticatedOnly(exitChannelGroup));
      `,
      filename: 'src/functions/exitChannelGroup.f.ts',
    },

    // Similar pattern in another .f.ts file (should also be valid)
    {
      code: `
      export type Response = Promise<void>;

      export const processData = async (data: any): Response => {
        // Process the data
        return Promise.resolve();
      };
      `,
      filename: 'src/functions/processData.f.ts',
    },
  ],
  invalid: [],
});
