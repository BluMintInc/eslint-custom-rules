import { ESLintUtils } from '@typescript-eslint/utils';
import { noUnusedUseState } from '../rules/no-unused-usestate';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('no-unused-usestate', noUnusedUseState, {
  valid: [
    // Valid usage of useState
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `,
    },
    // Valid usage with custom hook
    {
      code: `
        import { useCustomHook } from './hooks';

        function Component() {
          const [_, setCustomState] = useCustomHook();
          return <div onClick={() => setCustomState(true)}>Click me</div>;
        }
      `,
    },
    // Valid usage with both values used
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [value, setValue] = useState('');
          return <input value={value} onChange={e => setValue(e.target.value)} />;
        }
      `,
    },
  ],
  invalid: [
    // Unused state variable with _
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setCount] = useState(0);
          return <div onClick={() => setCount(c => c + 1)}>Increment</div>;
        }
      `,
      errors: [{ messageId: 'unusedUseState' }],
      output: `
        import React, { useState } from 'react';

        function Component() {
          return <div onClick={() => setCount(c => c + 1)}>Increment</div>;
        }
      `,
    },
    // Unused state variable with _unused
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_unused, setFlag] = useState(false);
          return <button onClick={() => setFlag(true)}>Set Flag</button>;
        }
      `,
      errors: [{ messageId: 'unusedUseState' }],
      output: `
        import React, { useState } from 'react';

        function Component() {
          return <button onClick={() => setFlag(true)}>Set Flag</button>;
        }
      `,
    },
    // Multiple declarations with one unused
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0), [_, setFlag] = useState(false);
          return <div onClick={() => { setCount(count + 1); setFlag(true); }}>{count}</div>;
        }
      `,
      errors: [{ messageId: 'unusedUseState' }],
      output: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);
          return <div onClick={() => { setCount(count + 1); setFlag(true); }}>{count}</div>;
        }
      `,
    },
  ],
});
