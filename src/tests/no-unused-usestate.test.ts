import { ruleTesterJsx, withParserOptions } from '../utils/ruleTester';
import { noUnusedUseState } from '../rules/no-unused-usestate';

// The shared JSX tester supplies the parser and `ecmaFeatures.jsx`; module
// scope analysis is not its default, so every snippet here declares it.
const parserOptions = {
  ecmaVersion: 2020,
  sourceType: 'module',
} as const;

ruleTesterJsx.run('no-unused-usestate', noUnusedUseState, {
  valid: withParserOptions(parserOptions, [
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
    // An underscore-named value that is actually read is not discarded
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setValue] = useState('');
          return <input value={_} onChange={e => setValue(e.target.value)} />;
        }
      `,
    },
    // An underscore-prefixed value read inside a nested closure is not discarded
    {
      code: `
        import React, { useState, useEffect } from 'react';

        function Component() {
          const [_internal, setInternal] = useState(0);
          useEffect(() => {
            console.log(_internal);
          }, [_internal]);
          return <button onClick={() => setInternal(1)}>Go</button>;
        }
      `,
    },
    // Non-array destructuring of useState is out of scope
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const state = useState(0);
          return <div>{state[0]}</div>;
        }
      `,
    },
    // The rule matches the bare `useState` callee name, so an aliased import is
    // outside what it reports — and therefore outside what its fixer unbinds.
    {
      code: `
        import React, { useState as useLocalState } from 'react';

        function Component() {
          const [_] = useLocalState(0);
          return <div>Static</div>;
        }
      `,
    },
  ]),
  invalid: withParserOptions(parserOptions, [
    {
      // The value is discarded but the setter is live, so the declaration must stay.
      code: `
import React, { useState } from 'react';
export function C() {
  const [_, setCount] = useState(0);
  return <div onClick={() => setCount(c => c + 1)}>Inc</div>;
}
`,
      output: null,
      errors: [{ messageId: 'unusedUseState' }],
    },
    // Unused state variable with _, setter still called: report only, no fix
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setCount] = useState(0);
          return <div onClick={() => setCount(c => c + 1)}>Increment</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Unused state variable with _unused, setter still called: report only, no fix
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_unused, setFlag] = useState(false);
          return <button onClick={() => setFlag(true)}>Set Flag</button>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_unused' },
        },
      ],
      output: null,
    },
    // Multiple declarations with one discarded value whose setter is live
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0), [_, setFlag] = useState(false);
          return <div onClick={() => { setCount(count + 1); setFlag(true); }}>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Setter referenced only as a JSX prop value
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setOpen] = useState(false);
          return <Child onToggle={setOpen} />;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Setter passed as a bare callback reference
    {
      code: `
        import React, { useState } from 'react';

        function Component({ subscribe }) {
          const [_, setValue] = useState(0);
          subscribe(setValue);
          return <div />;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Setter referenced only from a deeply nested closure
    {
      code: `
        import React, { useState, useEffect } from 'react';

        function Component() {
          const [_, setTick] = useState(0);
          useEffect(() => {
            const id = setInterval(() => {
              requestAnimationFrame(() => setTick(t => t + 1));
            }, 1000);
            return () => clearInterval(id);
          }, []);
          return <div />;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Setter reached through an alias
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setValue] = useState(0);
          const update = setValue;
          return <button onClick={() => update(1)}>Update</button>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Rest element capturing the setter keeps the declaration alive
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, ...rest] = useState(0);
          return <button onClick={() => rest[0](1)}>Update</button>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // Genuinely dead pair: both the value and the setter are unreferenced. The
    // call was the import's last use, so the specifier goes with it.
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setUnused] = useState(0);
          return <div>Static</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React from 'react';

        function Component() {
          return <div>Static</div>;
        }
      `,
    },
    // Genuinely dead pair with an underscore-prefixed value name
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_unusedFlag, setUnusedFlag] = useState(false);
          return <div>Static</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_unusedFlag' },
        },
      ],
      output: `
        import React from 'react';

        function Component() {
          return <div>Static</div>;
        }
      `,
    },
    // A shadowing inner binding is not a reference to the outer setter
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setCount] = useState(0);
          function inner() {
            const setCount = (value) => console.log(value);
            setCount(1);
          }
          inner();
          return <div>Static</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React from 'react';

        function Component() {
          function inner() {
            const setCount = (value) => console.log(value);
            setCount(1);
          }
          inner();
          return <div>Static</div>;
        }
      `,
    },
    // Single-element pattern declares no setter, so removal is safe
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_] = useState(0);
          return <div>Static</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React from 'react';

        function Component() {
          return <div>Static</div>;
        }
      `,
    },
    // Multiple declarators where only the dead pair is removed
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0), [_, setFlag] = useState(false);
          return <div onClick={() => setCount(count + 1)}>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);
          return <div onClick={() => setCount(count + 1)}>{count}</div>;
        }
      `,
    },
    // Dead pair declared first among multiple declarators
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setFlag] = useState(false), [count, setCount] = useState(0);
          return <div onClick={() => setCount(count + 1)}>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);
          return <div onClick={() => setCount(count + 1)}>{count}</div>;
        }
      `,
    },
    // Dead pair with a type argument and a comment on the following line
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [_, setValue] = useState<number>(0);
          // keep this comment
          return <div>Static</div>;
        }
      `,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
        import React from 'react';

        function Component() {
          // keep this comment
          return <div>Static</div>;
        }
      `,
    },
    // The reported shape of #2228: removing the last useState call unbinds the
    // specifier in the same fix, so the fixed file has no unreferenced import.
    {
      code: `
