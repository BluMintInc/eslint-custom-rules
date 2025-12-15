import { ruleTesterTs } from '../utils/ruleTester';
import { enforceTransformMemoization } from '../rules/enforce-transform-memoization';

ruleTesterTs.run('enforce-transform-memoization', enforceTransformMemoization, {
  valid: [
    `
      import { useMemo, useCallback } from 'react';
      const Switch = () => null;

      function Component({ formatter }: { formatter: (v: unknown) => string }) {
        return adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value), []),
            transformOnChange: useCallback(
              (event) => event.target.checked,
              [],
            ),
          },
          Switch,
        );
      }
    `,
    `
      const convertToBoolean = (value: unknown) => Boolean(value);
      const Switch = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: convertToBoolean,
          },
          Switch,
        );
      }
    `,
    `
      import { useMemo, useCallback } from 'react';
      const Switch = () => null;

      function Component({ formatter, onChange }) {
        const transformValue = useMemo(
          () => (value: string) => formatter(value),
          [formatter],
        );
        const transformOnChange = useCallback(
          (event) => onChange(event.target.value),
          [onChange],
        );

        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue,
            transformOnChange,
          },
          Switch,
        );
      }
    `,
    `
      const Switch = () => null;
      function Component({ handleChange }) {
        return adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformOnChange: handleChange,
          },
          Switch,
        );
      }
    `,
    `
      import { useMemo } from 'react';
      const Switch = () => null;
      const formatter = (value: unknown) => String(value);

      function Component() {
        const transformValue = useMemo(
          () => (value: unknown) => formatter(value),
          [formatter],
        );
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue,
          },
          Switch,
        );
      }
    `,
    `
      const throttle = (fn: any) => fn;
      const throttledTransform = throttle((value: number) => value.toString(), 200);
      const TextInput = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue: throttledTransform,
          },
          TextInput,
        );
      }
    `,
    `
      import { useMemo } from 'react';
      const Switch = () => null;

      function Component() {
        const config = {
          component: Switch,
          props: {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value), []),
          },
        };

        return adaptValue(config.props, config.component);
      }
    `,
    `
      import { useMemo } from 'react';
      const Switch = () => null;

      function Component() {
        const configs = {
          base: {
            transformValue: useMemo(() => (value) => value, []),
          },
        };
        const props = { ...configs.base };

        return adaptValue(props, Switch);
      }
    `,
    `
      import { useMemo } from 'react';
      const Input = () => null;

      function Component() {
        const base = {
          transformValue: (value) => value,
        };
        const props = {
          ...base,
          transformValue: useMemo(() => (value) => value, []),
          valueKey: 'value',
        };

        return adaptValue(props, Input);
      }
    `,
    `
      import adapt from './adaptValue';
      import { useCallback } from 'react';
      const Switch = () => null;

      function Component() {
        return adapt(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformOnChange: useCallback((event) => event.target.checked, []),
          },
          Switch,
        );
      }
    `,
    `
      import { useMemo } from 'react';
      const Switch = () => null;

      function Component() {
        const base = {
          transformValue: useMemo(() => (value) => value, []),
        };
        const props = { ...base, valueKey: 'value' };

        return adaptValue(props, Switch);
      }
    `,
    `
      import { useCallback } from 'react';
      const Switch = () => null;

      function Component({ formatter }) {
        const transformOnChange = useCallback(
          (event) => formatter(event.target.value),
          [formatter],
        );
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformOnChange,
          },
          Switch,
        );
      }
    `,
    `
      const Switch = () => null;
      const convert = (value: unknown) => Boolean(value);

      function Component() {
        const transformValue = convert;
        return adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue,
          },
          Switch,
        );
      }
    `,
  ],
  invalid: [
    {
      code: `
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: (value) => Boolean(value),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    {
      code: `
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformOnChange: (event) => event.target.checked,
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    {
      code: `
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: (value) => Boolean(value),
              transformOnChange: (event) => event.target.checked,
            },
            Switch,
          );
        }
      `,
      errors: [
        { messageId: 'memoizeTransformValue' },
        { messageId: 'memoizeTransformOnChange' },
      ],
    },
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: useCallback((value) => Boolean(value), []),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'useCorrectHook' }],
    },
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformOnChange: useMemo((event) => event.target.checked, []),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'useCorrectHook' }],
    },
    {
      code: `
        const Switch = () => null;
        function Component() {
          const transformValue = (value) => Boolean(value);
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue,
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    {
      code: `
        const Switch = () => null;
        function Component() {
          function transformOnChange(event) {
            return event.target.checked;
          }
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformOnChange,
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    {
      code: `
        const Switch = () => null;
        function Component() {
          const config = {
            component: Switch,
            props: {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: (value) => Boolean(value),
            },
          };

          return adaptValue(config.props, config.component);
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: useMemo(() => (value) => Boolean(value)),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'missingDependencies' }],
    },
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformOnChange: useCallback((event) => event.target.checked),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'missingDependencies' }],
    },
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        function Component({ formatter }) {
          return adaptValue(
            {
              valueKey: 'value',
              onChangeKey: 'onChange',
              transformValue: useMemo(
                () => (value) => formatter(value),
                [],
              ),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'missingDependencies' }],
    },
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        function Component({ dependency }) {
          return adaptValue(
            {
              valueKey: 'value',
              onChangeKey: 'onChange',
              transformOnChange: useCallback(
                (event) => dependency(event.target.value),
                [],
              ),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'missingDependencies' }],
    },
    {
      code: `
        const throttle = (fn: any) => fn;
        const TextInput = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'value',
              onChangeKey: 'onChange',
              transformValue: throttle((value) => value.toString(), 200),
            },
            TextInput,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
  ],
});
