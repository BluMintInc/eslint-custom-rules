import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { preferFragmentComponent } from '../rules/prefer-fragment-component';

const preferFragmentMessage =
  'Prefer Fragment imported from react over {{type}}. Shorthand fragments block props like "key" and mixing fragment styles makes JSX harder to refactor. Import { Fragment } from "react" and wrap the children with <Fragment>...</Fragment> so fragment usage stays explicit.';
const addFragmentImportMessage =
  "Fragment is used but not imported from react. Without an explicit import the fixer leaves <Fragment> undefined and the React dependency implicit. Add `import { Fragment } from 'react'` alongside your other React imports so the file compiles.";

describe('prefer-fragment-component messages', () => {
  it('exposes educational message strings', () => {
    expect(preferFragmentComponent.meta.messages.preferFragment).toBe(
      preferFragmentMessage,
    );
    expect(preferFragmentComponent.meta.messages.addFragmentImport).toBe(
      addFragmentImportMessage,
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

// RuleTester applies a single fix pass and never shows the file that
// `eslint --fix` actually writes. These cases drive the real multi-pass fixer
// and assert the invariant the bug violated: an emitted <Fragment> is never
// left without `import { Fragment } from 'react'`.
describe('prefer-fragment-component: inline disables and the import carrier (issue #1407)', () => {
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
