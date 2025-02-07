import { ruleTesterTs } from '../utils/ruleTester';
import { scopesReadTopToBottom } from '../../src/rules/scopes-read-top-to-bottom';

ruleTesterTs.run('scopes-read-top-to-bottom', scopesReadTopToBottom, {
  valid: [
    // Basic variable ordering
    {
      code: `
        const a = 1;
        const b = a + 2;
      `,
    },
    // React hooks should maintain their order
    {
      code: `
        const [state, setState] = useState(null);
        const { id } = group || {};
      `,
    },
    // Destructuring with correct order
    {
      code: `
        const group = useGroupDoc();
        const { id } = group || {};
        const { groupTabState } = useGroupRouter();
      `,
    },
    // Side effects should prevent reordering
    {
      code: `
        let results = [];
        console.log('Processing started');
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
    },
    // If statements with side effects
    {
      code: `
        const id = getId();
        let data;
        if (shouldFetch) {
          data = fetchData();
        }
      `,
    },
  ],
  invalid: [
    // Basic out of order case
    {
      code: `
        const b = a + 2;
        const a = 1;
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const a = 1;
        const b = a + 2;
      `,
    },
    // Out of order with destructuring
    {
      code: `
        const { id } = group || {};
        const group = useGroupDoc();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const group = useGroupDoc();
        const { id } = group || {};
      `,
    },
    // Multiple dependencies
    {
      code: `
        const result = a + b;
        const a = 1;
        const b = 2;
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const a = 1;
        const result = a + b;
        const b = 2;
      `,
    },
  ],
});
