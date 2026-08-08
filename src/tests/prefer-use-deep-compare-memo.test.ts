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
        // The rewritten call was the react import's only reader, so the
        // specifier — and with it the whole declaration — goes with it.
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
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
const Comp = ({ obj }) => {
  const result = useDeepCompareMemo(() => obj.id, [{ a: obj.id }]);
  return <div>{result}</div>;
};
`,
      },
      // A file with no imports still has a prologue: the inserted import lands
      // below the directive, which stops being one the moment a statement
      // precedes it.
      {
        code: `'use client';

const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `'use client';

import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
      },
      // A shebang is only a shebang at character 0, so an import spliced above
      // it leaves the file unparseable.
      {
        code: `#!/usr/bin/env node
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `#!/usr/bin/env node
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
      },
      // A header comment governs the code beneath it, so the import belongs
      // below the comment rather than above it.
      {
        code: `// @ts-nocheck
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `// @ts-nocheck
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
      },
      // Control for the prologue cases: an existing import still anchors the
      // insertion, so the directive-aware path cannot pass by refusing to
      // place imports at all.
      {
        code: `'use client';

import { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `'use client';

import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
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
type T = { a: number };
const Comp = ({ value }: { value: T }) => {
  const v = useDeepCompareMemo<T>(() => value.a, [value]);
  return <div>{v}</div>;
};
`,
      },
      // The shape the consumer's files actually carry: only the useMemo
      // specifier and its separator go, and the siblings keep their spacing.
      {
        code: `
import { ComponentType, useMemo, FC } from 'react';
const withFormatted = (Wrapped: ComponentType<{ name: string }>): FC<{ userConfig: { name: string } }> => {
  return ({ userConfig }) => {
    const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
    return <Wrapped {...formatted} />;
  };
};
export default withFormatted;
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { ComponentType, FC } from 'react';
const withFormatted = (Wrapped: ComponentType<{ name: string }>): FC<{ userConfig: { name: string } }> => {
  return ({ userConfig }) => {
    const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
    return <Wrapped {...formatted} />;
  };
};
export default withFormatted;
`,
      },
      // A specifier list spread over lines loses its own line, not its
      // neighbours'.
      {
        code: `
import {
  ComponentType,
  useMemo,
  FC,
} from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
export type Wrapped = ComponentType<Record<string, never>> | FC;
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import {
  ComponentType,
  FC,
} from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
export type Wrapped = ComponentType<Record<string, never>> | FC;
`,
      },
      // Surviving hooks from the same declaration are untouched.
      {
        code: `
import { useState, useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const [open, setOpen] = useState(false);
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div onClick={() => setOpen(!open)}>{open ? formatted.name : null}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useState } from 'react';
const Comp = ({ userConfig }) => {
  const [open, setOpen] = useState(false);
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div onClick={() => setOpen(!open)}>{open ? formatted.name : null}</div>;
};
`,
      },
      // A second call site the rule leaves alone still reads the specifier, so
      // it stays. Judging one rewrite at a time is what makes the removal
      // suppression-safe.
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ userConfig, count }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  const doubled = useMemo(() => count * 2, [count]);
  return <div>{formatted.name}{doubled}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const Comp = ({ userConfig, count }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  const doubled = useMemo(() => count * 2, [count]);
  return <div>{formatted.name}{doubled}</div>;
};
`,
      },
      // The suppression hazard: a suppressed sibling never reports, so its fix
      // never runs. Removing the specifier on the strength of a sibling report
      // would leave the surviving call spelling a name nothing binds.
      {
        code: `
import { useMemo } from 'react';
const Comp = ({ userConfig, other }) => {
  // eslint-disable-next-line
  const kept = useMemo(() => ({ name: other.name }), [other]);
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}{kept.name}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const Comp = ({ userConfig, other }) => {
  // eslint-disable-next-line
  const kept = useMemo(() => ({ name: other.name }), [other]);
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}{kept.name}</div>;
};
`,
      },
      // JSX references the default specifier through the factory pragma, so a
      // member call is not its last reader and the import stays.
      {
        code: `
