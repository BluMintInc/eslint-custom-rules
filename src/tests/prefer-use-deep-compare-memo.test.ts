import { Linter, Rule } from 'eslint';
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
      // Issue #1979: a string prop read through a member is still a string, and
      // React already compares it by value.
      {
        name: 'leaves a string prop read via a member alone',
        code: `
import { useMemo } from 'react';
const Comp = ({ slug }: { slug: string }) => {
  const v = useMemo(() => slug.toUpperCase(), [slug]);
  return <div>{v}</div>;
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
  return <div>{formatted.name}</div>;
};
`,
      },
      // The separator blank line after the import block is the author's, not
      // the removal's to take: the fix writes the replacement import at the
      // removed import's own anchor, and the planner is told about that write
      // via `RemovalContext.insertions`. Undeclared, the planner reads the file
      // as opening on the code below and takes the blank line. Prettier keeps
      // such a line but never reinstates one, so the loss is silent (#2240).
      {
        name: 'keeps the blank line after a sole rewritten import (#2240)',
        code: `
import { useMemo } from 'react';

const Comp = ({ o }) => {
  const v = useMemo(() => ({ a: o.a }), [o]);
  return <div>{v.a}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

const Comp = ({ o }) => {
  const v = useDeepCompareMemo(() => ({ a: o.a }), [o]);
  return <div>{v.a}</div>;
};
`,
      },
      // Same contract with a comment opening the code below: the blank line
      // sits between the import block and the comment, and neither is the
      // removal's to take. The comment binds to the component, so a planner
      // that climbs to it still must not absorb the separator (#2240).
      {
        name: 'keeps the blank line ahead of a leading comment (#2240)',
        code: `
import { useMemo } from 'react';

// renders the option row
const Comp = ({ o }) => {
  const v = useMemo(() => ({ a: o.a }), [o]);
  return <div>{v.a}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

// renders the option row
const Comp = ({ o }) => {
  const v = useDeepCompareMemo(() => ({ a: o.a }), [o]);
  return <div>{v.a}</div>;
};
`,
      },
      // Issue #1979 anti-vacuity control: the same shape as the string prop
      // above, with an object prop. The primitive carve-out must not reach it.
      {
        name: 'still reports an object prop read via a member',
        code: `
import { useMemo } from 'react';
const Comp = ({ cfg }: { cfg: { a: string } }) => {
  const v = useMemo(() => cfg.a, [cfg]);
  return <div>{v}</div>;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ cfg }: { cfg: { a: string } }) => {
  const v = useDeepCompareMemo(() => cfg.a, [cfg]);
  return <div>{v}</div>;
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
    const formatted = useDeepCompareMemo(
      () => ({ name: userConfig.name }),
      [userConfig],
    );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
  return <div>{formatted.name}</div>;
};
`,
      },
      // Issue #1959: the anchor sits past the prologue precisely because the
      // prologue precedes it, so widening the insertion to the anchor's line
      // start jumps the directive whenever the two share a line. Every file
      // this rule rewrites is a component module, which is where `'use client'`
      // lives.
      {
        name: 'keeps a directive sharing its line with the react import first',
        code: `'use client'; import { useMemo } from 'react';
const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `'use client'; import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
  return <div>{formatted.name}</div>;
};
`,
      },
      {
        name: 'keeps a directive sharing its line with the component first',
        code: `'use client'; const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`,
        errors: [error],
        output: `'use client'; import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userConfig }) => {
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
  return <div>{formatted.name}</div>;
};
`,
      },
      // The own-line branch still widens, which is what keeps the displaced
      // anchor on the indentation it already had.
      {
        name: 'keeps a directive on its own line first, indentation intact',
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
  const formatted = useDeepCompareMemo(
    () => ({ name: userConfig.name }),
    [userConfig],
  );
  return <div>{formatted.name}</div>;
};
`,
      },
      // ---------------------------------------------------------------------
      // Issue #2064: `useDeepCompareMemo` is eleven characters longer than
      // `useMemo`, so the rename widens the line it lands on without ever
      // measuring it. agora runs this plugin's `--fix` over prettier-formatted
      // source and `prettier --check` in CI, so every emitted line is measured
      // against width 80 — the repo's own Prettier settings — and each layout
      // below is what Prettier prints for that input.
      // ---------------------------------------------------------------------
      {
        // 69 columns in, exactly 80 out: the widest line the rename can produce
        // and still be what Prettier prints. Wrapping here would be the mirror
        // failure, since Prettier collapses a hand-broken call that fits.
        name: 'issue #2064: a 69-column call stays on one line',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const heading = useMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const heading = useDeepCompareMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
      },
      {
        // One column over the case above — the predicate is `> printWidth`.
        name: 'issue #2064: a 70-column call breaks its argument list open',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(
    () => ({ name: userCfg.name }),
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // Prettier prints a trailing `//` comment as a line suffix that never
        // counts toward whether the statement fits — measured, it leaves this
        // statement flat at 124 columns. Counting those columns would break a
        // call Prettier leaves alone, the mirror of the defect being fixed.
        name: 'issue #2064: a trailing line comment does not count toward the width',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const heading = useMemo(() => ({ name: userCfg.name }), [userCfg]); // note
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const heading = useDeepCompareMemo(() => ({ name: userCfg.name }), [userCfg]); // note
  return <div />;
};
`,
      },
      {
        // The same line one comment syntax apart. A block comment occupies
        // columns like any other text, and Prettier counts it: measured, it
        // breaks this identical statement at 88 columns. The comment rides along
        // on the closing line, where Prettier also puts it.
        name: 'issue #2064: a trailing block comment does count toward the width',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const heading = useMemo(() => ({ name: userCfg.name }), [userCfg]); /* note */
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const heading = useDeepCompareMemo(
    () => ({ name: userCfg.name }),
    [userCfg],
  ); /* note */
  return <div />;
};
`,
      },
      {
        // A member callee is thirteen characters, not seven, so the delta is
        // read off the callee rather than assumed: this 77-column line reaches
        // 82 and not 88.
        name: 'issue #2064: a React.useMemo callee measures its own width',
        code: `
import React from 'react';
const Comp = ({ userCfg }) => {
  const subtitleForCard = React.useMemo(() => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import React from 'react';
const Comp = ({ userCfg }) => {
  const subtitleForCard = useDeepCompareMemo(
    () => ({ n: userCfg.n }),
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // The break is written from the callee's own text onward, so a type
        // argument list rides along instead of being deleted.
        name: 'issue #2064: type arguments survive the break',
        code: `
import { useMemo } from 'react';
type Row = { name: string };
const Comp = ({ userCfg }) => {
  const subtitle = useMemo<Row>(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
type Row = { name: string };
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo<Row>(
    () => ({ name: userCfg.name }),
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // Prettier's React-hook shape: a zero-parameter arrow with a block body
        // keeps the callee and the dependency array on the outer lines and
        // breaks only the block between them. One argument per line is not what
        // it prints, so the rename stays in place and the formatter settles the
        // layout on its own pass.
        name: 'issue #2064: a block-bodied callback keeps the rename in place',
        code: `
import { useMemo } from 'react';
const Comp = ({ cfg }) => {
  const rowLabelForTheCard = useMemo(() => { return cfg.label; }, [cfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ cfg }) => {
  const rowLabelForTheCard = useDeepCompareMemo(() => { return cfg.label; }, [cfg]);
  return <div />;
};
`,
      },
      {
        // A call the author already broke carries its own line breaks inside
        // the argument text a re-render copies verbatim, so re-indenting the
        // arguments would leave every continuation line at its original column.
        name: 'issue #2064: a call already broken across lines keeps its layout',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitleForTheCardHeadingRowOfTheProfilePanel = useMemo(() => ({
    name: userCfg.name,
  }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitleForTheCardHeadingRowOfTheProfilePanel = useDeepCompareMemo(() => ({
    name: userCfg.name,
  }), [userCfg]);
  return <div />;
};
`,
      },
      {
        // Each argument slot is sliced out of the source rather than rebuilt
        // from the argument's own text, so a comment written inside the list
        // rides on the slot it annotates — which is exactly where Prettier
        // leaves it. Leaving the line flat instead was the mirror defect: the
        // very next `prettier --write` broke it open anyway (#2121).
        name: 'issue #2121: a comment leading the callback rides on its slot',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(/* keep */ () => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(
    /* keep */ () => ({ n: userCfg.n }),
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // The other three positions a single-line call offers a comment. A
        // trailing one stays ahead of the comma this re-render appends, which
        // is the side Prettier puts it on.
        name: 'issue #2121: a comment trailing the callback stays ahead of the comma',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(() => ({ n: userCfg.n }) /* keep */, [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(
    () => ({ n: userCfg.n }) /* keep */,
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        name: 'issue #2121: a comment leading the dependency array rides on its slot',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(() => ({ n: userCfg.n }), /* keep */ [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(
    () => ({ n: userCfg.n }),
    /* keep */ [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // The last slot ends at the closing parenthesis, so a comment written
        // against it is inside the slot and not stranded outside the list.
        name: 'issue #2121: a comment after the dependency array stays in its slot',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(() => ({ n: userCfg.n }), [userCfg] /* keep */);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(
    () => ({ n: userCfg.n }),
    [userCfg] /* keep */,
  );
  return <div />;
};
`,
      },
      {
        // The only span a re-render does not re-emit is the one the author's
        // own trailing comma occupies, so a comment written behind that comma
        // is the one piece of text this rewrite could delete. It declines
        // instead: an over-width line costs less than a lost comment.
        name: 'issue #2121: a comment behind a trailing comma keeps the rename in place',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitleRow = useMemo(() => ({ n: userCfg.n }), [userCfg, userCfg], /* keep */);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitleRow = useDeepCompareMemo(() => ({ n: userCfg.n }), [userCfg, userCfg], /* keep */);
  return <div />;
};
`,
      },
      {
        // A comment between the callee and the opening parenthesis is one
        // Prettier MOVES — it prints `useDeepCompareMemo(/* keep */ () => …`.
        // Relocating a comment is not this fixer's to do, so this one arm still
        // declines and the rename stays in place.
        name: 'issue #2121: a comment ahead of the argument list keeps the rename in place',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo /* keep */(() => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo /* keep */(() => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
      },
      {
        // The callee is re-emitted from its own name onward, so parentheses an
        // author wrote around it would come back on the wrong side of the
        // rename. Prettier strips them anyway, so the decline costs one pass
        // of the formatter and never a token.
        name: 'issue #2121: a parenthesised callee keeps the rename in place',
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitleRowLongName = (useMemo)(() => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitleRowLongName = (useDeepCompareMemo)(() => ({ n: userCfg.n }), [userCfg]);
  return <div />;
};
`,
      },
      {
        // The outer break carries the inner rename in its own text rather than
        // leaving it as a second edit inside the replacement, which ESLint would
        // reject as overlapping — taking every report's fix down with it. That
        // is the only way to emit what Prettier prints here: the outer list
        // broken open with the inner call left flat inside it (#2121).
        name: 'issue #2121: an outer break carries the nested call rename',
        code: `
import { useMemo } from 'react';
const Comp = () => {
  const subtitle = useMemo(() => useMemo(() => 1, [{ a: 1 }]), [{ b: 2 }]);
  return <div />;
};
`,
        errors: [error, error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = () => {
  const subtitle = useDeepCompareMemo(
    () => useDeepCompareMemo(() => 1, [{ a: 1 }]),
    [{ b: 2 }],
  );
  return <div />;
};
`,
      },
      {
        // Both renames move this line, not just the outer one: at 68 columns it
        // lands at 79 after one and at 90 after two, so measuring the outer
        // eleven alone leaves a call flat that Prettier breaks open.
        name: 'issue #2121: the width counts every rename the call carries',
        code: `
import { useMemo } from 'react';
const Comp = () => {
  const v = useMemo(() => useMemo(() => 1, [{ a: 1 }]), [{ b: 2 }]);
  return <div />;
};
`,
        errors: [error, error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = () => {
  const v = useDeepCompareMemo(
    () => useDeepCompareMemo(() => 1, [{ a: 1 }]),
    [{ b: 2 }],
  );
  return <div />;
};
`,
      },
      {
        // The same 68-column line with only one callee to rename, so the count
        // is pinned as a measurement rather than a flag that any nesting sets:
        // 79 columns fits, and Prettier leaves it flat.
        name: 'issue #2121: one rename on the same line stays flat',
        code: `
import { useMemo } from 'react';
const Comp = () => {
  const v = useMemo(() => compute(() => 1, [{ a: 1 }]), [{ b: 2 }]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = () => {
  const v = useDeepCompareMemo(() => compute(() => 1, [{ a: 1 }]), [{ b: 2 }]);
  return <div />;
};
`,
      },
      {
        // Prettier reaches an inner argument list only after breaking the outer
        // one open, so a call nested inside one this pass leaves flat declines
        // with it. Breaking the inner alone inside a flat outer call is a layout
        // Prettier prints for neither.
        name: 'issue #2121: a call nested in a flat outer call keeps the rename in place',
        code: `
import { useMemo } from 'react';
const Comp = ({ cfg }) => {
  const label = useMemo(() => { return useMemo(() => cfg.a, [{ a: 1 }]); }, [{ b: 2 }]);
  return <div />;
};
`,
        errors: [error, error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ cfg }) => {
  const label = useDeepCompareMemo(() => { return useDeepCompareMemo(() => cfg.a, [{ a: 1 }]); }, [{ b: 2 }]);
  return <div />;
};
`,
      },
      {
        // The option is read, not merely declared: the same source that stays
        // flat at the default width breaks here.
        name: 'issue #2064: a lowered printWidth breaks a call that fits at 80',
        options: [{ printWidth: 40 }],
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const heading = useMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const heading = useDeepCompareMemo(
    () => ({ name: userCfg.name }),
    [userCfg],
  );
  return <div />;
};
`,
      },
      {
        // The other direction, so the option is pinned as a live measurement
        // rather than a one-way switch: the source that breaks at 80 stays flat.
        name: 'issue #2064: a raised printWidth keeps a call that breaks at 80 on one line',
        options: [{ printWidth: 120 }],
        code: `
import { useMemo } from 'react';
const Comp = ({ userCfg }) => {
  const subtitle = useMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
};
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const Comp = ({ userCfg }) => {
  const subtitle = useDeepCompareMemo(() => ({ name: userCfg.name }), [userCfg]);
  return <div />;
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

      // ---------------------------------------------------------------------
      // Issue #1979: reading a member off a dependency proves the receiver has
      // members, which every primitive also has. Each case below reported once
      // before the primitive carve-out, and `--fix` wrapped a deep comparison
      // around a value React already compares by value.
      // ---------------------------------------------------------------------

      // Layer A/B: an explicit primitive annotation on a parameter.
      {
        name: 'string parameter calling a string method',
        code: `
import { useMemo } from 'react';
export function useSlug(slug: string) {
  return useMemo(() => slug.toUpperCase(), [slug]);
}
`,
      },
      {
        name: 'number parameter calling a number method',
        code: `
import { useMemo } from 'react';
export function usePrice(cents: number) {
  return useMemo(() => cents.toFixed(2), [cents]);
}
`,
      },
      {
        name: 'string parameter read through a property arrays also carry',
        code: `
import { useMemo } from 'react';
export function useLong(s: string) {
  return useMemo(() => s.length > 3, [s]);
}
`,
      },
      {
        name: 'boolean parameter calling a shared method',
        code: `
import { useMemo } from 'react';
export function useFlag(flag: boolean) {
  return useMemo(() => flag.toString(), [flag]);
}
`,
      },
      {
        name: 'bigint parameter calling a shared method',
        code: `
import { useMemo } from 'react';
export function useBig(a: bigint) {
  return useMemo(() => a.toString(), [a]);
}
`,
      },
      {
        name: 'symbol parameter calling a shared method',
        code: `
import { useMemo } from 'react';
export function useSym(sym: symbol) {
  return useMemo(() => sym.toString(), [sym]);
}
`,
      },
      // An optional parameter is `string | undefined`, and the access reaching
      // the rule is a ChainExpression rather than a bare MemberExpression.
      {
        name: 'optional string parameter accessed through a chain',
        code: `
import { useMemo } from 'react';
export function useMaybe(a?: string) {
  return useMemo(() => a?.toUpperCase(), [a]);
}
`,
      },
      // A union answers only when nothing in it can carry identity.
      {
        name: 'union of primitives',
        code: `
import { useMemo } from 'react';
export function useEither(x: string | number) {
  return useMemo(() => x.toString(), [x]);
}
`,
      },
      {
        name: 'union of string literal types',
        code: `
import { useMemo } from 'react';
export function useMode(mode: 'compact' | 'full') {
  return useMemo(() => mode.toUpperCase(), [mode]);
}
`,
      },
      // An annotation constrains every assignment, so it answers for a `let`.
      {
        name: 'annotated let',
        code: `
import { useMemo } from 'react';
export function useLabel(initial: string) {
  let label: string = initial;
  label = initial.trim();
  return useMemo(() => label.toUpperCase(), [label]);
}
`,
      },
      // Layer B: an unannotated `const` whose initializer is a literal.
      {
        name: 'const bound to a string literal',
        code: `
import { useMemo } from 'react';
const s = 'abc';
export const v = useMemo(() => s.toUpperCase(), [s]);
`,
      },
      {
        name: 'const bound to a number literal',
        code: `
import { useMemo } from 'react';
const rate = 42;
export const v = useMemo(() => rate.toFixed(1), [rate]);
`,
      },
      {
        name: 'const bound to a template literal',
        code: `
import { useMemo } from 'react';
const prefix = \`/t\`;
export const v = useMemo(() => prefix.trim(), [prefix]);
`,
      },
      // Layer B: the `useState` tuple. `useState` is imported, so under a
      // program without `project` it resolves to `any` and the checker cannot
      // answer here at all — the syntax is the only evidence there is.
      {
        name: 'useState tuple initialised with a string literal',
        code: `
import { useMemo, useState } from 'react';
export function useName() {
  const [name] = useState('');
  return useMemo(() => name.trim(), [name]);
}
`,
      },
      {
        name: 'React.useState tuple initialised with a number literal',
        code: `
import React, { useMemo } from 'react';
export function useCount() {
  const [count] = React.useState(0);
  return useMemo(() => count.toFixed(0), [count]);
}
`,
      },
      {
        name: 'useState tuple with a primitive type argument',
        code: `
import { useMemo, useState } from 'react';
export function useLabel() {
  const [label] = useState<string>();
  return useMemo(() => label?.toUpperCase(), [label]);
}
`,
      },
      // Layer C: the consumer's own shape. `useRouter()` resolves to `any`, the
      // binding carries no annotation and no literal initializer, and every read
      // of it names a method only a string has.
      {
        name: 'destructured router field read only through string methods',
        code: `
import { useMemo } from 'react';
import { useRouter } from 'next/router';
export function useIsKeywordInUrl(keyword: string) {
  const { asPath } = useRouter();
  return useMemo(() => {
    return asPath.toLowerCase().includes(keyword.toLowerCase());
  }, [asPath, keyword]);
}
`,
      },
      // A primitive spread is still a primitive: `[...s]` splits a string into
      // characters, and deep-comparing the string it came from buys nothing.
      {
        name: 'string spread inside the callback',
        code: `
import { useMemo } from 'react';
export function useChars(s: string) {
  return useMemo(() => [...s], [s]);
}
`,
      },
      // The issue's silent controls: these never reported, so they pin that the
      // measurement above is a change in behaviour rather than a change in what
      // the fixtures exercise.
      {
        name: 'control: a string dependency concatenated rather than read',
        code: `
import { useMemo } from 'react';
export function useBang(slug: string) {
  return useMemo(() => slug + '!', [slug]);
}
`,
      },
      {
        name: 'control: a string dependency interpolated',
        code: `
import { useMemo } from 'react';
export function usePath(slug: string) {
  return useMemo(() => \`/t/\${slug}\`, [slug]);
}
`,
      },
      {
        name: 'control: a numeric literal dependency',
        code: `
import { useMemo } from 'react';
export const v = useMemo(() => 1, [2]);
`,
      },
    ],
    invalid: [
      // ---------------------------------------------------------------------
      // Issue #1979 anti-vacuity: the primitive carve-out must leave every
      // dependency it cannot prove primitive reporting exactly as before.
      // ---------------------------------------------------------------------
      {
        name: 'object parameter read via a member still reports',
        code: `
import { useMemo } from 'react';
export function useCfg(cfg: { a: string }) {
  return useMemo(() => cfg.a, [cfg]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
export function useCfg(cfg: { a: string }) {
  return useDeepCompareMemo(() => cfg.a, [cfg]);
}
`,
      },
      // `length` is deliberately absent from the primitive-only member list:
      // arrays carry it, and vetoing on it would blind the rule to the array
      // dependencies it exists to catch.
      {
        name: 'array parameter read through length still reports',
        code: `
import { useMemo } from 'react';
export function useItems(items: string[]) {
  return useMemo(() => items.length, [items]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
export function useItems(items: string[]) {
  return useDeepCompareMemo(() => items.length, [items]);
}
`,
      },
      {
        name: 'array parameter mapped still reports',
        code: `
import { useMemo } from 'react';
export function useLabels(items: string[]) {
  return useMemo(() => items.map((item) => item.trim()), [items]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
export function useLabels(items: string[]) {
  return useDeepCompareMemo(() => items.map((item) => item.trim()), [items]);
}
`,
      },
      // One non-primitive member of a union is enough to keep the report.
      {
        name: 'union carrying an object member still reports',
        code: `
import { useMemo } from 'react';
export function useEither(x: string | { a: number }) {
  return useMemo(() => x.toString(), [x]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
export function useEither(x: string | { a: number }) {
  return useDeepCompareMemo(() => x.toString(), [x]);
}
`,
      },
      // The initializer arm reads the literal, not merely the `const`.
      {
        name: 'const bound to an object literal still reports',
        code: `
import { useMemo } from 'react';
const cfg = { a: 1 };
export const v = useMemo(() => cfg.a, [cfg]);
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
const cfg = { a: 1 };
export const v = useDeepCompareMemo(() => cfg.a, [cfg]);
`,
      },
      {
        name: 'useState tuple initialised with an object literal still reports',
        code: `
import { useMemo, useState } from 'react';
export function useCfg() {
  const [cfg] = useState({ a: 1 });
  return useMemo(() => cfg.a, [cfg]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useState } from 'react';
export function useCfg() {
  const [cfg] = useState({ a: 1 });
  return useDeepCompareMemo(() => cfg.a, [cfg]);
}
`,
      },
      // The type argument overrides whatever the initial value would infer.
      {
        name: 'useState tuple with an object type argument still reports',
        code: `
import { useMemo, useState } from 'react';
export function useCfg() {
  const [cfg] = useState<{ a: number }>();
  return useMemo(() => cfg?.a, [cfg]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useState } from 'react';
export function useCfg() {
  const [cfg] = useState<{ a: number }>();
  return useDeepCompareMemo(() => cfg?.a, [cfg]);
}
`,
      },
      // Only element 0 of the tuple is the state value; element 1 is the setter,
      // and the initial value says nothing about it.
      {
        name: 'the useState setter element is not covered by the carve-out',
        code: `
import { useMemo, useState } from 'react';
export function useSetter() {
  const [, setName] = useState('');
  return useMemo(() => setName.name, [setName]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useState } from 'react';
export function useSetter() {
  const [, setName] = useState('');
  return useDeepCompareMemo(() => setName.name, [setName]);
}
`,
      },
      // Layer C answers only where the checker is silent. Here the checker
      // resolves an object type, so a method name that looks primitive does not
      // get to overrule it.
      {
        name: 'a resolved object type outranks a primitive-looking method name',
        code: `
import { useMemo } from 'react';
export function useBox(box: { toUpperCase: () => string }) {
  return useMemo(() => box.toUpperCase(), [box]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
export function useBox(box: { toUpperCase: () => string }) {
  return useDeepCompareMemo(() => box.toUpperCase(), [box]);
}
`,
      },
      // Every read must agree: one occurrence that says nothing about the shape
      // withdraws Layer C's guess.
      {
        name: 'a mixed read of an unresolvable binding still reports',
        code: `
import { useMemo } from 'react';
import { useThing } from './useThing';
export function useMixed() {
  const { data } = useThing();
  return useMemo(() => data.trim() + data.rest, [data]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useThing } from './useThing';
export function useMixed() {
  const { data } = useThing();
  return useDeepCompareMemo(() => data.trim() + data.rest, [data]);
}
`,
      },
      {
        name: 'a computed read of an unresolvable binding still reports',
        code: `
import { useMemo } from 'react';
import { useThing } from './useThing';
export function useComputed(key: string) {
  const { data } = useThing();
  return useMemo(() => data[key], [data, key]);
}
`,
        errors: [error],
        output: `
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
import { useThing } from './useThing';
export function useComputed(key: string) {
  const { data } = useThing();
  return useDeepCompareMemo(() => data[key], [data, key]);
}
`,
      },
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

// Issue #1979: the syntactic layers of the primitive carve-out exist because
// the type layer goes blind, so they have to be exercised with the type layer
// switched OFF. Under the shared TypeScript testers the checker answers every
// question these cases turn on — `let s = 'abc'` is a `string` to the checker
// whatever the `const` gate decides — so a differential run there would score
// the same verdict twice and pin nothing.
//
// The default parser supplies no `parserServices` at all, which is the honest
// standing of a JavaScript file in a consumer repository, and leaves the
// syntactic layers as the only thing answering.
describe('prefer-use-deep-compare-memo: the syntactic primitive layers without a checker (issue #1979)', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-use-deep-compare-memo';

  const LINT_CONFIG = {
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  /**
   * Reports this rule raised, filtered by id: a rule the linter failed to find
   * reads as an empty message list, which every assertion below would pass
   * against vacuously.
   */
  const reportsFor = (code: string) => {
    const linter = new Linter();
    linter.defineRule(
      RULE_ID,
      preferUseDeepCompareMemo as unknown as Rule.RuleModule,
    );
    const messages = linter.verify(code, LINT_CONFIG, 'hook.js');
    expect(messages.filter((message) => message.fatal)).toHaveLength(0);
    return messages.filter((message) => message.ruleId === RULE_ID);
  };

  const memoOver = (declaration: string, body: string, dep: string) => `
import { useMemo } from 'react';
${declaration}
export const v = useMemo(() => ${body}, [${dep}]);
`;

  it('vetoes a const bound to a primitive literal', () => {
    expect(reportsFor(memoOver(`const s = 'abc';`, 's.length', 's'))).toEqual(
      [],
    );
  });

  it('declines the same binding spelled as a reassigned let', () => {
    // The identical callback and dependency, one keyword apart: an unannotated
    // initializer describes the binding only while nothing can rebind it.
    const reports = reportsFor(
      memoOver(`let s = 'abc';\ns = getObj();`, 's.length', 's'),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('preferUseDeepCompareMemo');
  });

  it('reports a const bound to an object literal, checker or no checker', () => {
    // The negative control: with the type layer switched off the rule still has
    // to fire, or the two cases above prove only that it went silent.
    const reports = reportsFor(memoOver(`const o = { a: 1 };`, 'o.a', 'o'));
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('preferUseDeepCompareMemo');
  });

  it('vetoes an unresolvable binding read only through primitive methods', () => {
    expect(
      reportsFor(`
import { useMemo } from 'react';
import { useThing } from './useThing';
export function useMixed() {
  const { data } = useThing();
  return useMemo(() => data.toUpperCase(), [data]);
}
`),
    ).toEqual([]);
  });

  it('declines the same binding read through a member arrays also carry', () => {
    const reports = reportsFor(`
import { useMemo } from 'react';
import { useThing } from './useThing';
export function useMixed() {
  const { data } = useThing();
  return useMemo(() => data.slice(1), [data]);
}
`);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('preferUseDeepCompareMemo');
  });
});

// Issue #1959: a `'use client'` directive is a directive only while it is the
// FIRST statement, so an import spliced above it is silently demoted to an
// inert expression statement. Nothing in the lint chain reports that — the
// output re-lints clean, and unlike #1956 there is no compiler signal either,
// since a demoted directive is still valid TypeScript. The oracle is therefore
// STRUCTURAL: parse the output and ask whether the directive still leads. A
// substring check passes on the corrupt output, because the directive is still
// present — just no longer first.
//
// This rule is the most exposed of the three sharing the defect (#1957, #1958):
// every file it rewrites is a React component module.
describe('prefer-use-deep-compare-memo: the injected import stays below the prologue (issue #1959)', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-use-deep-compare-memo';
  const FILENAME = 'Component.tsx';

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      preferUseDeepCompareMemo as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const LINT_CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

  const verify = (code: string) =>
    createLinter().verify(code, LINT_CONFIG, FILENAME);

  /** The leading directive's value, or null when none leads. */
  const leadingDirective = (code: string): string | null => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const first = require('@typescript-eslint/parser').parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      range: true,
      loc: true,
    }).body[0];
    return first?.type === 'ExpressionStatement' &&
      first.expression?.type === 'Literal'
      ? String(first.expression.value)
      : null;
  };

  const BODY = `const Comp = ({ userConfig }) => {
  const formatted = useMemo(() => ({ name: userConfig.name }), [userConfig]);
  return <div>{formatted.name}</div>;
};
`;

  const expectDirectiveSurvives = (code: string, directive: string) => {
    // A fixture the rule declined, or one with no leading directive, would
    // satisfy every assertion below vacuously.
    expect(verify(code).length).toBeGreaterThan(0);
    expect(leadingDirective(code)).toBe(directive);

    const first = fix(code);
    expect(first.fixed).toBe(true);
    expect(fix(first.output).fixed).toBe(false);
    expect(verify(first.output)).toHaveLength(0);
    expect(leadingDirective(first.output)).toBe(directive);
    expect(
      first.output.match(
        /import \{ useDeepCompareMemo \} from '@blumintinc\/use-deep-compare';/g,
      ),
    ).toHaveLength(1);

    return first.output;
  };

  it('keeps the directive leading when the react import shares its line', () => {
    expectDirectiveSurvives(
      `'use client'; import { useMemo } from 'react';\n${BODY}`,
      'use client',
    );
  });

  it('keeps the directive leading when the component shares its line', () => {
    expectDirectiveSurvives(`'use client'; ${BODY}`, 'use client');
  });

  it('keeps a use server directive leading', () => {
    expectDirectiveSurvives(
      `'use server'; import { useMemo } from 'react';\n${BODY}`,
      'use server',
    );
  });

  // #1959 pinned the own-line branch byte for byte because it is the spelling
  // the widened insertion had to leave alone. The directive, the import and the
  // indentation are still exactly what that issue fixed; only the call itself
  // moved, into the broken argument list #2064 measures it into.
  it('pins the own-line spelling byte for byte', () => {
    expect(
      expectDirectiveSurvives(
        `'use client';\nimport { useMemo } from 'react';\n${BODY}`,
        'use client',
      ),
    ).toBe(
      `'use client';\nimport { useDeepCompareMemo } from '@blumintinc/use-deep-compare';\nconst Comp = ({ userConfig }) => {\n  const formatted = useDeepCompareMemo(\n    () => ({ name: userConfig.name }),\n    [userConfig],\n  );\n  return <div>{formatted.name}</div>;\n};\n`,
    );
  });

  it('would have caught the bug: the pre-fix output is rejected by the oracle', () => {
    // Verbatim output of the unguarded line-start anchor, kept as a planted
    // positive control so this block cannot decay into passing vacuously.
    const preFixOutput = `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';\n'use client'; const Comp = ({ userConfig }) => {\n  const formatted = useDeepCompareMemo(() => ({ name: userConfig.name }), [userConfig]);\n  return <div>{formatted.name}</div>;\n};\n`;

    // Both halves matter: it re-lints CLEAN, so a report-counting guard scores
    // it a success, while the directive has stopped leading.
    expect(verify(preFixOutput)).toHaveLength(0);
    expect(preFixOutput).toContain(`'use client';`);
    expect(leadingDirective(preFixOutput)).not.toBe('use client');
  });
});
