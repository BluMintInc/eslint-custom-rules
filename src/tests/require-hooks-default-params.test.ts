import { ruleTesterTs } from '../utils/ruleTester';
import { requireHooksDefaultParams } from '../rules/require-hooks-default-params';

const errorFor = (hookName: string) => ({
  messageId: 'requireDefaultParams' as const,
  data: { hookName },
});

ruleTesterTs.run('require-hooks-default-params', requireHooksDefaultParams, {
  valid: [
    // A required property anywhere in the enclosing-scope type keeps the
    // parameter mandatory, so widening resolution must not widen the verdict.
    {
      code: `
function outer() {
  type Opts = { a: string };
  const useThing = ({ a }: Opts) => a;
  return useThing;
}
      `,
    },
    // An imported type's shape is unknowable here; an unresolved name must not
    // be read as "all optional".
    {
      code: `
import type { Opts } from './opts';
const useThing = ({ a }: Opts) => a;
      `,
    },
    /**
     * The imported-type carve-out has to hold from every container, not just
     * from module scope. Widening the container set adds scopes to the walk;
     * none of them may turn an unreadable shape into an assumed-empty one.
     */
    {
      code: `
import type { Opts } from './opts';
class Holder {
  static {
    const useThing = ({ a }: Opts) => a;
    void useThing;
  }
}
      `,
    },
    {
      code: `
import type { Opts } from './opts';
function pick(kind: string) {
  switch (kind) {
    case 'a':
      const useThing = ({ a }: Opts) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
    },
    /**
     * A sibling scope is not an enclosing one. The walk goes outward only, so a
     * matching type inside a container the hook is not written in must stay
     * invisible — otherwise the imported type above it would be overruled by an
     * unrelated declaration and the fix would change behaviour.
     */
    {
      code: `
import type { Opts } from './opts';
class Holder {
  static {
    type Opts = { a?: string };
    void 0;
  }
}
const useThing = ({ a }: Opts) => a;
      `,
    },
    // Resolving in the added containers must not change the VERDICT: a required
    // property there keeps the parameter mandatory exactly as at module scope.
    {
      code: `
class Holder {
  static {
    type Opts = { a: string };
    const useThing = ({ a }: Opts) => a;
    void useThing;
  }
}
      `,
    },
    {
      code: `
function pick(kind: string) {
  switch (kind) {
    case 'a':
      type Opts = { a: string };
      const useThing = ({ a }: Opts) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
    },
    // Innermost declaration wins: a nearer required shape must answer for the
    // reference rather than the all-optional one it shadows.
    {
      code: `
type Opts = { a?: string };
class Holder {
  static {
    type Opts = { a: string };
    const useThing = ({ a }: Opts) => a;
    void useThing;
  }
}
      `,
    },
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
    /**
     * Type resolution walks the scope chain outward (issue #1756). Previously
     * it read `context.getScope().variables`, which is own-scope-only, and fell
     * back to scanning `Program.body` — so a type declared anywhere between the
     * hook and module scope was invisible to both paths.
     */
    {
      code: `
function outer() {
  type Opts = { a?: string };
  const useThing = ({ a }: Opts) => a;
  return useThing;
}
      `,
      output: `
function outer() {
  type Opts = { a?: string };
  const useThing = ({ a }: Opts = {}) => a;
  return useThing;
}
      `,
      errors: [errorFor('useThing')],
    },
    {
      code: `
function outer() {
  interface Opts { a?: string }
  const useThing = ({ a }: Opts) => a;
  return useThing;
}
      `,
      output: `
function outer() {
  interface Opts { a?: string }
  const useThing = ({ a }: Opts = {}) => a;
  return useThing;
}
      `,
      errors: [errorFor('useThing')],
    },
    /**
     * A same-name VALUE binding used to satisfy the own-scope lookup with a
     * non-type definition, which skipped the fallback entirely and switched the
     * rule off for that hook.
     */
    {
      code: `
type Opts = { a?: string };
function useThing({ a }: Opts) {
  const Opts = 1;
  return a + Opts;
}
      `,
      output: `
type Opts = { a?: string };
function useThing({ a }: Opts = {}) {
  const Opts = 1;
  return a + Opts;
}
      `,
      errors: [errorFor('useThing')],
    },
    // An exported declaration sits inside its `export` statement.
    {
      code: `
export type Opts = { a?: string };
const useThing = ({ a }: Opts) => a;
      `,
      output: `
export type Opts = { a?: string };
const useThing = ({ a }: Opts = {}) => a;
      `,
      errors: [errorFor('useThing')],
    },
    {
      code: `
export default interface Opts { a?: string }
const useThing = ({ a }: Opts) => a;
      `,
      output: `
export default interface Opts { a?: string }
const useThing = ({ a }: Opts = {}) => a;
      `,
      errors: [errorFor('useThing')],
    },
    /**
     * Which containers hold a declaration is not a per-rule decision (#1781).
     * A class `static {}` block and a `switch` case consequent each hold a
     * statement list, so a type written in one is in scope for a hook written
     * beside it — the same type one container over was already reported, which
     * made the DEPTH of the declaration decide whether the rule could see it.
     */
    {
      code: `
class Holder {
  static {
    type Opts = { a?: string };
    const useThing = ({ a }: Opts) => a;
    void useThing;
  }
}
      `,
      output: `
class Holder {
  static {
    type Opts = { a?: string };
    const useThing = ({ a }: Opts = {}) => a;
    void useThing;
  }
}
      `,
      errors: [errorFor('useThing')],
    },
    {
      code: `
function pick(kind: string) {
  switch (kind) {
    case 'a':
      type Opts = { a?: string };
      const useThing = ({ a }: Opts) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
      output: `
function pick(kind: string) {
  switch (kind) {
    case 'a':
      type Opts = { a?: string };
      const useThing = ({ a }: Opts = {}) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
      errors: [errorFor('useThing')],
    },
    {
      code: `
function pick(kind: string) {
  switch (kind) {
    case 'a':
      interface Opts { a?: string }
      const useThing = ({ a }: Opts) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
      output: `
function pick(kind: string) {
  switch (kind) {
    case 'a':
      interface Opts { a?: string }
      const useThing = ({ a }: Opts = {}) => a;
      return useThing;
    default:
      return null;
  }
}
      `,
      errors: [errorFor('useThing')],
    },
    // The nearest declaration answers, including one written in an added
    // container: an all-optional type in a `static {}` block shadows an outer
    // required one, so the parameter is safe to default.
    {
      code: `
type Opts = { a: string };
class Holder {
  static {
    type Opts = { a?: string };
    const useThing = ({ a }: Opts) => a;
    void useThing;
  }
}
      `,
      output: `
type Opts = { a: string };
class Holder {
  static {
    type Opts = { a?: string };
    const useThing = ({ a }: Opts = {}) => a;
    void useThing;
  }
}
      `,
      errors: [errorFor('useThing')],
    },
    // Missing default empty object for hook with all optional params
    {
      code: `
        export const useLivestreamPlayer = ({ placeholder, playbackId }: { placeholder?: ReactNode; playbackId?: string }) => {
          return null;
        };
      `,
      errors: [errorFor('useLivestreamPlayer')],
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
      errors: [errorFor('useData')],
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
      errors: [errorFor('useTheme')],
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
      errors: [errorFor('useTheme')],
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
      errors: [errorFor('useDataFetcher')],
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
      errors: [errorFor('useComplexHook')],
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
