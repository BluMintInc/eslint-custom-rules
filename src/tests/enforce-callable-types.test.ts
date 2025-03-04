import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCallableTypes } from '../rules/enforce-callable-types';

const ruleTester = ruleTesterTs;

ruleTester.run('enforce-callable-types', enforceCallableTypes, {
  valid: [
    {
      // Valid case with Params type exported and used
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
      // Valid case with Props type exported and used (new convention)
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Props = {
          userId: string;
        };

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async (request: CallableRequest<Props>): Promise<Response> => {
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
      // Valid case with Props type and void response
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Props = {
          userId: string;
        };

        export type Response = void;

        const myCallableFunction = async (request: CallableRequest<Props>): Promise<Response> => {
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
    {
      // Files in callable/scripts directory should be ignored
      code: `
        import { onCall } from '../../v2/https/onCall';

        export function scriptHandler(req, res) {
          return { success: true };
        }

        export default onCall(scriptHandler);
      `,
      filename: 'src/callable/scripts/example.f.ts',
    },
  ],
  invalid: [
    {
      // Missing Props/Params type and unused Response type
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
        { messageId: 'missingParamsPropsType' },
        { messageId: 'unusedResponseType' },
      ],
    },
    {
      // Missing Response type with Props
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Props = {
          userId: string;
        };

        const myCallableFunction = async (request: CallableRequest<Props>) => {
          const { userId } = request.data;
          return { success: true };
        };

        export default onCall(myCallableFunction);
      `,
      filename: 'src/callable/myFunction.f.ts',
      errors: [{ messageId: 'missingResponseType' }],
    },
    {
      // Missing Response type with Params
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
      // Unused Props type
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Props = {
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
      errors: [{ messageId: 'unusedParamsPropsType' }],
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
      errors: [{ messageId: 'unusedParamsPropsType' }],
    },
    {
      // Unused Response type with Props
      code: `
        import { onCall } from '../../v2/https/onCall';

        export type Props = {
          userId: string;
        };

        export type Response = {
          success: boolean;
        };

        const myCallableFunction = async (request: CallableRequest<Props>) => {
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
