import path from 'path';
import { ESLintUtils } from '@typescript-eslint/utils';
import { memoCompareDeeplyComplexProps } from '../rules/memo-compare-deeply-complex-props';

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
    ],
    invalid: [
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
    ],
  },
);
