import { ruleTesterTs } from '../utils/ruleTester';
import { enforceLogicalGrouping } from '../../src/rules/enforce-logical-grouping';

ruleTesterTs.run('enforce-logical-grouping', enforceLogicalGrouping, {
  valid: [
    // Early returns before other code
    `
      if (id !== null) {
        return null;
      }
      const a = props.group;
      const b = a;
    `,
    // Related declarations grouped together
    `
      const group = useGroupDoc();
      const { id } = group || {};

      const { groupTabState } = useGroupRouter();
    `,
    // Hooks maintain their order
    `
      const { data } = useQuery();
      const { mutate } = useMutation();
      const theme = useTheme();
    `,
    // Logical order with side effects
    `
      console.log('Processing started');

      let results = [];
      for (const item of items) {
        results.push(processItem(item));
      }
    `,
    // Function expressions with dependencies
    `
      const userId = getUserId();
      const handler = (x: number) => {
        return x + userId;
      };
      console.log(handler(10));
    `,
  ],
  invalid: [
    {
      code: `
        const { a } = props.group;
        if (id !== null) {
          return null;
        }
        const b = a;
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        if (id !== null) {
          return null;
        }

        const { a } = props.group;
        const b = a;
      `,
    },
    {
      code: `
        const group = useGroupDoc();
        const { groupTabState } = useGroupRouter();
        const { id } = group || {};
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const group = useGroupDoc();
        const { id } = group || {};
        const { groupTabState } = useGroupRouter();
      `,
    },
    {
      code: `
        let results = [];
        console.log('Processing started');
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        console.log('Processing started');
        let results = [];
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
    },
    {
      code: `
        const handler = (x: number) => {
          return x + 1;
        };
        const userId = getUserId();
        console.log(handler(10));
      `,
      errors: [{ messageId: 'logicalGrouping' }],
      output: `
        const userId = getUserId();
        const handler = (x: number) => {
          return x + 1;
        };
        console.log(handler(10));
      `,
    },
  ],
});
