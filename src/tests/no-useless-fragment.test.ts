import { noUselessFragment } from '../rules/no-useless-fragment';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('no-useless-fragment', noUselessFragment, {
  valid: [
    '<><ChildComponent /><AnotherChild /></>',
    '<><ChildComponent />Text<AnotherChild /></>',
    '<><ChildComponent /><AnotherChild /></>',
    // Issue #1195: a fragment wrapping a single expression container is NOT
    // useless — unwrapping to a bare `{expr}` is invalid in return/statement
    // position, and `<>{expr}</>` is the idiomatic way to render it.
    '<>{Portal}</>',
    '<>{children}</>',
    '<>{condition ? <A /> : <B />}</>',
    '<>{items.map((item) => <Item key={item.id} {...item} />)}</>',
    // A string-literal expression container is still an expression
    // container, so the #1195 carve-out applies even though the rendered
    // value is plain text.
    '<>{"text"}</>',
    // A comment is itself an expression container, so it is exempt too.
    '<>{/* comment */}</>',
    // No children at all: nothing to unwrap.
    '<></>',
    // A single whitespace-only child that spans a newline is formatting
    // padding contributed by a code formatter, not rendered content, so it
    // collapses to zero meaningful children.
    '<>\n</>',
    // Whitespace WITHOUT a newline renders an actual space between
    // siblings, so it counts as a real child: 3 meaningful children here.
    '<> <Foo /> </>',
    '<>\t<Foo />\t</>',
    // A comment alongside an element leaves 2 meaningful children.
    `<>
      {/* keep this element documented */}
      <Foo />
    </>`,
    // The prettier-standard multi-line form with TWO real children is not
    // useless even though it is padded with newline whitespace on every
    // side.
    `<>
      <ChildComponent />
      <AnotherChild />
    </>`,
    // --- long-form fragment spellings (issue #2227) ---
    // Two meaningful children: the fragment groups, whichever spelling it uses.
    `import { Fragment } from 'react';
const A = () => <Fragment><ChildComponent /><AnotherChild /></Fragment>;`,
    `import { Fragment } from 'react';
const A = () => (
  <Fragment>
    <ChildComponent />
    <AnotherChild />
  </Fragment>
);`,
    '<React.Fragment><ChildComponent /><AnotherChild /></React.Fragment>',
    // An attribute is content the unwrap would have to drop or move onto the
    // promoted child: `key` positions the fragment among its siblings, so an
    // attributed fragment is meaningful even around a single child.
    `import { Fragment } from 'react';
const A = ({ k }) => <Fragment key={k}><ChildComponent /></Fragment>;`,
    '<React.Fragment key={k}><ChildComponent /></React.Fragment>',
    // A self-closing fragment has no children at all: nothing to unwrap.
    `import { Fragment } from 'react';
const A = () => <Fragment />;`,
    '<React.Fragment />',
    // The #1195 expression-container carve-out is about the child, not the
    // fragment's spelling.
    `import { Fragment } from 'react';
const A = ({ portal }) => <Fragment>{portal}</Fragment>;`,
    '<React.Fragment>{portal}</React.Fragment>',
    // A locally declared `Fragment` is a different element: unwrapping it
    // would delete a component that renders real markup.
    `const Fragment = ({ children }) => <section>{children}</section>;
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    `function Fragment({ children }) {
  return <section>{children}</section>;
}
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    // A `Fragment` imported from another module renders that module's
    // component, not react's.
    `import { Fragment } from 'preact';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    // An alias leaves the name `Fragment` free, so the element named `F` is
    // not recognized as react's fragment.
    `import { Fragment as F } from 'react';
const A = () => <F><ChildComponent /></F>;`,
    // The aliased import binds nothing called `Fragment`, so a `<Fragment>`
    // element beside it resolves to something the file never declares.
    `import { Fragment as F } from 'react';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    // An unresolved name states nothing about what it renders; counting it as
    // react's fragment would trade a false negative for a false positive.
    'const A = () => <Fragment><ChildComponent /></Fragment>;',
    // A default or namespace import named `Fragment` is the react module
    // object, not the fragment component.
    `import Fragment from 'react';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    `import * as Fragment from 'react';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    // A type-only import binds nothing at runtime.
    `import type { Fragment } from 'react';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
    // The binding is resolved from the element's own scope, so a narrower
    // shadow wins over the module-level react import.
    `import { Fragment } from 'react';
const A = () => {
  const Fragment = ({ children }) => <section>{children}</section>;
  return <Fragment><ChildComponent /></Fragment>;
};`,
    // Member expressions that are not `React.Fragment` are ordinary elements.
    '<Other.Fragment><ChildComponent /></Other.Fragment>',
    '<React.Suspense><ChildComponent /></React.Suspense>',
    // An ordinary element wrapping a single child is not a fragment: the
    // JSXElement visitor must not fire on every wrapper in the file.
    '<div><ChildComponent /></div>',
    `import { Fragment } from 'react';
const A = () => <div><ChildComponent /></div>;`,
  ],
  invalid: [
    {
      code: '<><ChildComponent /></>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<ChildComponent />',
    },
    {
      code: '<><NestedComponent><ChildComponent /></NestedComponent></>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<NestedComponent><ChildComponent /></NestedComponent>',
    },
    // Text and spread children are report-only: unwrapping a JSXText child
    // would turn it into a bare identifier reference, and `{...items}` is
    // not a valid standalone expression, so the rule offers no fix.
    {
      code: '<>hello</>',
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: null,
    },
    {
      code: '<>{...items}</>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'spread child' },
        },
      ],
      output: null,
    },
    // A single whitespace character with no newline still renders as a
    // meaningful (albeit pointless) text child, so it is reported like any
    // other text node — and, like any text node, gets no fix.
    {
      code: '<> </>',
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: null,
    },
    // The prettier-standard multi-line single-child form must be caught:
    // the surrounding newline-only JSXText nodes are formatting padding,
    // not real siblings.
    {
      code: `const A = () => {
  return (
    <>
      <ChildComponent />
    </>
  );
};`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => {
  return (
    <ChildComponent />
  );
};`,
    },
    // CRLF padding around the single child is still formatting whitespace.
    {
      code: '<>\r\n  <Foo />\r\n</>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<Foo />',
    },
    // A fragment whose only child is itself a fragment is fixable: the
    // outer fragment unwraps to the inner fragment's own source text.
    {
      code: '<><>Foo</></>',
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'text node' },
        },
      ],
      output: '<>Foo</>',
    },
    // Deeply nested useless fragments: each layer is reported once, and a
    // single autofix pass only removes the outermost layer (the inner
    // fixes overlap with it and are deferred to the next pass).
    {
      code: `<>
  <>
    <Foo />
  </>
</>`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<>
  <Foo />
</>`,
    },
    // Issue #2131: unwrapping must re-indent the promoted subtree by the
    // removed indentation step. A verbatim paste leaves every interior line
    // one step deeper than its new enclosing scope, so prettier immediately
    // rewrites the fixer's output and the fix never settles.
    {
      code: `<>
  <NestedComponent>
    <ChildComponent />
  </NestedComponent>
</>`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<NestedComponent>
  <ChildComponent />
</NestedComponent>`,
    },
    // The re-indent is relative: a fragment already nested inside a component
    // return dedents its subtree by exactly one step, not to column zero.
    {
      code: `const A = () => {
  return (
    <>
      <Wrapper>
        <Leaf />
      </Wrapper>
    </>
  );
};`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => {
  return (
    <Wrapper>
      <Leaf />
    </Wrapper>
  );
};`,
    },
    // Every line of the promoted subtree shifts, including the lines of a
    // multi-line opening tag and its `>` — not just the JSX children.
    {
      code: `<>
  <Card
    title="Title"
    subtitle="Sub"
  >
    <Leaf />
  </Card>
</>`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<Card
  title="Title"
  subtitle="Sub"
>
  <Leaf />
</Card>`,
    },
    // Interior lines of a multi-line template literal are part of the
    // runtime string, so the re-indent must leave them byte-identical —
    // including the line the closing backtick sits on. The tag is one
    // prettier has no embedded-language formatter for (unlike `gql`/`css`),
    // so prettier also treats the interior as opaque content.
    {
      code: `<>
  <Query>
    {sql\`
SELECT id
  FROM t
\`}
  </Query>
</>`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<Query>
  {sql\`
SELECT id
  FROM t
\`}
</Query>`,
    },
    // Interior lines of a block comment are content prettier leaves
    // verbatim, so the re-indent must not move them; the comment's first
    // line starts outside the token and shifts with the rest of the tree.
    {
      code: `<>
  <Section>
    {/* multi-line
       annotation */}
    <Leaf />
  </Section>
</>`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<Section>
  {/* multi-line
       annotation */}
  <Leaf />
</Section>`,
    },
    // A child that starts LEFT of the fragment (hand-formatted code) shifts
    // RIGHT so its internal alignment survives the promotion.
    {
      code: `const x = (
  <>
<Foo>
  <Bar />
</Foo>
  </>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const x = (
  <Foo>
    <Bar />
  </Foo>
);`,
    },
    // CRLF interior lines dedent like LF ones: splitting on `\n` leaves the
    // `\r` at line ends, away from the leading indentation being shifted.
    {
      code: '<>\r\n  <Foo>\r\n    <Bar />\r\n  </Foo>\r\n</>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<Foo>\r\n  <Bar />\r\n</Foo>',
    },
    // The dedent clamps to the whitespace actually present: a JSX text line
    // already at column zero loses no characters.
    {
      code: `<>
  <Pre>
text at col zero
  </Pre>
</>`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `<Pre>
text at col zero
</Pre>`,
    },
    // --- long-form fragment spellings (issue #2227) ---
    // A hand-written <Fragment> denotes the same node as `<>`, so it is
    // reported and unwrapped identically.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment><ChildComponent /></Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: 'const A = () => <ChildComponent />;',
    },
    // <React.Fragment> is recognized without any import bookkeeping: the
    // member access is the spelling itself.
    {
      code: '<React.Fragment><ChildComponent /></React.Fragment>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<ChildComponent />',
    },
    {
      code: `import React from 'react';
const A = () => <React.Fragment><ChildComponent /></React.Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import React from 'react';
const A = () => <ChildComponent />;`,
    },
    // The promoted child keeps its own subtree, exactly as under `<>`.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment><NestedComponent><ChildComponent /></NestedComponent></Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output:
        'const A = () => <NestedComponent><ChildComponent /></NestedComponent>;',
    },
    // Newline-only padding around a single child is formatting in the long
    // forms too.
    {
      code: `import { Fragment } from 'react';
const A = () => (
  <Fragment>
    <ChildComponent />
  </Fragment>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => (
  <ChildComponent />
);`,
    },
    // Issue #2131's re-indent applies to the element spellings: the promoted
    // subtree is shifted by the removed indentation step so prettier does not
    // immediately rewrite the fixer's output.
    {
      code: `import { Fragment } from 'react';
const A = () => (
  <Fragment>
    <Wrapper>
      <Leaf />
    </Wrapper>
  </Fragment>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => (
  <Wrapper>
    <Leaf />
  </Wrapper>
);`,
    },
    {
      code: `const A = () => (
  <React.Fragment>
    <Wrapper>
      <Leaf />
    </Wrapper>
  </React.Fragment>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => (
  <Wrapper>
    <Leaf />
  </Wrapper>
);`,
    },
    // A text child is report-only whatever the fragment's spelling: unwrapping
    // would turn the JSX text into a bare identifier reference.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment>hello</Fragment>;`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: null,
    },
    {
      code: '<React.Fragment>hello</React.Fragment>',
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: null,
    },
    // A spread child is not a valid standalone expression, so it stays
    // report-only too.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment>{...items}</Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'spread child' },
        },
      ],
      output: null,
    },
    {
      code: '<React.Fragment>{...items}</React.Fragment>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'spread child' },
        },
      ],
      output: null,
    },
    // Nested long-form fragments: each layer is reported once, and the child
    // is described as a fragment rather than as a plain JSX element. A single
    // pass removes the outermost layer; the inner fix overlaps it and is
    // deferred to the next pass.
    {
      code: `import { Fragment } from 'react';
const A = () => (
  <Fragment>
    <Fragment>
      <Leaf />
    </Fragment>
  </Fragment>
);`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => (
  <Fragment>
    <Leaf />
  </Fragment>
);`,
    },
    // Mixed spellings nest the same way, in either direction.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment><>Foo</></Fragment>;`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: 'const A = () => <>Foo</>;',
    },
    {
      code: `import { Fragment } from 'react';
const A = () => <><Fragment>Foo</Fragment></>;`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        { messageId: 'noUselessFragment', data: { childKind: 'text node' } },
      ],
      output: `import { Fragment } from 'react';
const A = () => <Fragment>Foo</Fragment>;`,
    },
    // An attributed fragment stays put, but a useless one nested inside it is
    // still reported: the attribute exempts only the element that carries it.
    {
      code: `import { Fragment } from 'react';
const A = ({ k }) => (
  <Fragment key={k}>
    <Fragment>
      <Leaf />
    </Fragment>
  </Fragment>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = ({ k }) => (
  <Fragment key={k}>
    <Leaf />
  </Fragment>
);`,
    },
    // Two different long-form spellings nest the same way as two of a kind,
    // but here the INNER fix is the one that lands. Unwrapping the outer
    // <Fragment> would orphan its import, and the orphan planner's coarse
    // second opinion sees the identifier `Fragment` still occurring outside the
    // deleted span — as the property of `React.Fragment` — so it declines
    // rather than guess. Declining costs a pass, never correctness: the report
    // stands, the inner fix lands, and the next pass unwraps what is by then a
    // lone <Fragment> and takes the import with it.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment><React.Fragment><Leaf /></React.Fragment></Fragment>;`,
      errors: [
        { messageId: 'noUselessFragment', data: { childKind: 'fragment' } },
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = () => <Fragment><Leaf /></Fragment>;`,
    },
    // A long-form fragment wrapping a single child inside a real element is
    // reported without disturbing the element around it.
    {
      code: `import { Fragment } from 'react';
const A = () => (
  <div>
    <Fragment>
      <Leaf />
    </Fragment>
  </div>
);`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => (
  <div>
    <Leaf />
  </div>
);`,
    },
    // --- the import the unwrap leaves bound to nothing (issue #2227) ---
    // Two fragments jointly hold the import alive, so neither unwrap may drop
    // it alone. One fix performs BOTH unwraps and the removal together: a fix
    // that counted on its sibling landing would strand the import whenever
    // ESLint discarded that sibling.
    {
      code: `import { Fragment } from 'react';
const A = () => <Fragment><X /></Fragment>;
const B = () => <Fragment><Y /></Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `const A = () => <X />;
const B = () => <Y />;`,
    },
    // Only the orphaned specifier goes; the siblings sharing its declaration
    // are still used and keep their import.
    {
      code: `import { Fragment, useState } from 'react';
const A = () => {
  useState();
  return <Fragment><X /></Fragment>;
};`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import { useState } from 'react';
const A = () => {
  useState();
  return <X />;
};`,
    },
    {
      code: `import React, { Fragment } from 'react';
const A = () => <Fragment><X /></Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import React from 'react';
const A = () => <X />;`,
    },
    // A use the fix does not delete keeps the import: the attributed fragment
    // is exempt, so it still names `Fragment` after the unwrap lands.
    {
      code: `import { Fragment } from 'react';
const A = ({ k }) => <Fragment key={k}><X /></Fragment>;
const B = () => <Fragment><Y /></Fragment>;`,
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: `import { Fragment } from 'react';
const A = ({ k }) => <Fragment key={k}><X /></Fragment>;
const B = () => <Y />;`,
    },
  ],
});
