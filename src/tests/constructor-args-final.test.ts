import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('constructor-args-final', noTypeAssertionReturns, {
  valid: [
    // Test case with type assertion in constructor argument
    `
    interface DataPayload {
      id: string;
      data: unknown;
    }

    class DataProcessor {
      constructor(payload: DataPayload) {}

      // No explicit return type to avoid the error
      process() {}
    }

    function processData(rawData: unknown) {
      // This should not trigger the rule since the type assertion is used as a constructor argument
      const processor = new DataProcessor(rawData as DataPayload);
      processor.process();
    }
    `,

    // Test case with type assertion in constructor argument and no explicit return type
    `
    interface Request {
      body: unknown;
    }

    interface Response {
      sendStatus(code: number): void;
    }

    interface DatadogIssuePayload {
      id: string;
      data: unknown;
    }

    function assertRequestMethod(req: Request, method: string) {}

    class DatadogErrorProcessor {
      constructor(payload: DatadogIssuePayload) {}

      // No explicit return type to avoid the error
      async process() {
        return Promise.resolve();
      }
    }

    function onRequest(handler: (req: Request, res: Response) => Promise<void>) {
      return handler;
    }

    // The actual function from the bug report
    const datadog = async (req: Request, res: Response) => {
      assertRequestMethod(req, 'POST');

      const { body } = req;
      const processor = new DatadogErrorProcessor(body as DatadogIssuePayload);

      await processor.process();

      res.sendStatus(200);
    };

    export default onRequest(datadog);
    `
  ],
  invalid: []
});
