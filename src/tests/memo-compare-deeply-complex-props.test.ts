import path from 'path';
import { ESLintUtils } from '@typescript-eslint/utils';
import { memoCompareDeeplyComplexProps } from '../rules/memo-compare-deeply-complex-props';

const callSignatureMissingFile = 'src/components/CallSignatureMissing.tsx';

jest.mock('typescript', () => {
  const actual = jest.requireActual<typeof import('typescript')>('typescript');
  const originalCreateProgram = actual.createProgram;

  return {
    ...actual,
    createProgram(...args: Parameters<typeof originalCreateProgram>) {
      const program = originalCreateProgram(...args);
      const checker = program.getTypeChecker();
      const originalGetTypeAtLocation = checker.getTypeAtLocation.bind(checker);

      // Simulate a type without getCallSignatures to ensure the rule handles it safely.
      checker.getTypeAtLocation = ((node: import('typescript').Node) => {
        const type = originalGetTypeAtLocation(node);
        if (node.getSourceFile().fileName.includes(callSignatureMissingFile)) {
          const clonedType = Object.assign(
            Object.create(Object.getPrototypeOf(type)),
            type,
          );
          delete (clonedType as { getCallSignatures?: unknown })
            .getCallSignatures;
          return clonedType as import('typescript').Type;
        }
        return type;
      }) as typeof checker.getTypeAtLocation;

      return program;
    },
  };
});

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: './tsconfig.json',
    tsconfigRootDir: path.join(__dirname, '..', '..'),
    createDefaultProgram: true,
  },
});

