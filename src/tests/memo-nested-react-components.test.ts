import { ruleTesterJsx } from '../utils/ruleTester';
import { memoNestedReactComponents } from '../rules/memo-nested-react-components';

ruleTesterJsx.run('memo-nested-react-components', memoNestedReactComponents, {
  valid: [
    {
      code: `
        import { useCallback } from 'react';

        const handleClick = useCallback((event) => {
          event.preventDefault();
          return event.clientX;
        }, []);
      `,
    },
    {
      code: `
        import { useDeepCompareCallback } from '@blumintinc/use-deep-compare';

        const computeValue = useDeepCompareCallback((input) => input.value * 2, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const buildConfig = useCallback(() => {
          return {
            title: 'example',
            footer: <div>not treated as component</div>,
          };
        }, []);
      `,
    },
    {
      code: `
        import { useMemo, memo } from 'react';

        const Wrapped = useMemo(() => memo((props) => <div {...props} />), []);
      `,
    },
    {
      code: `
        import React, { useCallback } from 'react';

        const createHandler = useCallback(() => {
          return (event: MouseEvent) => console.log(event.type);
        }, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const noop = useCallback(() => {}, []);
      `,
    },
    {
      code: `
        import { useCallback } from 'react';

        const getList = useCallback(() => [1, 2, 3], []);
      `,
    },
    {
      code: `
        import React from 'react';

        const makeLogger = React.useCallback((label) => {
          return () => console.log(label);
        }, []);
      `,
    },
    {
      code: `
        import { useCallback, memo } from 'react';

        const ignoreTests = useCallback(() => {
          return <div>Should be ignored via pattern</div>;
        }, []);
      `,
      filename: 'Component.test.tsx',
      options: [{ ignorePatterns: ['**/*.test.tsx'] }],
    },
    {
      code: `
        import { useMemo } from 'react';
        import { memo } from '@blumintinc/util';

        const GoodComponent = useMemo(() => memo(function Component(props) {
          return <section {...props} />;
        }), []);
      `,
    },
  ],
  invalid: [
    {
      code: `
        import React, { useCallback, useMemo, memo } from 'react';

        const CustomButton = useCallback(({ onClick, children }) => <button onClick={onClick}>{children}</button>, []);
      `,
      output: `
        import React, { useCallback, useMemo, memo } from 'react';

        const CustomButton = useMemo(() => memo(({ onClick, children }) => <button onClick={onClick}>{children}</button>), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CustomButton',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback, useMemo, memo } from 'react';

        const MenuItem = useCallback((props) => <li {...props} />, []);
      `,
      output: `
        import { useCallback, useMemo, memo } from 'react';

        const MenuItem = useMemo(() => memo((props) => <li {...props} />), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'MenuItem',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { memo } from 'react';
        import { useDeepCompareCallback, useDeepCompareMemo } from '@blumintinc/use-deep-compare';

        const DeepComp = useDeepCompareCallback((props) => <div {...props} />, []);
      `,
      output: `
        import { memo } from 'react';
        import { useDeepCompareCallback, useDeepCompareMemo } from '@blumintinc/use-deep-compare';

        const DeepComp = useDeepCompareMemo(() => memo((props) => <div {...props} />), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'DeepComp',
            hookName: 'useDeepCompareCallback()',
            replacementHook: 'useDeepCompareMemo()',
          },
        },
      ],
    },
    {
      code: `
        import React from 'react';

        const Inline = React.useCallback(() => {
          return <span>inline</span>;
        }, []);
      `,
      output: `
        import React from 'react';

        const Inline = React.useMemo(() => React.memo(() => {
          return <span>inline</span>;
        }), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Inline',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback, useMemo, memo } from 'react';

        const Conditional = useCallback((flag) => {
          if (!flag) return null;
          return <div>{flag}</div>;
        }, []);
      `,
      output: `
        import { useCallback, useMemo, memo } from 'react';

        const Conditional = useMemo(() => memo((flag) => {
          if (!flag) return null;
          return <div>{flag}</div>;
        }), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Conditional',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback } from 'react';

        const Factory = useCallback(() => {
          return (props) => <section {...props} />;
        }, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'Factory',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback } from 'react';
        import { forwardRef } from 'react';

        const WithRef = useCallback(
          forwardRef((props, ref) => <input ref={ref} {...props} />),
          [],
        );
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'WithRef',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback, useMemo, memo } from 'react';

        const FragmentComp = useCallback(() => (
          <>
            <h1>Title</h1>
            <p>Copy</p>
          </>
        ), []);
      `,
      output: `
        import { useCallback, useMemo, memo } from 'react';

        const FragmentComp = useMemo(() => memo(() => (
          <>
            <h1>Title</h1>
            <p>Copy</p>
          </>
        )), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'FragmentComp',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback, useMemo, memo } from 'react';

        const SwitchComp = useCallback((type) => {
          switch (type) {
            case 'a':
              return <div>A</div>;
            default:
              return <div>Default</div>;
          }
        }, []);
      `,
      output: `
        import { useCallback, useMemo, memo } from 'react';

        const SwitchComp = useMemo(() => memo((type) => {
          switch (type) {
            case 'a':
              return <div>A</div>;
            default:
              return <div>Default</div>;
          }
        }), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'SwitchComp',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import React, { useCallback, useMemo, memo } from 'react';

        const CreateElement = useCallback(() => {
          return React.createElement('div', null, 'text');
        }, []);
      `,
      output: `
        import React, { useCallback, useMemo, memo } from 'react';

        const CreateElement = useMemo(() => memo(() => {
          return React.createElement('div', null, 'text');
        }), []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'CreateElement',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
    {
      code: `
        import { useCallback } from 'react';

        const GenericComp = useCallback(<T,>(props: { value: T }) => <div>{props.value}</div>, []);
      `,
      errors: [
        {
          messageId: 'memoizeNestedComponent',
          data: {
            componentName: 'GenericComp',
            hookName: 'useCallback()',
            replacementHook: 'useMemo()',
          },
        },
      ],
    },
  ],
});