import React from 'react';
const Comp = ({ userConfig }) => {
  const formatted = React.useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import React from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
      },
      // Losing every named specifier next to a surviving default takes the
      // braces with it rather than leaving `import React, {} from 'react'`.
      {
        code: `
import React, { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import React from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
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
function unrelated() {
  const useDeepCompareMemo = 1;
  return useDeepCompareMemo;
}
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A member call reads the default specifier, so unbinding it collapses
      // the declaration along with the line it owns.
      {
        code: `
import React from 'react';
const v = React.useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A type position reads the specifier just as a call does, so the import
      // survives the rewrite.
      {
        code: `
import { useMemo } from 'react';
const v = useMemo(() => 1, [{ a: 1 }, 2]);
export type Hook = typeof useMemo;
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useMemo } from 'react';
const v = useDeepCompareMemo(() => 1, [{ a: 1 }, 2]);
export type Hook = typeof useMemo;
`,
        errors: [error],
      },
      // A nested binding of the same name is a different variable, so scope
      // analysis alone would unbind the import here. The name still occurring
      // outside the rewritten callee is the coarser second opinion that
      // disagrees, and a disagreement declines the whole fix: a removal that
      // turns out to be wrong deletes working code, while one declined in error
      // only leaves the report standing.
      {
        code: `
import { useMemo } from 'react';
function unrelated(fn: () => number) {
  const useMemo = (factory: () => number) => factory();
  return useMemo(fn);
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
import { useMemo } from 'react';
function unrelated(fn: () => number) {
  const useMemo = (factory: () => number) => factory();
  return useMemo(fn);
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // A hook the file declares itself is orphaned by the rewrite too, and it
      // is bound by a declaration this fix has no business deleting, so the
      // rewrite is withheld rather than trading the report for an unused
      // function.
      {
        code: `
function useMemo(factory: () => number, deps: unknown[]) {
  return factory();
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
function useMemo(factory: () => number, deps: unknown[]) {
  return factory();
}
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // The same local hook spelled as a const arrow, withheld for the same
      // reason. The pair is what pins the symmetry: a `const` binding's own
      // initializer write is not a use of it, and counting it as one once made
      // this spelling alone fixable — rewriting the call and importing the deep
      // compare hook while leaving the local `useMemo` declared and unread
      // (#1868).
      {
        code: `
const useMemo = (factory: () => number, deps: unknown[]) => {
  return factory();
};
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        output: `
const useMemo = (factory: () => number, deps: unknown[]) => {
  return factory();
};
const v = useMemo(() => 1, [{ a: 1 }, 2]);
`,
        errors: [error],
      },
      // Two convertible calls in a file that already imports the hook are
      // rewritten in the same pass, so neither is the specifier's sole reader
      // when its own fix is planned, and afterwards the rule no longer reports —
      // no later pass exists to notice the stranded import. One fix covering
      // both calls unbinds it here.
      //
      // This case is also the non-suppressed control for the two directive cases
      // below: both call sites report, and both are fixed, when no directive
      // covers them.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
const second = useDeepCompareMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error, error],
      },
      // The batch is not limited to a pair.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
const third = useMemo(() => 3, [{ c: 3 }]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
const second = useDeepCompareMemo(() => 2, [{ b: 2 }]);
const third = useDeepCompareMemo(() => 3, [{ c: 3 }]);
`,
        errors: [error, error, error],
      },
      // The same shape without the hook already imported, which used to reach a
      // clean file only by colliding on the insertion anchor and deferring one
      // rewrite to another pass. The single fix inserts the import once and
      // finishes in one.
      {
        code: `
import { useMemo } from 'react';
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
const second = useDeepCompareMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error, error],
      },
      // A directive is applied after the rule emits its reports, so a suppressed
      // call keeps its `useMemo(...)` text while its fix is discarded. It stays
      // out of the batch, and still reading the specifier it keeps the import
      // alive. The case above is the control: both calls report there.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useMemo(() => 1, [{ a: 1 }]);
// eslint-disable-next-line
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
// eslint-disable-next-line
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error],
      },
      // Suppressing the leading call moves the carrier slot to the next one that
      // survives, so the batch is not lost with it.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
// eslint-disable-next-line
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
// eslint-disable-next-line
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useDeepCompareMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error],
      },
      // A sibling the rule never reports reads the specifier just as a
      // suppressed one does, so the import survives the batch.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const count = 2;
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => count * 2, [count]);
`,
        output: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const count = 2;
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => count * 2, [count]);
`,
        errors: [error],
      },
      // A call whose scope binds the hook name to something else is reported
      // without being rewritten, so it stays out of the batch and keeps the
      // specifier bound for its own sake.
      {
        code: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
function build(useDeepCompareMemo: (factory: () => number) => number) {
  return useMemo(() => 1, [{ a: 1 }]);
}
const v = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useMemo } from 'react';
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
function build(useDeepCompareMemo: (factory: () => number) => number) {
  return useMemo(() => 1, [{ a: 1 }]);
}
const v = useDeepCompareMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error, error],
      },
      // A member call and a bare one drop different bindings — `React` and
      // `useMemo` — and the batch unbinds both, which empties the declaration.
      {
        code: `
import React, { useMemo } from 'react';
const first = React.useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const first = useDeepCompareMemo(() => 1, [{ a: 1 }]);
const second = useDeepCompareMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error, error],
      },
      // The name occurring outside every rewritten callee declines the removal,
      // and a removal the batch cannot make declines the batch: both calls are
      // reported without a fix rather than converted into a file whose import is
      // stranded.
      {
        code: `
import { useMemo } from 'react';
function unrelated(fn: () => number) {
  const useMemo = (factory: () => number) => factory();
  return useMemo(fn);
}
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        output: `
import { useMemo } from 'react';
function unrelated(fn: () => number) {
  const useMemo = (factory: () => number) => factory();
  return useMemo(fn);
}
const first = useMemo(() => 1, [{ a: 1 }]);
const second = useMemo(() => 2, [{ b: 2 }]);
`,
        errors: [error, error],
      },
    ],
  },
);
