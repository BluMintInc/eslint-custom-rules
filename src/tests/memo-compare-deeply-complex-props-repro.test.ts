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
  'memo-compare-deeply-complex-props-repro',
  memoCompareDeeplyComplexProps,
  {
    valid: [
      {
        filename: 'src/components/ReactNodeProps.tsx',
        code: `
import React, { memo } from 'react';

type Props = {
  avatar?: React.ReactNode;
  preview: React.ReactElement;
  renderItem: (data: any) => React.ReactNode;
  Component: React.FC<any>;
};

const MyComponent = ({ avatar, preview, renderItem, Component }: Props) => (
  <div>
    {avatar}
    {preview}
    {renderItem({})}
    <Component />
  </div>
);

export const Wrapped = memo(MyComponent);
`,
      },
      {
        filename: 'src/components/RefProps.tsx',
        code: `
import React, { memo, Ref } from 'react';

type Props = {
  ref?: Ref<HTMLDivElement>;
  innerRef: Ref<any>;
  customRef: React.RefObject<any>;
};

const MyComponent = ({ ref, innerRef, customRef }: Props) => (
  <div ref={ref} />
);

export const Wrapped = memo(MyComponent);
`,
      },
    ],
    invalid: [
      {
        filename: 'src/components/MixedPropsRepro.tsx',
        code: `
import React, { memo } from 'react';

type Props = {
  activeChannel: { id: string };
  Avatar: React.ReactNode;
  Preview: React.ReactNode;
};

const MyComponent = ({ activeChannel, Avatar, Preview }: Props) => (
  <div>{activeChannel.id}</div>
);

export const Wrapped = memo(MyComponent);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';

type Props = {
  activeChannel: { id: string };
  Avatar: React.ReactNode;
  Preview: React.ReactNode;
};

const MyComponent = ({ activeChannel, Avatar, Preview }: Props) => (
  <div>{activeChannel.id}</div>
);

export const Wrapped = memo(MyComponent, compareDeeply('activeChannel'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
    ],
  },
);
