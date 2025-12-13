import { enforceCallableTypes } from '../rules/enforce-callable-types';
import { ruleTesterTs } from '../utils/ruleTester';

const ruleTester = ruleTesterTs;
const messages = enforceCallableTypes.meta.messages;
const missingPropsError = { messageId: 'missingPropsType' } as const;
const missingResponseError = { messageId: 'missingResponseType' } as const;
const unusedPropsError = { messageId: 'unusedPropsType' } as const;
const unusedResponseError = { messageId: 'unusedResponseType' } as const;

describe('enforce-callable-types messages', () => {
  it('provides actionable guidance', () => {
    expect(messages).toEqual({
      missingPropsType:
        'Callable functions must export a Props type to describe the request payload. Without Props the callable accepts any data and loses compile-time validation; export `type Props = { ... }` and use it in `CallableRequest<Props>` so request.data stays typed.',
      missingResponseType:
        'Callable functions must export a Response type to document what the function returns. Without Response the callable can return any shape and break clients; export `type Response = ...` and return that shape from the handler.',
      unusedPropsType:
        'Props is exported but never used in the onCall handler. An unused Props type lets the request payload drift from the code that reads it; annotate the handler parameter as `CallableRequest<Props>` or remove Props if the callable does not accept data.',
      unusedResponseType:
        'Response is exported but never used in the callable return type. Without applying Response, the callable can return any payload and clients lose a stable contract; return Response (or Promise<Response>) from the handler or remove the unused type.',
    });
  });
});

ruleTester.run('enforce-callable-types', enforceCallableTypes, {
  valid: [
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
      // Missing Props type and unused Response type
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
      errors: [missingPropsError, unusedResponseError],
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
      errors: [missingResponseError],
    },
    {
      // Missing Props type (using Params instead)
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
      errors: [missingPropsError],
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
      errors: [unusedPropsError],
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
      errors: [unusedResponseError],
    },
  ],
});
