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
    // FC-annotated declarator with every prop read stays clean (#1620).
    {
      code: `
        type MyComponentProps = { title: string; subtitle: string };
        const MyComponent: React.FC<MyComponentProps> = ({ title, subtitle }) => (
          <div>
            <h1>{title}</h1>
            <h2>{subtitle}</h2>
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
    // An IMPORTED props type under React.FC cannot be resolved in-file and
    // stays out of scope — no report, matching the direct-annotation behavior.
    {
      code: `
        import { CardProps } from './types';
        const Card: React.FC<CardProps> = ({ title }) => <h1>{title}</h1>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A non-FC declarator annotation is never treated as a props source, even
    // when a same-file *Props type is within reach of the resolver's descent.
    {
      code: `
        type HandlerProps = { onClick: () => void; extra: string };
        type Handler = (p: HandlerProps) => null;
        const handle: Handler = (arg) => null;
        const j = <div />;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A parameter's own annotation wins over the declarator annotation when
    // both exist.
    {
      code: `
        type OuterProps = { a: string; b: string };
        type InnerProps = { a: string };
        const C: React.FC<OuterProps> = ({ a }: InnerProps) => <h1>{a}</h1>;
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
    // Issue #1890: a sibling declarator must not change the verdict in EITHER
    // direction — a fully-consumed Props type stays silent next to a sibling.
    {
      code: `
        type Props = { used: string };
        const Component = ({ used }: Props) => <div>{used}</div>, LIMIT = 2;
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
        type Props = { used: string; forwarded: string };
        const LIMIT = 2,
          Component = ({ used, ...rest }: Props) => <div {...rest}>{used}</div>;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A sibling declarator whose init is not a function is simply not a
    // component, so it contributes nothing to check.
    {
      code: `
        type Props = { used: string };
        const Component = ({ used }: Props) => <div>{used}</div>,
          CONFIG = { retries: 3 };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1912: nesting reaches every component without inventing reports.
    // Each fixture below is the fully-consumed twin of a nested-component
    // fixture in the invalid list, so an enclosing component that reads all of
    // its props stays silent no matter what is declared inside it.
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer = ({ a }: OuterProps) => {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
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
        type L1Props = { a: string };
        type L2Props = { b: string };
        type L3Props = { c: string };
        const L1 = ({ a }: L1Props) => {
          const L2 = ({ b }: L2Props) => {
            const L3 = ({ c }: L3Props) => <div>{c}</div>;
            return <L3 c={b} />;
          };
          return <L2 b={a} />;
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
        type OuterProps = { a: string };
        type FirstProps = { b: string };
        type SecondProps = { c: string };
        const Outer = ({ a }: OuterProps) => {
          const First = ({ b }: FirstProps) => <div>{b}</div>;
          const Second = ({ c }: SecondProps) => <span>{c}</span>;
          return (
            <div>
              <First b={a} />
              <Second c={a} />
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
    // A hook callback is just another body the nested declaration lives in.
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer = ({ a }: OuterProps) => {
          const rendered = useMemo(() => {
            const Inner = ({ b }: InnerProps) => <div>{b}</div>;
            return <Inner b={a} />;
          }, [a]);
          return rendered;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // An identifier param destructured in the body keeps its own verdict when
    // the body also declares a component.
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer = (props: OuterProps) => {
          const { a } = props;
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A nested component whose param shadows the enclosing param name is a
    // different binding, and each component answers from its own destructuring.
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer = (props: OuterProps) => {
          const { a } = props;
          const Inner = (props: InnerProps) => {
            const { b } = props;
            return <div>{b}</div>;
          };
          return <Inner b={a} />;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // An FC-annotated enclosing component resolves its props type from the
    // declarator annotation whether or not it declares a component inside.
    {
      code: `
        import { FC } from 'react';
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer: FC<OuterProps> = ({ a }) => {
          const Inner: FC<InnerProps> = ({ b }) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A block nested inside the component body is still inside the component.
    {
      code: `
        type OuterProps = { flag: boolean; a: string };
        type InnerProps = { b: string };
        const Outer = ({ flag, a }: OuterProps) => {
          if (flag) {
            const Inner = ({ b }: InnerProps) => <div>{b}</div>;
            return <Inner b={a} />;
          }
          return null;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A non-component factory holding a component contributes only the
    // component's verdict, and a fully-consumed one is silent.
    {
      code: `
        type InnerProps = { b: string };
        function makeComponent() {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return Inner;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A sibling declarator alongside a nested component leaves both the
    // enclosing and the nested verdict intact (#1890 crossed with #1912).
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string };
        const Outer = ({ a }: OuterProps) => {
          const LIMIT = 2,
            Inner = ({ b }: InnerProps) => (
              <div>
                {b}
                {LIMIT}
              </div>
            );
          return <Inner b={a} />;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Issue #1910: every function spelling answers the same way. The cases
    // below are the declaration and function-expression twins of the arrow
    // fixtures above, so a prop consumed in one spelling stays silent in all.
    {
      code: `
        type Props = { title: string };
        function MyComponent({ title }: Props) {
          return <h1>{title}</h1>;
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
        type Props = { title: string; subtitle: string };
        export function MyComponent({ title, subtitle }: Props) {
          return (
            <div>
              <h1>{title}</h1>
              <h2>{subtitle}</h2>
            </div>
          );
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
        type Props = { title: string };
        export default function MyComponent({ title }: Props) {
          return <h1>{title}</h1>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A rest element forwards every prop the pattern does not name.
    {
      code: `
        import { FormControlLabelProps } from '@mui/material';
        type GroupModeTogglesProps = {
          mode: string;
        } & FormControlLabelProps;
        function GroupModeToggles({ mode, ...rest }: GroupModeTogglesProps) {
          return <FormControlLabel {...rest} control={<div />} label={mode} />;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Whole-`props` parameter destructured in the body.
    {
      code: `
        type WrapApiErrorProps = Readonly<{ error: unknown; message: string }>;
        function WrapApiError(props: WrapApiErrorProps) {
          const { error, message } = props;
          return <div>{message}{String(error)}</div>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Member access and a whole-`props` spread consume props opaquely, which
    // no enumeration can follow, so the declaration spelling stays silent for
    // the same reason the arrow one does.
    {
      code: `
        type CardProps = { title: string; content: string };
        function Card(props: CardProps) {
          return (
            <div {...props}>
              <h2>{props.title}</h2>
            </div>
          );
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A prop read only inside a nested closure is read.
    {
      code: `
        type ListProps = { items: string[]; renderLabel: (item: string) => string };
        function List({ items, renderLabel }: ListProps) {
          return (
            <ul>
              {items.map((item) => (
                <li key={item}>{renderLabel(item)}</li>
              ))}
            </ul>
          );
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // An untyped parameter names no props type, so there is nothing to check.
    {
      code: `
        function Component({ title }) {
          return <h1>{title}</h1>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A parameter type that is not a `*Props` type is not a props contract,
    // which is the same boundary the arrow spelling is held to.
    {
      code: `
        type Config = { retries: number; verbose: boolean };
        function runTask({ retries }: Config) {
          return <div>{retries}</div>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A file that is neither react-like by extension nor holds JSX is out of
    // scope whatever spelling the function uses.
    {
      code: `
        type Props = { used: string; unused: string };
        export function computeThing({ used }: Props) {
          return used;
        }
      `,
      filename: 'src/util/computeThing.ts',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Generic wrappers resolve to the underlying props type in this spelling too.
    {
      code: `
        type DeepProps = { a: string; b: string };
        function Deep({ a, b }: Readonly<Partial<DeepProps>>) {
          return <div>{a}{b}</div>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A function expression assigned to a binding is the third spelling.
    {
      code: `
        type Props = { title: string };
        const MyComponent = function ({ title }: Props) {
          return <h1>{title}</h1>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A declaration nested in a factory resolves the props type from the scope
    // holding it.
    {
      code: `
        type SharedProps = { title: string };

        function makeComponent() {
          type LocalProps = SharedProps & { subtitle: string };
          function Component({ title, subtitle }: LocalProps) {
            return (
              <h1>
                {title}
                {subtitle}
              </h1>
            );
          }
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
    // A props type declared after the component still resolves, since the
    // report is deferred to `Program:exit`.
    {
      code: `
        import { ImportedProps } from './external';

        function ForwardRefComponent({ label, ...rest }: Props) {
          return <div {...rest}>{label}</div>;
        }

        type Props = { label: string } & ImportedProps;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A renamed binding marks the original prop name used.
    {
      code: `
        type ButtonProps = { onClick: () => void; label: string };
        function Button({ onClick: handleClick, label }: ButtonProps) {
          return <button onClick={handleClick}>{label}</button>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // `Omit` drops the prop from the contract, so its absence is not a finding.
    {
      code: `
        type BaseProps = {
          used: string;
          unused: string;
        };

        type Props = Omit<BaseProps, 'unused'>;

        function Component({ used }: Props) {
          return <span>{used}</span>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A configured react-like `.ts` hook, declaration-spelled, with every prop
    // consumed.
    {
      code: `
        type UseRangeProps = { value: number; onChange: (v: number) => void };
        function useRange(props: UseRangeProps) {
          const { value, onChange } = props;
          return () => onChange(value);
        }
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
    // A body destructure with a rest element forwards the remaining props.
    {
      code: `
        type RestProps = { a: string; b: string; c: string };
        function Rest(props: RestProps) {
          const { a, ...rest } = props;
          return <div {...rest}>{a}</div>;
        }
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A memo-wrapped component consuming every prop: peeling the wrapper must
    // not invent a finding (#2004).
    {
      code: `
        import { memo } from 'react';
        type BadgeProps = { label: string; count: number };
        const Badge = memo(({ label, count }: BadgeProps) => (
          <span>{label}{count}</span>
        ));
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A rest element inside a wrapper forwards the remaining props, exactly as
    // it does for the unwrapped spelling.
    {
      code: `
        import { memo } from 'react';
        type RowProps = { id: string; first: string; second: string };
        const Row = memo(({ id, ...rest }: RowProps) => <div id={id} {...rest} />);
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // `forwardRef` around a component that reads every prop stays clean.
    {
      code: `
        import { forwardRef } from 'react';
        type FieldProps = { value: string; onChange: () => void };
        const Field = forwardRef(({ value, onChange }: FieldProps, ref) => (
          <input ref={ref} value={value} onChange={onChange} />
        ));
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A wrapper call carrying no argument holds no component to answer for.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = memo();
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A spread argument hides which value reaches the wrapper, so no props type
    // can be attributed to it.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const candidates = [({ used }: WidgetProps) => <div>{used}</div>];
        const Widget = memo(...candidates);
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A call that is not a component wrapper reaches the props of no component;
    // the callback below consumes what it declares either way.
    {
      code: `
        import { useCallback } from 'react';
        type SubmitProps = { value: string };
        const submit = useCallback(({ value }: SubmitProps) => value, []);
        const view = <div onClick={submit} />;
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // The five fixtures below are memo-wrapped because `crossrule-contradiction-
    // closure` signs off on how many of this suite's blessed fixtures the
    // `require-memo` sibling reports on; a bare component would join that count
    // without adding anything the wrapper hides, since memo is transparent here.
    //
    // A `var` rebind of the param is the SAME function-scoped binding, not a
    // shadow, so its initializer still reads the real props; that forwarding is
    // an opaque consumption and nothing may be reported (#2188).
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { alpha: string; beta: string };
        declare function forward(x: unknown): any;
        const Widget = memo(function Widget(props: WidgetProps) {
          const { alpha } = props;
          var props = forward(props);
          return <div>{alpha}</div>;
        });
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // Control for #2188: the same forwarding under a non-colliding name, which
    // the walker has always credited.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { alpha: string; beta: string };
        declare function forward(x: unknown): any;
        const Widget = memo(function Widget(props: WidgetProps) {
          const { alpha } = props;
          var forwarded = forward(props);
          return <div>{alpha}{forwarded}</div>;
        });
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A block-scoped shadow ends at its own block: statements after the
    // enclosing block still reach the real param (#2185 must not over-prune).
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { alpha: string; beta: string };
        const Widget = memo((props: WidgetProps) => {
          const { alpha } = props;
          if (alpha) {
            const props = { gamma: 'x' };
            return <div>{props.gamma}</div>;
          }
          const { beta } = props;
          return <div>{alpha}{beta}</div>;
        });
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A utility type over a locally declared base enumerates the same inside an
    // intersection as alone, so consuming every member stays silent (#2187).
    {
      code: `
        import { memo } from 'react';
        type BaseProps = { alpha: string; beta: string };
        type WidgetProps = Partial<BaseProps> & { gamma?: string };
        const Widget = memo(({ alpha, beta, gamma }: WidgetProps) => (
          <div>{alpha}{beta}{gamma}</div>
        ));
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // A utility type whose base is NOT locally declared stays an opaque
    // forwarding marker in an intersection, exactly as it does alone (#2187).
    {
      code: `
        import { memo } from 'react';
        import type { ImportedProps } from './imported';
        type WidgetProps = Partial<ImportedProps> & { gamma: string };
        const Widget = memo(({ gamma }: WidgetProps) => <div>{gamma}</div>);
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
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
    // The docs' own headline incorrect example: the props type is carried by
    // the DECLARATOR annotation (`React.FC<Props>`), not the parameter (#1620).
    {
      code: `
        type MyComponentProps = {
          title: string;
          subtitle: string;
        };
        const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
          return <h1>{title}</h1>;
        };
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
    // Bare `FC` import alias resolves the same way.
    {
      code: `
        import { FC } from 'react';
        type CardProps = { title: string; footer: string };
        const Card: FC<CardProps> = ({ title }) => <h1>{title}</h1>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'footer' },
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
    // `FunctionComponent` long form.
    {
      code: `
        import { FunctionComponent } from 'react';
        type CardProps = { title: string; footer: string };
        const Card: FunctionComponent<CardProps> = ({ title }) => <h1>{title}</h1>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'footer' },
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
    // Identifier param under an FC annotation: body destructuring resolves
    // against the annotation-carried props type.
    {
      code: `
        type PanelProps = { header: string; body: string };
        const Panel: React.FC<PanelProps> = (props) => {
          const { header } = props;
          return <h1>{header}</h1>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'body' },
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
    // Issue #1890: an unused prop stays unused when the component's declaration
    // carries a sibling declarator, in either declarator order. The rule moves
    // nothing, so the sibling has no bearing on the question it answers.
    {
      code: `
        type Props = { used: string; unused: number };
        const Component = ({ used }: Props) => <div>{used}</div>, LIMIT = 2;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
        type Props = { used: string; unused: number };
        const LIMIT = 2,
          Component = ({ used }: Props) => <div>{used}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // Every declarator is analysed on its own, so two components in one
    // statement each answer for their own Props type.
    {
      code: `
        type AProps = { used: string; unusedA: number };
        type BProps = { used: string; unusedB: number };
        const A = ({ used }: AProps) => <div>{used}</div>,
          B = ({ used }: BProps) => <span>{used}</span>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedA' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedB' },
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
    // The identifier-param branch (destructuring in the body) reaches the same
    // per-declarator analysis, sibling or not.
    {
      code: `
        type Props = { used: string; unused: number };
        const LIMIT = 2,
          Component = (props: Props) => {
            const { used } = props;
            return <div>{used}</div>;
          };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // Issue #1910 repro: the component spelled as a function declaration.
    {
      code: `
        import type { ExternalProps } from './external';
        type Props = Omit<ExternalProps, 'disabled'> & { disabled: boolean; label: string };

        function Component({ disabled, label }: Props) {
          return <div>{label}{disabled ? 'on' : 'off'}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: '...ExternalProps' },
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
    // An FC-annotated declarator resolves its props type from the annotation,
    // which the declarator-level analysis preserves alongside a sibling.
    {
      code: `
        import { FC } from 'react';
        type Props = { used: string; unused: number };
        const LIMIT = 2,
          Component: FC<Props> = ({ used }) => <div>{used}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // Issue #1910: the declaration and function-expression twins of the arrow
    // fixtures above. A prop left unread is unread whichever keyword declares
    // the component.
    {
      code: `
        type Props = { title: string; subtitle: string };
        function MyComponent({ title }: Props) {
          return <h1>{title}</h1>;
        }
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
        type Props = { title: string; subtitle: string };
        export function MyComponent({ title }: Props) {
          return <h1>{title}</h1>;
        }
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
        type Props = { title: string; subtitle: string };
        export default function MyComponent({ title }: Props) {
          return <h1>{title}</h1>;
        }
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
    // Whole-`props` parameter destructured in the body, one prop omitted.
    {
      code: `
        type BodyProps = { error: unknown; message: string };
        function Body(props: BodyProps) {
          const { error } = props;
          return <div>{String(error)}</div>;
        }
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
    // A renamed binding consumes its prop; the prop named by nothing does not.
    {
      code: `
        type ButtonProps = { onClick: () => void; label: string; disabled: boolean };
        function Button({ onClick: handleClick, label }: ButtonProps) {
          return <button onClick={handleClick}>{label}</button>;
        }
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
    // A string-literal prop key reports from its own node in this spelling too.
    {
      code: `
        type Props = { 'data-testid': string; label: string };
        function Component({ label }: Props) {
          return <div>{label}</div>;
        }
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
    // An imported type intersected into the props contract must be forwarded.
    {
      code: `
        import { FormControlLabelProps } from '@mui/material';
        type GroupModeTogglesProps = {
          mode: string;
        } & FormControlLabelProps;
        function GroupModeToggles({ mode }: GroupModeTogglesProps) {
          return <FormControlLabel control={<div />} label={mode} />;
        }
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
    // A generic wrapper on the parameter annotation resolves to the props type.
    {
      code: `
        type WrapProps = { error: unknown; message: string };
        function Wrap({ error }: Readonly<WrapProps>) {
          return <div>{String(error)}</div>;
        }
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
    // `async` sits between the keyword and the parameter list without hiding it.
    {
      code: `
        type Props = { used: string; unused: string };
        async function Component({ used }: Props) {
          return <div>{used}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // So do type parameters: the props type is read off the first parameter
    // either way.
    {
      code: `
        type Props = { used: string; unused: string };
        function Component<T extends object>({ used }: Props) {
          return <div>{used}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // A props-typed parameter is what puts a function in scope, not a
    // capitalized name or a JSX return — the same boundary the arrow-spelled
    // `helper` fixture above is held to.
    {
      code: `
        type FooProps = { used: string; unused: string };

        function helper({ used }: FooProps) {
          return used.toUpperCase();
        }

        const Component = () => <span />;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // A declaration nested in a factory is reached, so an unused prop on a
    // scope-local props type is reported.
    {
      code: `
        type SharedProps = { title: string };

        function makeComponent() {
          type LocalProps = SharedProps & { subtitle: string };
          function Component({ title }: LocalProps) {
            return <h1>{title}</h1>;
          }
          return Component;
        }
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
    // A declaration nested inside an arrow component is recorded without
    // displacing the component holding it, so both verdicts stand.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };
        const Outer = ({ a }: OuterProps) => {
          function Inner({ b }: InnerProps) {
            return <div>{b}</div>;
          }
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // Issue #1912 repro: an arrow component declared inside another arrow
    // component. The enclosing component's verdict must survive the nested
    // declaration.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string };

        const Outer = ({ a }: OuterProps) => {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
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
    // A nested component and its host each answer for their own props type.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // The mirror of the #1912 repro: a fully-consumed host does not mask an
    // unread prop on the component nested inside it.
    {
      code: `
        type OuterProps = { a: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // Nesting is not depth-limited: every level answers.
    {
      code: `
        type L1Props = { a: string; unusedL1: string };
        type L2Props = { b: string; unusedL2: string };
        type L3Props = { c: string; unusedL3: string };

        const L1 = ({ a }: L1Props) => {
          const L2 = ({ b }: L2Props) => {
            const L3 = ({ c }: L3Props) => <div>{c}</div>;
            return <L3 c={b} />;
          };
          return <L2 b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedL1' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedL2' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedL3' },
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
    // Two components nested side by side in one host: neither displaces the
    // other, nor the host.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type FirstProps = { b: string; unusedFirst: string };
        type SecondProps = { c: string; unusedSecond: string };

        const Outer = ({ a }: OuterProps) => {
          const First = ({ b }: FirstProps) => <div>{b}</div>;
          const Second = ({ c }: SecondProps) => <span>{c}</span>;
          return (
            <div>
              <First b={a} />
              <Second c={a} />
            </div>
          );
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedFirst' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedSecond' },
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
    // A hook callback body holds the nested declaration without hiding the
    // component that owns the hook call.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const rendered = useMemo(() => {
            const Inner = ({ b }: InnerProps) => <div>{b}</div>;
            return <Inner b={a} />;
          }, [a]);
          return rendered;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const render = useCallback(() => {
            const Inner = ({ b }: InnerProps) => <div>{b}</div>;
            return <Inner b={a} />;
          }, [a]);
          return <div>{render()}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A callback passed to `.map` inside the returned JSX is reached too.
    {
      code: `
        type OuterProps = { items: string[]; unusedOuter: string };
        type RowProps = { label: string; unusedRow: string };

        const Outer = ({ items }: OuterProps) => {
          return (
            <ul>
              {items.map((item) => {
                const Row = ({ label }: RowProps) => <li>{label}</li>;
                return <Row key={item} label={item} />;
              })}
            </ul>
          );
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedRow' },
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
    // The declaration-spelled host of a nested arrow keeps its verdict, the
    // spelling asymmetry #1912 leaves behind once both paths record on entry.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        function Outer({ a }: OuterProps) {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        }
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A non-component factory has no verdict of its own, so only the component
    // nested inside it reports.
    {
      code: `
        type InnerProps = { b: string; unusedInner: string };

        function makeComponent() {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return Inner;
        }
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
        type InnerProps = { b: string; unusedInner: string };

        const makeComponent = () => {
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return Inner;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // The identifier-param branch reaches the same verdict with a component
    // declared in the body it scans.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = (props: OuterProps) => {
          const { a } = props;
          const Inner = ({ b }: InnerProps) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A nested param shadowing the enclosing param name binds a different
    // variable, so neither component borrows the other's destructuring.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = (props: OuterProps) => {
          const { a } = props;
          const Inner = (props: InnerProps) => {
            const { b } = props;
            return <div>{b}</div>;
          };
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // An FC-annotated host resolves its props type from the declarator and
    // keeps that verdict past a nested FC-annotated component (#1620, #1912).
    {
      code: `
        import { FC } from 'react';
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer: FC<OuterProps> = ({ a }) => {
          const Inner: FC<InnerProps> = ({ b }) => <div>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A sibling declarator in the nested statement changes neither verdict
    // (#1890 crossed with #1912).
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const LIMIT = 2,
            Inner = ({ b }: InnerProps) => (
              <div>
                {b}
                {LIMIT}
              </div>
            );
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A nested block is still inside the host component's body.
    {
      code: `
        type OuterProps = { flag: boolean; a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ flag, a }: OuterProps) => {
          if (flag) {
            const Inner = ({ b }: InnerProps) => <div>{b}</div>;
            return <Inner b={a} />;
          }
          return null;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A component behind an IIFE binding: the intervening non-component
    // statement is skipped, and the host still reports.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const Inner = (() => {
            const Deep = ({ b }: InnerProps) => <div>{b}</div>;
            return Deep;
          })();
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A nested function expression is the same statement shape as a nested
    // arrow, so the host survives it identically.
    {
      code: `
        type OuterProps = { a: string; unusedOuter: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a }: OuterProps) => {
          const Inner = function ({ b }: InnerProps) {
            return <div>{b}</div>;
          };
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedOuter' },
          type: AST_NODE_TYPES.Identifier,
        },
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A rest element on the host forwards its remaining props, and that
    // carve-out survives the nested declaration: only the nested one reports.
    {
      code: `
        type OuterProps = { a: string; extra: string };
        type InnerProps = { b: string; unusedInner: string };

        const Outer = ({ a, ...rest }: OuterProps) => {
          const Inner = ({ b }: InnerProps) => <div {...rest}>{b}</div>;
          return <Inner b={a} />;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unusedInner' },
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
    // A function expression assigned to a binding reports like the arrow it
    // could have been written as.
    {
      code: `
        type Props = { title: string; subtitle: string };
        const MyComponent = function ({ title }: Props) {
          return <h1>{title}</h1>;
        };
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
    // An FC-shaped declarator annotation supplies the props type to a function
    // expression with an unannotated parameter, as it does to an arrow.
    {
      code: `
        import { FC } from 'react';
        type Props = { used: string; unused: number };
        const Component: FC<Props> = function ({ used }) {
          return <div>{used}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // A configured react-like `.ts` hook, declaration-spelled, with a prop it
    // never reads.
    {
      code: `
        type UseRangeProps = { value: number; onChange: (v: number) => void };
        function useRange(props: UseRangeProps) {
          const { value } = props;
          return value;
        }
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
    // Two declarations sharing a props type each answer for themselves.
    {
      code: `
        type FooProps = { used: string; unused: string };

        function First({ used }: FooProps) {
          return <span>{used}</span>;
        }

        function Second({ used }: FooProps) {
          return <div>{used}</div>;
        }
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
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    // `memo(...)` is the shape `require-memo` autofixes a component INTO, so a
    // wrapper may not hide the props type from this rule (#2004).
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = memo(({ used }: WidgetProps) => <div>{used}</div>);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // The function-expression spelling `require-memo` emits when it rewrites a
    // function declaration.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = memo(function WidgetUnmemoized({ used }: WidgetProps) {
          return <div>{used}</div>;
        });
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // The namespaced callee `React.memo` names the same wrapper.
    {
      code: `
        import React from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = React.memo(({ used }: WidgetProps) => <div>{used}</div>);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // `forwardRef` passes the props as its first parameter, so the props type
    // resolves from the same position as an unwrapped component's.
    {
      code: `
        import { forwardRef } from 'react';
        type FieldProps = { value: string; placeholder: string };
        const Field = forwardRef(({ value }: FieldProps, ref) => (
          <input ref={ref} value={value} />
        ));
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'placeholder' },
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
    // Nested wrappers peel one after the other.
    {
      code: `
        import { forwardRef, memo } from 'react';
        type FieldProps = { value: string; placeholder: string };
        const Field = memo(
          forwardRef(({ value }: FieldProps, ref) => <input ref={ref} value={value} />),
        );
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'placeholder' },
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
    // The comparator `memo-compare-deeply-complex-props` adds as a second
    // argument leaves the component in first position.
    {
      code: `
        import { compareDeeply, memo } from 'src/util/memo';
        type WidgetProps = { used: string; unused: string };
        const Widget = memo(
          ({ used }: WidgetProps) => <div>{used}</div>,
          compareDeeply('used'),
        );
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // The split shape `require-memo` leaves behind for a default-exported
    // function declaration: the component is declared, then exported.
    {
      code: `
        import { memo } from 'react';
        type PageProps = { used: string; unused: string };
        const Page = memo(function PageUnmemoized({ used }: PageProps) {
          return <div>{used}</div>;
        });
        export default Page;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // An identifier parameter under a wrapper still resolves through the body
    // destructuring scan.
    {
      code: `
        import { memo } from 'react';
        type PanelProps = { header: string; body: string };
        const Panel = memo((props: PanelProps) => {
          const { header } = props;
          return <h1>{header}</h1>;
        });
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'body' },
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
    // The props type may live on the DECLARATOR under a wrapper too: the
    // annotation is read from the binding, the props from the wrapped function.
    {
      code: `
        import { memo } from 'react';
        import { FC } from 'react';
        type CardProps = { title: string; footer: string };
        const Card: FC<CardProps> = memo(({ title }) => <h1>{title}</h1>);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'footer' },
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
    // `memo?.(...)` parses as a ChainExpression around the call, so the wrapper
    // sits one node deeper than the plain spelling.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = memo?.(({ used }: WidgetProps) => <div>{used}</div>);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    // The same for an optional member callee, `React?.memo(...)`.
    {
      code: `
        import React from 'react';
        type WidgetProps = { used: string; unused: string };
        const Widget = React?.memo(({ used }: WidgetProps) => <div>{used}</div>);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
          type: AST_NODE_TYPES.Identifier,
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    // A wrapper argument that merely NAMES a component is left to the
    // declaration that holds the function: the prop is reported once, not once
    // per binding that re-wraps it.
    {
      code: `
        import { memo } from 'react';
        type WidgetProps = { used: string; unused: string };
        const WidgetUnmemoized = ({ used }: WidgetProps) => <div>{used}</div>;
        const Widget = memo(WidgetUnmemoized);
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'unused' },
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
    // #2185: a block-scoped `const props = ...` shadow must prune every LATER
    // sibling statement too, so a destructure of the SHADOW cannot credit the
    // component's props type.
    {
      code: `
        type WidgetProps = { alpha: string; beta: string };
        const Widget = (props: WidgetProps) => {
          const { alpha } = props;
          if (alpha) {
            const props = { beta: 'x' };
            const { beta } = props;
            return <div>{beta}</div>;
          }
          return <div>{alpha}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
    // Control for #2185: the identical code with the local renamed, which the
    // walker has always reported.
    {
      code: `
        type WidgetProps = { alpha: string; beta: string };
        const Widget = (props: WidgetProps) => {
          const { alpha } = props;
          if (alpha) {
            const local = { beta: 'x' };
            const { beta } = local;
            return <div>{beta}</div>;
          }
          return <div>{alpha}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
    // #2185: the shadow's opaque member access must not leak to the param
    // either — a `props.x` read of the SHADOW cannot suppress the component.
    {
      code: `
        type WidgetProps = { alpha: string; beta: string };
        const Widget = (props: WidgetProps) => {
          const { alpha } = props;
          if (alpha) {
            const props = { beta: 'x' };
            return <div>{props.beta}</div>;
          }
          return <div>{alpha}</div>;
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
    // #2185: the realistic shape — a child's props built inside a callback and
    // named `props`. The spread of that SHADOW used to register as an opaque
    // consumption of the component's own props and silence the whole component.
    {
      code: `
        type WidgetProps = { alpha: string; items: string[] };
        declare function makeChildProps(item: string): any;
        declare const Child: any;
        const Widget = (props: WidgetProps) => {
          const { items } = props;
          return (
            <div>
              {items.map((item) => {
                const props = makeChildProps(item);
                return <Child {...props} />;
              })}
            </div>
          );
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'alpha' },
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
    // #2187: `Partial<Base>` must enumerate its base's members as an
    // intersection member, not collapse to an opaque `...Partial` marker.
    {
      code: `
        type BaseProps = { alpha: string; beta: string };
        type WidgetProps = Partial<BaseProps> & {};
        const Widget = ({ alpha }: WidgetProps) => <div>{alpha}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
    // Control for #2187: the same type unintersected, which extractProps has
    // always enumerated.
    {
      code: `
        type BaseProps = { alpha: string; beta: string };
        type WidgetProps = Partial<BaseProps>;
        const Widget = ({ alpha }: WidgetProps) => <div>{alpha}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
    // #2187: the expansion is order-independent inside the intersection.
    {
      code: `
        type BaseProps = { alpha: string; beta: string };
        type WidgetProps = { gamma: string } & Required<BaseProps>;
        const Widget = ({ alpha, gamma }: WidgetProps) => <div>{alpha}{gamma}</div>;
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'beta' },
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
  ],
});
