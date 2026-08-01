import { noEmptyDependencyUseCallbacks } from '../rules/no-empty-dependency-use-callbacks';
import { ruleTesterJsx } from '../utils/ruleTester';

// Shared across the filename-gated option cases below so that the option (or
// the filename it is matched against) is the only difference between the valid
// and invalid twins. Anything else varying would let a case pass even if the
// rule ignored the option entirely.
const OPTION_PAIR_CODE = `
import { useCallback } from 'react';
const Component = () => {
  const formatLabel = useCallback((value) => value.trim(), []);
  return <div>{formatLabel('x')}</div>;
};
`;

const OPTION_PAIR_OUTPUT = `
import { useCallback } from 'react';
const formatLabel = (value) => value.trim();
const Component = () => {
  return <div>{formatLabel('x')}</div>;
};
`;

const valid = [
  `
import { useCallback } from 'react';
function getValue<T>() {
  return {} as T;
}
function Component() {
  type LocalType = { value: number };
  const handler = useCallback(() => getValue<LocalType>(), []);
  return handler();
}
`,
  `
import { useCallback } from 'react';
function Component() {
  type LocalType = { id: string };
  const handler = useCallback(() => {
    const value: LocalType = { id: 'a' };
    return value.id;
  }, []);
  return handler();
}
`,
  `
import { useCallback } from 'react';
function Component() {
  type LocalType = { id: number };
  const handler = useCallback(() => {
    function format(input: LocalType): LocalType {
      return input;
    }
    return format({ id: 1 });
  }, []);
  return handler();
}
`,
  `
import { useCallback } from 'react';
function Component() {
  const [count, setCount] = useState(0);
  const handle = useCallback(() => setCount((c) => c + 1), [setCount]);
  return <button onClick={handle}>{count}</button>;
}
`,
  `
import { useCallback, useId } from 'react';
function Component() {
  const componentId = useId();
  const logEvent = useCallback((eventType) => {
    analytics.track(eventType, { componentId });
  }, []);
  return <button onClick={() => logEvent('click')}>Log</button>;
}
`,
  `
import { useLatestCallback } from 'use-latest-callback';
function Component({ userId }) {
  const onUser = useLatestCallback(() => track(userId));
  return <button onClick={onUser}>Log</button>;
}
`,
  `
import { useCallback } from 'react';
const List = ({ items }) => {
  const renderItem = useCallback((item) => <li>{item.name}</li>, []);
  return <ul>{items.map(renderItem)}</ul>;
};
`,
  `
import { useLatestCallback } from 'use-latest-callback';
const List = ({ items }) => {
  const renderHeader = useLatestCallback(() => <header>Hi</header>);
  return <div>{renderHeader()}</div>;
};
`,
  {
    filename: 'Component.test.tsx',
    code: `
import { useCallback } from 'react';
const TestComponent = () => {
  const handler = useCallback(() => console.log('x'), []);
  return <div onClick={handler}/>;
};
    `,
  },
  {
    code: `
import { useLatestCallback } from 'use-latest-callback';
function Component() {
  const handler = useLatestCallback(() => console.log('latest'));
  return <button onClick={handler}>Run</button>;
}
    `,
    options: [{ ignoreUseLatestCallback: true }] as [
      { ignoreUseLatestCallback: boolean },
    ],
  },
  `
import { useCallback, useId } from 'react';
function Component() {
  const componentId = useId();
  const buildPayload = useCallback(() => ({ componentId }), []);
  return <div data-id={buildPayload().componentId} />;
}
`,
  `
import { useCallback } from 'react';
function Component() {
  type HandlerEvent = { value: string };
  const handler = useCallback((event: HandlerEvent) => event.value.length, []);
  return <div>{handler({ value: 'a' })}</div>;
}
`,
  `
import { useCallback } from 'react';
function Component() {
  type LocalHandler = () => string;
  const handler: LocalHandler = useCallback(() => 'hi', []);
  return handler();
}
`,
  `
import { useCallback } from 'react';
function Outer() {
  type LocalType = { value: number };
  function Inner() {
    const handler = useCallback((input: LocalType) => input.value, []);
    return handler({ value: 1 });
  }
  return <Inner />;
}
`,
  `
import { useCallback } from 'react';
function Component() {
  type LocalType = { value: string };
  const handler = useCallback((input: string) => {
    const coerced = ({ value: input } as LocalType);
    return coerced.value.length;
  }, []);
  return <div>{handler('x')}</div>;
}
`,
  `
import { useCallback } from 'react';
function Component() {
  class LocalClass {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
  }
  const handler = useCallback((instance: LocalClass) => instance.value.length, []);
  return <div>{handler(new LocalClass('a'))}</div>;
}
`,
  `
import { useCallback } from 'react';
function Component<T extends { id: string }>() {
  const handler = useCallback((value: T) => value.id, []);
  return handler({ id: 'a' });
}
`,
  {
    filename: 'component.ts',
    code: `
import { useCallback } from 'react';
function buildHandler() {
  type LocalType = { id: number };
  const handler = useCallback((input: number) => {
    const coerced = { id: input } satisfies LocalType;
    return coerced.id;
  }, []);
  return handler(1);
}
  `,
  },
  `
import { useCallback } from 'react';
function Component({ formatter }) {
  const formatPrice = useCallback((price) => formatter(price), [formatter]);
  return <span>{formatPrice(10)}</span>;
}
`,
  `
import { useCallback } from 'react';
const deps = [];
function Component() {
  const handler = useCallback(() => doThing(), deps);
  return <div onClick={handler}/>;
}
`,
  `
import { useLatestCallback } from 'use-latest-callback';
import { sendAnalytics } from './analytics';
function Component({ id }) {
  const report = useLatestCallback(() => sendAnalytics(id));
  return <button onClick={report}>Report</button>;
}
`,
  `
import { useLatestCallback } from 'use-latest-callback';
function Component() {
  type LatestHandler = () => number;
  const run: LatestHandler = useLatestCallback(() => 1);
  return run();
}
`,
  {
    filename: 'C:\\project\\components\\Component.test.tsx',
    code: `
import { useCallback } from 'react';
const Component = () => {
  const handler = useCallback(() => 'static', []);
  return <div onClick={handler} />;
};
    `,
  },
  `
import { useCallback } from 'react';
class Service {
  value = 1;
  handle = useCallback(() => this.value + 1, []);
}
class Child extends Service {
  run = useCallback(() => super.handle(), []);
}
`,
  `
import { useCallback } from 'react';
function Component() {
  enum LocalStatus {
    Active = 'active',
    Inactive = 'inactive',
  }
  const handler = useCallback(
    (status: LocalStatus) => status === LocalStatus.Active,
    [],
  );
  return handler(LocalStatus.Active);
}
`,
  `
import { useCallback } from 'react';
function Component() {
  namespace LocalNS {
    export type Payload = { id: string };
  }
  const handler = useCallback(
    (payload: LocalNS.Payload) => payload.id,
    [],
  );
  return handler({ id: 'a' });
}
`,
  // ignoreTestFiles: true is the default, but stating it explicitly pairs this
  // with the invalid twin that only flips it to false on the same fixture.
  {
    filename: 'OptionPair.test.tsx',
    code: OPTION_PAIR_CODE,
    options: [{ ignoreTestFiles: true }] as [{ ignoreTestFiles: boolean }],
  },
  // testFilePatterns widened: a filename the built-in patterns never treat as a
  // test file becomes one, so the rule goes quiet on code it otherwise reports.
  {
    filename: 'OptionPair.stories.tsx',
    code: OPTION_PAIR_CODE,
    options: [{ testFilePatterns: ['**/*.stories.*'] }] as [
      { testFilePatterns: string[] },
    ],
  },
];

