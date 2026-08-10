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
  ],
});
