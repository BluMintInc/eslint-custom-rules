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
        const GroupModeToggles = ({ mode, preferences, label }: GroupModeTogglesProps) => (
          <FormControlLabel
            control={<div />}
            label={label}
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
  ],
});
