import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { ruleTesterTs } from '../utils/ruleTester';

const error = (awaitCount: number) => ({
  messageId: 'parallelizeAsyncOperations' as const,
  data: { awaitCount: awaitCount.toString() },
});

ruleTesterTs.run('parallelize-async-operations-false-positives', parallelizeAsyncOperations, {
  valid: [],
  invalid: [
    {
      code: `
      async function falsePositiveCoordinator() {
        await fetch({ manager: 'a' });
        await fetch({ manager: 'b' });
      }
      `,
      errors: [error(2)],
    },
    {
      code: `
      async function falsePositiveMember() {
        await obj.manager();
        await other.manager();
      }
      `,
      errors: [error(2)],
    },
  ],
});
