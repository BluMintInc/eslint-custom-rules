import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIsPrefixValidators } from '../rules/enforce-is-prefix-validators';

// All tests that target a validators file use filename: to exercise path matching.
const VALIDATORS_FILE = 'src/util/edit/validators/string/isEmail.ts';
// Issue #1269: Windows backslash form of a validators-directory path.
const WINDOWS_VALIDATORS_FILE =
  'C:\\repo\\src\\util\\edit\\validators\\string\\isEmail.ts';
// A Windows path outside the validators directory (rule must not apply).
const WINDOWS_NON_VALIDATORS_FILE = 'C:\\repo\\src\\util\\string\\helpers.ts';
const NON_VALIDATORS_FILE = 'src/util/helpers/formatters.ts';
const TEST_FILE = 'src/util/edit/validators/string/isEmail.test.ts';

ruleTesterTs.run('enforce-is-prefix-validators', enforceIsPrefixValidators, {
  valid: [
    // ── Compliant `is` prefix exports ───────────────────────────────────────

    // Standard is-prefix arrow function validator
    {
      filename: VALIDATORS_FILE,
      code: `export const isEmail = (value: string) => { return true; };`,
    },

    // is-prefix function declaration
    {
      filename: VALIDATORS_FILE,
      code: `export function isPositive(value: number) { return value > 0 || 'Must be positive'; }`,
    },

    // is-prefix derived validator (factory call result)
    {
      filename: VALIDATORS_FILE,
      code: `export const isNotEmpty = isOverMinLength(0);`,
    },

    // is-prefix composed via ValidatorPipeline
    {
      filename: VALIDATORS_FILE,
      code: `export const isUrl = ValidatorPipeline.start(isTrimmed).add(isUrlCore).buildCombinedValidator();`,
    },

    // ── Allowed alternative predicate prefixes ───────────────────────────────

    // `not` prefix — negative predicate validator
    {
      filename: VALIDATORS_FILE,
      code: `export const notContainsUrl = (value: string) => { return true; };`,
    },

    // `are` prefix — plural predicate validator
    {
      filename: VALIDATORS_FILE,
      code: `export const areBothPositiveIntegers = (value: { min: number; max: number }) => { return true; };`,
    },

    // ── Non-function constants are exempt ────────────────────────────────────

    // Constant string error message — not a validator function
    {
      filename: VALIDATORS_FILE,
      code: `export const ERROR_NOT_INTEGER = 'Value must be an integer' as const;`,
    },

    // Regex constant
    {
      filename: VALIDATORS_FILE,
      code: `export const EMAIL_REGEX = /^[\\w%+.-]+@[\\d.A-Za-z-]+\\.[A-Za-z]{2,}$/;`,
    },

    // Numeric constant
    {
      filename: VALIDATORS_FILE,
      code: `export const MAX_DESCRIPTION_LENGTH = 5000 as const;`,
    },

    // Object literal constant
    {
      filename: VALIDATORS_FILE,
      code: `export const DEFAULT_SETTINGS = { strict: true } as const;`,
    },

    // Array literal constant
    {
      filename: VALIDATORS_FILE,
      code: `export const ALLOWED_TYPES = ['string', 'number'] as const;`,
    },

    // Boolean literal constant
    {
      filename: VALIDATORS_FILE,
      code: `export const FEATURE_ENABLED = true;`,
    },

    // ── Infrastructure exports are exempt ────────────────────────────────────

    // PascalCase class export (ValidatorPipeline)
    {
      filename: VALIDATORS_FILE,
      code: `export class ValidatorPipeline<TValue> { static start() {} }`,
    },

    // Type alias export — must never be flagged
    {
      filename: VALIDATORS_FILE,
      code: `export type Validate<T> = (value?: T) => true | string;`,
    },

    // Interface export — must never be flagged
    {
      filename: VALIDATORS_FILE,
      code: `export interface ValidatorOptions { strict: boolean; }`,
    },

    // Name in excludeNames default list
    {
      filename: VALIDATORS_FILE,
      code: `export const ValidatorFactory = () => {};`,
    },

    // ── Non-exported helpers are exempt regardless of name ───────────────────

    // Private helper with disallowed prefix — no export keyword
    {
      filename: VALIDATORS_FILE,
      code: `const validateHelper = (value: string) => { return true; };`,
    },

    // Private helper with check prefix
    {
      filename: VALIDATORS_FILE,
      code: `const checkFormat = (value: string) => { return true; };`,
    },

    // Private helper with any prefix
    {
      filename: VALIDATORS_FILE,
      code: `const parseAmount = (value: string) => parseFloat(value);`,
    },

    // ── Files outside the target path are entirely exempt ────────────────────

    // Disallowed prefix but outside validators/ directory
    {
      filename: NON_VALIDATORS_FILE,
      code: `export const validateEmail = (value: string) => { return true; };`,
    },

    // Any export in a non-validators file
    {
      filename: NON_VALIDATORS_FILE,
      code: `export function checkFormat(value: string) { return true; }`,
    },

    // ── Test files inside validators/ are exempt ─────────────────────────────
    {
      filename: TEST_FILE,
      code: `export const validateSomething = (v: string) => true;`,
    },

    // ── Re-exports from external sources are exempt ──────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export { validateExternal } from './external-lib';`,
    },

    // ── is-prefix factory that returns a curried validator ───────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const isDecreaseOnly = (before = {}) => { return (after = {}) => true; };`,
    },

    // ── Custom allowedPrefixes option ────────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const hasMinLength = (value: string) => value.length > 0 || 'Required';`,
      options: [{ allowedPrefixes: ['is', 'has', 'not', 'are'] }],
    },

    // ── Custom excludeNames option ───────────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const catchBigInt = (value: string, onSuccess: (v: bigint) => true | string) => true;`,
      options: [
        {
          excludeNames: [
            'catchBigInt',
            ...[
              'ValidatorPipeline',
              'ValidatorFactory',
              'ValidatorFactorySync',
              'Validate',
              'ValidateSync',
            ],
          ],
        },
      ],
    },

    // Issue #1269: a Windows backslash path OUTSIDE the validators directory
    // stays exempt after separator normalization — the rule only applies to
    // validators files, so a validate-prefixed export elsewhere is not flagged.
    {
      filename: WINDOWS_NON_VALIDATORS_FILE,
      code: `export const validateEmail = (v: string) => true;`,
    },
  ],

  invalid: [
    // ── Disallowed `validate` prefix ─────────────────────────────────────────

    // export const with arrow function using validate prefix
    {
      filename: VALIDATORS_FILE,
      code: `export const validateDecreaseOnly = (before = {}) => { return (after = {}) => true; };`,
      errors: [
        {
          messageId: 'disallowedPrefix',
          data: {
            name: 'validateDecreaseOnly',
            prefix: 'validate',
            requiredPrefix: 'is',
            suggestion: 'isDecreaseOnly',
          },
        },
      ],
    },

    // export const with arrow function using validate prefix (second example)
    {
      filename: VALIDATORS_FILE,
      code: `export const validateTokenSelection = (selection: unknown) => { return true; };`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // export function declaration with validate prefix
    {
      filename: VALIDATORS_FILE,
      code: `export function validateTokenSelection(selection: unknown) { return true; }`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Disallowed `check` prefix ─────────────────────────────────────────────

    // export const with check prefix
    {
      filename: VALIDATORS_FILE,
      code: `export const checkTokenCount = (selection: unknown) => { return true; };`,
      errors: [
        {
          messageId: 'disallowedPrefix',
          data: {
            name: 'checkTokenCount',
            prefix: 'check',
            requiredPrefix: 'is',
            suggestion: 'isTokenCount',
          },
        },
      ],
    },

    // export function with check prefix
    {
      filename: VALIDATORS_FILE,
      code: `export function checkFormat(value: string) { return value.length > 0 || 'Required'; }`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Disallowed `verify` prefix ────────────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const verifyEmail = (value: string) => { return true; };`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Disallowed `ensure` prefix ────────────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const ensureNonEmpty = (value: string) => { return true; };`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Missing allowed prefix entirely ──────────────────────────────────────

    // Lowercase name with no recognized prefix and a callable initializer
    {
      filename: VALIDATORS_FILE,
      code: `export const emailValidator = (value: string) => { return true; };`,
      errors: [
        {
          messageId: 'missingRequiredPrefix',
          data: {
            name: 'emailValidator',
            requiredPrefix: 'is',
            suggestion: 'isEmailValidator',
          },
        },
      ],
    },

    // export function with no recognized prefix
    {
      filename: VALIDATORS_FILE,
      code: `export function positiveCheck(value: number) { return value > 0 || 'Must be positive'; }`,
      errors: [{ messageId: 'missingRequiredPrefix' }],
    },

    // ── `export { localName }` specifier-style re-export of local name ────────
    {
      filename: VALIDATORS_FILE,
      code: `
const validateX = (v: unknown) => true;
export { validateX };
      `,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Multiple violations in one file ──────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `
export const validateEmail = (v: string) => true;
export const checkPhoneNumber = (v: string) => true;
      `,
      errors: [
        { messageId: 'disallowedPrefix' },
        { messageId: 'disallowedPrefix' },
      ],
    },

    // ── Validate-prefix with ValidatorPipeline chain ──────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const validateScore = ValidatorPipeline.start(isRequired).add(isNonNegative).buildCombinedValidator();`,
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Custom targetPaths option ─────────────────────────────────────────────
    {
      filename: 'src/util/asserters/string/checkValue.ts',
      code: `export const checkValue = (v: string) => true;`,
      options: [{ targetPaths: ['**/asserters/**/*.ts'] }],
      errors: [{ messageId: 'disallowedPrefix' }],
    },

    // ── Issue #1269: Windows backslash validators path must be enforced ───────
    // Before separator normalization the `**/validators/**` glob never matched a
    // backslash path (Minimatch treats `\` as an escape), so the rule silently
    // no-op'd on Windows.
    {
      filename: WINDOWS_VALIDATORS_FILE,
      code: `export const validateEmail = (v: string) => true;`,
      errors: [
        {
          messageId: 'disallowedPrefix',
          data: {
            name: 'validateEmail',
            prefix: 'validate',
            requiredPrefix: 'is',
            suggestion: 'isEmail',
          },
        },
      ],
    },

    // ── Custom disallowedPrefixes option ──────────────────────────────────────
    {
      filename: VALIDATORS_FILE,
      code: `export const transformValue = (v: string) => v.trim();`,
      options: [
        {
          disallowedPrefixes: [
            'transform',
            'validate',
            'check',
            'verify',
            'ensure',
          ],
        },
      ],
      errors: [{ messageId: 'disallowedPrefix' }],
    },
  ],
});
