import { noConditionalLiteralsInJsx } from '../rules/no-conditional-literals-in-jsx';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run(
  'no-conditional-literals-in-jsx',
  noConditionalLiteralsInJsx,
  {
    // Message is shared across invalid cases with interpolated values
    // to ensure the rule surfaces actionable context in errors.
    invalid: [
      {
        code: `<div> This is a test {conditional && 'additional text'} </div>`,
        condition: 'conditional',
        literal: `'additional text'`,
        expression: `conditional && 'additional text'`,
      },
      {
        code: `<div> This is a {isReady && 'also text'} test </div>`,
        condition: 'isReady',
        literal: `'also text'`,
        expression: `isReady && 'also text'`,
      },
      {
        code: `<div> <span> This is a {show && 'extra'} test </span> </div>`,
        condition: 'show',
        literal: `'extra'`,
        expression: `show && 'extra'`,
      },
      {
        code: `<div> Label: {value || 'missing'} </div>`,
        condition: 'value',
        literal: `'missing'`,
        expression: `value || 'missing'`,
      },
      // Any sibling expression container fragments the text node, regardless of
      // the shape of its expression.
      {
        code: `<div>{getName()} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      {
        code: `<div>{first + last} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      {
        code: `<div>{\`hi \${x}\`} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      {
        code: `<div>{cond ? 'a' : 'b'} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      {
        code: `<div>{name ?? fallback} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      {
        code: `<div>{user.profile.name} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      // A sibling conditional element renders nothing when false, but its
      // rendered output cannot be classified syntactically, so it counts.
      {
        code: `<div>{isLoading && <Spinner/>} {isReturning && 'back'}</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      // Whitespace-only JSXText is not content on its own, but the sibling
      // container still is.
      {
        code: `<div>\n  {getName()}\n  {isReturning && 'back'}\n</div>`,
        condition: 'isReturning',
        literal: `'back'`,
        expression: `isReturning && 'back'`,
      },
      // A template literal without substitutions renders the same fragmented
      // text node as its quoted spelling, so notation must not decide.
      {
        code: `<div>Welcome {isReturning && \`back\`} user</div>`,
        condition: 'isReturning',
        literal: '`back`',
        expression: 'isReturning && `back`',
      },
      {
        code: `<div> Label: {value || \`missing\`} </div>`,
        condition: 'value',
        literal: '`missing`',
        expression: 'value || `missing`',
      },
      {
        code: `<div>{getName()} {isReturning && \`back\`}</div>`,
        condition: 'isReturning',
        literal: '`back`',
        expression: 'isReturning && `back`',
      },
      {
        code: `<div> <span> This is a {show && \`extra\`} test </span> </div>`,
        condition: 'show',
        literal: '`extra`',
        expression: 'show && `extra`',
      },
      // An interpolated template on the left is not an unconditional literal,
      // so the right-hand string literal still reports.
      {
        code: `<div>x {\`always \${y}\` && 'text'} z</div>`,
        condition: '`always ${y}`',
        literal: `'text'`,
        expression: "`always ${y}` && 'text'",
      },
    ]
      .map(({ code, condition, literal, expression }) => {
        return {
          code,
          errors: [
            {
              messageId: 'unexpected' as const,
              data: { literal, condition, expression },
            },
          ],
        };
      })
      .concat([
        // Two conditional literals are each other's sibling, so both report.
        {
          code: `<div>{isA && 'alpha'}{isB && 'beta'}</div>`,
          errors: [
            {
              messageId: 'unexpected' as const,
              data: {
                literal: `'alpha'`,
                condition: 'isA',
                expression: `isA && 'alpha'`,
              },
            },
            {
              messageId: 'unexpected' as const,
              data: {
                literal: `'beta'`,
                condition: 'isB',
                expression: `isB && 'beta'`,
              },
            },
          ],
        },
        {
          code: `<div>{isA && 'alpha'} {isB && 'beta'}</div>`,
          errors: [
            {
              messageId: 'unexpected' as const,
              data: {
                literal: `'alpha'`,
                condition: 'isA',
                expression: `isA && 'alpha'`,
              },
            },
            {
              messageId: 'unexpected' as const,
              data: {
                literal: `'beta'`,
                condition: 'isB',
                expression: `isB && 'beta'`,
              },
            },
          ],
        },
      ]),
    valid: [
      // JSX with no conditional text literals
      `(
      <div>
        This is a test
      </div>
    )`,
      // JSX with conditional element rendering
      `(
      <div>
        This is a test {conditional && <span>additional text</span>}
      </div>
    )`,
      // Conditional rendering of non-literal values
      `(
      <div>
        {conditional && variable}
      </div>
    )`,
      // Conditional rendering of non-string literal should be ignored
      `(
      <div>
        {conditional && 0}
      </div>
    )`,
      // Logical expression with two literals should be ignored
      `(
      <div>
        prefix {'foo' && 'bar'} suffix
      </div>
    )`,
      // Literal on the left-hand side should not report because the literal is
      // not the rendered value
      `(
      <div>
        start {'always' && condition} end
      </div>
    )`,
      // Literal short-circuit on the left is unconditional and should be ignored
      `(
      <div>
        start {'always' || condition} end
      </div>
    )`,
      // A conditional literal that is the sole child fragments nothing: the
      // container must never count itself as its own sibling.
      `<div>{isReturning && 'back'}</div>`,
      `<div>Welcome <span>{isReturning && 'back'}</span> user</div>`,
      // Surrounding whitespace-only JSXText is not adjacent content.
      `(
      <div>
        {isReturning && 'back'}
      </div>
    )`,
      // A comment container renders nothing.
      `<div>{/* note */}{isReturning && 'back'}</div>`,
      `(
      <div>
        {/* note */}
        {isReturning && 'back'}
        {/* trailing note */}
      </div>
    )`,
      // A sibling container elsewhere in the tree is not a sibling.
      `<div><span>{getName()}</span><span>{isReturning && 'back'}</span></div>`,
      // Wrapping the conditional keeps it whole even beside an expression.
      `<div>{formatDate(date)} <span>{isLate && 'late'}</span></div>`,
      // A template literal on the left is unconditional exactly as a quoted
      // literal is, so the carve-out must survive the notation change.
      `<div>prefix {\`always\` && 'bar'} suffix</div>`,
      `<div>prefix {\`always\` && \`bar\`} suffix</div>`,
      `<div>start {\`always\` && condition} end</div>`,
      `<div>start {\`always\` || condition} end</div>`,
      // A non-string literal on the left stays unconditional too.
      `<div>prefix {0 && 'bar'} suffix</div>`,
      // An interpolated template is not a text literal: its rendered value is
      // not decidable syntactically, so the conservative carve-out holds.
      `<div>Welcome {isReturning && \`back \${name}\`} user</div>`,
      `<div>{getName()} {isReturning && \`back \${name}\`}</div>`,
      // A conditional template literal with no sibling fragments nothing.
      `<div>{isReturning && \`back\`}</div>`,
      `<div>Welcome <span>{isReturning && \`back\`}</span> user</div>`,
      // A template conditional rendering an element is not a text literal.
      `<div>Welcome {isReturning && <span>back</span>} user</div>`,
    ],
  },
);
