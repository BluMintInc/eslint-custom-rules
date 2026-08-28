import { noFilterWithoutReturn } from '../rules/no-filter-without-return';
import { ruleTesterTs } from '../utils/ruleTester';

const messageTemplate =
  'Callback for {{filterCall}} uses braces but never returns a value, so filter receives undefined for every element and silently drops them all. Return the predicate result from inside the block (e.g., "return matches(item);") or use a concise arrow like {{filterCall}}((item) => matches(item)) to make the keep/remove condition explicit.';

const resolvedMessage = messageTemplate.replace(
  /{{filterCall}}/g,
  "['a'].filter",
);

describe('no-filter-without-return message text', () => {
  it('teaches why a missing return is a bug', () => {
    expect(noFilterWithoutReturn.meta.messages.unexpected).toBe(
      messageTemplate,
    );
  });

  it('produces a concrete example when the filter call is known', () => {
    expect(resolvedMessage).toContain("['a'].filter((item) => matches(item))");
  });
});

ruleTesterTs.run('no-filter-without-return', noFilterWithoutReturn, {
  valid: [
    `['a'].filter((x) => !x)`,
    `['a'].filter((x) => !!x)`,
    `['a'].filter((x) => {
            if (x === 'test') {
                return true
            }
            else {
                return false
            }
        })`,
    `['a'].filter(function (x) {
          return true
        })`,
    `['a'].filter((x) => x === 'a' ? true : false)`,
    // #2194 controls: the callback's OWN return is what satisfies the rule, and
    // it still does with a nested function alongside it.
    `['a'].filter((x) => { function inner() { return true; } return inner(); })`,
    `['a'].filter((x) => { const inner = () => true; return inner(x); })`,
  ],
  invalid: [
    {
      code: `['a'].filter((x) => {console.log(x)})`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      code: `['a'].filter((x) => {if (x) {
                return true
            }
        else {
            
        }})`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      code:
        // If-else with return only in the else branch
        "['a'].filter((x) => { if (x !== 'a') { console.log(x) } else { return true } })",
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      // #2194 subject: the `return` belongs to `inner`, not to the callback,
      // so the callback still yields undefined for every element. The walk had
      // no function boundary and credited the nested return to the callback.
      code: `['a'].filter((x) => { function inner() { return true; } })`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      // #2194 control: the same nested function spelled as an initializer,
      // which the walk skipped for an unrelated reason (`declarations` is an
      // array key) and so always reported. The two must agree.
      code: `['a'].filter((x) => { const inner = function () { return true; }; })`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      // A nested arrow is a boundary too, and so is a return nested inside a
      // branch of one.
      code: `['a'].filter((x) => { const inner = () => { if (x) { return true; } return false; }; })`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
    {
      // The boundary applies inside an `if` arm as well, where the both-branches
      // rule would otherwise be satisfied by a nested function's return.
      code: `['a'].filter((x) => { if (x) { function inner() { return true; } } else { return false; } })`,
      errors: [
        {
          messageId: 'unexpected',
          data: {
            filterCall: "['a'].filter",
          },
        },
      ],
    },
  ],
});
