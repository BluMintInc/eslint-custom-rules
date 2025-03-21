import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../rules/enforce-transform-memoization';

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

ruleTester.run('enforce-transform-memoization', rule, {
  valid: [
    // Valid: transformValue wrapped with useMemo
    {
      code: `
        const Component = () => {
          const transformedSwitch = adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value), []),
            transformOnChange: useCallback((event) => event.target.checked, []),
          }, Switch);
          return <div>{transformedSwitch}</div>;
        };
      `,
    },
    // Valid: Using external functions (defined outside the component)
    {
      code: `
        const convertToBoolean = (value) => Boolean(value);
        const extractChecked = (event) => event.target.checked;

        function MyComponent() {
          return adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: convertToBoolean,
            transformOnChange: extractChecked,
          }, Switch);
        }
      `,
    },
    // Valid: Using variables that are already memoized
    {
      code: `
        function MyComponent() {
          const transformValue = useMemo(() => (value) => Boolean(value), []);
          const transformOnChange = useCallback((event) => event.target.checked, []);

          return adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue,
            transformOnChange,
          }, Switch);
        }
      `,
    },
    // Valid: Using dynamic dependencies in memoization
    {
      code: `
        function MyComponent({ formatter }) {
          const transformValue = useMemo(() => (value) => formatter(value), [formatter]);
          const transformOnChange = useCallback((event) => event.target.checked, []);

          return adaptValue({
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue,
            transformOnChange,
          }, TextInput);
        }
      `,
    },
    // Valid: Using nested object structure
    {
      code: `
        function MyComponent() {
          const config = {
            component: Switch,
            props: {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: useMemo(() => (value) => Boolean(value), []),
              transformOnChange: useCallback((event) => event.target.checked, []),
            }
          };

          return adaptValue(config.props, config.component);
        }
      `,
    },
    // Valid: Using a namespace import
    {
      code: `
        function MyComponent() {
          return utils.adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value), []),
            transformOnChange: useCallback((event) => event.target.checked, []),
          }, Switch);
        }
      `,
    },
    // Valid: Using a throttled function
    {
      code: `
        function MyComponent() {
          const transformFn = throttle((value) => value.toString(), 200);

          return adaptValue({
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue: transformFn,
          }, TextInput);
        }
      `,
    },
  ],
  invalid: [
    // Invalid: Inline transformValue function without useMemo
    {
      code: `
        const Component = () => {
          const transformedSwitch = adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: (value) => Boolean(value),
            transformOnChange: useCallback((event) => event.target.checked, []),
          }, Switch);
          return <div>{transformedSwitch}</div>;
        };
      `,
      errors: [{ messageId: 'enforceTransformValueMemoization' }],
    },
    // Invalid: Inline transformOnChange function without useCallback
    {
      code: `
        const Component = () => {
          const transformedSwitch = adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value), []),
            transformOnChange: (event) => event.target.checked,
          }, Switch);
          return <div>{transformedSwitch}</div>;
        };
      `,
      errors: [{ messageId: 'enforceTransformOnChangeMemoization' }],
    },
    // Invalid: Both transform functions without memoization
    {
      code: `
        const Component = () => {
          const transformedSwitch = adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: (value) => Boolean(value),
            transformOnChange: (event) => event.target.checked,
          }, Switch);
          return <div>{transformedSwitch}</div>;
        };
      `,
      errors: [
        { messageId: 'enforceTransformValueMemoization' },
        { messageId: 'enforceTransformOnChangeMemoization' },
      ],
    },
    // Invalid: Using complex object structure
    {
      code: `
        function MyComponent() {
          const config = {
            component: Switch,
            props: {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: (value) => Boolean(value),
              transformOnChange: (event) => event.target.checked,
            }
          };

          return adaptValue(config.props, config.component);
        }
      `,
      errors: [
        { messageId: 'enforceTransformValueMemoization' },
        { messageId: 'enforceTransformOnChangeMemoization' },
      ],
    },
    // Invalid: Using a namespace import
    {
      code: `
        function MyComponent() {
          return utils.adaptValue({
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: (value) => Boolean(value),
            transformOnChange: (event) => event.target.checked,
          }, Switch);
        }
      `,
      errors: [
        { messageId: 'enforceTransformValueMemoization' },
        { messageId: 'enforceTransformOnChangeMemoization' },
      ],
    },
  ],
});
