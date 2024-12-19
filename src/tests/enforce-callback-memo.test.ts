import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../rules/enforce-callback-memo';

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

ruleTester.run('enforce-callback-memo', rule, {
  valid: [
    // Valid: Function wrapped with useCallback
    {
      code: `
        const Component = () => {
          const handleClick = useCallback(() => {
            console.log('clicked');
          }, []);
          return <button onClick={handleClick} />;
        };
      `,
    },
    // Valid: Object with function wrapped with useMemo
    {
      code: `
        const Component = () => {
          const config = useMemo(() => ({
            onClick: () => console.log('clicked')
          }), []);
          return <CustomButton {...config} />;
        };
      `,
    },
    // Valid: Array with function wrapped with useMemo
    {
      code: `
        const Component = () => {
          const buttons = useMemo(() => [
            { onClick: () => console.log('clicked') }
          ], []);
          return <DialogActions buttons={buttons} />;
        };
      `,
    },
    // Valid: Non-function prop
    {
      code: `
        const Component = () => {
          return <button title="Click me" />;
        };
      `,
    },
  ],
  invalid: [
    // Invalid: Inline function
    {
      code: `
        const Component = () => {
          return <button onClick={() => console.log('clicked')} />;
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Object with inline function
    {
      code: `
        const Component = () => {
          return <CustomButton config={{ onClick: () => console.log('clicked') }} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Array with inline function
    {
      code: `
        const Component = () => {
          return <DialogActions buttons={[{ onClick: () => console.log('clicked') }]} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Nested object with inline function
    {
      code: `
        const Component = () => {
          return <CustomComponent data={{ nested: { handler: () => {} } }} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
  ],
});

