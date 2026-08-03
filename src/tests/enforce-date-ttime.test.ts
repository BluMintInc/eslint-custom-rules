import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceDateTTime } from '../rules/enforce-date-ttime';

const tsconfigRootDir = path.join(__dirname, '..', '..');
const parserOptions = {
  project: './tsconfig.json',
  tsconfigRootDir,
};
const filename = path.join(tsconfigRootDir, 'src/rules/enforce-date-ttime.ts');

const COMMON_TYPES = `
  type Timestamp = { seconds: number; nanoseconds: number };
  interface Notification<TTime = Timestamp> {
    createdAt: TTime;
  }
  type PendingWalletToken<TType extends string, TTime = Timestamp> = {
    type: TType;
    updatedAt: TTime;
  };
  interface User<TName extends string, TAge extends number, TTime = Timestamp> {
    name: TName;
    age: TAge;
    lastLogin: TTime;
  }
`;

/**
 * The same `Notification` declaration without `COMMON_TYPES`' leading newline
 * and indentation, so a case may put an `import` on the first line and spell
 * out what the file looks like once that import is gone.
 */
const NOTIFICATION = `type Timestamp = { seconds: number; nanoseconds: number };
interface Notification<TTime = Timestamp> {
  createdAt: TTime;
}`;

ruleTesterTs.run('enforce-date-ttime', enforceDateTTime, {
  valid: [
    {
      code: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\ntype Foo = PendingWalletToken<'offchain', Date>;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\ntype Foo = User<'Alice', 30, Date>;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\nconst x: Date = new Date();`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\ntype Other<T> = { value: T };\ntype Foo = Other<Timestamp>;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\nfunction foo<TTime>(x: TTime) {}`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\ntype Foo = Notification<Date>;\ntype Bar = Foo;`,
      parserOptions,
      filename,
    },
    {
      code: `interface Local<TTime = Date> { t: TTime }\ntype Foo = Local<Date>;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\nconst n: Notification<Date> = {} as any;`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\ninterface MyType extends Notification<Date> {}`,
      parserOptions,
      filename,
    },
    {
      code: `${COMMON_TYPES}\nclass MyClass implements Notification<Date> { createdAt: Date = new Date(); }`,
      parserOptions,
      filename,
    },
  ],
  invalid: [
    {
      code: `interface Local<TTime = Date> { t: TTime }\ntype Foo = Local;`,
      output: `interface Local<TTime = Date> { t: TTime }\ntype Foo = Local<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Omitted TTime (1st param)
      code: `${COMMON_TYPES}\ntype Foo = Notification;`,
      output: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Omitted TTime (2nd param)
      code: `${COMMON_TYPES}\ntype Foo = PendingWalletToken<'offchain'>;`,
      output: `${COMMON_TYPES}\ntype Foo = PendingWalletToken<'offchain', Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Provided TTime but not Date (Timestamp)
      code: `${COMMON_TYPES}\ntype Foo = Notification<Timestamp>;`,
      output: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Provided TTime but not Date (Union)
      code: `${COMMON_TYPES}\ntype Foo = Notification<Date | null>;`,
      output: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Provided TTime but not Date (Alias). The argument holds the only
      // reference to `Time`, and a local declaration is not something the
      // removal helper can rewrite, so the fix is declined rather than traded
      // for a `no-unused-vars` violation on the stranded alias.
      code: `${COMMON_TYPES}\ntype Time = Date;\ntype Foo = Notification<Time>;`,
      output: null,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // The regression guard for the common case: `Time` is named elsewhere, so
      // rewriting the argument orphans nothing and the autofix survives.
      code: `${COMMON_TYPES}\ntype Time = Date;\ntype Foo = Notification<Time>;\nconst t: Time = new Date();`,
      output: `${COMMON_TYPES}\ntype Time = Date;\ntype Foo = Notification<Date>;\nconst t: Time = new Date();`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // An exported declaration has consumers no edit to this file can reach,
      // so losing its last local reference orphans nothing and the rewrite
      // proceeds with the declaration left exactly as written.
      code: `${COMMON_TYPES}\nexport type Time = Date;\ntype Foo = Notification<Time>;`,
      output: `${COMMON_TYPES}\nexport type Time = Date;\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // An import the argument solely consumed is unbound by the same fix, so
      // neither half can ship without the other.
      code: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;`,
      output: `${NOTIFICATION}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Only the orphaned specifier and its separator go; the sibling binding
      // and the declaration around it are untouched.
      code: `import { Time, Zone } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\ntype Bar = Zone;`,
      output: `import { Zone } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Date>;\ntype Bar = Zone;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // An imported alias named elsewhere in the file keeps its binding alive,
      // so the rewrite proceeds and the import declaration stays whole.
      code: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\nconst t: Time = new Date();`,
      output: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Date>;\nconst t: Time = new Date();`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // A re-exported import is reachable from outside the file, so the
      // specifier is never unbound however the argument is rewritten.
      code: `import { Time } from './time';\nexport type { Time };\n${NOTIFICATION}\ntype Foo = Notification<Time>;`,
      output: `import { Time } from './time';\nexport type { Time };\n${NOTIFICATION}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // The control for the suppressed case below: with nothing suppressed both
      // arguments report and both are rewritten, so nothing names `Time`
      // afterwards and its import goes with them. Neither rewrite orphans it
      // alone — only their union does, which is why the batch is planned as one
      // edit rather than a rewrite at a time.
      code: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\ntype Bar = Notification<Time>;`,
      output: `${NOTIFICATION}\ntype Foo = Notification<Date>;\ntype Bar = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // Suppression is applied to reports after a rule emits them, so a fix
      // that counted on its suppressed sibling's rewrite would unbind an import
      // `Foo` still names. The declaration survives.
      code: `import { Time } from './time';\n${NOTIFICATION}\n// eslint-disable-next-line enforce-date-ttime\ntype Foo = Notification<Time>;\ntype Bar = Notification<Time>;`,
      output: `import { Time } from './time';\n${NOTIFICATION}\n// eslint-disable-next-line enforce-date-ttime\ntype Foo = Notification<Time>;\ntype Bar = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // The carrier slot falls to a surviving site wherever the suppressed one
      // sits: here the batch is `Foo` alone, and `Bar` keeps naming `Time`, so
      // the import stays.
      code: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\n// eslint-disable-next-line enforce-date-ttime\ntype Bar = Notification<Time>;`,
      output: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Date>;\n// eslint-disable-next-line enforce-date-ttime\ntype Bar = Notification<Time>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // The batch is not limited to a pair; the import goes once nothing in the
      // file names it.
      code: `import { Time } from './time';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\ntype Bar = Notification<Time>;\ntype Baz = Notification<Time>;`,
      output: `${NOTIFICATION}\ntype Foo = Notification<Date>;\ntype Bar = Notification<Date>;\ntype Baz = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // One fix carries every rewrite in the batch, so two distinct orphaned
      // imports go in the same pass.
      code: `import { Time } from './time';\nimport { Moment } from './moment';\n${NOTIFICATION}\ntype Foo = Notification<Time>;\ntype Bar = Notification<Moment>;`,
      output: `${NOTIFICATION}\ntype Foo = Notification<Date>;\ntype Bar = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // A site the helper cannot plan must not veto the batch. `Local` is a
      // locally declared alias this rule declines to delete, so that argument
      // stays as written while the imported `Time` is still unbound alongside
      // the argument that solely consumed it.
      code: `import { Time } from './time';\ntype Local = { seconds: number };\n${NOTIFICATION}\ntype Foo = Notification<Local>;\ntype Bar = Notification<Time>;`,
      output: `type Local = { seconds: number };\n${NOTIFICATION}\ntype Foo = Notification<Local>;\ntype Bar = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // Neither rewrite orphans `Local` alone, but together they do, and a
      // declaration is not this rule's to delete. Judging the union declines the
      // whole batch rather than stranding the alias.
      code: `type Local = { seconds: number };\n${NOTIFICATION}\ntype Foo = Notification<Local>;\ntype Bar = Notification<Local>;`,
      output: null,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // Nested usage
      code: `${COMMON_TYPES}\ntype Foo = { n: Notification };`,
      output: `${COMMON_TYPES}\ntype Foo = { n: Notification<Date> };`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Multiple violations
      code: `${COMMON_TYPES}\ntype Foo = [Notification, PendingWalletToken<'onchain'>];`,
      output: `${COMMON_TYPES}\ntype Foo = [Notification<Date>, PendingWalletToken<'onchain', Date>];`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' },
        { messageId: 'enforceDateTTime' },
      ],
    },
    {
      // TTime as 3rd param, omitted
      code: `${COMMON_TYPES}\ntype Foo = User<'Bob', 25>;`,
      output: `${COMMON_TYPES}\ntype Foo = User<'Bob', 25, Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // TTime with complex type argument
      code: `${COMMON_TYPES}\ntype Foo = Notification<any>;`,
      output: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Generic constraints with extends
      code: `${COMMON_TYPES}\ntype Foo = Notification<Extract<Date, Date>>;`,
      output: `${COMMON_TYPES}\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Type-only re-exports
      code: `${COMMON_TYPES}\nexport type UserDoc = Notification;\nconst x: UserDoc = {} as any;`,
      output: `${COMMON_TYPES}\nexport type UserDoc = Notification<Date>;\nconst x: UserDoc = {} as any;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Aliased generic with TTime. Overwriting the pass-through argument would
      // leave `UserDoc`'s own type parameter unread by its body — reported by
      // `@typescript-eslint/no-unused-vars` and by `tsc --noUnusedParameters`
      // alike, and leaving an argument callers may still pass that no longer
      // means anything. The use site is fixed regardless, and `UserDoc<Date>`
      // already forwards `Date` to `Notification`.
      code: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = Notification<TTime>;\nconst x: UserDoc = {} as any;`,
      output: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = Notification<TTime>;\nconst x: UserDoc<Date> = {} as any;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' }, // for Notification<TTime>
        { messageId: 'enforceDateTTime' }, // for UserDoc
      ],
    },
    {
      // A type parameter its body reads elsewhere is not orphaned by the
      // rewrite, so the argument is fixed and the parameter stays meaningful.
      code: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = { n: Notification<TTime>; at: TTime };\nconst x: UserDoc<Date> = {} as any;`,
      output: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = { n: Notification<Date>; at: TTime };\nconst x: UserDoc<Date> = {} as any;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // TSQualifiedName (Namespace)
      code: `namespace Types {\n  export interface Notification<TTime = any> { t: TTime }\n}\ntype Foo = Types.Notification;`,
      output: `namespace Types {\n  export interface Notification<TTime = any> { t: TTime }\n}\ntype Foo = Types.Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Aliased symbol via import/alias
      code: `${COMMON_TYPES}\ntype N = Notification;\ntype Foo = N;`,
      output: `${COMMON_TYPES}\ntype N = Notification<Date>;\ntype Foo = N;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' }, // for Notification in type N
      ],
    },
    {
      // Class with TTime
      code: `class Base<TTime = any> { t!: TTime }\ntype Foo = Base;`,
      output: `class Base<TTime = any> { t!: TTime }\ntype Foo = Base<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Omitted TTime in the middle (fixable because it's at the end of provided ones)
      code: `interface Multi<A, TTime, B = any> { a: A, t: TTime, b: B }\ntype Foo = Multi<string>;`,
      output: `interface Multi<A, TTime, B = any> { a: A, t: TTime, b: B }\ntype Foo = Multi<string, Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
    {
      // Omitted TTime in the middle (not fixable because it would skip parameters)
      code: `interface Multi<A, B, TTime> { a: A, b: B, t: TTime }\ntype Foo = Multi<string>;`,
      output: null,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
    },
  ],
});
