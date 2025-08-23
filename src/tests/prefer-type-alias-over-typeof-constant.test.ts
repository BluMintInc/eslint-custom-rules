import { ruleTesterTs } from '../utils/ruleTester';
import { preferTypeAliasOverTypeofConstant } from '../rules/prefer-type-alias-over-typeof-constant';

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
					"type StatusToCheck = StatusExceeding | StatusSubceeding;",
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
					"  type T = typeof LOCAL;",
					'}',
				].join('\n'),
			},
			// Good: typeof on function const should not be flagged
			{
				code: [
					'const FN = () => {};',
					'type T = typeof FN;',
				].join('\n'),
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
					"interface Props { s: StatusExceeding | StatusSubceeding }",
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
					{ messageId: 'preferTypeAlias' },
					{ messageId: 'preferTypeAlias' },
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
					{ messageId: 'preferTypeAlias' },
					{ messageId: 'preferTypeAlias' },
				],
			},
			// In interface property
			{
				code: [
					"const STATUS_EXCEEDING = 'exceeding' as const;",
					'interface I { status: typeof STATUS_EXCEEDING }',
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }],
			},
			// With intersection
			{
				code: [
					"const STATUS_EXCEEDING = 'exceeding' as const;",
					"type T = typeof STATUS_EXCEEDING & { extra: number };",
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }],
			},
			// Ensure we ignore non-top-level (so this one is top-level const)
			{
				code: [
					"const LOCAL = 'x' as const;",
					'type T = typeof LOCAL;',
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }],
			},
			// Ordering: type alias declared after constant
			{
				code: [
					"const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;",
					"type StatusExceeding = 'exceeding';",
				].join('\n'),
				errors: [{ messageId: 'defineTypeBeforeConstant' }],
			},
			// Mixed union: part typeof, part literal
			{
				code: [
					"const STATUS_EXCEEDING = 'exceeding' as const;",
					"type T = typeof STATUS_EXCEEDING | 'succeeding';",
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }],
			},
			// Multiple constants
			{
				code: [
					"const A = 'a' as const;",
					"const B = 'b' as const;",
					'type U = typeof A | typeof B;',
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }, { messageId: 'preferTypeAlias' }],
			},
			// Interface property with intersection
			{
				code: [
					"const C = 'c' as const;",
					'interface P { p: typeof C & string }',
				].join('\n'),
				errors: [{ messageId: 'preferTypeAlias' }],
			},
		],
	},
);