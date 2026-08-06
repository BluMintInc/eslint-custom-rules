import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceTransformMemoization } from '../rules/enforce-transform-memoization';
import { useLatestCallback } from '../rules/use-latest-callback';
import { preferUseCallbackOverUseMemoForFunctions } from '../rules/prefer-usecallback-over-usememo-for-functions';

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
    // Valid: useLatestCallback is a memoization primitive. It is also the exact
    // shape use-latest-callback's fixer emits from a useMemo/useCallback
    // transform, so rejecting it would make the recommended config's own --fix
    // manufacture this rule's violations (issue #1584).
    `
      import useLatestCallback from 'use-latest-callback';
      const Switch = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'checked',
            onChangeKey: 'onChange',
            transformValue: useLatestCallback((value) => Boolean(value)),
            transformOnChange: useLatestCallback((event) => event.target.checked),
          },
          Switch,
        );
      }
    `,
    // Valid: the hook stabilizes a transform that closes over props, and it
    // takes no dependency array to audit
    `
      import useLatestCallback from 'use-latest-callback';
      const Switch = () => null;

      function Component({ formatter, onChange }) {
        const transformValue = useLatestCallback((value: string) => formatter(value));
        const transformOnChange = useLatestCallback((event) =>
          onChange(event.target.value),
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
    // Valid: the fixer's exact output for the issue's repro, reached through a
    // spread of a local object
    `
      import useLatestCallback from 'use-latest-callback';
      const Switch = () => null;

      function Component() {
        const base = {
          transformValue: useLatestCallback((value) => value),
        };
        const props = { ...base, valueKey: 'value' };

        return adaptValue(props, Switch);
      }
    `,
    // Valid: the module's sole export is the hook, so a default specifier binds
    // it under any local name. use-latest-callback's fixer picks exactly this
    // suffixed name when 'useLatestCallback' is already taken in the file.
    `
      import useLatestCallback2 from 'use-latest-callback';
      const useLatestCallback = 'not the hook';
      const Switch = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue: useLatestCallback2((value) => value),
          },
          Switch,
        );
      }
    `,
    // Valid: an arbitrary alias of the default export
    `
      import stableTransform from 'use-latest-callback';
      const Switch = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformOnChange: stableTransform((event) => event.target.value),
          },
          Switch,
        );
      }
    `,
    // Valid: the named-specifier form of the same hook
    `
      import { useLatestCallback } from 'use-latest-callback';
      const Switch = () => null;

      function Component() {
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformValue: useLatestCallback((value) => value),
          },
          Switch,
        );
      }
    `,
    // Valid: the hook used inside a custom hook rather than a component
    `
      import useLatestCallback from 'use-latest-callback';
      const Switch = () => null;

      export function useAdaptedSwitch(formatter) {
        return adaptValue(
          {
            valueKey: 'value',
            onChangeKey: 'onChange',
            transformOnChange: useLatestCallback((event) =>
              formatter(event.target.value),
            ),
          },
          Switch,
        );
      }
    `,
    // Valid: component factory. The helper is created once per factory call and
    // the component closes over that one reference, so no render recreates it.
    // useMemo is illegal in the factory, so the demanded remedy has nowhere to
    // go (issue #1770).
    `
      const Switch = () => null;

      export function createBooleanAdapter() {
        const convertToBoolean = (value: unknown) => Boolean(value);
        return function AdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
      }
    `,
    // Valid: the same factory shape for transformOnChange
    `
      const Switch = () => null;

      export function createBooleanAdapter() {
        const handleChange = (event) => event.target.checked;
        return function AdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformOnChange: handleChange,
            },
            Switch,
          );
        };
      }
    `,
    // Valid: HOC. The helper cannot be hoisted to module scope in the general
    // case because a factory helper may close over the factory's parameters.
    `
      const Switch = () => null;

      export function withBooleanAdapter(Wrapped) {
        const convertToBoolean = (value: unknown) => Boolean(value);
        return function AdaptedSwitch(props) {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Wrapped,
          );
        };
      }
    `,
    // Valid: describe-scope helper consumed from a component built in a nested
    // it. The describe callback runs once, so the reference never changes.
    `
      const Switch = () => null;

      describe('adaptValue', () => {
        const convertToBoolean = (value: unknown) => Boolean(value);
        it('adapts', () => {
          const Adapted = () =>
            adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: convertToBoolean,
              },
              Switch,
            );
          expect(Adapted).toBeDefined();
        });
      });
    `,
    // Valid: class-method factory. A class body is not a render path and hooks
    // are illegal in it.
    `
      const Switch = () => null;

      class AdapterFactory {
        build() {
          const convertToBoolean = (value: unknown) => Boolean(value);
          return function AdaptedSwitch() {
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: convertToBoolean,
              },
              Switch,
            );
          };
        }
      }
    `,
    // Valid: an IIFE is a function boundary like any other
    `
      const Switch = () => null;

      export const AdaptedSwitch = (() => {
        const convertToBoolean = (value: unknown) => Boolean(value);
        return function Adapted() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
      })();
    `,
    // Valid: a bare block outside every function binds once for the program
    `
      const Switch = () => null;
      {
        const convertToBoolean = (value: unknown) => Boolean(value);
        var Adapted = function AdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
      }
    `,
    // Valid: the factory helper reached through an identifier chain — each hop
    // is resolved against the same consumer
    `
      const Switch = () => null;

      export function createBooleanAdapter() {
        const convertToBoolean = (value: unknown) => Boolean(value);
        const transformValue = convertToBoolean;
        return function AdaptedSwitch() {
          return adaptValue(
            { valueKey: 'checked', onChangeKey: 'onChange', transformValue },
            Switch,
          );
        };
      }
    `,
    // Valid: a function declaration hoisted inside the factory
    `
      const Switch = () => null;

      export function createBooleanAdapter() {
        function convertToBoolean(value: unknown) {
          return Boolean(value);
        }
        return function AdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
      }
    `,
    // Valid: a factory helper produced by an arbitrary call — the call runs once
    // per factory call, so its result is as stable as any other outer binding
    `
      const throttle = (fn: any, ms: number) => fn;
      const TextInput = () => null;

      export function createThrottledAdapter() {
        const throttledTransform = throttle((value: number) => value.toString(), 200);
        return function AdaptedInput() {
          return adaptValue(
            {
              valueKey: 'value',
              onChangeKey: 'onChange',
              transformValue: throttledTransform,
            },
            TextInput,
          );
        };
      }
    `,
    // Valid: the consumer is a custom hook rather than a component
    `
      const Switch = () => null;

      export function createBooleanAdapter() {
        const convertToBoolean = (value: unknown) => Boolean(value);
        return function useAdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
      }
    `,
    // Valid: a factory parameter keeps its own exemption
    `
      const Switch = () => null;

      export function createBooleanAdapter(convertToBoolean) {
        return function AdaptedSwitch() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: convertToBoolean,
            },
            Switch,
          );
        };
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
    // The useLatestCallback exemption is not a file-wide amnesty: an
    // unmemoized transform sitting next to a memoized one still reports
    {
      code: `
        import useLatestCallback from 'use-latest-callback';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'checked',
              onChangeKey: 'onChange',
              transformValue: (value) => Boolean(value),
              transformOnChange: useLatestCallback((event) => event.target.checked),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A default import of the same local name from another module binds some
    // other function, so it carries no stability guarantee
    {
      code: `
        import stableTransform from './helpers';
        const Switch = () => null;
        function Component() {
          return adaptValue(
            {
              valueKey: 'value',
              onChangeKey: 'onChange',
              transformValue: stableTransform((value) => value),
            },
            Switch,
          );
        }
      `,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A helper declared in the component's own body is rebuilt by every render,
    // so the consumer-relative carve-out must not reach it. `output: null`
    // asserts the report carries no autofix: this rule declares no `fixable`
    // and hands the remediation to the author.
    {
      code: `
        const Switch = () => null;
        function Component() {
          const convertToBoolean = (value: unknown) => Boolean(value);
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
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A custom hook body re-runs on every render of its caller, so a helper
    // declared there is exactly as unstable as one in a component
    {
      code: `
        const Switch = () => null;
        export function useAdaptedSwitch() {
          const convertToBoolean = (value: unknown) => Boolean(value);
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
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A block inside the component is not a function boundary: the declaration
    // still re-runs with the render
    {
      code: `
        const Switch = () => null;
        function Component() {
          {
            const handleChange = (event) => event.target.checked;
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformOnChange: handleChange,
              },
              Switch,
            );
          }
        }
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformOnChange' }],
    },
    // The factory carve-out is keyed on the declaration being OUTSIDE the
    // component: moving the same helper inside it reports again
    {
      code: `
        const Switch = () => null;
        export function createBooleanAdapter() {
          return function AdaptedSwitch() {
            const convertToBoolean = (value: unknown) => Boolean(value);
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: convertToBoolean,
              },
              Switch,
            );
          };
        }
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // The same plant for the HOC shape
    {
      code: `
        const Switch = () => null;
        export function withBooleanAdapter(Wrapped) {
          return function AdaptedSwitch(props) {
            const convertToBoolean = (value: unknown) => Boolean(value);
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: convertToBoolean,
              },
              Wrapped,
            );
          };
        }
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // The same plant for the class-method factory shape
    {
      code: `
        const Switch = () => null;
        class AdapterFactory {
          build() {
            return function AdaptedSwitch() {
              const convertToBoolean = (value: unknown) => Boolean(value);
              return adaptValue(
                {
                  valueKey: 'checked',
                  onChangeKey: 'onChange',
                  transformValue: convertToBoolean,
                },
                Switch,
              );
            };
          }
        }
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // The same plant for the describe/it shape
    {
      code: `
        const Switch = () => null;
        describe('adaptValue', () => {
          it('adapts', () => {
            const Adapted = () => {
              const convertToBoolean = (value: unknown) => Boolean(value);
              return adaptValue(
                {
                  valueKey: 'checked',
                  onChangeKey: 'onChange',
                  transformValue: convertToBoolean,
                },
                Switch,
              );
            };
            expect(Adapted).toBeDefined();
          });
        });
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A plain helper called during render is a render path, not an outer
    // boundary: the declaration it holds is rebuilt on every render
    {
      code: `
        const Switch = () => null;
        function Component() {
          const build = () => {
            const convertToBoolean = (value: unknown) => Boolean(value);
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: convertToBoolean,
              },
              Switch,
            );
          };
          return build();
        }
      `,
      output: null,
      errors: [{ messageId: 'memoizeTransformValue' }],
    },
    // A hook call inside a factory-built component is still on a render path,
    // so the hook-shape checks keep applying there
    {
      code: `
        import { useCallback } from 'react';
        const Switch = () => null;
        export function createBooleanAdapter() {
          return function AdaptedSwitch() {
            return adaptValue(
              {
                valueKey: 'checked',
                onChangeKey: 'onChange',
                transformValue: useCallback((value) => Boolean(value), []),
              },
              Switch,
            );
          };
        }
      `,
      output: null,
      errors: [{ messageId: 'useCorrectHook' }],
    },
    // A factory-built component's own props still have to be declared as
    // dependencies: the dependency audit is measured against the render
    // boundary, not against the factory
    {
      code: `
        import { useMemo } from 'react';
        const Switch = () => null;
        export function createBooleanAdapter() {
          return function AdaptedSwitch({ formatter }) {
            return adaptValue(
              {
                valueKey: 'value',
                onChangeKey: 'onChange',
                transformValue: useMemo(() => (value) => formatter(value), []),
              },
              Switch,
            );
          };
        }
      `,
      output: null,
      errors: [{ messageId: 'missingDependencies' }],
    },
  ],
});

