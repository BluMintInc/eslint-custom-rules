import { ruleTesterJsx } from '../utils/ruleTester';
import { noJsxWhitespaceLiteral } from '../rules/no-jsx-whitespace-literal';

/**
 * Fixtures carrying a `{' '}` that closes its line are reproduced VERBATIM from
 * prettier 2.8.8's own output at printWidth 80 (agora's formatter settings).
 * They are prettier fixed points: the rule ships no autofix, so a report on one
 * of them is an unactionable hard failure whose only escape is an inline
 * disable, because folding the space into the adjacent text is precisely the
 * edit the next format reverts.
 *
 * The invalid fixtures deliberately include the PRETTIER-CANONICAL spelling of
 * every shape the rule still catches. Prettier erases a mid-line single-space
 * container outright, so a suite written only in the hand-authored spelling
 * cannot tell a working carve-out from a disabled rule.
 */
ruleTesterJsx.run('no-jsx-whitespace-literal', noJsxWhitespaceLiteral, {
  valid: [
    {
      code: '<div>Hello, world!</div>',
    },
    {
      code: '<Button>Click Me</Button>',
    },
    {
      code: '<div className="space-between">Hello, world!</div>',
    },
    {
      code: '<div>Hello,&nbsp;world!</div>',
    },
    {
      code: '<div>{showGreeting && "Hello "}{username}</div>',
    },
    {
      code: '<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}</div>',
    },
    // Prettier's line-break encoding: the wrapped line ends with the container
    // and the next line opens an element.
    {
      code: `
const App = () => (
  <div>
    <SomeFairlyLongComponentName /> and then some more text here{' '}
    <AnotherComponentName />
  </div>
);
`,
    },
    // The same encoding written with double quotes, which is what prettier
    // emits when singleQuote is off. The rule reads the literal's VALUE, so the
    // carve-out must not be keyed on one quote style.
    {
      code: `
const App = () => (
  <div>
    <SomeFairlyLongComponentName /> and then some more text here{" "}
    <AnotherComponentName />
  </div>
);
`,
    },
    // A leading significant space: prettier parks the container alone on its own
    // line, which also closes the line.
    {
      code: `
const App = () => (
  <div>
    {' '}
    <CompWord />
  </div>
);
`,
    },
    // A trailing significant space before the closing tag. This is the
    // prettier-formatted image of the mapped-list fixture in the invalid list
    // below, so the two together pin both sides of the carve-out.
    {
      code: `
const App = () => (
  <div>
    {items.map((item) => (
      <span key={item.id}>{item.name}</span>
    ))}{' '}
  </div>
);
`,
    },
    // Next line opens with text rather than an element.
    {
      code: `
const App = () => (
  <div>
    WordWordWordWordWordWordWordWordWordWordWordWord{' '}
    WordWordWordWordWordWordWordWordWordWordWordWord
  </div>
);
`,
    },
    // Depth must not matter: the encoding is a property of the line, not of the
    // element's nesting.
    {
      code: `
const App = () => (
  <Outer>
    <Middle>
      <Inner>
        <SomeFairlyLongComponentName /> plus some more words here{' '}
        <AnotherComponentName />
      </Inner>
    </Middle>
  </Outer>
);
`,
    },
    // A fragment is as much a parent of JSX children as an element is.
    {
      code: `
const App = () => (
  <>
    <SomeFairlyLongComponentName /> and then some more text here{' '}
    <AnotherComponentName />
  </>
);
`,
    },
    // The preceding sibling is an expression container rather than text.
    {
      code: `
const App = () => (
  <div>
    {someCondition ? <VeryLongComponentNameHere /> : null}{' '}
    <AnotherFairlyLongComponentName />
  </div>
);
`,
    },
    // Both neighbours are expression containers.
    {
      code: `
const App = () => (
  <div>
    {someCondition ? <VeryLongComponentNameHere /> : fallbackValue}{' '}
    {trailingValueExpression}
  </div>
);
`,
    },
    /**
     * Trailing whitespace after the container still closes the line. Prettier
     * strips trailing whitespace, so this exact text is NOT its output; the
     * fixture exists because hand-edited source reaches the linter before the
     * formatter does, and the predicate must not hinge on the container being
     * the literal last character of the line.
     */
    {
      code: `
const App = () => (
  <div>
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa{' '}   
    <BComponentName />
  </div>
);
`,
    },
    /**
     * Attribute values are props, not children (#2102). React passes the
     * string to the element untouched — no text node exists to shift or
     * duplicate — and `alt={''}` is the accessibility idiom for a decorative
     * image. The message's remedy (move the space into adjacent text) has no
     * meaning for a prop, so every whitespace-only attribute value is out of
     * the rule's subject, whatever the literal holds and wherever it sits.
     */
    {
      code: `const Decorative = () => <img alt={''} src="/x.png" />;`,
    },
    {
      code: "<div title={' '} />",
    },
    {
      code: `
const App = () => (
  <Comp title={' '}
    other={1} />
);
`,
    },
    {
      code: "<input placeholder={'  '} />",
    },
    {
      code: `<pre data-sep={'\\n'} />`,
    },
    {
      code: `<span aria-label={'\\t'}>x</span>`,
    },
    {
      code: `
const App = () => (
  <Comp
    label={''}
    title={' '}
  />
);
`,
    },
    // A prop on a member-expression element, and a prop on a fragment-wrapped
    // element: the parent of the container is the attribute in both.
    {
      code: `const A = () => <Foo.Bar alt={''} />;`,
    },
    {
      code: `const A = () => <><img alt={''} /></>;`,
    },
  ],
  invalid: [
    {
      code: '<div>Hello,{" "}world!</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<Button>Click{" "}Me</Button>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<div>{showGreeting && "Hello"}{" "}{username}</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}{" "}</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    // A container with source after it on its own line is a mid-text spacer:
    // prettier folds that space back into the surrounding text rather than
    // preserving the container, so it is hand-written.
    {
      code: `
const App = () => (
  <Outer>
    <Inner>a{' '}b</Inner>
  </Outer>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    // Only the FIRST of two adjacent containers is mid-line. The second closes
    // the line and is prettier's encoding, so exactly one report is correct.
    {
      code: `
const App = () => (
  <div>
    a{' '}{' '}
    <B />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: "<div>a{' '}{' '}</div>",
      errors: [
        { messageId: 'noWhitespaceLiteral' },
        { messageId: 'noWhitespaceLiteral' },
      ],
    },
    // Prettier-canonical spellings of the literals it never relocates. Each of
    // these is a prettier FIXED POINT mid-line, so they are the shapes the rule
    // genuinely reaches on formatted source and must keep reporting.
    {
      code: "<div>a{'  '}b</div>",
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: { literal: "{'  '}" },
        },
      ],
    },
    {
      code: "<div>a{'\\t'}b</div>",
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: "<div>a{'\\n'}b</div>",
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: "<div>a{''}b</div>",
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: { literal: "{''}" },
        },
      ],
    },
    // The same literals CLOSING a line. Prettier leaves every one of them
    // exactly where it sits, so line position does not make them its encoding —
    // the carve-out must stay keyed on a single space.
    {
      code: `
const App = () => (
  <div>
    WordWordWordWordWordWordWordWordWordWordWordWord{'  '}
    <Another />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: `
const App = () => (
  <div>
    WordWordWordWordWordWordWordWordWordWordWordWord{'\\t'}
    <Another />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: `
const App = () => (
  <div>
    WordWordWordWordWordWordWordWordWordWordWordWord{'\\n'}
    <Another />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    {
      code: `
const App = () => (
  <div>
    WordWordWordWordWordWordWordWordWordWordWordWord{''}
    <Another />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
    // An attribute value beside a child spacer: only the child is the rule's
    // subject, so exactly one report lands, on the child.
    {
      code: `
const App = () => (
  <Figure alt={''} src="/x.png">
    {''}
  </Figure>
);
`,
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          line: 4,
          column: 5,
        },
      ],
    },
    // A container prettier would collapse onto one line is not its output, so
    // spreading a single space across several lines does not buy the carve-out.
    {
      code: `
const App = () => (
  <div>
    x{
      ' '
    }
    <B />
  </div>
);
`,
      errors: [{ messageId: 'noWhitespaceLiteral' }],
    },
  ],
});
