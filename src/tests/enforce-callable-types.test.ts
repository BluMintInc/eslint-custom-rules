import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCallableTypes } from '../rules/enforce-callable-types';

const ruleTester = ruleTesterTs;

ruleTester.run('enforce-callable-types', enforceCallableTypes, {
  valid: [
    {
      // Valid case with both types exported and used
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Params = {
          userId: string;
        };

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async (request: CallableRequest<Params>): Promise<Response> => {
          const { userId } = request.data;
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
    },
    {
      // Valid case with void response
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Params = {
          userId: string;
        };

        export type Response = void;

        const myCallableFunction = async (request: CallableRequest<Params>): Promise<Response> => {
          const { userId } = request.data;
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
    },
    {
      // Non-callable file should be ignored
      code: `
        export const helper = () => {
          return true;
        };
      `,
      filename: 'src/utils/helper.ts',
    },
  ],
  invalid: [
    {
      // Missing Params type and unused Response type
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async () => {
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
      errors: [
        { messageId: 'missingParamsType' },
        { messageId: 'unusedResponseType' }
      ],
    },
    {
      // Missing Response type
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Params = {
          userId: string;
        };

        const myCallableFunction = async (request: CallableRequest<Params>) => {
          const { userId } = request.data;
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
      errors: [{ messageId: 'missingResponseType' }],
    },
    {
      // Unused Params type
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Params = {
          userId: string;
        };

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async (): Promise<Response> => {
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
      errors: [{ messageId: 'unusedParamsType' }],
    },
    {
      // Unused Response type
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Params = {
          userId: string;
        };

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async (request: CallableRequest<Params>) => {
          const { userId } = request.data;
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
      errors: [{ messageId: 'unusedResponseType' }],
    },
  ],
});
