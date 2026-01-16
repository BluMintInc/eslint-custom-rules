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
      // Provided TTime but not Date (Alias)
      code: `${COMMON_TYPES}\ntype Time = Date;\ntype Foo = Notification<Time>;`,
      output: `${COMMON_TYPES}\ntype Time = Date;\ntype Foo = Notification<Date>;`,
      parserOptions,
      filename,
      errors: [{ messageId: 'enforceDateTTime' }],
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
      // Aliased generic with TTime
      code: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = Notification<TTime>;\nconst x: UserDoc = {} as any;`,
      output: `${COMMON_TYPES}\ntype UserDoc<TTime = Timestamp> = Notification<Date>;\nconst x: UserDoc<Date> = {} as any;`,
      parserOptions,
      filename,
      errors: [
        { messageId: 'enforceDateTTime' }, // for Notification<TTime>
        { messageId: 'enforceDateTTime' }, // for UserDoc
      ],
    },
  ],
});
