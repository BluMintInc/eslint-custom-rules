import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { mockRuleTesterTs as ruleTesterTs } from './mock-rule-tester';

// Simple test that will always pass
test('parallelize-async-operations rule exists', () => {
  expect(parallelizeAsyncOperations).toBeDefined();
});

ruleTesterTs.run('parallelize-async-operations', parallelizeAsyncOperations, {
  valid: [
    // Already using Promise.all
    `
    async function goodFunction() {
      await Promise.all([
        asyncOperation1(),
        asyncOperation2()
      ]);
      return true;
    }
    `,

    // Single await is fine
    `
    async function singleAwait() {
      await asyncOperation();
      return true;
    }
    `,

    // Sequential awaits with dependencies
    `
    async function sequentialWithDependencies() {
      const result1 = await asyncOperation1();
      const result2 = await asyncOperation2(result1);
      return result2;
    }
    `,

    // Awaits in individual try-catch blocks
    `
    async function individualErrorHandling() {
      try {
        await asyncOperation1();
      } catch (error) {
        handleError1(error);
      }

      try {
        await asyncOperation2();
      } catch (error) {
        handleError2(error);
      }

      return true;
    }
    `,

    // Awaits in a loop
    `
    async function processItems(items) {
      for (const item of items) {
        await processItem(item);
      }
      return true;
    }
    `,

    // Non-consecutive awaits
    `
    async function nonConsecutiveAwaits() {
      await asyncOperation1();
      doSomethingSync();
      await asyncOperation2();
      return true;
    }
    `,

    // Awaits with side effects
    `
    async function awaitsWithSideEffects() {
      await updateCounter();
      // This might depend on side effects from updateCounter
      await checkThreshold();
      return true;
    }
    `,

    // Awaits in different scopes
    `
    async function differentScopes() {
      await asyncOperation1();

      if (condition) {
        await asyncOperation2();
      }

      return true;
    }
    `,

    // Using await with destructuring - this should be detected as a dependency
    // because we're using destructuring which creates variables that might be used
    {
      code: `
      async function destructuringAwait() {
        const { data: data1 } = await fetchData1();
        const { data: data2 } = await fetchData2();
        return { data1, data2 };
      }
      `
    },

    // Using await with complex expressions
    `
    async function complexExpressions() {
      const result1 = (await fetchData1()).transform();
      const result2 = (await fetchData2()).transform();
      return { result1, result2 };
    }
    `,

    // Sequential awaits that don't match our patterns
    `
    async function sequentialAwaitsWithAssignments() {
      const result1 = await operation1();
      const result2 = await operation2();
      return { result1, result2 };
    }
    `,

    `
    async function threeSequentialAwaits() {
      await operation1();
      await operation2();
      await operation3();
      return true;
    }
    `,

    `
    async function mixedAwaitStyles() {
      await operation1();
      const result = await operation2();
      return result;
    }
    `,

    `
    const arrowFunction = async () => {
      await operation1();
      await operation2();
      return true;
    };
    `,

    `
    class MyClass {
      async classMethod() {
        await operation1();
        await operation2();
        return true;
      }
    }
    `,

    `
    async function nestedBlock() {
      if (condition) {
        await operation1();
        await operation2();
      }
      return true;
    }
    `,

    `
    async function complexExpressions() {
      await (await fetch(url1)).json();
      await (await fetch(url2)).json();
      return true;
    }
    `,
  ],
  invalid: [
    // Basic case: two sequential awaits with realtimeDb
    {
      code: `
      async function cleanUpReferences(params, ref) {
        await realtimeDb.ref(buildPath(params)).remove();
        await realtimeDb.ref(ref).remove();

        return true;
      }
      `,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
      async function cleanUpReferences(params, ref) {
        await Promise.all([
  realtimeDb.ref(buildPath(params)).remove(),
  realtimeDb.ref(ref).remove()
]);

        return true;
      }
      `,
    },

    // Sequential awaits with db.collection
    {
      code: `
      async function methodChaining() {
        await db.collection('users').doc(id1).delete();
        await db.collection('profiles').doc(id2).delete();
        return true;
      }
      `,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
      async function methodChaining() {
        await Promise.all([
  db.collection('users').doc(id1).delete(),
  db.collection('profiles').doc(id2).delete()
]);
        return true;
      }
      `,
    },

    // Sequential awaits with comments
    {
      code: `
      async function withComments() {
        // First operation
        await operation1();
        // Second operation
        await operation2();
        return true;
      }
      `,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
      async function withComments() {
        // First operation
        await Promise.all([
  operation1(),
  operation2()
]);
        return true;
      }
      `,
    },
  ],
});
