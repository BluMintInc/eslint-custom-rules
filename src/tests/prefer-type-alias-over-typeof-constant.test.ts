import { ruleTesterTs } from '../utils/ruleTester';
import {
  preferTypeAliasOverTypeofConstant,
  type MessageIds,
} from '../rules/prefer-type-alias-over-typeof-constant';
import type { TSESLint } from '@typescript-eslint/utils';

const preferMessage = (constName: string, suggested: string) =>
  `Type derived from same-file constant "${constName}" couples the type to its runtime value and scatters literal unions across the file. Create a named alias such as "${suggested}" and reference that alias instead of \`typeof ${constName}\` so the type stays stable even if the value changes.`;

const orderMessage = (typeName: string, constName: string) =>
  `Type alias "${typeName}" appears after constant "${constName}", which hides the shape from readers and risks using an undeclared alias. Declare "${typeName}" before "${constName}" so the type is visible where it is consumed and can be reused consistently.`;

const preferError = (
  constName: string,
  suggested: string,
): TSESLint.TestCaseError<MessageIds> =>
  ({
    message: preferMessage(constName, suggested),
  } as const as unknown as TSESLint.TestCaseError<MessageIds>);

const orderingError = (
  typeName: string,
  constName: string,
): TSESLint.TestCaseError<MessageIds> =>
  ({
    message: orderMessage(typeName, constName),
  } as const as unknown as TSESLint.TestCaseError<MessageIds>);

