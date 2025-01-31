import { ruleTesterTs } from '../utils/ruleTester';
import { requireHooksDefaultParams } from '../rules/require-hooks-default-params';

ruleTesterTs.run('require-hooks-default-params', requireHooksDefaultParams, {
  valid: [
    // Already has default empty object
    {
      code: `
        export const useLivestreamPlayer = ({ placeholder, playbackId }: { placeholder?: ReactNode; playbackId?: string } = {}) => {
          return null;
        };
      `,
    },
    // Has required properties, should not enforce default
    {
      code: `
        export const usePlayer = ({ playbackId, placeholder }: { playbackId: string; placeholder?: ReactNode }) => {
          return null;
        };
      `,
    },
    // Multiple parameters, should not enforce default
    {
      code: `
        export const useLivestreamPlayer = (
          { placeholder, playbackId }: { placeholder?: ReactNode; playbackId?: string },
          extraParam: boolean
        ) => {
          return null;
        };
      `,
    },
    // Not a hook function
    {
      code: `
        export const configure = ({ theme, mode }: { theme?: string; mode?: string }) => {
          return null;
        };
      `,
    },
  ],
  invalid: [
    // Missing default empty object for hook with all optional params
    {
      code: `
        export const useLivestreamPlayer = ({ placeholder, playbackId }: { placeholder?: ReactNode; playbackId?: string }) => {
          return null;
        };
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        export const useLivestreamPlayer = ({ placeholder, playbackId }: { placeholder?: ReactNode; playbackId?: string } = {}) => {
          return null;
        };
      `,
    },
    // Function declaration style
    {
      code: `
        export function useData({ url, options }: { url?: string; options?: object }) {
          return null;
        }
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        export function useData({ url, options }: { url?: string; options?: object } = {}) {
          return null;
        }
      `,
    },
  ],
});