import React, { useState } from 'react';

function Component() {
  const [_] = useState(0);
  return <div>Static</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
import React from 'react';

function Component() {
  return <div>Static</div>;
}
`,
    },
    // A surviving call keeps the import: only the dead component's declaration
    // goes, and `useState` is still referenced from the live one.
    {
      code: `
import React, { useState } from 'react';

function Dead() {
  const [_] = useState(0);
  return <div>Static</div>;
}

function Live() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
import React, { useState } from 'react';

function Dead() {
  return <div>Static</div>;
}

function Live() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`,
    },
    // Losing its sole specifier collapses the whole import statement rather than
    // leaving `import {} from 'react';` behind.
    {
      code: `
import { useState } from 'react';

function Component() {
  const [_] = useState(0);
  return <div>Static</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: `
function Component() {
  return <div>Static</div>;
}
`,
    },
    // Two dead pairs in one file. Neither declaration alone is the import's last
    // use, so both removals and the unbinding ship as ONE fix — the pass that
    // deletes them resolves every report, and no later pass revisits the import.
    {
      code: `
import React, { useState } from 'react';

function First() {
  const [_] = useState(0);
  return <div>First</div>;
}

function Second() {
  const [_unused] = useState(1);
  return <div>Second</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
        {
          messageId: 'unusedUseState',
          data: { stateName: '_unused' },
        },
      ],
      output: `
import React from 'react';

function First() {
  return <div>First</div>;
}

function Second() {
  return <div>Second</div>;
}
`,
    },
    // Two dead declarators of one statement overlap on the separator between
    // them, so only the first is deleted in a pass — ESLint rejects a fix whose
    // own edits collide. The import survives this pass because the second
    // declarator still calls `useState`; the next pass deletes both, which is
    // what `verifyAndFix` converges to.
    {
      code: `
import React, { useState } from 'react';

function Component() {
  const [_a] = useState(0), [_b] = useState(1);
  return <div>Static</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_a' },
        },
        {
          messageId: 'unusedUseState',
          data: { stateName: '_b' },
        },
      ],
      output: `
import React, { useState } from 'react';

function Component() {
  const [_b] = useState(1);
  return <div>Static</div>;
}
`,
    },
    // A comment among the specifiers makes the unbinding unsafe, so the whole
    // fix is withheld: an unfixed report costs less than a stranded import.
    {
      code: `
import React, { /* keep */ useState } from 'react';

function Component() {
  const [_] = useState(0);
  return <div>Static</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
    // The discarded initializer holds the only read of a local, which the
    // deletion would strand just as surely as the import. Nothing this rule can
    // unbind safely, so the report ships without a fix.
    {
      code: `
import React, { useState } from 'react';

function Component() {
  const initial = 0;
  const [_] = useState(initial);
  return <div>Static</div>;
}
`,
      errors: [
        {
          messageId: 'unusedUseState',
          data: { stateName: '_' },
        },
      ],
      output: null,
    },
  ]),
});
