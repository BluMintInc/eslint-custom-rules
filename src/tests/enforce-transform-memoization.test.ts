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
    // Valid: module scope — no enclosing function, so useMemo is impossible
    `
      const Switch = () => null;
      export const ADAPTED = adaptValue(
        { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
        Switch,
      );
    `,
    // Valid: plain non-component, non-hook function — hooks are illegal here
    `
      const Switch = () => null;
      export function buildAdapted() {
        return adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformOnChange: (e) => e.target.checked },
          Switch,
        );
      }
    `,
    // Valid: Jest test body — useMemo here is "Invalid hook call"
    `
      const Switch = () => null;
      it('adapts', () => {
        const Adapted = adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
          Switch,
        );
        expect(Adapted).toBeDefined();
      });
    `,
    // Valid: lowercase arrow const is a plain helper, not a component
    `
      const Switch = () => null;
      const buildAdapted = () =>
        adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
          Switch,
        );
    `,
    // Valid: describe body — no render path, so no hook may be called
    `
      const Switch = () => null;
      describe('adaptValue', () => {
        const Adapted = adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformOnChange: (e) => e.target.checked },
          Switch,
        );
        expect(Adapted).toBeDefined();
      });
    `,
    // Valid: beforeEach body
    `
      const Switch = () => null;
      let Adapted;
      beforeEach(() => {
        Adapted = adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
          Switch,
        );
      });
    `,
    // Valid: useCorrectHook outside a component — swapping to useMemo is still
    // an illegal hook call in a plain helper
    `
      import { useCallback } from 'react';
      const Switch = () => null;
      function buildAdapted() {
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
    // Valid: missingDependencies outside a component — the hook itself is
    // already illegal there, so demanding a dependency array is moot
    `
      import { useMemo } from 'react';
      const Switch = () => null;
      const buildAdapted = () =>
        adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useMemo(() => (value) => Boolean(value)),
          },
          Switch,
        );
    `,
    // Valid: missingDependencies at module scope
    `
      import { useCallback } from 'react';
      const Switch = () => null;
      export const ADAPTED = adaptValue(
        {
          valueKey: 'checked',
          onChangeKey: 'onChange',
          transformOnChange: useCallback((event) => event.target.checked),
        },
        Switch,
      );
    `,
    // Valid: class component render — hooks are illegal in a class, so the
    // prescribed remediation cannot be applied
    `
      const Switch = () => null;
      class MyForm extends React.Component {
        render() {
          return adaptValue(
            { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
            Switch,
          );
        }
      }
    `,
    // Valid: anonymous module-scope IIFE returns no JSX, so it is not a component
    `
      const Switch = () => null;
      const ADAPTED = (() =>
        adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
          Switch,
        ))();
    `,
    // Valid: callback nested inside a plain helper stays outside the render path
    `
      const Switch = () => null;
      function buildAll(keys: string[]) {
        return keys.map((key) =>
          adaptValue(
            { valueKey: key, onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
            Switch,
          ),
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
    {
      code: `
      const Switch = () => null;
      export function MyForm() {
        return adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
          Switch,
        );
      }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    {
      code: `
      const Switch = () => null;
      export function useAdapted() {
        return adaptValue(
          { valueKey: 'checked', onChangeKey: 'onChange', transformOnChange: (e) => e.target.checked },
          Switch,
        );
      }
      `,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    // Arrow component: PascalCase const is a component even without JSX in view
    {
      code: `
        const Switch = () => null;
        const MyForm = () =>
          adaptValue(
            { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
            Switch,
          );
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // Arrow hook
    {
      code: `
        const Switch = () => null;
        const useAdaptedSwitch = () =>
          adaptValue(
            { valueKey: 'checked', onChangeKey: 'onChange', transformOnChange: (e) => e.target.checked },
            Switch,
          );
      `,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    // A plain helper nested inside a component is still on the render path
    {
      code: `
        const Switch = () => null;
        function MyForm() {
          const build = () =>
            adaptValue(
              { valueKey: 'checked', onChangeKey: 'onChange', transformValue: (v) => Boolean(v) },
              Switch,
            );
          return build();
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A map callback inside a component is a render path
    {
      code: `
        const Switch = () => null;
        function MyForm({ keys }) {
          return keys.map((key) =>
            adaptValue(
              { valueKey: key, onChangeKey: 'onChange', transformOnChange: (e) => e.target.checked },
              Switch,
            ),
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    // forwardRef-wrapped anonymous arrow named through its declarator
    {
      code: `
        import { forwardRef } from 'react';
        const Switch = () => null;
        const MyInput = forwardRef((props, ref) =>
          adaptValue(
            { valueKey: 'value', onChangeKey: 'onChange', transformValue: (v) => String(v) },
            Switch,
          ),
        );
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // useCorrectHook inside a component still reports: useMemo is legal here
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        const MyForm = () =>
          adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: useCallback((value) => Boolean(value), []),
            },
            Switch,
          );
      `,
      errors: [{ messageId: 'useCorrectHook' }],
    },
    // useCorrectHook inside a custom hook
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        export function useAdaptedSwitch() {
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
    // missingDependencies inside a component
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        const MyForm = () =>
          adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: useMemo(() => (value) => Boolean(value)),
            },
            Switch,
          );
      `,
      errors: [{ messageId: 'missingDependencies' }],
    },
    // missingDependencies inside a custom hook
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        export function useAdaptedSwitch(dependency) {
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
  ],
});
