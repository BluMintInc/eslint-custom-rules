import { ruleTesterTs } from '../utils/ruleTester';
import { preferUnionFromConstArray } from '../rules/prefer-union-from-const-array';
import { preferTypeAliasOverTypeofConstant } from '../rules/prefer-type-alias-over-typeof-constant';

ruleTesterTs.run('prefer-union-from-const-array', preferUnionFromConstArray, {
  valid: [
    // Inline parameter annotation — not a named alias (Edge Case 1)
    `function sortRows(direction: 'asc' | 'desc') { return direction; }`,
    // Inline property annotation inside an object type (Edge Case 1)
    `type SortState = { direction: 'asc' | 'desc'; column: string };`,
    // Inline return-type annotation
    `function pick(): 'a' | 'b' { return 'a'; }`,
    // Numeric-literal union — out of scope in v1 (Edge Case 2)
    `type HttpStatus = 200 | 404 | 500;`,
    // String literals mixed with null (Edge Case 2)
    `type MaybeMode = 'arena' | 'studio' | null;`,
    // String literals mixed with undefined (Edge Case 2)
    `type OptionalTone = 'active' | 'warning' | undefined;`,
    // String literal mixed with the `string` primitive (Edge Case 2)
    `type Loose = 'exact' | string;`,
    // Boolean-literal union — booleans are not string literals
    `type Flag = true | false;`,
    // Template-literal-type union — not plain string literals (Edge Case 2)
    'type Templated = `a-${string}` | `b-${string}`;',
    // Discriminated union: kinds are single literals on object types, and the
    // result union members are type references (Edge Case 5)
    `type Success<T> = { kind: 'success'; data: T };
type Failure<E> = { kind: 'failure'; error: E };
type Result<T, E> = Success<T> | Failure<E>;`,
    // Indexed-access over an ambient type — no syntactic union (Edge Case 6)
    `type Environment = NodeJS.ProcessEnv['NODE_ENV'];`,
    // Alias of an imported union we don't own (Edge Case 6)
    `import type { ChannelType } from 'stream-chat';
type ChatChannelKind = ChannelType;`,
    // Indexed access into imported prop types (Edge Case 6/7)
    `import type { ButtonProps } from '@mui/material';
type MirroredVariant = NonNullable<ButtonProps['variant']>;`,
    // The rule's own fix-output shape must not re-fire (Edge Case 3)
    `export const EVENT_TYPES = ['Tournament', 'Giveaway'] as const;
export type EventType = (typeof EVENT_TYPES)[number];`,
    // Derived form with a Readonly wrapper (Edge Case 3)
    `export type GlobalStrategies = Readonly<(typeof GLOBAL_STRATEGIES)[number][]>;`,
    // Single-member string-literal alias — not a multi-member union (Edge Case 4/5)
    `type Kind = 'success';`,
    // Idempotence: the fixer output of an invalid case, run back through, must
    // not re-report.
    `const DIRECTION_VALUES = ['asc', 'desc'] as const;
type Direction = (typeof DIRECTION_VALUES)[number];`,
    // Union of type references (not literals)
    `type Shape = Circle | Square;`,
    // Intersection type — not a union
    `type Combined = A & B;`,
    // REPRO #2020: an ambient `declare namespace` admits no const initializer
    // (TS1254), so there is no valid rewrite to offer.
    `declare namespace NS { export type Role = 'owner' | 'member' }
export type T = { roles: NS.Role[]; list: Array<NS.Role> };`,
    // #2020: same, over several lines and without the export modifier
    `declare namespace Access {
  type Role = 'owner' | 'member';
}`,
    // #2020: an inner namespace inherits ambience from the outer `declare`,
    // which only the OUTERMOST declaration carries
    `declare namespace Access {
  namespace Team {
    type Role = 'owner' | 'member';
  }
}`,
    // #2020: ambience survives any depth of nesting
    `declare namespace A {
  namespace B {
    namespace C {
      type Role = 'owner' | 'member';
    }
  }
}`,
    // #2020: `export declare namespace` carries the modifier on the module
    // declaration, one level under the export
    `export declare namespace NS {
  type Role = 'owner' | 'member';
}`,
    // #2020: a module augmentation is ambient
    `declare module 'stream-chat' {
  type Role = 'owner' | 'member';
}`,
    // #2020: a namespace nested inside an ambient module augmentation
    `declare module 'stream-chat' {
  namespace Team {
    type Role = 'owner' | 'member';
  }
}`,
    // #2020: a global augmentation block is ambient
    `export {};
declare global {
  type Role = 'owner' | 'member';
}`,
    // #2020: `declare` on the alias itself promises no runtime emit, and the
    // derived array is the runtime emit
    `declare type Role = 'owner' | 'member';`,
    // #2020: every declaration in a `.d.ts` is ambient even with no `declare`
    // keyword anywhere in sight
    {
      code: `export type Role = 'owner' | 'member';`,
      filename: 'src/types/roles.d.ts',
    },
    // #2020: including one nested in a plain namespace
    {
      code: `namespace Access {
  type Role = 'owner' | 'member';
}`,
      filename: 'src/types/roles.d.ts',
    },
    // #2020: the `.d.mts`/`.d.cts` declaration-file spellings are ambient too
    {
      code: `export type Role = 'owner' | 'member';`,
      filename: 'src/types/roles.d.mts',
    },
    {
      code: `export type Role = 'owner' | 'member';`,
      filename: 'src/types/roles.d.cts',
    },
  ],
  invalid: [
    // Motivating real case: exactly two members, exported (export mirroring)
    {
      code: `export type TournamentActionId = 'start' | 'contribute';`,
      output: `export const TOURNAMENT_ACTION_ID_VALUES = ['start', 'contribute'] as const;
export type TournamentActionId = (typeof TOURNAMENT_ACTION_ID_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Non-exported two-member union (single-quote preservation)
    {
      code: `type Direction = 'asc' | 'desc';`,
      output: `const DIRECTION_VALUES = ['asc', 'desc'] as const;
type Direction = (typeof DIRECTION_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // `Literal` suffix does NOT exempt (Edge Case 9)
    {
      code: `type StatusLiteral = 'active' | 'inactive';`,
      output: `const STATUS_LITERAL_VALUES = ['active', 'inactive'] as const;
type StatusLiteral = (typeof STATUS_LITERAL_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Three-plus member union
    {
      code: `type ChipTone = 'active' | 'warning' | 'critical' | 'neutral';`,
      output: `const CHIP_TONE_VALUES = ['active', 'warning', 'critical', 'neutral'] as const;
type ChipTone = (typeof CHIP_TONE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Leading JSDoc preserved above the generated const (Edge Case 8)
    {
      code: `/** Severity tier for auth errors surfaced to the user. */
export type AuthErrorLevel = 'warning' | 'error';`,
      output: `/** Severity tier for auth errors surfaced to the user. */
export const AUTH_ERROR_LEVEL_VALUES = ['warning', 'error'] as const;
export type AuthErrorLevel = (typeof AUTH_ERROR_LEVEL_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Double-quote preservation
    {
      code: `type Quoted = "a" | "b";`,
      output: `const QUOTED_VALUES = ["a", "b"] as const;
type Quoted = (typeof QUOTED_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Exported 2-member component prop union (Edge Case 4/7)
    {
      code: `export type PanelVariant = 'standard' | 'outlined';`,
      output: `export const PANEL_VARIANT_VALUES = ['standard', 'outlined'] as const;
export type PanelVariant = (typeof PANEL_VARIANT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // camelCase literal values, exported (Edge Case 4). The compact const would
    // be 83 columns, so it wraps — a two-member union is not automatically
    // short enough to stay inline.
    {
      code: `export type StreamSetupStepId = 'enableBluBot' | 'connectObs';`,
      output: `export const STREAM_SETUP_STEP_ID_VALUES = [
  'enableBluBot',
  'connectObs',
] as const;
export type StreamSetupStepId = (typeof STREAM_SETUP_STEP_ID_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Named alias mirroring an MUI variant set fires like any other (Edge Case 7)
    {
      code: `type ButtonVariant = 'contained' | 'outlined' | 'text';`,
      output: `const BUTTON_VARIANT_VALUES = ['contained', 'outlined', 'text'] as const;
type ButtonVariant = (typeof BUTTON_VARIANT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Exported real 2-member case
    {
      code: `export type VoiceChatMode = 'arena' | 'studio';`,
      output: `export const VOICE_CHAT_MODE_VALUES = ['arena', 'studio'] as const;
export type VoiceChatMode = (typeof VOICE_CHAT_MODE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Exported real 2-member case
    {
      code: `export type LiveBadgeSize = 'small' | 'medium';`,
      output: `export const LIVE_BADGE_SIZE_VALUES = ['small', 'medium'] as const;
export type LiveBadgeSize = (typeof LIVE_BADGE_SIZE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Indentation preserved for a type alias inside a function body
    {
      code: `function f() {
  type Local = 'a' | 'b';
  return null;
}`,
      output: `function f() {
  const LOCAL_VALUES = ['a', 'b'] as const;
  type Local = (typeof LOCAL_VALUES)[number];
  return null;
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Type parameters preserved on the derived alias
    {
      code: `type Wrapper<T> = 'a' | 'b';`,
      output: `const WRAPPER_VALUES = ['a', 'b'] as const;
type Wrapper<T> = (typeof WRAPPER_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // A named discriminant alias — the second untethered source of truth
    {
      code: `type ResultKind = 'success' | 'failure';`,
      output: `const RESULT_KIND_VALUES = ['success', 'failure'] as const;
type ResultKind = (typeof RESULT_KIND_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Preserves member order (out-of-alphabetical order stays as written)
    {
      code: `type Priority = 'high' | 'low' | 'medium';`,
      output: `const PRIORITY_VALUES = ['high', 'low', 'medium'] as const;
type Priority = (typeof PRIORITY_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Acronym run stays glued (simple derivation, acceptable per spec)
    {
      code: `type HTTPMethod = 'GET' | 'POST';`,
      output: `const HTTPMETHOD_VALUES = ['GET', 'POST'] as const;
type HTTPMethod = (typeof HTTPMETHOD_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // REPRO #1566: the emitted const array must wrap when the single-line form
    // would overflow the print width.
    {
      code: `export type TabsVariant =
  | 'tabs'
  | 'toggle-button'
  | 'chip'
  | 'chip-large'
  | 'underline';`,
      output: `export const TABS_VARIANT_VALUES = [
  'tabs',
  'toggle-button',
  'chip',
  'chip-large',
  'underline',
] as const;
export type TabsVariant = (typeof TABS_VARIANT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Width boundary — the emitted const is exactly 79 columns, so it stays on
    // one line.
    {
      code: `type Boundary = 'aaaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbb';`,
      output: `const BOUNDARY_VALUES = ['aaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbb'] as const;
type Boundary = (typeof BOUNDARY_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Width boundary — exactly 80 columns is still within the print width.
    {
      code: `type Boundary = 'aaaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbbb';`,
      output: `const BOUNDARY_VALUES = ['aaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbb'] as const;
type Boundary = (typeof BOUNDARY_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Width boundary — 81 columns overflows by one, so the array breaks open.
    {
      code: `type Boundary = 'aaaaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbbb';`,
      output: `const BOUNDARY_VALUES = [
  'aaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbb',
] as const;
type Boundary = (typeof BOUNDARY_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Indentation counts toward the width: this const is 78 columns at column
    // zero but 80 at the declaration's own indent, so it still fits.
    {
      code: `namespace Ui {
  type Boundary = 'aaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbb';
}`,
      output: `namespace Ui {
  const BOUNDARY_VALUES = ['aaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbb'] as const;
  type Boundary = (typeof BOUNDARY_VALUES)[number];
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // The same const is 80 columns at column zero — within the width — yet 82
    // at indent 2, so a nested declaration wraps where a top-level one would
    // not, and it wraps at its own indentation rather than at column zero.
    {
      code: `namespace Ui {
  type Boundary = 'aaaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbbb';
}`,
      output: `namespace Ui {
  const BOUNDARY_VALUES = [
    'aaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbb',
  ] as const;
  type Boundary = (typeof BOUNDARY_VALUES)[number];
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // The emitted lines use the file's own indent unit, not a hardcoded two
    // spaces.
    {
      code: `function outer() {
    function inner() {
        return 1;
    }
    type Palette = 'primaryFill' | 'secondaryFill' | 'tertiaryFill' | 'quaternaryFill';
    return inner;
}`,
      output: `function outer() {
    function inner() {
        return 1;
    }
    const PALETTE_VALUES = [
        'primaryFill',
        'secondaryFill',
        'tertiaryFill',
        'quaternaryFill',
    ] as const;
    type Palette = (typeof PALETTE_VALUES)[number];
    return inner;
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // A block comment whose body carries no leading asterisks — commented-out
    // code — must not contribute its indentation to the census (issue #1577).
    // The old leading-`*` heuristic read a 3-space step out of this body.
    {
      code: `/*
const legacy = () => {
   one();
      two();
};
*/
function outer() {
  type Palette = 'primaryFill' | 'secondaryFill' | 'tertiaryFill' | 'quaternaryFill';
}`,
      output: `/*
const legacy = () => {
   one();
      two();
};
*/
function outer() {
  const PALETTE_VALUES = [
    'primaryFill',
    'secondaryFill',
    'tertiaryFill',
    'quaternaryFill',
  ] as const;
  type Palette = (typeof PALETTE_VALUES)[number];
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Tab-indented file: the wrap uses a tab as its nesting step.
    {
      code: `function outer() {
\tfunction inner() {
\t\treturn 1;
\t}
\ttype Palette = 'primaryFill' | 'secondaryFill' | 'tertiaryFill' | 'quaternaryFill';
}`,
      output: `function outer() {
\tfunction inner() {
\t\treturn 1;
\t}
\tconst PALETTE_VALUES = [
\t\t'primaryFill',
\t\t'secondaryFill',
\t\t'tertiaryFill',
\t\t'quaternaryFill',
\t] as const;
\ttype Palette = (typeof PALETTE_VALUES)[number];
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // The derived alias overflows on its own when the type name is long, even
    // though the const array fits; Prettier breaks such an alias after the `=`.
    {
      code: `type CreateOffchainTokenLaunchContext = 'a' | 'b';`,
      output: `const CREATE_OFFCHAIN_TOKEN_LAUNCH_CONTEXT_VALUES = ['a', 'b'] as const;
type CreateOffchainTokenLaunchContext =
  (typeof CREATE_OFFCHAIN_TOKEN_LAUNCH_CONTEXT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Real agora shape (EventIsLiveDialogBody.tsx): both emitted lines overflow.
    {
      code: `export type EventIsLiveDialogBodyVariant =
  | 'successWithoutBlubot'
  | 'successWithBlubot';`,
      output: `export const EVENT_IS_LIVE_DIALOG_BODY_VARIANT_VALUES = [
  'successWithoutBlubot',
  'successWithBlubot',
] as const;
export type EventIsLiveDialogBodyVariant =
  (typeof EVENT_IS_LIVE_DIALOG_BODY_VARIANT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Type parameters survive a wrapped emission
    {
      code: `type Wrapper<T> = 'aaaaaaaaaaaaaaaaaaaaaa' | 'bbbbbbbbbbbbbbbbbbbbbb' | 'cc';`,
      output: `const WRAPPER_VALUES = [
  'aaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbb',
  'cc',
] as const;
type Wrapper<T> = (typeof WRAPPER_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // A leading JSDoc still sits above the generated const when it wraps
    {
      code: `/** Severity tier for auth errors surfaced to the user. */
export type AuthErrorLevel = 'warningLevelOne' | 'warningLevelTwo' | 'errorLevel';`,
      output: `/** Severity tier for auth errors surfaced to the user. */
export const AUTH_ERROR_LEVEL_VALUES = [
  'warningLevelOne',
  'warningLevelTwo',
  'errorLevel',
] as const;
export type AuthErrorLevel = (typeof AUTH_ERROR_LEVEL_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Double quotes are preserved through a wrap
    {
      code: `type Quoted = "aaaaaaaaaaaaaaaaaaaaaaaaa" | "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";`,
      output: `const QUOTED_VALUES = [
  "aaaaaaaaaaaaaaaaaaaaaaaaa",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
] as const;
type Quoted = (typeof QUOTED_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // A literal written with a backslash line continuation can never sit on one
    // line, so the array breaks open regardless of width — and the raw text is
    // reproduced verbatim, so the newline it carries as string DATA (and the
    // column the closing quote sits at) is untouched.
    {
      code: `type Weird = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\
' | 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';`,
      output: `const WEIRD_VALUES = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\
',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
] as const;
type Weird = (typeof WEIRD_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // The same, short enough that the compact form would fit: Prettier breaks
    // any array holding a multi-line literal, so width does not enter into it.
    {
      code: `type Weird = 'a\\
' | 'b';`,
      output: `const WEIRD_VALUES = [
  'a\\
',
  'b',
] as const;
type Weird = (typeof WEIRD_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // `printWidth` raised: a 105-column const the default would wrap stays on
    // one line.
    {
      code: `export type TabsVariant =
  | 'tabs'
  | 'toggle-button'
  | 'chip'
  | 'chip-large'
  | 'underline';`,
      options: [{ printWidth: 120 }],
      output: `export const TABS_VARIANT_VALUES = ['tabs', 'toggle-button', 'chip', 'chip-large', 'underline'] as const;
export type TabsVariant = (typeof TABS_VARIANT_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // `printWidth` lowered: a 49-column const the default keeps inline wraps.
    {
      code: `type Direction = 'asc' | 'desc';`,
      options: [{ printWidth: 40 }],
      output: `const DIRECTION_VALUES = [
  'asc',
  'desc',
] as const;
type Direction =
  (typeof DIRECTION_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Realistically shaped module (agora `src/util/credentialFormatValidation.ts`):
    // the whole file must come out formatted, not just the snippet.
    {
      code: `const passwordWhitelistRegex = /^[A-Za-z0-9]*$/;
const defaultMinLength = 8;

export function cleanPassword(password: string): string {
  return password.trim();
}

export type PasswordFailureReason =
  | 'needsLowercase'
  | 'needsUppercase'
  | 'needsNumber'
  | 'needsSymbol'
  | 'tooShort'
  | 'tooLong'
  | 'blacklistedChar';

export function getPasswordFailures(
  password: string,
  minLength: number = defaultMinLength,
): PasswordFailureReason[] {
  const passwordFailures: PasswordFailureReason[] = [];
  if (!passwordWhitelistRegex.test(password)) {
    passwordFailures.push('blacklistedChar');
  }
  if (password.length < minLength) {
    passwordFailures.push('tooShort');
  }
  return passwordFailures;
}`,
      output: `const passwordWhitelistRegex = /^[A-Za-z0-9]*$/;
const defaultMinLength = 8;

export function cleanPassword(password: string): string {
  return password.trim();
}

export const PASSWORD_FAILURE_REASON_VALUES = [
  'needsLowercase',
  'needsUppercase',
  'needsNumber',
  'needsSymbol',
  'tooShort',
  'tooLong',
  'blacklistedChar',
] as const;
export type PasswordFailureReason =
  (typeof PASSWORD_FAILURE_REASON_VALUES)[number];

export function getPasswordFailures(
  password: string,
  minLength: number = defaultMinLength,
): PasswordFailureReason[] {
  const passwordFailures: PasswordFailureReason[] = [];
  if (!passwordWhitelistRegex.test(password)) {
    passwordFailures.push('blacklistedChar');
  }
  if (password.length < minLength) {
    passwordFailures.push('tooShort');
  }
  return passwordFailures;
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // #2020 counterpart: a plain `namespace` in a `.ts` file is NOT ambient, so
    // a const array is legal there and the union is still rewritten.
    {
      code: `namespace Access {
  type Role = 'owner' | 'member';
}`,
      output: `namespace Access {
  const ROLE_VALUES = ['owner', 'member'] as const;
  type Role = (typeof ROLE_VALUES)[number];
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // #2020 counterpart: nested plain namespaces stay non-ambient
    {
      code: `namespace Access {
  namespace Team {
    type Role = 'owner' | 'member';
  }
}`,
      output: `namespace Access {
  namespace Team {
    const ROLE_VALUES = ['owner', 'member'] as const;
    type Role = (typeof ROLE_VALUES)[number];
  }
}`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // #2020 counterpart: an alias OUTSIDE the ambient block is still rewritten,
    // so the carve-out is keyed on the alias's own ancestry, not on the file
    // containing a `declare` anywhere.
    {
      code: `declare namespace NS {
  type Ignored = 'x' | 'y';
}
type Role = 'owner' | 'member';`,
      output: `declare namespace NS {
  type Ignored = 'x' | 'y';
}
const ROLE_VALUES = ['owner', 'member'] as const;
type Role = (typeof ROLE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // #2020 counterpart: an ambient VALUE declaration elsewhere in the file
    // does not make the module scope ambient.
    {
      code: `declare const version: string;
type Role = 'owner' | 'member';`,
      output: `declare const version: string;
const ROLE_VALUES = ['owner', 'member'] as const;
type Role = (typeof ROLE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // #2020 counterpart: an ordinary `.ts` file whose name merely resembles a
    // declaration file is a normal module.
    {
      code: `export type Role = 'owner' | 'member';`,
      filename: 'src/types/roles.ts',
      output: `export const ROLE_VALUES = ['owner', 'member'] as const;
export type Role = (typeof ROLE_VALUES)[number];`,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
    // Duplicate array + union pair: union still flagged, but fix SKIPPED
    // because `WEIGHT_CLASS_VALUES` already exists (collision guard, Edge Case 10)
    {
      code: `type WeightClass = 'light' | 'middle' | 'heavy';
const WEIGHT_CLASS_VALUES = ['light', 'middle', 'heavy'] as const;`,
      output: null,
      errors: [{ messageId: 'preferDerivedUnion' }],
    },
  ],
});

// Cross-rule compatibility: the derived output shape this rule produces is
// exempt under `prefer-type-alias-over-typeof-constant` (BluMintInc/eslint-custom-rules#1175).
ruleTesterTs.run(
  'prefer-union-from-const-array (compat: prefer-type-alias-over-typeof-constant)',
  preferTypeAliasOverTypeofConstant,
  {
    valid: [
      `export const EVENT_TYPES = ['Tournament', 'Giveaway'] as const;
export type EventType = (typeof EVENT_TYPES)[number];`,
      `const DIRECTION_VALUES = ['asc', 'desc'] as const;
type Direction = (typeof DIRECTION_VALUES)[number];`,
    ],
    invalid: [],
  },
);
