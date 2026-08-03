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
  ],
});
