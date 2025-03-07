import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('exact-bug-reproduction', noTypeAssertionReturns, {
  valid: [
    // Test case that exactly matches the bug report example
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

    function assertRequestMethod(req: Request, method: string): void {
      // Implementation not important for the test
    }

    class DatadogErrorProcessor {
      constructor(payload: DatadogIssuePayload) {
        // Implementation not important for the test
      }

      // Now with explicit return type, which should be allowed
      async process(): Promise<void> {
        return Promise.resolve();
      }
    }

    function onRequest(handler: (req: Request, res: Response) => Promise<void>) {
      return handler;
    }

    // The actual function from the bug report
    const datadog = async (req: Request, res: Response): Promise<void> => {
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
