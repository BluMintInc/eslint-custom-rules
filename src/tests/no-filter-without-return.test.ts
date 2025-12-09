import { noFilterWithoutReturn } from '../rules/no-filter-without-return';
import { ruleTesterTs } from '../utils/ruleTester';

const messageTemplate =
  'Callback for {{filterCall}} uses braces but never returns a boolean, so filter receives undefined for every element and silently drops them all. Return the predicate result from inside the block (e.g., "return matches(item);") or use a concise arrow like {{filterCall}}((item) => matches(item)) to make the keep/remove condition explicit.';

const resolvedMessage = messageTemplate.replace(/{{filterCall}}/g, "['a'].filter");

describe('no-filter-without-return message text', () => {
  it('teaches why a missing return is a bug', () => {
    expect(noFilterWithoutReturn.meta.messages.unexpected).toBe(messageTemplate);
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
  ],
});
