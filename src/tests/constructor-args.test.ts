import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('constructor-args-test', noTypeAssertionReturns, {
  valid: [
    // Test case 1: Type assertion in constructor argument
    `
    interface Payload {
      id: string;
    }

    class Processor {
      constructor(payload: Payload) {}
    }

    function process(data: unknown) {
      const processor = new Processor(data as Payload);
    }
    `,

    // Test case 2: Type assertion in constructor argument with method call
    `
    interface Payload {
      id: string;
    }

    class Processor {
      constructor(payload: Payload) {}
      process() {}
    }

    function process(data: unknown) {
      const processor = new Processor(data as Payload);
      processor.process();
    }
    `,

    // Test case 3: Direct constructor call with type assertion
    `
    interface Payload {
      id: string;
    }

    class Processor {
      constructor(payload: Payload) {}
      process() {}
    }

    function process(data: unknown) {
      new Processor(data as Payload).process();
    }
    `,

    // Test case 4: Type assertion in object passed to constructor
    `
    interface Payload {
      before: unknown;
      after: unknown;
    }

    class Processor {
      constructor(payload: Payload) {}
    }

    function process(before: unknown, after: unknown) {
      const processor = new Processor({
        before,
        after
      } as Payload);
    }
    `,

    // Test case 5: Type assertion in nested object passed to constructor
    `
    interface Inner {
      value: string;
    }

    interface Payload {
      data: Inner;
    }

    class Processor {
      constructor(payload: Payload) {}
    }

    function process(value: unknown) {
      const processor = new Processor({
        data: { value } as Inner
      });
    }
    `
  ],
  invalid: []
});
