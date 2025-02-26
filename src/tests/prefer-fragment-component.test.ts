import { ruleTesterJsx } from '../utils/ruleTester';
import { preferFragmentComponent } from '../rules/prefer-fragment-component';

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
      errors: [{ messageId: 'preferFragment' }],
      output: `import { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `import React from 'react';
const Component = () => <React.Fragment>Hello World</React.Fragment>;`,
      errors: [{ messageId: 'preferFragment' }],
      output: `import React, { Fragment } from 'react';
const Component = () => <Fragment>Hello World</Fragment>;`,
    },
    {
      code: `import { useState } from 'react';
const Component = () => <>Hello World</>;`,
      errors: [{ messageId: 'preferFragment' }],
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
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
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
      errors: [{ messageId: 'preferFragment' }],
      output: `import { Fragment } from 'react';
const Component = () => (<Fragment>
  <span>Line 1</span>
  <span>Line 2</span>
</Fragment>);`,
    },
    {
      code: `import * as React from 'react';
const Component = () => <React.Fragment>Using namespace import</React.Fragment>;`,
      errors: [{ messageId: 'preferFragment' }],
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
      errors: [{ messageId: 'preferFragment' }],
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
      errors: [{ messageId: 'preferFragment' }],
      output: `import { Fragment } from 'react';
const Component = () => <Fragment>
  {/* Whitespace preservation test */}
  <div>Content</div>
</Fragment>;`,
    },
    {
      code: `import React from 'react';
const Component = () => <React.Fragment key="unique-key">With Key</React.Fragment>;`,
      errors: [{ messageId: 'preferFragment' }],
      output: `import React, { Fragment } from 'react';
const Component = () => <Fragment key="unique-key">With Key</Fragment>;`,
    },
    {
      code: `import React from 'react';
import { useEffect } from 'react';
const Component = () => <><div>Test</div></>;
const AnotherComponent = () => <React.Fragment><p>Multi-component</p></React.Fragment>;`,
      errors: [
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
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
      errors: [{ messageId: 'preferFragment' }],
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
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
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
      errors: [{ messageId: 'preferFragment' }],
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
        { messageId: 'preferFragment' },
        { messageId: 'preferFragment' },
      ],
      output: `import React, { Fragment } from 'react';

const ComponentA = () => <Fragment></Fragment>;
const ComponentB = () => <Fragment></Fragment>;`,
    },
  ],
});
