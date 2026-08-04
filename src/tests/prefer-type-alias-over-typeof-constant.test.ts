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
      // Good: direct typeof in a type alias for a DEEPLY NESTED as-const object
      // (Issue #1220). typeof is the single-source-of-truth alias here; an
      // explicit type would duplicate the whole shape and drift from the value.
      {
        code: [
          'export const SCROLLBARS = {',
          "  primary: { '::-webkit-scrollbar': { width: '16px' }, '::-webkit-scrollbar-thumb': { background: 'red', border: '4px solid transparent' } },",
          "  secondary: { '::-webkit-scrollbar': { width: '8px' } },",
          '} as const;',
          'export type Scrollbar = typeof SCROLLBARS;',
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
      // Good: the alias IS the constant's type, the canonical remedy (Issue #1680)
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Config = typeof CONFIG;',
        ].join('\n'),
      },
      // Good: array of the derived type still defines the alias from the constant
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Configs = (typeof CONFIG)[];',
        ].join('\n'),
      },
      // Good: readonly array wrapper around the derived type
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Configs = readonly (typeof CONFIG)[];',
        ].join('\n'),
      },
      // Good: union of derivation wrappers (indexed access + keyof)
      {
        code: [
          'const MESSAGES = ["a", "b"] as const;',
          'const MAP = { A: 1 } as const;',
          'type Either = (typeof MESSAGES)[number] | keyof typeof MAP;',
        ].join('\n'),
      },
      // Good: `keyof typeof` inside an alias member mirrors the same shape
      // outside an alias, which this rule also allows
      {
        code: [
          'const MAP = { A: 1, B: 2 } as const;',
          'type Props = { key: keyof typeof MAP };',
        ].join('\n'),
      },
      // Good: alias member referencing a function constant is out of scope
      {
        code: ['const FN = () => {};', 'type Props = { fn: typeof FN };'].join(
          '\n',
        ),
      },
      // Good: alias member referencing an imported value is out of scope
      {
        code: [
          "import { API_BASE } from './config';",
          'type Props = { base: typeof API_BASE };',
        ].join('\n'),
        filename: 'src/props.ts',
      },
      // Good: alias member referencing a constant declared inside a function
      {
        code: [
          'function f() {',
          "  const LOCAL = 'x' as const;",
          '  type Props = { s: typeof LOCAL };',
          '  return null as unknown as Props;',
          '}',
        ].join('\n'),
      },
      // Good: utility application still names the constant's type. This is the
      // convergence case: the remedy for the reported
      // `function f(x: Readonly<typeof CONFIG>)` below is exactly this alias, so
      // reporting it would make the remedy its own violation.
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type FrozenConfig = Readonly<typeof CONFIG>;',
        ].join('\n'),
      },
      // Good: the same alias consumed by the shape that used to inline the query
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type FrozenConfig = Readonly<typeof CONFIG>;',
          'function f(x: FrozenConfig) {}',
        ].join('\n'),
      },
      // Good: user-defined utility over the constant
      {
        code: [
          'type ValueOf<T> = T[keyof T];',
          'const CHANNEL_IDS = { a: "1" } as const;',
          'type ChannelId = ValueOf<typeof CHANNEL_IDS>;',
        ].join('\n'),
      },
      // Good: derivation wrappers nested inside a utility argument
      {
        code: [
          'type Registry = { alpha: number };',
          'const BASENAMES = ["alpha"] as const;',
          'type Extra = Exclude<keyof Registry, (typeof BASENAMES)[number]>;',
        ].join('\n'),
      },
      // Good: nested utility application
      {
        code: [
          'const MAX_DEPTH = 5 as const;',
          'type ArrayOfLength<T> = readonly T[];',
          'type Prev = Readonly<ArrayOfLength<typeof MAX_DEPTH>>;',
        ].join('\n'),
      },
      // Good: top-level type argument, the alias still names the constant
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Configs = Array<typeof CONFIG>;',
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
      // Control for Issue #1680: parameter annotation keeps firing
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'function f(s: typeof CONFIG) {}',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Control for Issue #1680: interface member keeps firing
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'interface Props { s: typeof CONFIG }',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: the alias-shaped twin of the firing interface member
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Props = { s: typeof CONFIG };',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: member nested deeper inside the alias body
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Props = { inner: { s: typeof CONFIG } };',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: type argument inside an alias member
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Props = { list: Array<typeof CONFIG> };',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: utility transparency stops at a type literal, so a member
      // inside a utility argument still reports
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Wrapper<T> = { readonly value: T };',
          'type Props = Wrapper<{ s: typeof CONFIG }>;',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: the pre-remedy shape of the exempt
      // `type FrozenConfig = Readonly<typeof CONFIG>` alias above. Extracting
      // that alias is what silences this report, so the rule converges.
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'function f(x: Readonly<typeof CONFIG>) {}',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: type parameter default is a declaration slot, not the
      // alias's own derived type
      {
        code: [
          'const MAX_DEPTH = 5 as const;',
          'type Paths<TDepth extends number = typeof MAX_DEPTH> = readonly TDepth[];',
        ].join('\n'),
        errors: [preferError('MAX_DEPTH', 'MaxDepth')],
      },
      // Issue #1680: mapped type constraint inside the alias body
      {
        code: [
          "const SSR_KEY = 'rates' as const;",
          'type WithRates = { [Key in typeof SSR_KEY]: number };',
        ].join('\n'),
        errors: [preferError('SSR_KEY', 'SsrKey')],
      },
      // Issue #1680: member of a union arm inside the alias body
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Props = { s: typeof CONFIG } | number;',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: index signature value inside the alias body
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Props = { [key: string]: typeof CONFIG };',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: function type parameter inside the alias body
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Handler = (s: typeof CONFIG) => void;',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: the constant is a lookup key, not the derived type
      {
        code: [
          'type Box = { a: number };',
          "const KEY = 'a' as const;",
          'type Value = Box[typeof KEY];',
        ].join('\n'),
        errors: [preferError('KEY', 'Key')],
      },
      // Issue #1680: conditional type branch inside the alias body
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          'type Maybe<T> = T extends string ? typeof CONFIG : never;',
        ].join('\n'),
        errors: [preferError('CONFIG', 'Config')],
      },
      // Issue #1680: multiple members report once per use site
      {
        code: [
          'const CONFIG = { a: 1 } as const;',
          "const LABEL = 'x' as const;",
          'type Props = { config: typeof CONFIG; label: typeof LABEL };',
        ].join('\n'),
        errors: [
          preferError('CONFIG', 'Config'),
          preferError('LABEL', 'Label'),
        ],
      },
    ],
  },
);
