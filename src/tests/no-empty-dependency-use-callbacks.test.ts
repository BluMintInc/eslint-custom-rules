import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { noEmptyDependencyUseCallbacks } from '../rules/no-empty-dependency-use-callbacks';
import { useLatestCallback } from '../rules/use-latest-callback';
import { ruleTesterJsx } from '../utils/ruleTester';

const PARSE_OPTIONS = {
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: { jsx: true },
};

function scopesOf(code: string) {
  const { scopeManager } = tsParser.parseForESLint(code, {
    ...PARSE_OPTIONS,
    range: true,
    loc: true,
  });
  const global = scopeManager?.globalScope;
  const module = global?.childScopes.find((child) => child.type === 'module');
  return { global, module };
}

/**
 * Names the source references but no longer binds.
 *
 * This is what a fix that unbinds an import too eagerly produces, and it is
 * invisible to the rule's own reports — the fix resolves them, so nothing
 * re-reports the damage. It is also strictly worse than the orphaned import
 * issue #1650 reports: an unused import is a lint warning, a call bound to
 * nothing is a runtime error.
 */
function unboundReferences(code: string): string[] {
  const { global } = scopesOf(code);
  return (global?.through ?? []).map((reference) => reference.identifier.name);
}

/** Imported locals nothing in the file references — issue #1650's symptom. */
function orphanedImportBindings(code: string): string[] {
  const { module } = scopesOf(code);
  return (module?.variables ?? [])
    .filter(
      (variable) =>
        variable.defs.some((def) => def.type === 'ImportBinding') &&
        variable.references.length === 0,
    )
    .map((variable) => variable.name);
}

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
  // Detection is by callee name, so a locally renamed hook is not reported —
  // and with no fix there is no specifier to unbind either. Pinned so that
  // teaching the rule about aliases forces the import question to be answered
  // at the same time.
  `
import { useCallback as useCb } from 'react';
export const Button = () => {
  const onClick = useCb(() => console.log('hi'), []);
  return <button onClick={onClick} />;
};
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
const base = 1;
const handler = () => base + 1;
function Component() {
  const marker = 'ok';
  return <div data-id={marker}>{handler()}</div>;
}
    `,
  },
  // Only the first hoist lands: the second declares the same identifier, which
  // the reservation refuses to duplicate at module scope. The call it leaves
  // behind still consumes the import, so the import stays.
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
  // Issue #1650, verbatim: the hoist consumes the last useCallback call, so the
  // declaration it emptied goes with it rather than being left for
  // no-unused-vars to report.
  {
    code: `
import { useCallback } from 'react';

export const Button = () => {
  const onClick = useCallback(() => {
    console.log('hi');
  }, []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
const onClick = () => {
  console.log('hi');
};
export const Button = () => {
  return <button onClick={onClick} />;
};
`,
  },
  // A second call the rule leaves alone still consumes the specifier, so
  // removing it would strand that call. Guards against over-removal.
  {
    code: `
import { useCallback } from 'react';
export const Button = ({ id }) => {
  const onClick = useCallback(() => console.log('static'), []);
  const onBlur = useCallback(() => console.log(id), [id]);
  return <button onClick={onClick} onBlur={onBlur} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
const onClick = () => console.log('static');
export const Button = ({ id }) => {
  const onBlur = useCallback(() => console.log(id), [id]);
  return <button onClick={onClick} onBlur={onBlur} />;
};
`,
  },
  // A surviving default clause keeps the declaration: only the named specifier
  // and its separator go, leaving neither empty braces nor a dangling comma.
  {
    code: `
import React, { useCallback } from 'react';
export const Button = () => {
  const onClick = useCallback(() => console.log('hi'), []);
  return React.createElement('button', { onClick });
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import React from 'react';
const onClick = () => console.log('hi');
export const Button = () => {
  return React.createElement('button', { onClick });
};
`,
  },
  // A specifier list broken over several lines keeps its layout: the removal
  // reaches to the next survivor, taking one separator and nothing else.
  {
    code: `
import {
  useCallback,
  useState,
} from 'react';
export const Button = () => {
  const [n] = useState(0);
  const onClick = useCallback(() => console.log('hi'), []);
  return <button onClick={onClick}>{n}</button>;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import {
  useState,
} from 'react';
const onClick = () => console.log('hi');
export const Button = () => {
  const [n] = useState(0);
  return <button onClick={onClick}>{n}</button>;
};
`,
  },
  // An aliased specifier is removed by its clause, not by the name it imports.
  {
    code: `
import { default as useLatestCallback } from 'use-latest-callback';
export const Button = () => {
  const onClick = useLatestCallback(() => console.log('hi'));
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityLatest' as const }],
    output: `
const onClick = () => console.log('hi');
export const Button = () => {
  return <button onClick={onClick} />;
};
`,
  },
  // A comment naming the hook binds nothing, so it does not keep the specifier
  // alive — it is left where the author wrote it.
  {
    code: `
import { useCallback } from 'react';
export const Button = () => {
  // useCallback buys nothing here
  const onClick = useCallback(() => console.log('hi'), []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
const onClick = () => console.log('hi');
export const Button = () => {
  // useCallback buys nothing here
  return <button onClick={onClick} />;
};
`,
  },
  // A type query consumes the value binding, so the specifier stays even though
  // no call site survives.
  {
    code: `
import { useCallback } from 'react';
export type Wrapper = typeof useCallback;
export const Button = () => {
  const onClick = useCallback(() => console.log('hi'), []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
export type Wrapper = typeof useCallback;
const onClick = () => console.log('hi');
export const Button = () => {
  return <button onClick={onClick} />;
};
`,
  },
  // The hoist reproduces the callback verbatim, so a hook call nested in its
  // body moves with it. That surviving reference keeps the specifier: counting
  // it as deleted would strand the relocated call.
  {
    code: `
import { useCallback } from 'react';
export const Button = () => {
  const onClick = useCallback(() => {
    const inner = useCallback(() => 1, []);
    return inner();
  }, []);
  return <button onClick={onClick} />;
};
`,
    errors: [
      { messageId: 'preferUtilityFunction' as const },
      { messageId: 'preferUtilityFunction' as const },
    ],
    output: `
import { useCallback } from 'react';
const inner = () => 1;
export const Button = () => {
  const onClick = useCallback(() => {
    return inner();
  }, []);
  return <button onClick={onClick} />;
};
`,
  },
  // Two components, two independent hoists, one fix. Neither hoist alone is the
  // specifier's last use, so orphanhood is only visible across the batch — and
  // the pass that applies both resolves every report, so nothing would ever
  // revisit the residue. Shipping them together is what lets the specifier go.
  {
    code: `
import { useCallback } from 'react';
export const First = () => {
  const first = useCallback(() => console.log('first'), []);
  return <button onClick={first} />;
};
export const Second = () => {
  const second = useCallback(() => console.log('second'), []);
  return <button onClick={second} />;
};
`,
    errors: [
      { messageId: 'preferUtilityFunction' as const },
      { messageId: 'preferUtilityFunction' as const },
    ],
    output: `
const first = () => console.log('first');
export const First = () => {
  return <button onClick={first} />;
};
const second = () => console.log('second');
export const Second = () => {
  return <button onClick={second} />;
};
`,
  },
  // Two hoists out of ONE component share only the zero-width module-scope
  // insertion point, so both ship in the same fix rather than one waiting for a
  // later pass. Their union unbinds the specifier.
  {
    code: `
import { useCallback } from 'react';
export const Button = () => {
  const onClick = useCallback(() => console.log('click'), []);
  const onBlur = useCallback(() => console.log('blur'), []);
  return <button onClick={onClick} onBlur={onBlur} />;
};
`,
    errors: [
      { messageId: 'preferUtilityFunction' as const },
      { messageId: 'preferUtilityFunction' as const },
    ],
    output: `
const onClick = () => console.log('click');
const onBlur = () => console.log('blur');
export const Button = () => {
  return <button onClick={onClick} onBlur={onBlur} />;
};
`,
  },
  // A re-export is a consumer no edit to this file can reach, so the specifier
  // stays bound even though the last call site goes.
  {
    code: `
import { useCallback } from 'react';
export { useCallback };
export const Button = () => {
  const onClick = useCallback(() => 1, []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import { useCallback } from 'react';
export { useCallback };
const onClick = () => 1;
export const Button = () => {
  return <button onClick={onClick} />;
};
`,
  },
  // A directive comment governs the line below it, so deleting that line would
  // re-aim the directive at whatever moves up. The removal cannot be made
  // safely, so the whole fix is declined: hoisting anyway would trade this
  // rule's report for an unused-import one that nothing re-reports, because the
  // hoist has already resolved the violation that would have found it.
  {
    code: `
// @ts-expect-error untyped module
import { useCallback } from 'react';
export const Button = () => {
  const onClick = useCallback(() => 1, []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: null,
  },
  // A comment inside the import declaration cannot be placed by a removal that
  // spans separators, so the planner refuses and the hoist is declined with it.
  {
    code: `
import { useCallback /* the hook */ } from 'react';
export const Button = () => {
  const onClick = useCallback(() => 1, []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: null,
  },
  // A namespace object stays bound because JSX still reads it: the scope
  // manager records the pragma's implicit reference, which is the same oracle
  // `no-unused-vars` consults. Nothing here inspects the file for JSX.
  {
    code: `
import * as React from 'react';
export const Button = () => {
  const onClick = React.useCallback(() => console.log('hi'), []);
  return <button onClick={onClick} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import * as React from 'react';
const onClick = () => console.log('hi');
export const Button = () => {
  return <button onClick={onClick} />;
};
`,
  },
  // The classic-JSX pair, both sides measured in the same `.tsx` file. Nothing
  // in the rule inspects the file for JSX or reads its extension: the scope
  // manager records the reference the pragma creates, and that alone decides.
  // With JSX the default import is read after the hoist, so it stays.
  {
    filename: 'Widget.tsx',
    code: `
import React from 'react';
export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return <button onClick={inner} />;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import React from 'react';
const inner = () => doThing();
export const Widget = () => {
  return <button onClick={inner} />;
};
`,
  },
  // The other side of the pair: same file extension, same import, no JSX. No
  // pragma reference exists, so the hoist takes the last use and the
  // declaration goes with it.
  {
    filename: 'Widget.tsx',
    code: `
import React from 'react';
export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
const inner = () => doThing();
export const Widget = () => {
  return inner;
};
`,
  },
  // The issue's repro. A member callee reads its object, so hoisting the call
  // out of the component strips the default import's last use. Without JSX
  // nothing else reads it, and the declaration goes with the hoist.
  {
    code: `
import React from 'react';
export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
const inner = () => doThing();
export const Widget = () => {
  return inner;
};
`,
  },
  // Its twin: the same hoist where `React` is read elsewhere. An over-eager
  // removal here would be the worse bug — a call bound to nothing is a runtime
  // error, an unused import only a lint report.
  {
    code: `
import React from 'react';
export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return React.createElement('div', null, inner());
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import React from 'react';
const inner = () => doThing();
export const Widget = () => {
  return React.createElement('div', null, inner());
};
`,
  },
  // A default import next to the named one: the specifier the hoist orphans is
  // removed from inside the braces and the default clause is left alone,
  // because `React` is still read by `React.createElement`.
  {
    code: `
import React, { useCallback } from 'react';
export const Widget = () => {
  const inner = useCallback(() => doThing(), []);
  return React.createElement('div', null, inner());
};
`,
    errors: [{ messageId: 'preferUtilityFunction' as const }],
    output: `
import React from 'react';
const inner = () => doThing();
export const Widget = () => {
  return React.createElement('div', null, inner());
};
`,
  },
  // Both spellings in one file. The default clause goes with the member call,
  // but the named one stays for this pass: the planner's coarse second-opinion
  // name scan counts the `useCallback` PROPERTY of `React.useCallback` as an
  // occurrence of the name, and it declines rather than guess. Erring that way
  // costs a pass, never a binding — the surviving call still reads the
  // specifier, so nothing is stranded, the report stands, and the pass that
  // hoists it retires the specifier (pinned under the real `Linter` below).
  {
    code: `
import React, { useCallback } from 'react';
export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  const outer = useCallback(() => doOther(), []);
  return [inner, outer];
};
`,
    errors: [
      { messageId: 'preferUtilityFunction' as const },
      { messageId: 'preferUtilityFunction' as const },
    ],
    output: `
import { useCallback } from 'react';
const inner = () => doThing();
export const Widget = () => {
  const outer = useCallback(() => doOther(), []);
  return [inner, outer];
};
`,
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

// A rule cannot see `eslint-disable`: suppression is applied to reports after
// they are emitted. So a fix may never assume that another report's fix also
// lands — a disabled sibling keeps calling the hook forever, and unbinding
// "its" import strands that call. These pin every suppression shape against the
// real `Linter`, which is the only place the interaction exists: RuleTester
// bypasses directive processing entirely.
describe('no-empty-dependency-use-callbacks --fix under eslint-disable', () => {
  const RULE_ID = '@blumintinc/blumint/no-empty-dependency-use-callbacks';
  const LATEST_ID = '@blumintinc/blumint/use-latest-callback';
  const FILENAME = 'Button.tsx';

  const fixWith = (code: string, rules: Record<string, 'error'>) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser as never);
    linter.defineRule(
      RULE_ID,
      noEmptyDependencyUseCallbacks as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      LATEST_ID,
      useLatestCallback as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: PARSE_OPTIONS,
        rules,
      },
      FILENAME,
    );
  };

  const fix = (code: string) => fixWith(code, { [RULE_ID]: 'error' });

  const IMPORT = "import { useCallback } from 'react';";
  const component = (name: string, body: string[] = []) =>
    [
      `export const ${name} = () => {`,
      ...body,
      `  const on${name} = useCallback(() => console.log('${name}'), []);`,
      `  return <button onClick={on${name}} />;`,
      '};',
    ].join('\n');

  const expectNothingStranded = (source: string, output: string) => {
    expect(unboundReferences(output)).toEqual(unboundReferences(source));
  };

  it('hoists and unbinds the specifier when nothing is disabled', () => {
    const source = [IMPORT, '', component('First'), ''].join('\n');
    const { output } = fixWith(source, { [RULE_ID]: 'error' });

    // Vacuity guard: a rule that stopped fixing would satisfy every assertion
    // about what the output no longer contains.
    expect(output).not.toBe(source);
    expect(output).toContain("const onFirst = () => console.log('First');");
    expect(output).not.toContain('useCallback');
    expect(orphanedImportBindings(output)).toEqual([]);
    expectNothingStranded(source, output);
  });

  it('keeps the import when a sibling call is disabled next-line', () => {
    const source = [
      IMPORT,
      '',
      component('First'),
      '',
      'export const Second = () => {',
      `  // eslint-disable-next-line ${RULE_ID}`,
      "  const onSecond = useCallback(() => console.log('Second'), []);",
      '  return <button onClick={onSecond} />;',
      '};',
      '',
    ].join('\n');
    const { output } = fix(source);

    expect(output).toContain("const onFirst = () => console.log('First');");
    expect(output).toContain(IMPORT);
    expect(output).toContain(
      "const onSecond = useCallback(() => console.log('Second'), []);",
    );
    expectNothingStranded(source, output);
  });

  it('keeps the import when a sibling call is disabled by a block', () => {
    const source = [
      IMPORT,
      '',
      component('First'),
      '',
      `/* eslint-disable ${RULE_ID} */`,
      component('Second'),
      `/* eslint-enable ${RULE_ID} */`,
      '',
    ].join('\n');
    const { output } = fix(source);

    expect(output).toContain("const onFirst = () => console.log('First');");
    expect(output).toContain(IMPORT);
    expect(output).toContain(
      "const onSecond = useCallback(() => console.log('Second'), []);",
    );
    expectNothingStranded(source, output);
  });

  it('changes nothing when the sole call is itself disabled', () => {
    const source = [
      IMPORT,
      '',
      'export const First = () => {',
      `  // eslint-disable-next-line ${RULE_ID}`,
      "  const onFirst = useCallback(() => console.log('First'), []);",
      '  return <button onClick={onFirst} />;',
      '};',
      '',
    ].join('\n');
    const { output } = fix(source);

    expect(output).toBe(source);
    expectNothingStranded(source, output);
  });

  // The member spelling owes the same debt: a disabled `React.useCallback` goes
  // on reading the default import forever, so the live sibling's hoist must not
  // take it away.
  it('keeps the default import when a member call is disabled', () => {
    const source = [
      "import React from 'react';",
      '',
      'export const First = () => {',
      "  const onFirst = React.useCallback(() => console.log('First'), []);",
      '  return onFirst;',
      '};',
      'export const Second = () => {',
      `  // eslint-disable-next-line ${RULE_ID}`,
      "  const onSecond = React.useCallback(() => console.log('Second'), []);",
      '  return onSecond;',
      '};',
      '',
    ].join('\n');
    const { output } = fix(source);

    expect(output).toContain("const onFirst = () => console.log('First');");
    expect(output).toContain("import React from 'react';");
    expect(output).toContain(
      "const onSecond = React.useCallback(() => console.log('Second'), []);",
    );
    expectNothingStranded(source, output);
  });

  // Both spellings in one file need more than one pass, because the member
  // call's `useCallback` property blocks the named specifier's removal while it
  // is still written. Every pass leaves a file that lints and links, and the
  // sequence converges on retiring the whole declaration.
  it('retires a mixed import once the passes settle', () => {
    const source = [
      "import React, { useCallback } from 'react';",
      'export const Widget = () => {',
      '  const inner = React.useCallback(() => doThing(), []);',
      '  const outer = useCallback(() => doOther(), []);',
      '  return [inner, outer];',
      '};',
      '',
    ].join('\n');
    const { output } = fix(source);

    expect(output).not.toContain("from 'react'");
    expect(output).toContain('const inner = () => doThing();');
    expect(output).toContain('const outer = () => doOther();');
    expect(orphanedImportBindings(output)).toEqual([]);
    expectNothingStranded(source, output);
  });

  // use-latest-callback rewrites the same declaration this rule hoists, and its
  // own import handling is issue #1650's sibling. What is pinned here is only
  // that this rule's fix composes: the pass converges, nothing is left bound to
  // nothing, and the hoist still happens.
  it('composes with use-latest-callback', () => {
    const source = [IMPORT, '', component('First'), ''].join('\n');
    const { output } = fixWith(source, {
      [RULE_ID]: 'error',
      [LATEST_ID]: 'error',
    });

    expect(output).not.toBe(source);
    expect(output).toContain('const onFirst = () =>');
    expectNothingStranded(source, output);
    expect(orphanedImportBindings(output)).toEqual([]);
  });
});
