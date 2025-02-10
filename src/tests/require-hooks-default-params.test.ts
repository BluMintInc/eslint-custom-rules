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
    // Using type alias with all optional properties
    {
      code: `
        type Options = {
          theme?: string;
          mode?: string;
        };
        export const useTheme = ({ theme, mode }: Options = {}) => {
          return null;
        };
      `,
    },
    // Using interface with all optional properties
    {
      code: `
        interface Options {
          theme?: string;
          mode?: string;
        }
        export const useTheme = ({ theme, mode }: Options = {}) => {
          return null;
        };
      `,
    },
    // Generic hook with default params
    {
      code: `
        export function useDataFetcher<T>({ url, options }: { url?: string; options?: T } = {}) {
          return null;
        }
      `,
    },
    // Default value is a constant
    {
      code: `
        const DEFAULT_PARAMS = {};
        export const useConfig = ({ theme, mode }: { theme?: string; mode?: string } = DEFAULT_PARAMS) => {
          return null;
        };
      `,
    },
    // Non-hook function with optional params (should be ignored)
    {
      code: `
        export const processData = ({ data, format }: { data?: any; format?: string }) => {
          return null;
        };
      `,
    },
    // Hook with non-object parameter (should be ignored)
    {
      code: `
        export const useValue = (value?: string) => {
          return null;
        };
      `,
    },
    // Hook with type imported from another module (should be ignored if has required params)
    {
      code: `
        import { UseUnseenParams } from '../types';
        export const useUnseen = ({ identifier, action }: UseUnseenParams) => {
          return null;
        };
      `,
    },
    // Hook with all required fields
    {
      code: `
        export type UseUnseenParams = {
          identifier: string;
          action: () => void;
        };
        export const useUnseen = ({ identifier, action }: UseUnseenParams) => {
          return null;
        };
      `,
    },
    // Hook with mixed required and optional properties (should be ignored)
    {
      code: `
        export const usePlayer = ({ id, volume, muted }: { id: string; volume?: number; muted?: boolean }) => {
          return null;
        };
      `,
    },
    // Hook with complex type having all optional nested properties
    {
      code: `
        type ComplexOptions = {
          config?: {
            theme?: string;
            mode?: string;
          };
          callbacks?: {
            onSuccess?: () => void;
            onError?: () => void;
          };
        };
        export const useComplexHook = ({ config, callbacks }: ComplexOptions = {}) => {
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
    // Using type alias without default
    {
      code: `
        type Options = {
          theme?: string;
          mode?: string;
        };
        export const useTheme = ({ theme, mode }: Options) => {
          return null;
        };
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        type Options = {
          theme?: string;
          mode?: string;
        };
        export const useTheme = ({ theme, mode }: Options = {}) => {
          return null;
        };
      `,
    },
    // Using interface without default
    {
      code: `
        interface Options {
          theme?: string;
          mode?: string;
        }
        export const useTheme = ({ theme, mode }: Options) => {
          return null;
        };
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        interface Options {
          theme?: string;
          mode?: string;
        }
        export const useTheme = ({ theme, mode }: Options = {}) => {
          return null;
        };
      `,
    },
    // Generic hook without default params
    {
      code: `
        export function useDataFetcher<T>({ url, options }: { url?: string; options?: T }) {
          return null;
        }
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        export function useDataFetcher<T>({ url, options }: { url?: string; options?: T } = {}) {
          return null;
        }
      `,
    },
    // Complex type with all optional properties but no default
    {
      code: `
        type ComplexOptions = {
          config?: {
            theme?: string;
            mode?: string;
          };
          callbacks?: {
            onSuccess?: () => void;
            onError?: () => void;
          };
        };
        export const useComplexHook = ({ config, callbacks }: ComplexOptions) => {
          return null;
        };
      `,
      errors: [{ messageId: 'requireDefaultParams' }],
      output: `
        type ComplexOptions = {
          config?: {
            theme?: string;
            mode?: string;
          };
          callbacks?: {
            onSuccess?: () => void;
            onError?: () => void;
          };
        };
        export const useComplexHook = ({ config, callbacks }: ComplexOptions = {}) => {
          return null;
        };
      `,
    },
  ],
});