// use-latest-callback rewrites every useCallback into useLatestCallback and
// drops the dependency array; prefer-usecallback-over-usememo-for-functions
// first turns a function-returning useMemo into that useCallback. All three
// rules ship as 'error' in the recommended config and the first two are
// fixable, and ESLint re-lints until the output settles — so ONE `eslint --fix`
// invocation walks the whole chain. If this rule cannot see the hook the chain
// lands on, correctly memoized code goes in and a demand to memoize it comes
// out: the config manufacturing its own violation (issue #1584).
describe('enforce-transform-memoization vs use-latest-callback --fix', () => {
  const fixThenLint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-transform-memoization',
      enforceTransformMemoization as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/use-latest-callback',
      useLatestCallback as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/prefer-usecallback-over-usememo-for-functions',
      preferUseCallbackOverUseMemoForFunctions as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/enforce-transform-memoization': 'error' as const,
        'test/use-latest-callback': 'error' as const,
        'test/prefer-usecallback-over-usememo-for-functions': 'error' as const,
      },
    };
    const { output } = linter.verifyAndFix(code, config, 'Adapted.tsx');
    return {
      output,
      messages: linter.verify(
        output,
        {
          ...config,
          rules: { 'test/enforce-transform-memoization': 'error' as const },
        },
        'Adapted.tsx',
      ),
    };
  };

  it('stays silent on a useCallback transformOnChange the sibling fixer rewrites', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';
const Switch = () => null;

function Component() {
  return adaptValue(
    {
      valueKey: 'checked',
      onChangeKey: 'onChange',
      transformOnChange: useCallback((event) => event.target.checked, []),
    },
    Switch,
  );
}`,
    );

    // Without this the test passes vacuously: an unrun sibling fixer leaves the
    // original useCallback, which this rule always accepted.
    expect(output).toContain('useLatestCallback');
    expect(messages).toEqual([]);
  });

  it('stays silent on a useMemo transformValue after the full fixer chain', () => {
    const { output, messages } = fixThenLint(
      `import { useMemo } from 'react';
const Switch = () => null;

function Component() {
  const base = {
    transformValue: useMemo(() => (value) => value, []),
  };
  const props = { ...base, valueKey: 'value' };
  return adaptValue(props, Switch);
}`,
    );

    expect(output).toContain('useLatestCallback');
    expect(output).not.toContain('useMemo');
    expect(messages).toEqual([]);
  });

  it('stays silent on transforms hoisted into their own consts', () => {
    const { output, messages } = fixThenLint(
      `import { useMemo, useCallback } from 'react';
const Switch = () => null;

function Component({ formatter, onChange }) {
  const transformValue = useMemo(() => (value: string) => formatter(value), [formatter]);
  const transformOnChange = useCallback((event) => onChange(event.target.value), [onChange]);

  return adaptValue(
    { valueKey: 'value', onChangeKey: 'onChange', transformValue, transformOnChange },
    Switch,
  );
}`,
    );

    expect(output).toContain('useLatestCallback');
    expect(messages).toEqual([]);
  });

  it('still reports an unmemoized transform in the same fixed file', () => {
    const { output, messages } = fixThenLint(
      `import { useCallback } from 'react';
const Switch = () => null;

function Component() {
  return adaptValue(
    {
      valueKey: 'checked',
      onChangeKey: 'onChange',
      transformValue: (value) => Boolean(value),
      transformOnChange: useCallback((event) => event.target.checked, []),
    },
    Switch,
  );
}`,
    );

    expect(output).toContain('useLatestCallback');
    expect(messages.map((message) => message.messageId)).toEqual([
      'memoizeTransformValue',
    ]);
  });
});

// The consumer-relative carve-out (issue #1770) decides whether code is
// REWRITTEN by a downstream `--fix` run, so the rule's own fix behaviour is
// asserted directly rather than inferred: it declares no `fixable`, emits no
// fix on either side of the boundary, and a fix pass therefore converges after
// one round with the report count unchanged.
describe('enforce-transform-memoization emits no autofix across the boundary', () => {
  const FACTORY_HELPER = `const Switch = () => null;

export function createBooleanAdapter() {
  const convertToBoolean = (value: unknown) => Boolean(value);
  return function AdaptedSwitch() {
    return adaptValue(
      { valueKey: 'checked', onChangeKey: 'onChange', transformValue: convertToBoolean },
      Switch,
    );
  };
}`;

  const COMPONENT_HELPER = `const Switch = () => null;

export function createBooleanAdapter() {
  return function AdaptedSwitch() {
    const convertToBoolean = (value: unknown) => Boolean(value);
    return adaptValue(
      { valueKey: 'checked', onChangeKey: 'onChange', transformValue: convertToBoolean },
      Switch,
    );
  };
}`;

  const runAlone = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/enforce-transform-memoization',
      enforceTransformMemoization as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { 'test/enforce-transform-memoization': 'error' as const },
    };
    const { fixed, output } = linter.verifyAndFix(code, config, 'Adapted.tsx');
    return {
      fixed,
      output,
      before: linter.verify(code, config, 'Adapted.tsx'),
      after: linter.verify(output, config, 'Adapted.tsx'),
    };
  };

  it('declares no fixer at all', () => {
    expect(enforceTransformMemoization.meta.fixable).toBeUndefined();
  });

  it('leaves the factory-scoped helper untouched and silent', () => {
    const { fixed, output, before, after } = runAlone(FACTORY_HELPER);
    expect(before).toEqual([]);
    expect(fixed).toBe(false);
    expect(output).toBe(FACTORY_HELPER);
    expect(after).toEqual([]);
  });

  it('reports the component-scoped helper without rewriting it, and converges', () => {
    const { fixed, output, before, after } = runAlone(COMPONENT_HELPER);
    expect(before.map((message) => message.messageId)).toEqual([
      'memoizeTransformValue',
    ]);
    expect(fixed).toBe(false);
    expect(output).toBe(COMPONENT_HELPER);
    expect(after.map((message) => message.messageId)).toEqual([
      'memoizeTransformValue',
    ]);
  });
});
