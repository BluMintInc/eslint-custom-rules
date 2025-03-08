import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('no-type-assertion-returns-bug-fix', noTypeAssertionReturns, {
  valid: [
    // Bug fix case: Type assertion as constructor argument
    `
    import { Request } from 'express';

    const datadog = async (req: Request): Promise<void> => {
      const { body } = req;
      const processor = new DatadogErrorProcessor(body as DatadogIssuePayload);

      await processor.process();

      res.sendStatus(200);
    };
    `,
  ],
  invalid: [],
});
