import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { preferFragmentComponent } from '../rules/prefer-fragment-component';
import { noUselessFragment } from '../rules/no-useless-fragment';
import { preferFragmentShorthand } from '../rules/prefer-fragment-shorthand';

const preferFragmentMessage =
  'Prefer Fragment imported from react over {{type}}. Shorthand fragments block props like "key" and mixing fragment styles makes JSX harder to refactor. Import { Fragment } from "react" and wrap the children with <Fragment>...</Fragment> so fragment usage stays explicit.';

describe('prefer-fragment-component messages', () => {
  it('exposes educational message strings', () => {
    expect(preferFragmentComponent.meta.messages.preferFragment).toBe(
      preferFragmentMessage,
    );
  });
});

ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [
    {
      code: `import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `import { Fragment } from 'react';
const Component = () => <Fragment><ChildComponent /></Fragment>;`,
    },
    {
      code: `import { Fragment } from 'react';
const Component = () => <Fragment key="unique-key">With Key</Fragment>;`,
    },
    {
      code: `import { Fragment } from 'react';
// Comment before fragment
const Component = () => (
  <Fragment>
    {/* Comment inside fragment */}
    <div>Content</div>
  </Fragment>
);`,
    },
    {
      code: `import { Fragment } from 'react';
const Component = () => <Fragment><Fragment>Nested correctly</Fragment></Fragment>;`,
    },
    {
      code: `import { Fragment as ReactFragment } from 'react';
const Component = () => <ReactFragment>Using alias</ReactFragment>;`,
    },
    {
      code: `import { Fragment } from 'react';
interface Props {
  children: React.ReactNode;
}
const Component = ({ children }: Props) => <Fragment>{children}</Fragment>;`,
    },
  ],
  invalid: [
    {
      code: `const Component = () => <>Hello World</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `import React from 'react';
const Component = () => <React.Fragment>Hello World</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `import { useState } from 'react';
const Component = () => <>Hello World</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { useState, Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `const Component = () => (
  <>
    <React.Fragment>
      <ChildComponent />
    </React.Fragment>
  </>
);`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import { Fragment } from 'react';
const Component = () => (
  <>
    <Fragment>
      <ChildComponent />
    </Fragment>
  </>
);`,
    },
    {
      code: `const Component = () => (<>
  <span>Line 1</span>
  <span>Line 2</span>
</>);`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const Component = () => (<Fragment>
  <span>Line 1</span>
  <span>Line 2</span>
</Fragment>);`,
    },
    {
      code: `import * as React from 'react';
const Component = () => <React.Fragment>Using namespace import</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import * as React from 'react';
import { Fragment } from 'react';
const Component = () => <Fragment>Using namespace import</Fragment>;`,
    },
    {
      code: `// With JSX comments
const Component = () => (
  <>
    {/* Comment inside fragment */}
    <div>Content</div>
  </>
);`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `// With JSX comments
import { Fragment } from 'react';
const Component = () => (
  <Fragment>
    {/* Comment inside fragment */}
    <div>Content</div>
  </Fragment>
);`,
    },
    {
      code: `const Component = () => <>
  {/* Whitespace preservation test */}
  <div>Content</div>
</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const Component = () => <Fragment>
  {/* Whitespace preservation test */}
  <div>Content</div>
</Fragment>;`,
    },
    {
      code: `import React from 'react';
const Component = () => <React.Fragment key="unique-key">With Key</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
const Component = () => <Fragment key="unique-key">With Key</Fragment>;`,
    },
    {
      code: `import React from 'react';
import { useEffect } from 'react';
const Component = () => <><div>Test</div></>;
const AnotherComponent = () => <React.Fragment><p>Multi-component</p></React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
import { useEffect } from 'react';
const Component = () => <Fragment><div>Test</div></Fragment>;
const AnotherComponent = () => <Fragment><p>Multi-component</p></Fragment>;`,
    },
    {
      code: `// No existing React import
import { useState, useEffect } from 'other-library';
const Component = () => <>No React import</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `// No existing React import
import { Fragment } from 'react';
import { useState, useEffect } from 'other-library';
const Component = () => <Fragment>No React import</Fragment>;`,
    },
    {
      code: `import React from 'react';
// Nested fragments with mixed types
const Component = () => (
  <React.Fragment>
    <>
      <div>Double nested content</div>
    </>
  </React.Fragment>
);`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import React, { Fragment } from 'react';
// Nested fragments with mixed types
const Component = () => (
  <Fragment>
    <Fragment>
      <div>Double nested content</div>
    </Fragment>
  </Fragment>
);`,
    },
    {
      code: `// Typescript interface with fragment
interface Props {
  name: string;
}
const Component = ({ name }: Props) => <>Hello {name}</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `// Typescript interface with fragment
import { Fragment } from 'react';
interface Props {
  name: string;
}
const Component = ({ name }: Props) => <Fragment>Hello {name}</Fragment>;`,
    },
    {
      code: `import React from 'react';

const ComponentA = () => <></>;
const ComponentB = () => <React.Fragment></React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';

const ComponentA = () => <Fragment></Fragment>;
const ComponentB = () => <Fragment></Fragment>;`,
    },
  ],
});

// Issue #1407: the `import { Fragment } from 'react'` edit rides on a single
// violation's fix, which makes that violation the file's import carrier. ESLint
// builds fixes eagerly and drops inline-disabled reports afterwards, so a
// suppressed carrier used to take the import down with it while the surviving
// violations still emitted <Fragment>. The carrier slot must fall to the first
// violation that actually survives.
// The suite name doubles as `context.id`, which is exactly the name the inline
// directives below must spell — so it stays the canonical rule name.
ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [
    // Every violation disabled: no rewrites, and above all no stray import.
    `// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
// eslint-disable-next-line prefer-fragment-component
const B = () => <>Two</>;`,
    // Whole-file block disable.
    `/* eslint-disable prefer-fragment-component */
const A = () => <>One</>;
const B = () => <>Two</>;`,
    // A bare block disable covers every rule, including this one.
    `/* eslint-disable */
const A = () => <>One</>;
const B = () => <>Two</>;`,
    // Trailing `eslint-disable-line` form.
    `const A = () => <>One</>; // eslint-disable-line prefer-fragment-component
const B = () => <>Two</>; // eslint-disable-line prefer-fragment-component`,
    // A justification suffix does not change which rules a directive names.
    `/* eslint-disable prefer-fragment-component -- legacy file */
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;`,
    // React.Fragment violations are equally suppressible.
    `import React from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <React.Fragment>One</React.Fragment>;`,
  ],
  invalid: [
    // The carrier is disabled: the survivor must still get the import. The
    // import lands above the directive, which otherwise would end up aimed at
    // the inserted line instead of the fragment its author meant to exempt.
    {
      code: `// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // A disable in the middle leaves the carrier where it was.
    {
      code: `const A = () => <>One</>;
// eslint-disable-next-line prefer-fragment-component
const B = () => <>Two</>;
const C = () => <>Three</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => <Fragment>One</Fragment>;
// eslint-disable-next-line prefer-fragment-component
const B = () => <>Two</>;
const C = () => <Fragment>Three</Fragment>;`,
    },
    // Disabling the last violation changes nothing for the carrier.
    {
      code: `const A = () => <>One</>;
// eslint-disable-next-line prefer-fragment-component
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => <Fragment>One</Fragment>;
// eslint-disable-next-line prefer-fragment-component
const B = () => <>Two</>;`,
    },
    // A bare `eslint-disable-next-line` names no rule, so it covers this one.
    {
      code: `// eslint-disable-next-line
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
// eslint-disable-next-line
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // A directive naming a different rule must not suppress this one.
    {
      code: `// eslint-disable-next-line no-console
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
// eslint-disable-next-line no-console
const A = () => <Fragment>One</Fragment>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // Trailing `eslint-disable-line` on the carrier.
    {
      code: `const A = () => <>One</>; // eslint-disable-line prefer-fragment-component
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => <>One</>; // eslint-disable-line prefer-fragment-component
const B = () => <Fragment>Two</Fragment>;`,
    },
    // A justification suffix on the carrier's directive.
    {
      code: `// eslint-disable-next-line prefer-fragment-component -- keeps the diff small
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component -- keeps the diff small
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // A block disable/enable region: the carrier is the first violation past
    // the re-enable.
    {
      code: `/* eslint-disable prefer-fragment-component */
const A = () => <>One</>;
const B = () => <>Two</>;
/* eslint-enable prefer-fragment-component */
const C = () => <>Three</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `/* eslint-disable prefer-fragment-component */
import { Fragment } from 'react';
const A = () => <>One</>;
const B = () => <>Two</>;
/* eslint-enable prefer-fragment-component */
const C = () => <Fragment>Three</Fragment>;`,
    },
    // React.Fragment carrier disabled: the survivor still gets `, Fragment`
    // spliced into the existing React import.
    {
      code: `import React from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <React.Fragment>One</React.Fragment>;
const B = () => <React.Fragment>Two</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <React.Fragment>One</React.Fragment>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // Mixed shorthand/React.Fragment with the shorthand carrier disabled.
    {
      code: `import React from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // Fragment already imported: suppression must not add a duplicate import.
    {
      code: `import { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
// eslint-disable-next-line prefer-fragment-component
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // The nested path where a shorthand fragment inside a React.Fragment
    // carries the fix for both tags. Suppressing it leaves the outer
    // React.Fragment reported but unfixed, and hands the import to the next
    // surviving violation.
    {
      code: `import React from 'react';
const A = () => (
  <React.Fragment>
    {/* eslint-disable-next-line prefer-fragment-component */}
    <>
      <div />
    </>
  </React.Fragment>
);
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import React, { Fragment } from 'react';
const A = () => (
  <React.Fragment>
    {/* eslint-disable-next-line prefer-fragment-component */}
    <>
      <div />
    </>
  </React.Fragment>
);
const B = () => <Fragment>Two</Fragment>;`,
    },
    // The mirror path: a React.Fragment inside a shorthand fragment.
    {
      code: `const A = () => (
  <>
    {/* eslint-disable-next-line prefer-fragment-component */}
    <React.Fragment>
      <div />
    </React.Fragment>
  </>
);
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => (
  <>
    {/* eslint-disable-next-line prefer-fragment-component */}
    <React.Fragment>
      <div />
    </React.Fragment>
  </>
);
const B = () => <Fragment>Two</Fragment>;`,
    },
    // Fragment already imported, nothing suppressed: unchanged behaviour.
    {
      code: `import { Fragment } from 'react';
const A = () => <>One</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => <Fragment>One</Fragment>;
const B = () => <Fragment>Two</Fragment>;`,
    },
  ],
});

// Issue #1426: the fix spells `Fragment` bare and inserts the import that binds
// it, so any other `Fragment` visible at the rewritten element breaks the edit
// two ways — the inserted import collides with the existing declaration
// (TS2440, or TS2300 when that declaration is itself an import), and a
// narrower-scope shadow captures the emitted `<Fragment>` with no compile error
// at all. Every such case must report and withhold the edit; the ordinary
// no-collision path must stay byte-identical.
ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [],
  invalid: [
    // Module-scope const: the inserted import would be a second declaration.
    {
      code: `const Fragment = 1;
const C = () => <><span>{Fragment}</span></>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Function declaration binding the name.
    {
      code: `function Fragment() {
  return null;
}
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Class declaration binding the name.
    {
      code: `class Fragment {}
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // `let` binding assigned later still owns the name for the whole scope.
    {
      code: `let Fragment;
Fragment = 2;
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Named import of the same name from another module: the rewritten element
    // would render that module's component.
    {
      code: `import { Fragment } from 'preact';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Namespace import: `Fragment` is a module object, not a component.
    {
      code: `import * as Fragment from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Default import under the name.
    {
      code: `import Fragment from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Type-only declaration: the binding erases, so `<Fragment>` would be
    // undefined at runtime while the inserted import still duplicates the name.
    {
      code: `import type { Fragment } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Inline type specifier, same reasoning.
    {
      code: `import { type Fragment } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // An alias pointing the name at some other react export.
    {
      code: `import { useState as Fragment } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Shadowing parameter: the silent variant — the rewrite compiles and
    // renders the parameter instead of react's Fragment.
    {
      code: `function C(Fragment) {
  return <>{Fragment}</>;
}`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Destructured parameter shadow.
    {
      code: `const C = ({ Fragment }) => <>{Fragment}</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // Block-scoped shadow at the JSX site, with react's Fragment imported at
    // module scope: only scope-chain resolution from the element catches this.
    {
      code: `import { Fragment } from 'react';
const C = () => {
  const Fragment = 'div';
  return <>{Fragment}</>;
};`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // React.Fragment path takes the same guard.
    {
      code: `import React from 'react';
const Fragment = 1;
const C = () => <React.Fragment>{Fragment}</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: null,
    },
    // Nested React.Fragment/shorthand path, where one fix rewrites both tags.
    {
      code: `import React from 'react';
const Fragment = 1;
const C = () => (
  <React.Fragment>
    <>
      <div>{Fragment}</div>
    </>
  </React.Fragment>
);`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: null,
    },
    // A collision confined to one function withholds only that element's edit;
    // the module-scope violation still carries the import.
    {
      code: `const A = ({ Fragment }) => <>{Fragment}</>;
const B = () => <>Two</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = ({ Fragment }) => <>{Fragment}</>;
const B = () => <Fragment>Two</Fragment>;`,
    },
    // Reuse: react's Fragment is already bound, so no second specifier and no
    // second declaration.
    {
      code: `import { Fragment } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // Reuse across two react declarations, one of which already binds Fragment.
    {
      code: `import React from 'react';
import { Fragment } from 'react';
const C = () => <React.Fragment>Hello</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React from 'react';
import { Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // Reuse when the import follows the element in source order: import state
    // read from Program.body at fix time, not from a visitor flag that the
    // ImportDeclaration visitor has yet to set.
    {
      code: `const C = () => <>Hello</>;
import { Fragment } from 'react';`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `const C = () => <Fragment>Hello</Fragment>;
import { Fragment } from 'react';`,
    },
    // Over-declining guard: `React.Fragment` is a member access on the default
    // import, not a `Fragment` binding, so the ordinary edit still lands.
    {
      code: `import React from 'react';
const C = () => <React.Fragment>Hello</React.Fragment>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'React.Fragment' },
        },
      ],
      output: `import React, { Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // Over-declining guard: other named specifiers from react are untouched
    // neighbours, not collisions.
    {
      code: `import { useMemo, useState } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { useMemo, useState, Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // Over-declining guard: an alias of react's Fragment leaves the name free.
    {
      code: `import { Fragment as Frag } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment as Frag, Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // A type-only declaration cannot host the specifier: `Fragment` would erase
    // at compile time and leave the rewritten element undefined at runtime, so
    // the fix emits its own value declaration.
    {
      code: `import type { ReactNode } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
import type { ReactNode } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // With both shapes present, the value declaration is the one extended.
    {
      code: `import type { ComponentType } from 'react';
import { useCallback } from 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import type { ComponentType } from 'react';
import { useCallback, Fragment } from 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // A side-effect import hosts no specifier, so it is skipped as a target
    // rather than treated as one.
    {
      code: `import 'react';
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
import 'react';
const C = () => <Fragment>Hello</Fragment>;`,
    },
    // Over-declining guard: an unrelated local name is no reason to decline.
    {
      code: `const Fragmentation = 1;
const C = () => <>{Fragmentation}</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
const Fragmentation = 1;
const C = () => <Fragment>{Fragmentation}</Fragment>;`,
    },
    // Over-declining guard: a `Fragment` bound inside an unrelated function
    // scope is invisible at the reported element.
    {
      code: `function other() {
  const Fragment = 1;
  return Fragment;
}
const C = () => <>Hello</>;`,
      errors: [
        {
          messageId: 'preferFragment',
          data: { type: 'shorthand fragment (<>)' },
        },
      ],
      output: `import { Fragment } from 'react';
function other() {
  const Fragment = 1;
  return Fragment;
}
const C = () => <Fragment>Hello</Fragment>;`,
    },
  ],
});

const RULE_ID = '@blumintinc/blumint/prefer-fragment-component';

const lint = (code: string) => {
  const linter = new Linter();
  linter.defineParser(
    '@typescript-eslint/parser',
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@typescript-eslint/parser'),
  );
  linter.defineRule(
    RULE_ID,
    preferFragmentComponent as unknown as Rule.RuleModule,
  );
  // A near-miss neighbour proves rule matching is exact rather than a
  // suffix/substring heuristic.
  linter.defineRule('@blumintinc/blumint/prefer-fragment-component-props', {
    meta: { schema: [] },
    create: () => ({}),
  } as unknown as Rule.RuleModule);
  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' as const },
  };
  const { output } = linter.verifyAndFix(code, config, 'f.tsx');
  return output;
};

const expectNoUnboundFragment = (output: string) => {
  if (/<Fragment[\s/>]/.test(output)) {
    expect(output).toMatch(
      /import (?:\w+, )?\{[^}]*\bFragment\b[^}]*\} from 'react';/,
    );
  }
};

// RuleTester applies a single fix pass and never shows the file that
// `eslint --fix` actually writes. These cases drive the real multi-pass fixer
// and assert the invariant the bug violated: an emitted <Fragment> is never
// left without `import { Fragment } from 'react'`.
describe('prefer-fragment-component: inline disables and the import carrier (issue #1407)', () => {
  it('carries the import on the first surviving violation', () => {
    const output = lint(`// eslint-disable-next-line ${RULE_ID}
const A = () => <>One</>;
const B = () => <>Two</>;
`);

    expect(output).toBe(`import { Fragment } from 'react';
// eslint-disable-next-line ${RULE_ID}
const A = () => <>One</>;
const B = () => <Fragment>Two</Fragment>;
`);
    expectNoUnboundFragment(output);
  });

  it('adds neither import nor rewrite when every violation is disabled', () => {
    const code = `// eslint-disable-next-line ${RULE_ID}
const A = () => <>One</>;
// eslint-disable-next-line ${RULE_ID}
const B = () => <>Two</>;
`;

    expect(lint(code)).toBe(code);
    expect(lint(code)).not.toContain('Fragment');
  });

  it('adds neither import nor rewrite under a whole-file block disable', () => {
    const code = `/* eslint-disable ${RULE_ID} */
const A = () => <>One</>;
const B = () => <>Two</>;
`;

    expect(lint(code)).toBe(code);
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`// eslint-disable-next-line ${RULE_ID}-props
const A = () => <>One</>;
`);

    expect(output).toBe(`import { Fragment } from 'react';
// eslint-disable-next-line ${RULE_ID}-props
const A = () => <Fragment>One</Fragment>;
`);
    expectNoUnboundFragment(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`/* eslint-disable ${RULE_ID} */
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;
/* eslint-enable ${RULE_ID} */
const C = () => <>Three</>;
`);

    expect(output).toBe(`/* eslint-disable ${RULE_ID} */
import { Fragment } from 'react';
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;
/* eslint-enable ${RULE_ID} */
const C = () => <Fragment>Three</Fragment>;
`);
    expectNoUnboundFragment(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`// eslint-disable-next-line ${RULE_ID}
const A = () => <>One</>;
const B = () => <>Two</>;
const C = () => <React.Fragment>Three</React.Fragment>;
`);

    expect(output.match(/<Fragment>/g)).toHaveLength(2);
    expect(output.match(/import \{ Fragment \} from 'react';/g)).toHaveLength(
      1,
    );
    expectNoUnboundFragment(output);
  });

  it('leaves no unbound Fragment when the carrier is a React.Fragment', () => {
    const output = lint(`import React from 'react';
// eslint-disable-next-line ${RULE_ID}
const A = () => <React.Fragment>One</React.Fragment>;
const B = () => <React.Fragment>Two</React.Fragment>;
`);

    expect(output).toBe(`import React, { Fragment } from 'react';
// eslint-disable-next-line ${RULE_ID}
const A = () => <React.Fragment>One</React.Fragment>;
const B = () => <Fragment>Two</Fragment>;
`);
    expectNoUnboundFragment(output);
  });
});

// The single fix pass RuleTester applies cannot show what `eslint --fix`
// leaves on disk after re-linting its own output. A guard that merely defers
// the collision to a later pass would look correct there and still write a
// duplicate declaration here.
describe('prefer-fragment-component: existing Fragment bindings (issue #1426)', () => {
  // Statements that bind the name `Fragment` at top scope — the count TS2440
  // and TS2300 key on.
  const topScopeFragmentDeclarations = (source: string) =>
    source.match(
      /^(?:import\b[^\n]*\bFragment\b[^\n]*\bfrom\b|(?:const|let|var|function|class)\s+Fragment\b)/gm,
    )?.length ?? 0;

  it('leaves a file with a module-scope Fragment const untouched', () => {
    const code = `const Fragment = 1;
const C = () => <><span>{Fragment}</span></>;
`;

    expect(lint(code)).toBe(code);
    expect(topScopeFragmentDeclarations(lint(code))).toBe(1);
  });

  it('still reports the violation it declines to fix', () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      preferFragmentComponent as unknown as Rule.RuleModule,
    );
    const messages = linter.verify(
      `const Fragment = 1;
const C = () => <><span>{Fragment}</span></>;
`,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
          ecmaFeatures: { jsx: true },
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      'f.tsx',
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].fix).toBeUndefined();
  });

  it('leaves a file whose Fragment comes from another module untouched', () => {
    const code = `import { Fragment } from 'preact';
const C = () => <>One</>;
`;

    expect(lint(code)).toBe(code);
  });

  it('does not rewrite an element captured by a shadowing parameter', () => {
    const code = `const C = ({ Fragment }) => <>{Fragment}</>;
`;

    expect(lint(code)).toBe(code);
  });

  it('fixes the violations a narrow shadow does not reach', () => {
    const output = lint(`const A = ({ Fragment }) => <>{Fragment}</>;
const B = () => <>Two</>;
`);

    expect(output).toBe(`import { Fragment } from 'react';
const A = ({ Fragment }) => <>{Fragment}</>;
const B = () => <Fragment>Two</Fragment>;
`);
    expectNoUnboundFragment(output);
  });

  it('reuses an existing react Fragment import across passes', () => {
    const output = lint(`import { Fragment } from 'react';
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;
`);

    expect(output).toBe(`import { Fragment } from 'react';
const A = () => <Fragment>One</Fragment>;
const B = () => <Fragment>Two</Fragment>;
`);
    expect(output.match(/\bFragment\b(?=[^\n]*from 'react')/g)).toHaveLength(1);
  });

  it('keeps the no-collision output byte-identical to a plain rewrite', () => {
    const output = lint(`import React, { useState } from 'react';
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;
`);

    expect(output).toBe(`import React, { useState, Fragment } from 'react';
const A = () => <Fragment>One</Fragment>;
const B = () => <Fragment>Two</Fragment>;
`);
    expectNoUnboundFragment(output);
  });
});

// ------------------------------------------------------------------
// Issue #1648: a fix that writes a brand-new import must not displace the
// file's prologue. Each case is flush-left because a prologue's meaning
// depends on its position in the file. The final case is the control: an
// anchor disabled outright would also "preserve" every prologue above, so
// the import must still land at the top of an existing import block.
// ------------------------------------------------------------------
ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [],
  invalid: [
    {
      name: "the injected import lands below a 'use client' directive",
      code: `'use client';
const Component = () => <>Hello World</>;
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `'use client';
import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
    {
      name: 'the injected import leaves a shebang at character 0',
      code: `#!/usr/bin/env node
const Component = () => <>Hello World</>;
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `#!/usr/bin/env node
import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
    {
      name: 'the injected import stays below a // @ts-nocheck header',
      code: `// @ts-nocheck
const Component = () => <>Hello World</>;
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `// @ts-nocheck
import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
    {
      name: "a 'use client' file with an existing import anchors on that import",
      code: `'use client';
import { x } from './x';
void x;
const Component = () => <>Hello World</>;
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `'use client';
import { Fragment } from 'react';
import { x } from './x';
void x;
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #1660: a jest registrar's module factory is hoisted above the file's
// imports, and babel-plugin-jest-hoist rejects a factory that reads an
// out-of-scope binding whose name does not begin with `mock`. The injected
// `import { Fragment } from 'react'` is unreachable from inside one, so the
// fix declines there while the report stands. The shorthand `<>` the rule
// rewrites away is the spelling that works inside a factory.
// ------------------------------------------------------------------
ruleTesterJsx.run('prefer-fragment-component', preferFragmentComponent, {
  valid: [],
  invalid: [
    {
      // A jest.mock factory is hoisted above the imports, so it cannot reference an
      // out-of-scope `Fragment`. The report stands; the fix must decline.
      code: `
jest.mock('./Provider', () => {
  return { Provider: ({ children }) => <>{children}</> };
});
`,
      output: null,
      errors: [{ messageId: 'preferFragment' }],
    },
    {
      name: 'a jest.doMock factory withholds the fix',
      code: `
jest.doMock('./Provider', () => {
  return { Provider: ({ children }) => <>{children}</> };
});
`,
      output: null,
      errors: [{ messageId: 'preferFragment' }],
    },
    {
      name: 'a jest.setMock factory withholds the fix',
      code: `
jest.setMock('./Provider', () => {
  return { Provider: ({ children }) => <>{children}</> };
});
`,
      output: null,
      errors: [{ messageId: 'preferFragment' }],
    },
    {
      name: 'a React.Fragment inside a mock factory withholds the fix',
      code: `
jest.mock('./Provider', () => {
  return { Provider: ({ children }) => <React.Fragment>{children}</React.Fragment> };
});
`,
      output: null,
      errors: [{ messageId: 'preferFragment' }],
    },
    {
      // The control for the decline: the same fragment outside every factory
      // still gains the import and the rewrite.
      name: 'a fragment outside every mock factory fixes normally',
      code: `
jest.mock('./Provider', () => ({ Provider: null }));
const Component = () => <>Hello World</>;
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `
import { Fragment } from 'react';
jest.mock('./Provider', () => ({ Provider: null }));
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
    {
      name: 'a declining mock-factory fragment passes the import carrier on',
      code: `
jest.mock('./Provider', () => {
  return { Provider: ({ children }) => <>{children}</> };
});
const Component = () => <>Hello World</>;
`,
      errors: [
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
      ],
      output: `
import { Fragment } from 'react';
jest.mock('./Provider', () => {
  return { Provider: ({ children }) => <>{children}</> };
});
const Component = () => <Fragment>Hello World</Fragment>;
`,
    },
    {
      // The module specifier is evaluated in place rather than hoisted with the
      // factory, so a fragment there keeps its access to the file's imports.
      name: 'a fragment in the mock specifier position fixes normally',
      code: `
jest.mock(pathFor(<>{name}</>), () => ({ Provider: null }));
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `
import { Fragment } from 'react';
jest.mock(pathFor(<Fragment>{name}</Fragment>), () => ({ Provider: null }));
`,
    },
    {
      // `jest.fn` is not a registrar: its callback is never hoisted, so a
      // fragment inside it fixes like any other.
      name: 'a factory-shaped callback outside a registrar fixes normally',
      code: `
const render = jest.fn(() => <>{x}</>);
`,
      errors: [{ messageId: 'preferFragment' }],
      output: `
import { Fragment } from 'react';
const render = jest.fn(() => <Fragment>{x}</Fragment>);
`,
    },
  ],
});

// ------------------------------------------------------------------
// Issue #2233: no rule strands a <Fragment> on its own, so RuleTester — which
// runs one rule for one pass — cannot see this class of defect at all. The
// culprit set is `no-useless-fragment` + `prefer-fragment-shorthand` + this
// rule: unwrapping the file's other fragment orphans the `Fragment` import and
// removes it, in the very pass this rule emits a fresh <Fragment> elsewhere,
// leaving the name unbound (TS2304). These cases drive the real multi-pass
// fixer over the composed set.
// ------------------------------------------------------------------
const SIBLING_RULES = {
  '@blumintinc/blumint/no-useless-fragment': noUselessFragment,
  '@blumintinc/blumint/prefer-fragment-shorthand': preferFragmentShorthand,
  [RULE_ID]: preferFragmentComponent,
} as const;

const lintComposed = (code: string) => {
  const linter = new Linter();
  linter.defineParser(
    '@typescript-eslint/parser',
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@typescript-eslint/parser'),
  );
  for (const [id, rule] of Object.entries(SIBLING_RULES)) {
    linter.defineRule(id, rule as unknown as Rule.RuleModule);
  }
  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: Object.fromEntries(
      Object.keys(SIBLING_RULES).map((id) => [id, 'error' as const]),
    ),
  };
  const { output } = linter.verifyAndFix(code, config, 'react.tsx');
  // `--fix` re-lints what it wrote, so an output still holding fixes is not the
  // file the user ends up with. Every assertion below is made against a settled
  // one.
  const { output: settled } = linter.verifyAndFix(output, config, 'react.tsx');
  expect(settled).toBe(output);
  return output;
};

const fragmentImportCount = (source: string) =>
  (
    source.match(
      /import (?:\w+, )?\{[^}]*\bFragment\b[^}]*\} from 'react';/g,
    ) ?? []
  ).length;

describe('prefer-fragment-component: composed fixes and the import binding (issue #2233)', () => {
  it('strands no Fragment when a sibling unwrap removes the import', () => {
    const output = lintComposed(`import React from 'react';
import { useEffect } from 'react';
const Component = () => <><div>Test</div></>;
const AnotherComponent = () => <React.Fragment><p>Multi-component</p></React.Fragment>;
`);

    expectNoUnboundFragment(output);
    // Both fragments wrap a single child, so the composed result is the one
    // `no-useless-fragment` argues for: no fragment, and no import kept alive
    // for a name nothing reads.
    expect(output).toBe(`import React from 'react';
import { useEffect } from 'react';
const Component = () => <div>Test</div>;
const AnotherComponent = () => <p>Multi-component</p>;
`);
  });

  // The case above ends with no <Fragment> at all, so it would also pass for a
  // rule that simply stopped fixing. Multi-child fragments are the ones
  // `no-useless-fragment` leaves standing, so here the emitted <Fragment> has
  // to be bound for real.
  it('binds the Fragment a sibling unwrap leaves standing', () => {
    const output = lintComposed(`import React from 'react';
const A = () => <><div>only</div></>;
const B = () => <React.Fragment><p>c</p><em>d</em></React.Fragment>;
`);

    expect(output).toContain('<Fragment>');
    expectNoUnboundFragment(output);
    expect(fragmentImportCount(output)).toBe(1);
  });

  it('binds every Fragment in a file the sibling never unwraps', () => {
    const output = lintComposed(`import React from 'react';
const A = () => <><div>a</div><span>b</span></>;
const B = () => <React.Fragment><p>c</p><em>d</em></React.Fragment>;
`);

    expect(output.match(/<Fragment>/g)).toHaveLength(2);
    expectNoUnboundFragment(output);
    expect(fragmentImportCount(output)).toBe(1);
  });

  it('binds the Fragment when the file imports nothing from react', () => {
    const output =
      lintComposed(`const A = () => <><div>a</div><span>b</span></>;
const B = () => <><p>c</p><em>d</em></>;
`);

    expect(output.match(/<Fragment>/g)).toHaveLength(2);
    expectNoUnboundFragment(output);
    expect(fragmentImportCount(output)).toBe(1);
  });

  it('leaves a suppressed fragment alone while binding the rest', () => {
    const output = lintComposed(`import React from 'react';
// eslint-disable-next-line ${RULE_ID}
const A = () => <React.Fragment><p>a</p><em>b</em></React.Fragment>;
const B = () => <React.Fragment><p>c</p><em>d</em></React.Fragment>;
`);

    expect(output).toContain('<Fragment>');
    expectNoUnboundFragment(output);
    expect(fragmentImportCount(output)).toBe(1);
  });
});

// `verifyAndFix` stops after 10 passes. A remedy that made each fragment's fix
// claim the import binding site on its own would serialize the file to one
// fragment per pass and silently leave an 11th unconverted — passing every
// case above while regressing files this size. Solo runs are the control for
// that: one import, no leftover shorthand, however many fragments a file holds.
describe('prefer-fragment-component: whole-file conversion in one run (issue #2233)', () => {
  it.each([2, 10, 12, 20])(
    'converts all %i fragments and inserts one import',
    (count) => {
      const code = Array.from(
        { length: count },
        (_unused, index) => `const C${index} = () => <>x${index}</>;`,
      ).join('\n');

      const output = lint(code);

      expect(output.match(/<Fragment>/g)).toHaveLength(count);
      expect(output).not.toContain('<>');
      expect(fragmentImportCount(output)).toBe(1);
      expectNoUnboundFragment(output);
    },
  );

  it('adds no second import when the file already imports Fragment', () => {
    const output = lint(`import { Fragment } from 'react';
const A = () => <>One</>;
const B = () => <React.Fragment>Two</React.Fragment>;
const C = () => <>Three</>;
`);

    expect(output.match(/<Fragment>/g)).toHaveLength(3);
    expect(fragmentImportCount(output)).toBe(1);
    expectNoUnboundFragment(output);
  });
});