ruleTesterTs.run(
  'prefer-type-alias-over-typeof-constant',
  preferTypeAliasOverTypeofConstant,
  {
    valid: [
      // Good: named types and usage
      {
        code: [
          "type StatusExceeding = 'exceeding';",
          "type StatusSubceeding = 'succeeding';",
          "const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
          "const STATUS_SUBCEEDING: StatusSubceeding = 'succeeding' as const;",
          'type StatusToCheck = StatusExceeding | StatusSubceeding;',
          'function checkStatus(status: StatusToCheck) {}',
        ].join('\n'),
      },
      // Good: typeof within a type alias definition is now ALLOWED (Issue #1117)
      {
        code: [
          "export const STATUS_CHANGE = 'statusChange' as const;",
          'export type CursorStatusChangeEvent = typeof STATUS_CHANGE;',
        ].join('\n'),
      },
      // Good: union of typeof within a type alias is now ALLOWED
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          "const STATUS_SUBCEEDING = 'succeeding' as const;",
          'type StatusToCheck = typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;',
        ].join('\n'),
      },
      // Good: intersection of typeof within a type alias is now ALLOWED
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          'type T = typeof STATUS_EXCEEDING & { extra: number };',
        ].join('\n'),
      },
      // Good: mixed union within a type alias is now ALLOWED
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          "type T = typeof STATUS_EXCEEDING | 'succeeding';",
        ].join('\n'),
      },
      // Good: imported constant, typeof allowed locally (suggestions may be given but not errors)
      {
        code: [
          "import { STATUS_EXCEEDING } from './file1';",
          "type StatusToCheck = typeof STATUS_EXCEEDING | 'succeeding';",
        ].join('\n'),
        filename: 'src/file2.ts',
      },
      // Good: imported type used for constant annotation
      {
        code: [
          "import type { StatusExceeding } from './types';",
          "export const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
        ].join('\n'),
        filename: 'src/constants.ts',
      },
      // Good: type inference with as const (explicit type is optional)
      {
        code: "const STATUS_EXCEEDING = 'exceeding' as const;",
      },
      // Good: typeof of non-top-level const (inside function) should be ignored
      {
        code: [
          'function f() {',
          "  const LOCAL = 'x' as const;",
          '  type T = typeof LOCAL;',
          '}',
        ].join('\n'),
      },
      // Good: typeof on function const should not be flagged
      {
        code: ['const FN = () => {};', 'type T = typeof FN;'].join('\n'),
      },
      // Good: keyof typeof pattern
      {
        code: [
          'export const MAP = { A: 1, B: 2 } as const;',
          'type Keys = keyof typeof MAP;',
        ].join('\n'),
      },
      // Good: keyof (typeof MAP) pattern (Issue #1175)
      {
        code: [
          'export const MAP = { A: 1, B: 2 } as const;',
          'type Keys = keyof (typeof MAP);',
        ].join('\n'),
      },
      // Good: (typeof ARRAY_CONST)[number] pattern (Issue #1175)
      {
        code: [
          'export const ERROR_MESSAGES_USER_FRIENDLY = ["A"] as const;',
          'export type ErrorMessageUserFriendly = (typeof ERROR_MESSAGES_USER_FRIENDLY)[number];',
        ].join('\n'),
      },
      // Good: TS import type + union usage
      {
        code: [
          "type StatusExceeding = 'exceeding';",
          "type StatusSubceeding = 'succeeding';",
          "const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
          "const STATUS_SUBCEEDING: StatusSubceeding = 'succeeding' as const;",
          'interface Props { s: StatusExceeding | StatusSubceeding }',
        ].join('\n'),
      },
      // Good: generic type annotation on const
      {
        code: [
          "type Status<T> = T & { readonly __brand: 'status' };",
          "const STATUS_EXCEEDING: Status<'exceeding'> = 'exceeding' as const;",
        ].join('\n'),
      },
      // Good: complex type for object constant
      {
        code: [
          'type Status = { value: string; code: number };',
          "const STATUS_EXCEEDING: Status = { value: 'exceeding', code: 1 } as const;",
        ].join('\n'),
      },
      // Good: typeof import expression should be ignored
      {
        code: "type X = typeof import('./mod').X;",
      },
      // Good: mapped type constraint
      {
        code: [
          'type Keys = "a" | "b";',
          'const MAP: { [K in Keys]: number } = { a: 1, b: 2 };',
        ].join('\n'),
      },
      // Good: type literal with method and index signature
      {
        code: [
          'type T = { name: string };',
          'const OBJ: { [key: string]: T; get(id: T): T } = { a: { name: "a" }, get(id: T) { return id; } };',
        ].join('\n'),
      },
    ],
    invalid: [
      // In function parameter
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          "const STATUS_SUBCEEDING = 'succeeding' as const;",
          'function checkStatus(status: typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING) {}',
        ].join('\n'),
        errors: [
          preferError('STATUS_EXCEEDING', 'StatusExceeding'),
          preferError('STATUS_SUBCEEDING', 'StatusSubceeding'),
        ],
      },
      // In interface property
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          'interface I { status: typeof STATUS_EXCEEDING }',
        ].join('\n'),
        errors: [preferError('STATUS_EXCEEDING', 'StatusExceeding')],
      },
      // Consumer context: variable annotation
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          'const s: typeof STATUS_EXCEEDING = "exceeding";',
        ].join('\n'),
        errors: [preferError('STATUS_EXCEEDING', 'StatusExceeding')],
      },
      // Ordering: type alias declared after constant
      {
        code: [
          "const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
          "type StatusExceeding = 'exceeding';",
        ].join('\n'),
        errors: [orderingError('StatusExceeding', 'STATUS_EXCEEDING')],
      },
      // Ordering: type alias in mapped type constraint declared after constant
      {
        code: [
          'const MAP: { [K in Keys]: number } = { a: 1, b: 2 };',
          'type Keys = "a" | "b";',
        ].join('\n'),
        errors: [orderingError('Keys', 'MAP')],
      },
      // Ordering: type alias in index signature declared after constant
      {
        code: [
          'const OBJ: { [key: string]: T } = { a: { name: "a" } };',
          'type T = { name: string };',
        ].join('\n'),
        errors: [orderingError('T', 'OBJ')],
      },
      // Ordering: type alias in method parameter declared after constant
      {
        code: [
          'const OBJ: { get(id: T): void } = { get(id: T) {} };',
          'type T = { name: string };',
        ].join('\n'),
        errors: [orderingError('T', 'OBJ')],
      },
      // Interface property with intersection
      {
        code: [
          "const C = 'c' as const;",
          'interface P { p: typeof C & string }',
        ].join('\n'),
        errors: [preferError('C', 'C')],
      },
    ],
  },
);
