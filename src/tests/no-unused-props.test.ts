import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-unused-props', noUnusedProps, {
  valid: [
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