const invalid = [
  {
    code: `
import { useCallback } from 'react';
function Component() {
  const formatCurrency = useCallback((amount) => amount.toFixed(2), []);
  return <span>{formatCurrency(10)}</span>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const formatCurrency = (amount) => amount.toFixed(2);
function Component() {
  return <span>{formatCurrency(10)}</span>;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
import { format } from './format';
const Component = () => {
  const formatter = useCallback((value) => format(value), []);
  return <div>{formatter('x')}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
import { format } from './format';
const formatter = (value) => format(value);
const Component = () => {
  return <div>{formatter('x')}</div>;
};
    `,
  },
  {
    code: `
import React from 'react';
function Component() {
  const handle = React.useCallback(() => console.log('hi'), []);
  return <button onClick={handle}>Click</button>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import React from 'react';
const handle = () => console.log('hi');
function Component() {
  return <button onClick={handle}>Click</button>;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
const useHook = () => {
  const noop = useCallback(() => {}, []);
  return noop;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const noop = () => {};
const useHook = () => {
  return noop;
};
    `,
  },
  {
    code: `
import { useCallback } from 'react';
export function useApiClient() {
  const apiCall = useCallback((endpoint) => fetch(endpoint), []);
  return { apiCall };
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const apiCall = (endpoint) => fetch(endpoint);
export function useApiClient() {
  return { apiCall };
}
    `,
  },
  {
    code: `
import { useLatestCallback } from 'use-latest-callback';
const Component = () => {
  const validate = useLatestCallback((email) => email.includes('@'));
  return <div>{validate('test@example.com') ? 'ok' : 'bad'}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityLatest' as const }],
    output: `
import { useLatestCallback } from 'use-latest-callback';
const validate = (email) => email.includes('@');
const Component = () => {
  return <div>{validate('test@example.com') ? 'ok' : 'bad'}</div>;
};
    `,
  },
  {
    code: `
import { useLatestCallback } from 'use-latest-callback';
import { sanitizeInput } from './sanitize';
function Component() {
  const clean = useLatestCallback((value) => sanitizeInput(value));
  return <input onChange={(e) => clean(e.target.value)} />;
}
    `,
    errors: [{ messageId: 'preferUtilityLatest' as const }],
    output: `
import { useLatestCallback } from 'use-latest-callback';
import { sanitizeInput } from './sanitize';
const clean = (value) => sanitizeInput(value);
function Component() {
  return <input onChange={(e) => clean(e.target.value)} />;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
export const Component = () => {
  const handle = useCallback(() => console.log('x'), []);
  return <button onClick={handle}/>;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const handle = () => console.log('x');
export const Component = () => {
  return <button onClick={handle}/>;
};
    `,
  },
  {
    code: `
import { useLatestCallback } from 'use-latest-callback';
export function useThing() {
  const latest = useLatestCallback(() => 'value');
  return latest;
}
    `,
    errors: [{ messageId: 'preferUtilityLatest' as const }],
    output: `
import { useLatestCallback } from 'use-latest-callback';
const latest = () => 'value';
export function useThing() {
  return latest;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
function Component() {
  const combine = useCallback((a, b) => a + b, []);
  return <div>{combine(1, 2)}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const combine = (a, b) => a + b;
function Component() {
  return <div>{combine(1, 2)}</div>;
}
    `,
  },
  {
    code: `
import React from 'react';
const Component = () => {
  const printer = React.useLatestCallback((value) => value.toString());
  return <div>{printer(10)}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityLatest' as const }],
    output: `
import React from 'react';
const printer = (value) => value.toString();
const Component = () => {
  return <div>{printer(10)}</div>;
};
    `,
  },
  {
    code: `
import { useCallback } from 'react';
function Outer() {
  function Inner() {
    const handler = useCallback(() => 123, []);
    return handler();
  }
  return <Inner />;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const handler = () => 123;
function Outer() {
  function Inner() {
    return handler();
  }
  return <Inner />;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
const base = 1;
function Component() {
  const marker = 'ok';const handler = useCallback(() => base + 1, []);
  return <div data-id={marker}>{handler()}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const base = 1;
const handler = () => base + 1;
function Component() {
  const marker = 'ok';
  return <div data-id={marker}>{handler()}</div>;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
function First() {
  const handler = useCallback(() => console.log('first'), []);
  return <button onClick={handler}>First</button>;
}
function Second() {
  const handler = useCallback(() => console.log('second'), []);
  return <button onClick={handler}>Second</button>;
}
    `,
    errors: [
      { messageId: 'preferUtilityFunction' as const },
      { messageId: 'preferUtilityFunction' as const },
    ],
    output: `
import { useCallback } from 'react';
const handler = () => console.log('first');
function First() {
  return <button onClick={handler}>First</button>;
}
function Second() {
  const handler = useCallback(() => console.log('second'), []);
  return <button onClick={handler}>Second</button>;
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
function Component() {
  let formatter = useCallback((value: number) => value.toFixed(2), []);
  formatter = (value) => formatter(value);
  return formatter(1);
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: null,
  },
  {
    code: `
import { useCallback } from 'react';
const formatCurrency = (value) => value.toFixed(2);
function Component() {
  const formatCurrency = useCallback((amount) => amount.toFixed(2), []);
  return <span>{formatCurrency(10)}</span>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: null,
  },
  {
    code: `
import { useCallback } from 'react';
type Formatter = (value: string) => number;
function Component() {
  const format: Formatter = useCallback((value: string) => value.length, []);
  return format('ok');
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
type Formatter = (value: string) => number;
const format: Formatter = (value: string) => value.length;
function Component() {
  return format('ok');
}
    `,
  },
  {
    code: `
import { useCallback } from 'react';
namespace External {
  export type LocalType = { id: string };
}
function Component() {
  type LocalType = { value: number };
  const handler = useCallback((value: External.LocalType) => value.id, []);
  return <div>{handler({ id: 'a' })}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
namespace External {
  export type LocalType = { id: string };
}
const handler = (value: External.LocalType) => value.id;
function Component() {
  type LocalType = { value: number };
  return <div>{handler({ id: 'a' })}</div>;
}
    `,
  },
  // A multi-line callback loses one nesting level when it is hoisted to module
  // scope, so its body has to be dedented by that level.
  {
    code: `
import { useCallback } from 'react';
export const ElectronCloseButton = () => {
  const closeWindow = useCallback(() => {
    if (IS_ELECTRON) {
      closeWindowNative();
    }
  }, []);
  return <button onClick={closeWindow} />;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const closeWindow = () => {
  if (IS_ELECTRON) {
    closeWindowNative();
  }
};
export const ElectronCloseButton = () => {
  return <button onClick={closeWindow} />;
};
    `,
  },
  // Two levels deep: the dedent follows the declaration's own indentation
  // rather than assuming a single component-body level.
  {
    code: `
import { useCallback } from 'react';
function Component() {
  if (SHOW_TRACKING) {
    const handleClick = useCallback(() => {
      track({
        name: 'click',
      });
    }, []);
    return <button onClick={handleClick} />;
  }
  return null;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const handleClick = () => {
  track({
    name: 'click',
  });
};
function Component() {
  if (SHOW_TRACKING) {
    return <button onClick={handleClick} />;
  }
  return null;
}
    `,
  },
  // The interior of a multi-line template literal is string data, so it must
  // survive the hoist byte for byte even though the code around it shifts.
  {
    code: `
import { useCallback } from 'react';
const QueryPanel = () => {
  const buildQuery = useCallback(() => {
    return \`
      SELECT *
      FROM users
    \`;
  }, []);
  return <div>{buildQuery()}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const buildQuery = () => {
  return \`
      SELECT *
      FROM users
    \`;
};
const QueryPanel = () => {
  return <div>{buildQuery()}</div>;
};
    `,
  },
  // A tab-indented file shifts by one tab, not by a space count.
  {
    code: `
import { useCallback } from 'react';
function TabbedComponent() {
\tconst formatLabel = useCallback((value) => {
\t\treturn value.trim();
\t}, []);
\treturn <span>{formatLabel(' x ')}</span>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const formatLabel = (value) => {
\treturn value.trim();
};
function TabbedComponent() {
\treturn <span>{formatLabel(' x ')}</span>;
}
    `,
  },
  // A callback broken onto its own argument line sits one level deeper than the
  // declaration, so the shift is measured from the callback rather than from
  // the statement that holds it.
  {
    code: `
import { useCallback } from 'react';
const Component = () => {
  const parseAmount = useCallback(
    (raw: string) => {
      return Number.parseFloat(raw);
    },
    [],
  );
  return <div>{parseAmount('1.5')}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const parseAmount = (raw: string) => {
  return Number.parseFloat(raw);
};
const Component = () => {
  return <div>{parseAmount('1.5')}</div>;
};
    `,
  },
  // A blank line has no indentation to shed, and a line indented less than the
  // shift cannot give up characters it does not have, so both are left alone
  // instead of losing code to the dedent.
  {
    code: `
import { useCallback } from 'react';
const Component = () => {
  const describe = useCallback(() => {
    const parts = [
'first',
      'second',
    ];

    return parts.join(',');
  }, []);
  return <div>{describe()}</div>;
};
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const describe = () => {
  const parts = [
'first',
    'second',
  ];

  return parts.join(',');
};
const Component = () => {
  return <div>{describe()}</div>;
};
    `,
  },
  // A callback already written at the depth it is hoisted to sheds no level, so
  // its body is reproduced byte for byte.
  {
    code: `
import { useCallback } from 'react';
function Component() {
const handler = useCallback(() => {
  return 1;
}, []);
return <div>{handler()}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const handler = () => {
  return 1;
};
function Component() {
return <div>{handler()}</div>;
}
    `,
  },
  // The hoisted declaration lands at the indentation of the statement it is
  // inserted before, so a body shallower than that gains the difference.
  {
    code: `
import { useCallback } from 'react';
  function IndentedDeclaration() {
const buildLabel = useCallback(() => {
return 'label';
}, []);
return <div>{buildLabel()}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
  const buildLabel = () => {
  return 'label';
  };
function IndentedDeclaration() {
return <div>{buildLabel()}</div>;
}
    `,
  },
  // Indent characters that disagree give no delta that can be applied without
  // corrupting the layout, so the body is reproduced as the author wrote it.
  {
    code: `
import { useCallback } from 'react';
\tfunction MixedIndent() {
  const toKey = useCallback((value) => {
    return String(value);
  }, []);
  return <div>{toKey(1)}</div>;
}
    `,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
\tconst toKey = (value) => {
    return String(value);
  };
function MixedIndent() {
  return <div>{toKey(1)}</div>;
}
    `,
  },
  // Twin of the valid ignoreTestFiles case: same fixture, same test filename,
  // only the option flips, so the rule stops skipping the file.
  {
    filename: 'OptionPair.test.tsx',
    code: OPTION_PAIR_CODE,
    options: [{ ignoreTestFiles: false }] as [{ ignoreTestFiles: boolean }],
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: OPTION_PAIR_OUTPUT,
  },
  // Twin of the valid testFilePatterns case: the same .stories.tsx fixture is
  // reported once the widened pattern is withdrawn.
  {
    filename: 'OptionPair.stories.tsx',
    code: OPTION_PAIR_CODE,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: OPTION_PAIR_OUTPUT,
  },
  // The opposite direction: testFilePatterns replaces the built-in list rather
  // than extending it, so a genuine .test.tsx file loses its exemption when the
  // supplied patterns do not cover it.
  {
    filename: 'OptionPair.test.tsx',
    code: OPTION_PAIR_CODE,
    options: [{ testFilePatterns: ['**/*.stories.*'] }] as [
      { testFilePatterns: string[] },
    ],
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: OPTION_PAIR_OUTPUT,
  },
];

ruleTesterJsx.run(
  'no-empty-dependency-use-callbacks',
  noEmptyDependencyUseCallbacks,
  {
    valid,
    invalid,
  },
);
