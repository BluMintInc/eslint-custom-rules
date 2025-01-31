import { ruleTesterTs } from '../utils/ruleTester';
import { scopesReadTopToBottom } from '../rules/scopes-read-top-to-bottom';

ruleTesterTs.run('scopes-read-top-to-bottom', scopesReadTopToBottom, {
  valid: [
    // Basic variable ordering
    {
      code: `
        const group = useGroupDoc();
        const { id } = group || {};
        const { groupTabState } = useGroupRouter();
      `,
    },
    // React hooks should maintain order
    {
      code: `
        const [state, setState] = useState(null);
        const { id } = group || {};
      `,
    },
    // Side effects in control flow
    {
      code: `
        const id = getId();
        let data;
        if (shouldFetch) {
          data = fetchData();
        }
      `,
    },
    // For loops with side effects
    {
      code: `
        console.log('Processing started');
        let results = [];
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
    },
    // Lexical scoping and closures
    {
      code: `
        let counter = 0;
        const increment = () => counter++;
      `,
    },
    // Complex destructuring
    {
      code: `
        const data = getData();
        const { items: [first, second], meta: { count } } = data;
      `,
    },
    // Multiple hooks
    {
      code: `
        const [state1] = useState(1);
        const [state2] = useState(2);
        const value = state1 + state2;
      `,
    },
  ],
  invalid: [
    // Basic variable ordering violation
    {
      code: `
        const { id } = group || {};
        const group = useGroupDoc();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: null,
    },
    // Multiple dependencies
    {
      code: `
        const result = a + b;
        const a = 1;
        const b = 2;
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: null,
    },
    // Object destructuring
    {
      code: `
        const { value } = obj;
        const obj = { value: 42 };
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: null,
    },
    // Member expression
    {
      code: `
        const value = obj.prop;
        const obj = { prop: 42 };
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: null,
    },
    // Computed member expression
    {
      code: `
        const value = obj[key];
        const obj = { a: 1 };
        const key = 'a';
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: null,
    },
  ],
});
