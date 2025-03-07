import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('complex-constructor-args-test', noTypeAssertionReturns, {
  valid: [
    // Test case with destructuring and type assertion in constructor argument
    `
    interface Payload {
      id: string;
      data: unknown;
    }

    class Processor {
      constructor(payload: Payload) {}
      process() {}
    }

    function process(req: { body: unknown }) {
      const { body } = req;
      const processor = new Processor(body as Payload);
      processor.process();
    }
    `,

    // Test case with nested destructuring and type assertion
    `
    interface Payload {
      id: string;
      data: {
        value: string;
      };
    }

    class Processor {
      constructor(payload: Payload) {}
      process() {}
    }

    function process(req: { body: { nested: unknown } }) {
      const { body: { nested } } = req;
      const processor = new Processor(nested as Payload);
      processor.process();
    }
    `,

    // Test case with async function and type assertion in constructor
    `
    interface Payload {
      id: string;
      data: unknown;
    }

    class Processor {
      constructor(payload: Payload) {}
      async process() {
        return Promise.resolve();
      }
    }

    async function process(req: { body: unknown }) {
      const { body } = req;
      const processor = new Processor(body as Payload);
      await processor.process();
    }
    `,

    // Test case with multiple type assertions
    `
    interface InnerPayload {
      value: string;
    }

    interface Payload {
      id: string;
      data: InnerPayload;
    }

    class Processor {
      constructor(payload: Payload) {}
      process() {}
    }

    function process(req: { body: unknown; meta: unknown }) {
      const { body, meta } = req;
      const processor = new Processor({
        id: (meta as { id: string }).id,
        data: body as InnerPayload
      });
      processor.process();
    }
    `
  ],
  invalid: []
});
