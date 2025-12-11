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
    ],
    invalid: [
      // Basic: union of typeof local constants
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          "const STATUS_SUBCEEDING = 'succeeding' as const;",
          'type StatusToCheck = typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;',
        ].join('\n'),
        errors: [
          preferError('STATUS_EXCEEDING', 'StatusExceeding'),
          preferError('STATUS_SUBCEEDING', 'StatusSubceeding'),
        ],
      },
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
      // With intersection
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          'type T = typeof STATUS_EXCEEDING & { extra: number };',
        ].join('\n'),
        errors: [preferError('STATUS_EXCEEDING', 'StatusExceeding')],
      },
      // Ensure we ignore non-top-level (so this one is top-level const)
      {
        code: ["const LOCAL = 'x' as const;", 'type T = typeof LOCAL;'].join(
          '\n',
        ),
        errors: [preferError('LOCAL', 'Local')],
      },
      // Ordering: type alias declared after constant
      {
        code: [
          "const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
          "type StatusExceeding = 'exceeding';",
        ].join('\n'),
        errors: [orderingError('StatusExceeding', 'STATUS_EXCEEDING')],
      },
      // Mixed union: part typeof, part literal
      {
        code: [
          "const STATUS_EXCEEDING = 'exceeding' as const;",
          "type T = typeof STATUS_EXCEEDING | 'succeeding';",
        ].join('\n'),
        errors: [preferError('STATUS_EXCEEDING', 'StatusExceeding')],
      },
      // Multiple constants
      {
        code: [
          "const A = 'a' as const;",
          "const B = 'b' as const;",
          'type U = typeof A | typeof B;',
        ].join('\n'),
        errors: [preferError('A', 'A'), preferError('B', 'B')],
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
