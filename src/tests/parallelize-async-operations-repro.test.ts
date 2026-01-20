import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('parallelize-async-operations-repro', parallelizeAsyncOperations, {
  valid: [
    // This is the problematic code from the issue
    `
    async function reproduction() {
      const batchManager = options?.batchManager ?? new BatchManager<Notification>();

      await Promise.all(
        settings.map((setting) => {
          const filer = new NotificationFiler(setting);
          return filer.store({ batchManager });
        }),
      );
      await batchManager.commit();
    }
    `,
  ],
  invalid: [],
});