ruleTester.run(
  'memo-compare-deeply-complex-props',
  memoCompareDeeplyComplexProps,
  {
    valid: [
      {
        filename: 'src/components/Primitives.tsx',
        code: `
import { memo } from 'react';
type Props = { userId: string; count: number; active: boolean; onClick: () => void };
const Comp = ({ userId, count, active, onClick }: Props) => (
  <button onClick={onClick}>{userId}{count}{active ? 'yes' : 'no'}</button>
);
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/Comparator.tsx',
        code: `
import { memo } from 'react';
type Settings = { theme: string };
const Comp = ({ settings }: { settings: Settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo(
  Comp,
  (prev, next) => prev.settings.theme === next.settings.theme,
);
`,
      },
      {
        filename: 'src/components/CompareDeeply.tsx',
        code: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
      },
      {
        filename: 'src/components/NoProps.tsx',
        code: `
import { memo } from 'react';
const Comp = () => <div>Hello</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/UnionPrimitive.tsx',
        code: `
import { memo } from 'react';
type Props = { id: string | number };
const Comp = ({ id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/Children.tsx',
        code: `
import React, { memo } from 'react';
type Props = { children: React.ReactNode };
const Comp = ({ children }: Props) => <section>{children}</section>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ArrayWithComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.join(',')}</div>;
const eq = (a: Props, b: Props) => a.items.length === b.items.length;
export const Wrapped = memo(Comp, eq);
`,
      },
      {
        filename: 'src/components/AnyProp.tsx',
        code: `
import { memo } from 'react';
type Props = { config: any };
const Comp = ({ config }: Props) => <div>{String(config)}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ReactNamespaceComparator.tsx',
        code: `
import React from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = React.memo(Comp, () => true);
`,
      },
      {
        filename: 'src/components/ShadowedUndefinedComparator.tsx',
        code: `
import { memo } from 'react';
const undefined = (prev: unknown, next: unknown) => prev === next;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, undefined);
`,
      },
      {
        filename: 'src/components/CustomMemoCompareDeeply.tsx',
        code: `
import { memo as customMemo, compareDeeply } from 'src/util/memo';
type Props = { profile: { name: string } };
const Comp = ({ profile }: Props) => <div>{profile.name}</div>;
export const Wrapped = customMemo(Comp, compareDeeply('profile'));
`,
      },
      {
        filename: 'src/components/ArrowNoProps.tsx',
        code: `
import { memo } from 'react';
export const Wrapped = memo(() => <div>hi</div>);
`,
      },
      {
        filename: 'src/components/ExternalMemo.tsx',
        code: `
declare module 'some-other-lib' {
  export function memo<T>(component: T, comparator?: (a: T, b: T) => boolean): T;
}
import { memo } from 'some-other-lib';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/SxStyleOnly.tsx',
        code: `
import { memo } from 'src/util/memo';

type MyComponentProps = {
  name: string;
  sx?: { color: string };
  style?: { margin: number };
  containerSx?: { padding: number };
  wrapperStyle?: { border: string };
};

export const MyComponent = memo(({ name, sx, style, containerSx, wrapperStyle }: MyComponentProps) => {
  return <div style={style}>{name}</div>;
});
`,
      },
    ],
    invalid: [
      {
        filename: 'src/components/MixedComplexProps.tsx',
        code: `
import { memo } from 'src/util/memo';

type MixedProps = {
  name: string;
  sx?: { color: string };
  otherComplex: { foo: string };
};

export const MyComponent = memo(({ name, sx, otherComplex }: MixedProps) => {
  return <div sx={sx}>{name}</div>;
});
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';

type MixedProps = {
  name: string;
  sx?: { color: string };
  otherComplex: { foo: string };
};

export const MyComponent = memo(({ name, sx, otherComplex }: MixedProps) => {
  return <div sx={sx}>{name}</div>;
}, compareDeeply('otherComplex'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UserProfileCard.tsx',
        code: `
import { memo } from 'react';

interface UserSettings {
  theme: string;
  notifications: {
    email: boolean;
    sms: boolean;
  };
  preferences: string[];
}

interface UserProfileCardProps {
  userId: string;
  userSettings: UserSettings;
  onUpdate: () => void;
}

const UserProfileCardUnmemoized = ({
  userId,
  userSettings,
  onUpdate,
}: UserProfileCardProps) => {
  return (
    <div onClick={onUpdate}>
      <p>User ID: {userId}</p>
      <p>Theme: {userSettings.theme}</p>
    </div>
  );
};

export const UserProfileCard = memo(UserProfileCardUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';

interface UserSettings {
  theme: string;
  notifications: {
    email: boolean;
    sms: boolean;
  };
  preferences: string[];
}

interface UserProfileCardProps {
  userId: string;
  userSettings: UserSettings;
  onUpdate: () => void;
}

const UserProfileCardUnmemoized = ({
  userId,
  userSettings,
  onUpdate,
}: UserProfileCardProps) => {
  return (
    <div onClick={onUpdate}>
      <p>User ID: {userId}</p>
      <p>Theme: {userSettings.theme}</p>
    </div>
  );
};

export const UserProfileCard = memo(UserProfileCardUnmemoized, compareDeeply('userSettings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultiComplexProps.tsx',
        code: `
import { memo } from 'react';
type Props = { filters: string[]; settings: { theme: string }; id: string };
const Comp = ({ filters, settings, id }: Props) => (
  <div>{id}{filters.join(',')}{settings.theme}</div>
);
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { filters: string[]; settings: { theme: string }; id: string };
const Comp = ({ filters, settings, id }: Props) => (
  <div>{id}{filters.join(',')}{settings.theme}</div>
);
export const Wrapped = memo(Comp, compareDeeply('filters', 'settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/PropOrderConsistency.tsx',
        code: `
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
const Named = ({ beta, alpha }: Props) => <div>{beta.value}{alpha.value}</div>;
export const WrappedNamed = memo(Named);
export const WrappedInline = memo(({ beta, alpha }: Props) => <section>{beta.value}{alpha.value}</section>);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
const Named = ({ beta, alpha }: Props) => <div>{beta.value}{alpha.value}</div>;
export const WrappedNamed = memo(Named, compareDeeply('alpha', 'beta'));
export const WrappedInline = memo(({ beta, alpha }: Props) => <section>{beta.value}{alpha.value}</section>, compareDeeply('alpha', 'beta'));
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: 'src/components/TypeArgsAny.tsx',
        code: `
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
export const Wrapped = memo<any, Props>(
  ({ beta, alpha }: any) => <div>{beta.value}{alpha.value}</div>,
);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
export const Wrapped = memo<any, Props>(
  ({ beta, alpha }: any) => <div>{beta.value}{alpha.value}</div>, compareDeeply('alpha', 'beta')
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ArrayOnly.tsx',
        code: `
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(Comp, compareDeeply('items'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CustomMemoAlias.tsx',
        code: `
import { memo as customMemo } from 'src/util/memo';
type Props = { options: string[] };
const Comp = ({ options }: Props) => <div>{options.join(',')}</div>;
export const Wrapped = customMemo(Comp);
`,
        output: `
import { memo as customMemo, compareDeeply } from 'src/util/memo';
type Props = { options: string[] };
const Comp = ({ options }: Props) => <div>{options.join(',')}</div>;
export const Wrapped = customMemo(Comp, compareDeeply('options'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CustomMemoDefault.tsx',
        code: `
import memoUtil from 'src/util/memo';
type Props = { config: { dark: boolean } };
const Comp = ({ config }: Props) => <div>{String(config.dark)}</div>;
export const Wrapped = memoUtil(Comp);
`,
        output: `
import memoUtil, { compareDeeply } from 'src/util/memo';
type Props = { config: { dark: boolean } };
const Comp = ({ config }: Props) => <div>{String(config.dark)}</div>;
export const Wrapped = memoUtil(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ReactNamespace.tsx',
        code: `
import React from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = React.memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = React.memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/InlineArrow.tsx',
        code: `
import { memo } from 'react';
type Props = { data: { id: string } };
export const Wrapped = memo(({ data }: Props) => <span>{data.id}</span>);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { data: { id: string } };
export const Wrapped = memo(({ data }: Props) => <span>{data.id}</span>, compareDeeply('data'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/SatisfiesExpression.tsx',
        code: `
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp: React.FC<Props> = ({ settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo((Comp satisfies React.FC<Props>));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp: React.FC<Props> = ({ settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo((Comp satisfies React.FC<Props>), compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ExistingImport.tsx',
        code: `
import { memo } from 'react';
import { compareDeeply } from 'src/util/memo';
type Props = { settings: { mode: string } };
const Comp = ({ settings }: Props) => <div>{settings.mode}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'react';
import { compareDeeply } from 'src/util/memo';
type Props = { settings: { mode: string } };
const Comp = ({ settings }: Props) => <div>{settings.mode}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/NamespaceMemoUtil.tsx',
        code: `
import * as memoUtil from 'src/util/memo';
type Props = { payload: { value: string } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memoUtil.memo(Comp);
`,
        output: `
import * as memoUtil from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { payload: { value: string } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memoUtil.memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/AliasedCompareDeeply.tsx',
        code: `
import { memo } from 'react';
import { compareDeeply as cd } from 'src/util/memo';
type Props = { info: { id: string } };
const Comp = ({ info }: Props) => <div>{info.id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'react';
import { compareDeeply as cd } from 'src/util/memo';
type Props = { info: { id: string } };
const Comp = ({ info }: Props) => <div>{info.id}</div>;
export const Wrapped = memo(Comp, cd('info'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/RecordProp.tsx',
        code: `
import { memo } from 'react';
type Props = { mapping: Record<string, number> };
const Comp = ({ mapping }: Props) => <div>{Object.keys(mapping).length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { mapping: Record<string, number> };
const Comp = ({ mapping }: Props) => <div>{Object.keys(mapping).length}</div>;
export const Wrapped = memo(Comp, compareDeeply('mapping'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ReadonlyArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { ids: readonly string[] };
const Comp = ({ ids }: Props) => <div>{ids.length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { ids: readonly string[] };
const Comp = ({ ids }: Props) => <div>{ids.length}</div>;
export const Wrapped = memo(Comp, compareDeeply('ids'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/QuotedProp.tsx',
        code: `
import { memo } from 'react';
type Props = { "user'sData": { id: string } };
const Comp = ({ ["user'sData"]: usersData }: Props) => <div>{usersData.id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { "user'sData": { id: string } };
const Comp = ({ ["user'sData"]: usersData }: Props) => <div>{usersData.id}</div>;
export const Wrapped = memo(Comp, compareDeeply('user\\'sData'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/DuplicateImport.tsx',
        code: `
import { memo } from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UndefinedComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, undefined);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UndefinedAsAnyComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, (undefined as any));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/TrailingCommaMemo.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp,);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ParenthesizedNullComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, (null));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/InnerScopeCompareDeeplyShadow.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
function makeWrapper() {
  const compareDeeply = () => false;
  return memo(function Comp({ config }: Props) {
    return <div>{config.theme}</div>;
  });
}
export const Wrapped = makeWrapper();
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
function makeWrapper() {
  const compareDeeply = () => false;
  return memo(function Comp({ config }: Props) {
    return <div>{config.theme}</div>;
  }, compareDeeply2('config'));
}
export const Wrapped = makeWrapper();
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CompareDeeplyNameCollision.tsx',
        code: `
import { memo } from 'react';
const compareDeeply = () => false;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
const compareDeeply = () => false;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply2('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ForwardRefWrapper.tsx',
        code: `
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Base = React.forwardRef<HTMLDivElement, Props>(({ settings }, ref) => (
  <div ref={ref}>{settings.theme}</div>
));
export const Wrapped = memo(Base);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Base = React.forwardRef<HTMLDivElement, Props>(({ settings }, ref) => (
  <div ref={ref}>{settings.theme}</div>
));
export const Wrapped = memo(Base, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/BrandedTypeProp.tsx',
        code: `
import { memo } from 'react';
type UserId = string & { readonly __brand: 'UserId' };
type Props = { userId: UserId };
const Comp = ({ userId }: Props) => <div>{userId}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type UserId = string & { readonly __brand: 'UserId' };
type Props = { userId: UserId };
const Comp = ({ userId }: Props) => <div>{userId}</div>;
export const Wrapped = memo(Comp, compareDeeply('userId'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ClassInstanceProp.tsx',
        code: `
import { memo } from 'react';
class Config {
  mode = 'dark';
}
type Props = { config: Config };
const Comp = ({ config }: Props) => <div>{config.mode}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
class Config {
  mode = 'dark';
}
type Props = { config: Config };
const Comp = ({ config }: Props) => <div>{config.mode}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UnionMixedProp.tsx',
        code: `
import { memo } from 'react';
type Props = { payload: { value: number } | string };
const Comp = ({ payload }: Props) => <div>{String(payload)}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { payload: { value: number } | string };
const Comp = ({ payload }: Props) => <div>{String(payload)}</div>;
export const Wrapped = memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultipleMemoImports.tsx',
        code: `
import { memo } from '../util/memo';
import { memo as memoFromSrc } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from '../util/memo';
import { memo as memoFromSrc } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultipleMemoCalls.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const First = ({ config }: Props) => <div>{config.theme}</div>;
const Second = ({ config }: Props) => <span>{config.theme}</span>;
export const Wrapped = memo(First);
export const WrappedAgain = memo(Second);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const First = ({ config }: Props) => <div>{config.theme}</div>;
const Second = ({ config }: Props) => <span>{config.theme}</span>;
export const Wrapped = memo(First, compareDeeply('config'));
export const WrappedAgain = memo(Second, compareDeeply('config'));
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: 'src/components/MultipleCallsWithShadow.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const One = ({ config }: Props) => <div>{config.theme}</div>;
export const WrappedOne = memo(One);
function makeWrapper() {
  const compareDeeply = () => false;
  const Two = ({ config }: Props) => <span>{config.theme}</span>;
  return memo(Two);
}
export const WrappedTwo = makeWrapper();
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const One = ({ config }: Props) => <div>{config.theme}</div>;
export const WrappedOne = memo(One, compareDeeply2('config'));
function makeWrapper() {
  const compareDeeply = () => false;
  const Two = ({ config }: Props) => <span>{config.theme}</span>;
  return memo(Two, compareDeeply2('config'));
}
export const WrappedTwo = makeWrapper();
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: callSignatureMissingFile,
        code: `
import { memo } from 'react';
type Props = { payload: { value: number } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { payload: { value: number } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ShadowedInitializer.tsx',
        code: `
import { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;

function makeInner() {
  const Comp = ({ flag }: { flag: boolean }) => <span>{flag}</span>;
  return Comp;
}

export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;

function makeInner() {
  const Comp = ({ flag }: { flag: boolean }) => <span>{flag}</span>;
  return Comp;
}

export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
    ],
  },
);
