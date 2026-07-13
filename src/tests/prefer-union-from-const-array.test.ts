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
    // camelCase literal values, exported (Edge Case 4)
    {
      code: `export type StreamSetupStepId = 'enableBluBot' | 'connectObs';`,
      output: `export const STREAM_SETUP_STEP_ID_VALUES = ['enableBluBot', 'connectObs'] as const;
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
