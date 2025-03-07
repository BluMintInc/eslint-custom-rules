import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('no-type-assertion-returns-bug', noTypeAssertionReturns, {
  valid: [
    // Test case for constructor arguments with type assertion
    `
    interface DataPayload {
      id: string;
      data: unknown;
    }

    class DataProcessor {
      constructor(payload: DataPayload) {
        console.log(payload);
      }

      process() {
        // Process the data
      }
    }

    function processData(rawData: unknown) {
      // This should not trigger the rule since the type assertion is used as a constructor argument
      const processor = new DataProcessor(rawData as DataPayload);
      processor.process();
    }
    `,

    // Test case similar to the reported bug
    `
    interface DatadogIssuePayload {
      id: string;
      data: unknown;
    }

    class DatadogErrorProcessor {
      constructor(payload: DatadogIssuePayload) {
        console.log(payload);
      }

      async process() {
        return;
      }
    }

    async function datadog(req: { body: unknown }) {
      const { body } = req;
      const processor = new DatadogErrorProcessor(body as DatadogIssuePayload);

      await processor.process();
    }
    `
  ],
  invalid: [
    // Test case for type assertion in return statement (should be invalid)
    {
      code: `
      interface DataPayload {
        id: string;
        data: unknown;
      }

      function processData(rawData: unknown) {
        // This should trigger the rule since the type assertion is used in a return statement
        return rawData as DataPayload;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    }
  ]
});
