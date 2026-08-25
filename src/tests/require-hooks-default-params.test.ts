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
      // The appended default pushes the signature past the print width, so the
      // fix emits the pattern break prettier would otherwise make (#2132).
      output: `
        export const useLivestreamPlayer = ({
          placeholder,
          playbackId,
        }: { placeholder?: ReactNode; playbackId?: string } = {}) => {
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
        export function useData({
          url,
          options,
        }: { url?: string; options?: object } = {}) {
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
        export function useDataFetcher<T>({
          url,
          options,
        }: { url?: string; options?: T } = {}) {
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
        export const useComplexHook = ({
          config,
          callbacks,
        }: ComplexOptions = {}) => {
          return null;
        };
      `,
    },
    /**
     * The issue #2132 reproduction: the pre-image is prettier-canonical at 79
     * columns, the appended ` = {}` lands at 84, and prettier answers by
     * expanding the destructuring pattern — one property per line, trailing
     * comma, the type annotation flat on the closing line. The fix emits that
     * shape itself so its output is a prettier fixed point.
     */
    {
      code: `
export function useData({ url, options }: { url?: string; options?: object }) {
  return null;
}
      `,
      output: `
export function useData({
  url,
  options,
}: { url?: string; options?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useData')],
    },
    /**
     * The fitting boundary, flat side: the appended default lands the line at
     * exactly 80 columns (measured through the body's `{`), which prettier
     * keeps flat, so the fix must too.
     */
    {
      code: `
export function useXXXXXXXXXXXXXXXX({ a, b }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXXXXXXXXXX({ a, b }: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXXXXXXXXXX')],
    },
    /**
     * The fitting boundary, break side: one column more than the fixture above
     * lands the appended line at 81, and prettier expands the pattern.
     */
    {
      code: `
export function useXXXXXXXXXXXXXXXXX({ a, b }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXXXXXXXXXXX({
  a,
  b,
}: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXXXXXXXXXXX')],
    },
    /**
     * A trailing LINE comment never counts toward prettier's fitting decision:
     * the raw line is far past the width, but the tokens land at exactly 80
     * after the append, so the signature must stay flat.
     */
    {
      code: `
export function useXXXXXXX({ a, b }: { a?: string; b?: object }) { // this trailing note runs far beyond the print width
  return null;
}
      `,
      output: `
export function useXXXXXXX({ a, b }: { a?: string; b?: object } = {}) { // this trailing note runs far beyond the print width
  return null;
}
      `,
      errors: [errorFor('useXXXXXXX')],
    },
    /**
     * A BLOCK comment after the body's `{` does not count either — prettier
     * moves it into the body rather than measuring it — so the tokens-at-80
     * signature stays flat despite the raw line exceeding the width.
     */
    {
      code: `
export function useXXXXXXXXXXXXXXXX({ a, b }: { a?: string; b?: object }) { /* note */
  return null;
}
      `,
      output: `
export function useXXXXXXXXXXXXXXXX({ a, b }: { a?: string; b?: object } = {}) { /* note */
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXXXXXXXXXX')],
    },
    /**
     * A BLOCK comment BEFORE the body's `{` occupies columns and moves the
     * answer: without it the appended line would fit at 72, with it the line
     * lands at 83, and prettier expands the pattern while the comment rides
     * the closing line untouched.
     */
    {
      code: `
export function useXXXXXXXX({ a, b }: { a?: string; b?: object }) /* opts */ {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  a,
  b,
}: { a?: string; b?: object } = {}) /* opts */ {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * Property spans are sliced between separators, so a comment INSIDE a
     * property rides its own line — exactly where prettier keeps it.
     */
    {
      code: `
export function useXXXXXXXX({ a /* keep */, b }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  a /* keep */,
  b,
}: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * A comment in the GAP after a separator belongs to the following
     * property's slice, matching prettier's placement of the comment ahead of
     * the property on its own line.
     */
    {
      code: `
export function useXXXXXXXX({ a, /* pick */ b }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  a,
  /* pick */ b,
}: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * A comment between the last property and the close brace rides that
     * property's slice, before the comma the rebuild adds — prettier's own
     * placement.
     */
    {
      code: `
export function useXXXXXXXX({ a, b /* both */ }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  a,
  b /* both */,
}: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * A comment in the gap after the OPEN brace leads the first property's
     * slice.
     */
    {
      code: `
export function useXXXXXXXX({ /* lead */ a, b }: { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  /* lead */ a,
  b,
}: { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * A comment between the `:` and the type is part of the annotation's span,
     * carried verbatim onto the closing line.
     */
    {
      code: `
export function useXXXXXXXX({ a, b }: /* keep */ { a?: string; b?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXXXXX({
  a,
  b,
}: /* keep */ { a?: string; b?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXXXXX')],
    },
    /**
     * A comment between the pattern's `}` and the `:` is one prettier re-homes
     * to the other side of the colon — a move the fixer does not own — so the
     * break is withheld and the flat append keeps the comment in place.
     */
    {
      code: `
export function useXXX({ url, options } /* moved */: { url?: string; options?: object }) {
  return null;
}
      `,
      output: `
export function useXXX({ url, options } /* moved */: { url?: string; options?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXX')],
    },
    /**
     * An expression-bodied arrow that ends on the signature line breaks the
     * same way, with the body staying on the closing line.
     */
    {
      code: `
export const useXXX = ({ url, options }: { url?: string; options?: object }) => url;
      `,
      output: `
export const useXXX = ({
  url,
  options,
}: { url?: string; options?: object } = {}) => url;
      `,
      errors: [errorFor('useXXX')],
    },
    /**
     * A type REFERENCE stays flat on the closing line however the pattern
     * breaks; only the pattern is rebuilt.
     */
    {
      code: `
type UseDataOptions = { url?: string; options?: object; retries?: number };
export function useVeryLongHookNameForFetchingData({ url, options, retries }: UseDataOptions) {
  return null;
}
      `,
      output: `
type UseDataOptions = { url?: string; options?: object; retries?: number };
export function useVeryLongHookNameForFetchingData({
  url,
  options,
  retries,
}: UseDataOptions = {}) {
  return null;
}
      `,
      errors: [errorFor('useVeryLongHookNameForFetchingData')],
    },
    /**
     * The break aligns to the hook's own indent: properties one step in, the
     * close brace back at the statement's column (#2127 is the same lesson for
     * hoisted comments).
     */
    {
      code: `
function makeHooks() {
  function useXXXXXXXXX({ url, options }: { url?: string; options?: object }) {
    return null;
  }
  return useXXXXXXXXX;
}
      `,
      output: `
function makeHooks() {
  function useXXXXXXXXX({
    url,
    options,
  }: { url?: string; options?: object } = {}) {
    return null;
  }
  return useXXXXXXXXX;
}
      `,
      errors: [errorFor('useXXXXXXXXX')],
    },
    /**
     * A property too long for its own line is a layout only prettier can
     * settle, so the break is withheld and the flat append — the shape the
     * rule has always written — is kept.
     */
    {
      code: `
export function useConfiguredFetcher({ url = 'fallback-endpoint-path-used-when-the-caller-provides-no-url-option-value', options }: { url?: string; options?: object }) {
  return null;
}
      `,
      output: `
export function useConfiguredFetcher({ url = 'fallback-endpoint-path-used-when-the-caller-provides-no-url-option-value', options }: { url?: string; options?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useConfiguredFetcher')],
    },
    /**
     * A pattern prettier has already expanded — canonical over-width code that
     * merely lacks the default — takes the flat append on the closing line,
     * which is exactly the fixed point prettier prints.
     */
    {
      code: `
export function useData({
  url,
  options,
}: { url?: string; options?: object }) {
  return null;
}
      `,
      output: `
export function useData({
  url,
  options,
}: { url?: string; options?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useData')],
    },
    /**
     * A source-level trailing comma is a separator with no property after it:
     * the slices drop it rather than doubling it, and the emitted shape is the
     * same one prettier prints.
     */
    {
      code: `
export function useXXXXX({ url, options, }: { url?: string; options?: object }) {
  return null;
}
      `,
      output: `
export function useXXXXX({
  url,
  options,
}: { url?: string; options?: object } = {}) {
  return null;
}
      `,
      errors: [errorFor('useXXXXX')],
    },
    /**
     * An empty body keeps `{}` on the closing line, so the whole statement is
     * the measured group and the break still lands.
     */
    {
      code: `
export function useSomeVeryLongDataFetcherWithNames({ url, options }: { url?: string; options?: object }) {}
      `,
      output: `
export function useSomeVeryLongDataFetcherWithNames({
  url,
  options,
}: { url?: string; options?: object } = {}) {}
      `,
      errors: [errorFor('useSomeVeryLongDataFetcherWithNames')],
    },
    /**
     * A sibling declarator carries its own layout decisions, so a
     * multi-declarator statement is left to the flat append however wide the
     * result.
     */
    {
      code: `
function build() {
  const fallback = null, useHookish = ({ a, b }: { a?: string; b?: object }) => fallback;
  return useHookish;
}
      `,
      output: `
function build() {
  const fallback = null, useHookish = ({ a, b }: { a?: string; b?: object } = {}) => fallback;
  return useHookish;
}
      `,
      errors: [errorFor('useHookish')],
    },
    /**
     * Prettier's head-break shape: the signature line ends with `=>` and the
     * body sits below. The appended default overflows the head, prettier
     * expands the pattern — and with the head broken, the body fits the
     * closing line again, so the fix joins it there. The joined span is
     * provably whitespace-only.
     */
    {
      code: `
export const useXX = ({ url, options }: { url?: string; options?: object }) =>
  url;
      `,
      output: `
export const useXX = ({
  url,
  options,
}: { url?: string; options?: object } = {}) => url;
      `,
      errors: [errorFor('useXX')],
    },
    /**
     * The same head-break shape with a body too wide to rejoin: prettier keeps
     * the body on its own line below the expanded pattern, so the fix leaves
     * it exactly where it is.
     */
    {
      code: `
export const useXX = ({ url, options }: { url?: string; options?: object }) =>
  options ? url : 'fallback-value-used-when-the-caller-passes-only-options';
      `,
      output: `
export const useXX = ({
  url,
  options,
}: { url?: string; options?: object } = {}) =>
  options ? url : 'fallback-value-used-when-the-caller-passes-only-options';
      `,
      errors: [errorFor('useXX')],
    },
  ],
});
