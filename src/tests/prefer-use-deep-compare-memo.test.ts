import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { preferUseDeepCompareMemo } from '../rules/prefer-use-deep-compare-memo';

const error = {
  messageId: 'preferUseDeepCompareMemo' as const,
  data: { hook: 'useMemo' as const },
};

// Use JSX tester to allow JSX detection inside callbacks
ruleTesterJsx.run(
  'prefer-use-deep-compare-memo (jsx)',
  preferUseDeepCompareMemo,
  {
    valid: [
      // Primitives only in deps
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ value, flag }) => {
  const v = useMemo(() => value + (flag ? 1 : 0), [value, flag]);
  return <div>{v}</div>;
};
`,
      },
      // Empty deps array
      {
        code: `
import { useMemo } from 'react';
const Comp = () => {
  const c = useMemo(() => ({ a: 1 }), []);
  return <div />;
};
`,
      },
      // JSX returned from useMemo should be ignored
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ config }) => {
  const panel = useMemo(() => (<div>{config.title}</div>), [config]);
  return panel;
}
`,
      },
      // Already memoized dependency identifier
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const memoizedConfig = useMemo(() => userConfig, [userConfig]);
  const value = useMemo(() => memoizedConfig.name, [memoizedConfig]);
  return <div>{value}</div>;
};
`,
      },
      // Member expression heuristics treated as primitive to avoid FP
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ obj }) => {
  const v = useMemo(() => obj.id, [obj.id]);
  return <div>{v}</div>;
};
`,
      },
      // Function in deps (should be treated as stable enough)
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ fn }) => {
  const result = useMemo(() => fn(1), [fn]);
  return <div>{result}</div>;
};
`,
      },
    ],
    invalid: [
      // Identifier non-primitive (heuristic) triggers replacement
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
      },
      // Array literal in deps
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ a, b }) => {
  const arr = useMemo(() => a + b, [[a,b]]);
  return <div>{arr}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const Comp = ({ a, b }) => {
  const arr = useDeepCompareMemo(() => a + b, [[a,b]]);
  return <div>{arr}</div>;
};
`,
      },
      // Member expression should not trigger; but object literal in deps should
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ obj }) => {
  const result = useMemo(() => obj.id, [{ a: obj.id }]);
  return <div>{result}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const Comp = ({ obj }) => {
  const result = useDeepCompareMemo(() => obj.id, [{ a: obj.id }]);
  return <div>{result}</div>;
};
`,
      },
      // Generic type parameter preservation (access a property so rule triggers)
      {
        code: `
import { useMemo } from 'react';
type T = { a: number };
const Comp = ({ value }: { value: T }) => {
  const v = useMemo<T>(() => value.a, [value]);
  return <div>{v}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
type T = { a: number };
const Comp = ({ value }: { value: T }) => {
  const v = useDeepCompareMemo<T>(() => value.a, [value]);
  return <div>{v}</div>;
};
`,
      },
    ],
  },
);

// TS tester for non-JSX specifics
ruleTesterTs.run(
  'prefer-use-deep-compare-memo (ts)',
  preferUseDeepCompareMemo,
  {
    valid: [
      // Call expression in deps treated as primitive (avoid FP)
      {
        code: `
import { useMemo } from 'react';
function f(x: number) { return x; }
const v = useMemo(() => f(1), [f(1)]);
`,
      },
    ],
    invalid: [
      // Array dep with computed object inside
      {
        code: `
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
      },
      // A pre-existing `useDeepCompareMemo` binding makes the import unsafe to
      // insert, so the violation is reported without an autofix.
      {
        code: `
const useDeepCompareMemo = undefined as unknown as never;

import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
const useDeepCompareMemo = undefined as unknown as never;

import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // Declining the insertion must also withhold the useMemo specifier
      // removal: a member call leaves the named import unreferenced, so the
      // unguarded fix stripped it while the call site still spelled useMemo.
      {
        code: `
import React, { useMemo } from 'react';
const useDeepCompareMemo = 1;
const v = React.useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import React, { useMemo } from 'react';
const useDeepCompareMemo = 1;
const v = React.useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A function declaration binding the name collides just as a const does.
      {
        code: `
import { useMemo } from 'react';
function useDeepCompareMemo(factory: () => number, deps: unknown[]) {
  return factory();
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useMemo } from 'react';
function useDeepCompareMemo(factory: () => number, deps: unknown[]) {
  return factory();
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A named import of the same name from another module resolves to a
      // different value, so the rewritten call would change meaning.
      {
        code: `
import { useDeepCompareMemo } from 'other-package';
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useDeepCompareMemo } from 'other-package';
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A type-only import binds the name without binding a callable value.
      {
        code: `
import type { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
export type Hook = typeof useDeepCompareMemo;
`,
        output: `
import type { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
export type Hook = typeof useDeepCompareMemo;
`,
        errors: [error],
      },
      // A shadow narrower than the call site raises no TypeScript diagnostic,
      // so an unguarded rewrite would silently call the parameter.
      {
        code: `
import { useMemo } from 'react';
function build(useDeepCompareMemo: (factory: () => number) => number) {
  return useMemo(() => 1, [{ a: 1 }, 2]);
}
`,
        output: `
import { useMemo } from 'react';
function build(useDeepCompareMemo: (factory: () => number) => number) {
  return useMemo(() => 1, [{ a: 1 }, 2]);
}
`,
        errors: [error],
      },
      // The hook's own import is the binding the fix intends to emit, so its
      // presence reuses the import rather than declining.
      {
        code: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const a = useDeepCompareMemo(() => 2, [{ b: 2 }]);
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const a = useDeepCompareMemo(() => 2, [{ b: 2 }]);
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // An aliased hook import leaves `useDeepCompareMemo` unbound, so the
      // rewritten call needs its own specifier to resolve.
      {
        code: `
import { useDeepCompareMemo as deepMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const a = deepMemo(() => 2, [{ b: 2 }]);
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useDeepCompareMemo as deepMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const a = deepMemo(() => 2, [{ b: 2 }]);
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A block-scoped binding that never reaches the call site leaves the name
      // free, so the fix applies unchanged.
      {
        code: `
import { useMemo } from 'react';
function unrelated() {
  const useDeepCompareMemo = 1;
  return useDeepCompareMemo;
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
function unrelated() {
  const useDeepCompareMemo = 1;
  return useDeepCompareMemo;
}
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
    ],
  },
);
