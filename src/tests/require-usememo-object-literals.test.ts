import { ESLintUtils } from '@typescript-eslint/utils';
import { requireUseMemoObjectLiterals } from '../rules/require-usememo-object-literals';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run(
  'require-usememo-object-literals',
  requireUseMemoObjectLiterals,
  {
    valid: [
      // Valid case: using useMemo for object literal
      {
        code: `
        function Component() {
          const buttons = useMemo(() => [
            {
              isAsync: false,
              color: 'primary',
              onClick: handleClick,
              children: 'Click me',
            },
          ], [handleClick]);
          return <DialogActions buttons={buttons} />;
        }
      `,
      },
      // Valid case: non-literal prop
      {
        code: `
        function Component() {
          const config = { foo: 'bar' };
          return <MyComponent prop={config} />;
        }
      `,
      },
      // Valid case: primitive prop
      {
        code: `
        function Component() {
          return <MyComponent prop={42} />;
        }
      `,
      },
      // Valid case: lowercase component (HTML element)
      {
        code: `
        function Component() {
          return <div style={{ color: 'red' }} />;
        }
      `,
      },
    ],
    invalid: [
      // Invalid case: inline object literal
      {
        code: `
        function Component() {
          return <DialogActions buttons={[{
            isAsync: false,
            color: 'primary',
            onClick: handleClick,
            children: 'Click me',
          }]} />;
        }
      `,
        errors: [{ messageId: 'requireUseMemo' }],
      },
      // Invalid case: inline object literal in prop
      {
        code: `
        function Component() {
          return <MyComponent config={{ foo: 'bar', baz: 42 }} />;
        }
      `,
        errors: [{ messageId: 'requireUseMemo' }],
      },
      // Invalid case: inline array literal
      {
        code: `
        function Component() {
          return <MyList items={['a', 'b', 'c']} />;
        }
      `,
        errors: [{ messageId: 'requireUseMemo' }],
      },
    ],
  },
);
