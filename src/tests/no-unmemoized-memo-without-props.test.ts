import { noUnmemoizedMemoWithoutProps } from '../rules/no-unmemoized-memo-without-props';
import { ruleTesterJsx } from '../utils/ruleTester';

const baseError = (componentName: string) => ({
  messageId: 'unnecessaryMemoWithoutProps' as const,
  data: {
    componentName,
    suggestedName: componentName.replace(/Unmemoized$/, ''),
  },
});

ruleTesterJsx.run(
  'no-unmemoized-memo-without-props',
  noUnmemoizedMemoWithoutProps,
  {
    valid: [
      {
        filename: 'component.tsx',
        code: `
          import { memo } from '../../../util/memo';
          type Props = { title: string };
          export function BannerUnmemoized({ title }: Props) {
            return <div>{title}</div>;
          }
          export const Banner = memo(BannerUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          interface Props {
            subtitle?: string;
          }
          const HeroUnmemoized = ({ subtitle }: Props) => <section>{subtitle}</section>;
          export const Hero = memo(HeroUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          function WithRestUnmemoized({ heading, ...rest }) {
            return <div {...rest}>{heading}</div>;
          }
          export const WithRest = memo(WithRestUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo as reactMemo } from 'react';
          const UsesRestUnmemoized = (...args) => <div>{args.length}</div>;
          export const UsesRest = reactMemo(UsesRestUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import React from 'react';
          const WithPropsUnmemoized = ({ id }: { id: string }) => <div>{id}</div>;
          export const WithProps = React.memo(WithPropsUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import memo from '../../util/memo';
          const WrappedComponent = memo(function Wrapped() { return <div />; });
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from '../../../util/memo';
          function NotFollowingPattern() {
            return <div />;
          }
          export const StillMemoized = memo(NotFollowingPattern);
        `,
      },
      {
        filename: 'component.tsx',
        options: [{ ignoreHooks: ['useTheme'] }],
        code: `
          import { memo } from 'react';
          function ThemeConsumerUnmemoized() {
            const theme = useTheme();
            return <div>{theme.mode}</div>;
          }
          export const ThemeConsumer = memo(ThemeConsumerUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        options: [{ ignoreHooks: ['useContext'] }],
        code: `
          import React from 'react';
          const ContextReaderUnmemoized = () => {
            const value = useContext(SomeContext);
            return <div>{value}</div>;
          };
          export const ContextReader = React.memo(ContextReaderUnmemoized);
        `,
      },
      {
        filename: 'component.ts',
        code: `
          import { memo } from 'react';
          function ServerOnlyUnmemoized() {
            return 'ok';
          }
          export const ServerOnly = memo(ServerOnlyUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'different-memo';
          function ThirdPartyUnmemoized() {
            return <div />;
          }
          export const ThirdParty = memo(ThirdPartyUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          type Empty = {};
          const IntersectUnmemoized = (props: Empty & { x: number }) => (
            <div>{props.x}</div>
          );
          export const Intersect = memo(IntersectUnmemoized);
        `,
      },
      {
        filename: 'component.tsx',
        code: `
          import React from 'react';
          const NonMemoCallUnmemoized = () => <div />;
          const maybeMemo = React(NonMemoCallUnmemoized);
          export { maybeMemo };
        `,
      },
    ],
    invalid: [
      {
        filename: 'component.tsx',
        code: `
          import { memo } from '../../../util/memo';
          export function BracketAdUnmemoized() {
            return <div>Ad</div>;
          }
          export const BracketAd = memo(BracketAdUnmemoized);
        `,
        errors: [baseError('BracketAdUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from '../../../util/memo';
          export const SimpleUnmemoized = () => <span>text</span>;
          export const Simple = memo(SimpleUnmemoized);
        `,
        errors: [baseError('SimpleUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from '../../../util/memo';
          function EmptyDestructureUnmemoized({}) {
            return <div />;
          }
          export const EmptyDestructure = memo(EmptyDestructureUnmemoized);
        `,
        errors: [baseError('EmptyDestructureUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          function DefaultEmptyUnmemoized({} = {}) {
            return <div />;
          }
          export const DefaultEmpty = memo(DefaultEmptyUnmemoized);
        `,
        errors: [baseError('DefaultEmptyUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo as reactMemo } from 'react';
          type Props = {};
          const TypedEmptyUnmemoized = (props: Props) => <div>{Object.keys(props).length}</div>;
          export const TypedEmpty = reactMemo(TypedEmptyUnmemoized);
        `,
        errors: [baseError('TypedEmptyUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          interface EmptyProps {}
          const EmptyObjectPatternUnmemoized = ({}: EmptyProps) => <div />;
          export const EmptyObjectPattern = memo(EmptyObjectPatternUnmemoized);
        `,
        errors: [baseError('EmptyObjectPatternUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import React from 'react';
          const AliasedMemoUnmemoized = () => <div />;
          export const AliasedMemo = React.memo(AliasedMemoUnmemoized);
        `,
        errors: [baseError('AliasedMemoUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import memo from '../../util/memo';
          const DefaultImportUnmemoized = () => <div />;
          export const DefaultImport = memo(DefaultImportUnmemoized);
        `,
        errors: [baseError('DefaultImportUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          const LaterTypesUnmemoized = ({}) => <div />;
          export const LaterTypes = memo(LaterTypesUnmemoized);
          type LaterTypesProps = { label: string };
        `,
        errors: [baseError('LaterTypesUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          const MultipleArgsUnmemoized = () => <div />;
          const compare = () => true;
          export const MultipleArgs = memo(MultipleArgsUnmemoized, compare);
        `,
        errors: [baseError('MultipleArgsUnmemoized')],
      },
      {
        filename: 'component.tsx',
        code: `
          import { memo } from 'react';
          function OverloadedUnmemoized(): JSX.Element;
          function OverloadedUnmemoized() {
            return <div />;
          }
          export const Overloaded = memo(OverloadedUnmemoized);
        `,
        errors: [baseError('OverloadedUnmemoized')],
      },
    ],
  },
);
