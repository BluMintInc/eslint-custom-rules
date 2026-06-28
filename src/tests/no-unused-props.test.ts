import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

const formatUnusedPropMessage = (propName: string) =>
  `Prop "${propName}" is declared in the component Props type but never used inside the component body. Unused props make the component API misleading: callers keep passing values that are ignored and reviewers assume behavior that is not implemented. Remove "${propName}" from the Props type, consume it in the component, or forward it with a rest spread (e.g., \`const MyComponent = ({ usedProp, ...rest }: Props) => <Child {...rest} />\`).`;

describe('no-unused-props messages', () => {
  it('explains why unused props are flagged', () => {
    const propName = 'subtitle';
    const formatted = noUnusedProps.meta.messages.unusedProp.replace(
      /{{propName}}/g,
      propName,
    );
    expect(formatted).toBe(formatUnusedPropMessage(propName));
  });
});

ruleTesterTs.run('no-unused-props', noUnusedProps, {
  valid: [
    {
      code: `
        type ReactionBase = {
          count: number;
          isOwnReaction: boolean;
          reactedBy: string[];
        };

        type ReactionProps = ReactionBase & {
          type: string;
          onClick: () => Promise<void> | void;
        };

        const ReactionUnmemoized = ({
          type,
          count,
          reactedBy,
          isOwnReaction,
          onClick,
        }: ReactionProps) => {
          return (
            <div onClick={onClick}>
              <span>{type}</span>
              <span>{count}</span>
            </div>
          );
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = {
          tournamentId: string;
          gameReadonly: Readonly<{ id: string; name: string }>;
        };

        export const createScheduler = ({ tournamentId }: Props) => {
          return { id: tournamentId };
        };
      `,
      filename: 'functions/src/util/tournaments/exampleBackendUsage.ts',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = { title: string };
        const MyComponent = ({ title }: Props) => <h1>{title}</h1>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type ImageOptimizedProps = { src: string; alt: string };
        const ImageOptimized = ({ src, alt }: ImageOptimizedProps) => <img src={src} alt={alt} />;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type ButtonProps = { onClick: () => void; label: string };
        const Button = ({ onClick, label }: ButtonProps) => (
          <button onClick={() => onClick()}>{label}</button>
        );
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type CardProps = { title: string; content: string };
        const Card = (props: CardProps) => (
          <div {...props}>
            <h2>{props.title}</h2>
            <p>{props.content}</p>
          </div>
        );
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        import { FormControlLabelProps } from '@mui/material';
        type GroupModeTogglesProps = {
          mode: string;
          preferences: Record<string, any>;
        } & FormControlLabelProps;
        const GroupModeToggles = ({ mode, preferences, label, ...rest }: GroupModeTogglesProps) => (
          <FormControlLabel
            {...rest}
            control={<div />}
            label={label}
          />
        );
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type ChannelGroupProps = {
          sortGroups: ({ groupNameA, groupNameB }: { groupNameA: string; groupNameB: string }) => number;
          sortChannels: ({ channelA, channelB }: { channelA: any; channelB: any }) => number;
          otherProp: string;
        };
        type ChannelsProps = Pick<ChannelGroupProps, 'sortGroups' | 'sortChannels'> & {
          channels: any[];
          channelGroupId: string;
          onClick: () => void;
        };
        const ChannelsUnmemoized = ({
          channels,
          onClick,
          sortGroups,
          sortChannels,
          channelGroupId,
        }: ChannelsProps) => {
          const groupedChannels = useMemo(() => {
            const groups: Record<string, any[]> = {};
            if (sortChannels) {
              for (const groupName of Object.keys(groups)) {
                groups[groupName].sort((channelA, channelB) => {
                  return sortChannels({ channelA, channelB });
                });
              }
            }
            return groups;
          }, [channels, sortChannels]);

          const sortedGroups = useMemo(() => {
            const groupNames = Object.keys(groupedChannels);
            groupNames.sort((groupNameA, groupNameB) => {
              return sortGroups({ groupNameA, groupNameB });
            });
            return groupNames;
          }, [groupedChannels, sortGroups]);

          return <div>{sortedGroups.join(', ')}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        import { ImportedProps } from './external';

        const ForwardRefComponent = ({ label, ...rest }: Props) => (
          <div {...rest}>{label}</div>
        );

        type Props = { label: string } & ImportedProps;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = Partial & { title: string };
        const Component = ({ title }: Props) => <h1>{title}</h1>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Base = { kept: string; dropped: string };
        type Keys = keyof Base;
        type Props = Omit<Base, Keys>;

        const Component = (_props: Props) => <div />;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type RecursiveProps = { value: string } & RecursiveProps;
        const Component = ({ value }: RecursiveProps) => <div>{value}</div>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = { 'data-testid': string; label: string };
        const Component = ({ label, 'data-testid': dataTestId }: Props) => (
          <div data-testid={dataTestId}>{label}</div>
        );
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type SharedProps = { title: string };

        function makeComponent() {
          type LocalProps = SharedProps & { subtitle: string };
          const Component = ({ title, subtitle }: LocalProps) => (
            <h1>
              {title}
              {subtitle}
            </h1>
          );
          return Component;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type BaseProps = {
          used: string;
          unused: string;
        };

        type Props = Omit<BaseProps, 'unused'>;

        const Component = ({ used }: Props) => <span>{used}</span>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type External = { external: string };
        type Base = External & { local: string };
        type Props = Omit<Base, 'local'>;

        const Component = ({ external }: Props) => <div>{external}</div>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215 Case 1: generic wrapper on the param's type annotation.
    // \`Readonly<UseRangeOnChangeProps>\` must resolve to the underlying *Props
    // type so the inline destructure marks all props used.
    {
      code: `
        export type UseRangeOnChangeProps = Readonly<{
          value: number;
          onChange: (value: number) => void;
        }>;
        export const UseRangeOnChange = ({ value, onChange }: Readonly<UseRangeOnChangeProps>) => (
          <div onClick={() => onChange(value)}>{value}</div>
        );
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215 Case 2: identifier param destructured in the body.
    {
      code: `
        type WrapApiErrorProps = Readonly<{ error: unknown; message: string }>;
        const WrapApiError = (props: WrapApiErrorProps) => {
          const { error, message } = props;
          return <div>{message}{String(error)}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215: nested generic wrappers (\`Readonly<Partial<...>>\`) resolve.
    {
      code: `
        type DeepProps = { a: string; b: string };
        const Deep = ({ a, b }: Readonly<Partial<DeepProps>>) => <div>{a}{b}</div>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215: body destructure with a renamed binding (\`{ a: localA }\`)
    // marks the original prop name \`a\` used.
    {
      code: `
        type RenameProps = { a: string; b: string };
        const Rename = (props: RenameProps) => {
          const { a: localA, b } = props;
          return <div>{localA}{b}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215: body destructure with a rest element forwards remaining props.
    {
      code: `
        type RestProps = { a: string; b: string; c: string };
        const Rest = (props: RestProps) => {
          const { a, ...rest } = props;
          return <div {...rest}>{a}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215: identifier param used opaquely (member access + spread)
    // without body destructuring is left unchecked (no report), matching the
    // prior behavior for \`(props: Props) => <div {...props}>{props.x}</div>\`.
    {
      code: `
        type AccessProps = { title: string; content: string };
        const Access = (props: AccessProps) => {
          const { title } = props;
          return <div {...props}>{title}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215: non-component functions (hooks/utilities) are checked when
    // their extension is configured as react-like; all-props-used ⇒ no report.
    {
      code: `
        type UseRangeProps = { value: number; onChange: (v: number) => void };
        const useRange = (props: UseRangeProps) => {
          const { value, onChange } = props;
          return () => onChange(value);
        };
      `,
      filename: 'src/hooks/useRange.ts',
      settings: {
        'no-unused-props': {
          reactLikeExtensions: ['.ts', '.tsx'],
        },
      },
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
  invalid: [
    {
      code: `
        type Props = { title: string; subtitle: string };
        const MyComponent = ({ title }: Props) => <h1>{title}</h1>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'subtitle' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = { 'data-testid': string; label: string };
        const Component = ({ label }: Props) => <div>{label}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'data-testid' },
          type: AST_NODE_TYPES.Literal,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type ImageOptimizedProps = { src: string; alt: string; width: number; height: number };
        const ImageOptimized = ({ src, alt }: ImageOptimizedProps) => <img src={src} alt={alt} />;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'width' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'height' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = { used: string; unused: string };
        const Component = ({ used }: Props) => <div>{used}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'component.tsx',
      settings: {
        'no-unused-props': {
          reactLikeExtensions: ['tsx'],
        },
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = Omit<{ a: string; b: string }, 'a'>;
        const Component = ({}: Props) => <div />;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'b' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type Props = Omit<{ a: string; b: string }, K>;
        type K = 'c';
        const Component = ({ a }: Props) => <div>{a}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'b' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        namespace Foo {
          export type BarProps = { kept: string; unused: string };
        }

        type Props = Omit<Foo.BarProps, 'kept'>;
        const Component = ({}: Props) => <div />;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: '...Foo.BarProps' },
          type: AST_NODE_TYPES.TSQualifiedName,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type ButtonProps = { onClick: () => void; label: string; disabled: boolean };
        const Button = ({ onClick: handleClick, label }: ButtonProps) => (
          <button onClick={handleClick}>{label}</button>
        );
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'disabled' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        import { FormControlLabelProps } from '@mui/material';
        type GroupModeTogglesProps = {
          mode: string;
          preferences: Record<string, any>;
        } & FormControlLabelProps;
        const GroupModeToggles = ({ mode, preferences }: GroupModeTogglesProps) => (
          <FormControlLabel
            control={<div />}
          />
        );
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: '...FormControlLabelProps' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type FooProps = { used: string; unused: string };

        const helper = ({ used }: FooProps) => {
          return used.toUpperCase();
        };

        const Component = ({ used }: FooProps) => {
          return <span>{used}</span>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'mixed.tsx',
      settings: {
        'no-unused-props': {
          reactLikeExtensions: [],
        },
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
        jsx: true,
      },
    },
    // Issue #1215 control: a generic-wrapped inline destructure that OMITS a
    // declared prop must still report the omitted prop (no weakened positives).
    {
      code: `
        type WrapProps = { error: unknown; message: string };
        const Wrap = ({ error }: Readonly<WrapProps>) => <div>{String(error)}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'message' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215 control: an identifier-param body destructure that OMITS a
    // declared prop must still report the omitted prop.
    {
      code: `
        type BodyProps = { error: unknown; message: string };
        const Body = (props: BodyProps) => {
          const { error } = props;
          return <div>{String(error)}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'message' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215 control: destructuring a DIFFERENT variable does not count as
    // using the param's props. \`error\` comes from \`other\`, so it is unused;
    // \`message\` comes from \`props\`, so it is used.
    {
      code: `
        type OtherProps = { error: unknown; message: string };
        const Other = (props: OtherProps) => {
          const other = { error: 1, message: 2 };
          const { error } = other;
          const { message } = props;
          return <div>{message}{String(error)}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'error' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1215 control: a configured-react-like \`.ts\` hook with a genuinely
    // unused prop is still reported (non-component checking is not a free pass).
    {
      code: `
        type UseRangeProps = { value: number; onChange: (v: number) => void };
        const useRange = (props: UseRangeProps) => {
          const { value } = props;
          return value;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'onChange' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'src/hooks/useRange.ts',
      settings: {
        'no-unused-props': {
          reactLikeExtensions: ['.ts', '.tsx'],
        },
      },
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
});
