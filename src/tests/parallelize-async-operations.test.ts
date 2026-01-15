import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { ruleTesterTs } from '../utils/ruleTester';

const formatMessage = (awaitCount: number) =>
  parallelizeAsyncOperations.meta.messages.parallelizeAsyncOperations.replace(
    /{{awaitCount}}/g,
    awaitCount.toString(),
  );

const error = (awaitCount: number) => ({
  messageId: 'parallelizeAsyncOperations' as const,
  data: { awaitCount: awaitCount.toString() },
});

// Simple test that will always pass
test('parallelize-async-operations rule exists', () => {
  expect(parallelizeAsyncOperations).toBeDefined();
});

test('parallelize-async-operations message explains why and how to fix', () => {
  expect(formatMessage(2)).toBe(
    'Awaiting 2 independent async operations sequentially makes their network and I/O latency add up, which slows responses and wastes compute. These awaits have no data dependency or per-call error handling, so run them together with Promise.all([...]) and destructure the results when you need individual values.',
  );
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
      `,
    },

    // Using await with complex expressions
    `
    async function complexExpressions() {
      const result1 = (await fetchData1()).transform();
      const result2 = (await fetchData2()).transform();
      return { result1, result2 };
    }
    `,

    // Sequential awaits with dependencies - result1 is used in result2
    `
    async function sequentialAwaitsWithAssignments() {
      const result1 = await operation1();
      const result2 = await operation2(result1);
      return { result1, result2 };
    }
    `,

    // Awaits in different scopes (different blocks)
    `
    async function differentScopes() {
      await operation1();

      if (condition) {
        await operation2();
      }

      return true;
    }
    `,

    // Complex expressions with dependencies
    `
    async function complexExpressionsWithDeps() {
      const data = await (await fetch(url1)).json();
      const result = await processData(data);
      return result;
    }
    `,

    // Awaits with very specific side effect patterns
    `
    async function awaitsWithSpecificSideEffects() {
      await updateCounter();
      await checkThreshold();
      return true;
    }
    `,

    // Mixed await styles with dependencies
    `
    async function mixedAwaitStylesWithDeps() {
      const result = await operation1();
      await operation2(result);
      return result;
    }
    `,

    // Awaits separated by other statements
    `
    async function separatedAwaits() {
      await operation1();
      console.log('between operations');
      await operation2();
      return true;
    }
    `,

    // Single await
    `
    async function singleAwaitOnly() {
      await operation1();
      return true;
    }
    `,

    // Awaits with return values used later
    `
    async function awaitWithReturnUsage() {
      const user = await getUser();
      const profile = await getProfile(user.id);
      return { user, profile };
    }
    `,

    // Awaits in different control flow
    `
    async function differentControlFlow() {
      await operation1();

      if (someCondition) {
        return early;
      }

      await operation2();
      return true;
    }
    `,

    // Awaits with complex destructuring dependencies
    `
    async function complexDestructuringDeps() {
      const { id, name } = await fetchUser();
      const profile = await fetchProfile(id);
      return { name, profile };
    }
    `,

    // Edge case: Awaits with array destructuring dependencies
    `
    async function arrayDestructuringDeps() {
      const [first, second] = await getArray();
      const result = await processItem(first);
      return result;
    }
    `,

    // Edge case: Awaits with rest parameter dependencies
    `
    async function restParameterDeps() {
      const { id, ...rest } = await getData();
      const processed = await processData(id);
      return { processed, rest };
    }
    `,

    // Edge case: Awaits with nested destructuring dependencies
    `
    async function nestedDestructuringDeps() {
      const { user: { id } } = await fetchUserData();
      const profile = await fetchProfile(id);
      return profile;
    }
    `,

    // Edge case: Awaits with property access dependencies
    `
    async function propertyAccessDeps() {
      const user = await getUser();
      const profile = await getProfile(user.id);
      const settings = await getSettings(user.preferences.theme);
      return { user, profile, settings };
    }
    `,

    // Edge case: Awaits with method call dependencies
    `
    async function methodCallDeps() {
      const data = await fetchData();
      const processed = await processData(data.getValue());
      return processed;
    }
    `,

    // Edge case: Awaits with computed property dependencies
    `
    async function computedPropertyDeps() {
      const config = await getConfig();
      const value = await getValue(config['dynamic-key']);
      return value;
    }
    `,

    // Edge case: Awaits with function call dependencies
    `
    async function functionCallDeps() {
      const input = await getInput();
      const result = await process(transform(input));
      return result;
    }
    `,

    // Edge case: Awaits in different loop types
    `
    async function forInLoop() {
      for (const key in obj) {
        await processKey(key);
      }
      return true;
    }
    `,

    `
    async function whileLoop() {
      while (condition) {
        await processItem();
      }
      return true;
    }
    `,

    `
    async function doWhileLoop() {
      do {
        await processItem();
      } while (condition);
      return true;
    }
    `,

    // Edge case: Awaits with conditional assignment
    `
    async function conditionalAssignment() {
      const data = condition ? await fetchData1() : await fetchData2();
      const result = await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with logical operators
    `
    async function logicalOperators() {
      const data = await fetchData();
      const result = data && await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with nullish coalescing
    `
    async function nullishCoalescing() {
      const data = await fetchData();
      const fallback = data ?? await getFallbackData();
      return fallback;
    }
    `,

    // Edge case: Awaits with optional chaining
    `
    async function optionalChaining() {
      const user = await getUser();
      const profile = await getProfile(user?.id);
      return profile;
    }
    `,

    // Edge case: Awaits with template literal dependencies
    `
    async function templateLiteralDeps() {
      const userId = await getUserId();
      const profile = await fetch(\`/api/users/\${userId}/profile\`);
      return profile;
    }
    `,

    // Edge case: Awaits with spread operator dependencies
    `
    async function spreadOperatorDeps() {
      const baseData = await getBaseData();
      const result = await processData({ ...baseData, extra: 'value' });
      return result;
    }
    `,

    // Edge case: Awaits with assignment expression dependencies
    `
    async function assignmentExpressionDeps() {
      let data;
      data = await fetchData();
      const result = await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with update expression dependencies
    `
    async function updateExpressionDeps() {
      let counter = await getCounter();
      const result = await processCounter(++counter);
      return result;
    }
    `,

    // Edge case: Awaits with very specific side effect method names
    `
    async function verySpecificSideEffects() {
      await updateCounterValue();
      await checkThresholdLimit();
      return true;
    }
    `,

    // Edge case: Awaits with side effect function names
    `
    async function sideEffectFunctions() {
      await incrementCounterFunction();
      await checkThresholdFunction();
      return true;
    }
    `,

    // Edge case: Awaits in try-catch with shared catch (should not be parallelized)
    `
    async function sharedTryCatch() {
      try {
        await operation1();
        await operation2();
      } catch (error) {
        handleError(error);
      }
      return true;
    }
    `,

    // Edge case: Awaits in nested try-catch (should not be parallelized)
    `
    async function nestedTryCatch() {
      try {
        try {
          await operation1();
          await operation2();
        } catch (innerError) {
          handleInnerError(innerError);
        }
      } catch (outerError) {
        handleOuterError(outerError);
      }
      return true;
    }
    `,

    // Regression: Batch manager dependency (Issue #1147)
    `
    async function batchManagerRegression() {
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
    `
    async function batchManagerSimple() {
      const batch = new Batch();
      await batch.add(item);
      await batch.commit();
    }
    `,
    `
    async function coordinatorShared() {
      await manager.doSomething();
      await manager.doSomethingElse();
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
      errors: [error(2)],
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
      errors: [error(2)],
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
      errors: [error(2)],
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

    // Three sequential awaits - this should be invalid
    {
      code: `
      async function threeSequentialAwaits() {
        await operation1();
        await operation2();
        await operation3();
        return true;
      }
      `,
      errors: [error(3)],
      output: `
      async function threeSequentialAwaits() {
        await Promise.all([
  operation1(),
  operation2(),
  operation3()
]);
        return true;
      }
      `,
    },

    // Mixed await styles without dependencies
    {
      code: `
      async function mixedAwaitStyles() {
        await operation1();
        const result = await operation2();
        return result;
      }
      `,
      errors: [error(2)],
      output: `
      async function mixedAwaitStyles() {
        const [, result] = await Promise.all([
  operation1(),
  operation2()
]);
        return result;
      }
      `,
    },

    // Arrow function with sequential awaits
    {
      code: `
      const arrowFunction = async () => {
        await operation1();
        await operation2();
        return true;
      };
      `,
      errors: [error(2)],
      output: `
      const arrowFunction = async () => {
        await Promise.all([
  operation1(),
  operation2()
]);
        return true;
      };
      `,
    },

    // Class method with sequential awaits
    {
      code: `
      class MyClass {
        async classMethod() {
          await operation1();
          await operation2();
          return true;
        }
      }
      `,
      errors: [error(2)],
      output: `
      class MyClass {
        async classMethod() {
          await Promise.all([
  operation1(),
  operation2()
]);
          return true;
        }
      }
      `,
    },

    // Sequential awaits without variable assignments
    {
      code: `
      async function simpleSequentialAwaits() {
        await fetchData1();
        await fetchData2();
        await fetchData3();
        return 'done';
      }
      `,
      errors: [error(3)],
      output: `
      async function simpleSequentialAwaits() {
        await Promise.all([
  fetchData1(),
  fetchData2(),
  fetchData3()
]);
        return 'done';
      }
      `,
    },

    // Sequential awaits with independent variable assignments
    {
      code: `
      async function independentVariableAssignments() {
        const data1 = await fetchData1();
        const data2 = await fetchData2();
        return { data1, data2 };
      }
      `,
      errors: [error(2)],
      output: `
      async function independentVariableAssignments() {
        const [data1, data2] = await Promise.all([
  fetchData1(),
  fetchData2()
]);
        return { data1, data2 };
      }
      `,
    },

    // Sequential awaits with method calls
    {
      code: `
      async function methodCallAwaits() {
        await api.getData();
        await api.getMoreData();
        await api.getEvenMoreData();
        return true;
      }
      `,
      errors: [error(3)],
      output: `
      async function methodCallAwaits() {
        await Promise.all([
  api.getData(),
  api.getMoreData(),
  api.getEvenMoreData()
]);
        return true;
      }
      `,
    },

    // Sequential awaits with complex expressions
    {
      code: `
      async function complexExpressionAwaits() {
        await (await fetch(url1)).json();
        await (await fetch(url2)).json();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function complexExpressionAwaits() {
        await Promise.all([
  (await fetch(url1)).json(),
  (await fetch(url2)).json()
]);
        return true;
      }
      `,
    },

    // Sequential awaits with function calls
    {
      code: `
      async function functionCallAwaits() {
        await processFile(file1);
        await processFile(file2);
        await processFile(file3);
        return 'processed';
      }
      `,
      errors: [error(3)],
      output: `
      async function functionCallAwaits() {
        await Promise.all([
  processFile(file1),
  processFile(file2),
  processFile(file3)
]);
        return 'processed';
      }
      `,
    },

    // Sequential awaits with different types of calls
    {
      code: `
      async function mixedCallTypes() {
        await api.method1();
        await standaloneFunction();
        await obj.method2();
        return 'mixed';
      }
      `,
      errors: [error(3)],
      output: `
      async function mixedCallTypes() {
        await Promise.all([
  api.method1(),
  standaloneFunction(),
  obj.method2()
]);
        return 'mixed';
      }
      `,
    },

    // Sequential awaits at the end of function
    {
      code: `
      async function awaitsAtEnd() {
        const setup = doSomeSetup();
        await operation1();
        await operation2();
      }
      `,
      errors: [error(2)],
      output: `
      async function awaitsAtEnd() {
        const setup = doSomeSetup();
        await Promise.all([
  operation1(),
  operation2()
]);
      }
      `,
    },

    // Sequential awaits with whitespace and formatting
    {
      code: `
      async function withWhitespace() {

        await operation1();

        await operation2();

        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function withWhitespace() {

        await Promise.all([
  operation1(),
  operation2()
]);

        return true;
      }
      `,
    },

    // Sequential awaits with template literals
    {
      code: `
      async function withTemplateLiterals() {
        await fetch(\`/api/\${endpoint1}\`);
        await fetch(\`/api/\${endpoint2}\`);
        return 'fetched';
      }
      `,
      errors: [error(2)],
      output: `
      async function withTemplateLiterals() {
        await Promise.all([
  fetch(\`/api/\${endpoint1}\`),
  fetch(\`/api/\${endpoint2}\`)
]);
        return 'fetched';
      }
      `,
    },

    // Sequential awaits in nested blocks
    {
      code: `
      async function nestedBlock() {
        if (condition) {
          await operation1();
          await operation2();
        }
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function nestedBlock() {
        if (condition) {
          await Promise.all([
  operation1(),
  operation2()
]);
        }
        return true;
      }
      `,
    },

    // Complex expressions without dependencies
    {
      code: `
      async function complexExpressions() {
        const data = await (await fetch(url1)).json();
        await (await fetch(url2)).json();
        return data;
      }
      `,
      errors: [error(2)],
      output: `
      async function complexExpressions() {
        const [data, ] = await Promise.all([
  (await fetch(url1)).json(),
  (await fetch(url2)).json()
]);
        return data;
      }
      `,
    },

    // Edge case: Four sequential awaits
    {
      code: `
      async function fourSequentialAwaits() {
        await operation1();
        await operation2();
        await operation3();
        await operation4();
        return true;
      }
      `,
      errors: [error(4)],
      output: `
      async function fourSequentialAwaits() {
        await Promise.all([
  operation1(),
  operation2(),
  operation3(),
  operation4()
]);
        return true;
      }
      `,
    },

    // Edge case: Sequential awaits with independent variable assignments (no dependencies)
    {
      code: `
      async function independentAssignments() {
        const a = await fetchA();
        const b = await fetchB();
        const c = await fetchC();
        return { a, b, c };
      }
      `,
      errors: [error(3)],
      output: `
      async function independentAssignments() {
        const [a, b, c] = await Promise.all([
  fetchA(),
  fetchB(),
  fetchC()
]);
        return { a, b, c };
      }
      `,
    },

    // Edge case: Sequential awaits with mixed expression and variable styles
    {
      code: `
      async function mixedStyles() {
        await sendNotification();
        const data = await fetchData();
        await logActivity();
        return data;
      }
      `,
      errors: [error(3)],
      output: `
      async function mixedStyles() {
        const [, data, ] = await Promise.all([
  sendNotification(),
  fetchData(),
  logActivity()
]);
        return data;
      }
      `,
    },

    // Edge case: Sequential awaits with object method calls
    {
      code: `
      async function objectMethodCalls() {
        await cache.clear();
        await database.connect();
        await logger.initialize();
        return 'initialized';
      }
      `,
      errors: [error(3)],
      output: `
      async function objectMethodCalls() {
        await Promise.all([
  cache.clear(),
  database.connect(),
  logger.initialize()
]);
        return 'initialized';
      }
      `,
    },

    // Edge case: Sequential awaits with chained method calls
    {
      code: `
      async function chainedMethodCalls() {
        await api.users.getAll();
        await api.posts.getRecent();
        await api.comments.getLatest();
        return 'fetched';
      }
      `,
      errors: [error(3)],
      output: `
      async function chainedMethodCalls() {
        await Promise.all([
  api.users.getAll(),
  api.posts.getRecent(),
  api.comments.getLatest()
]);
        return 'fetched';
      }
      `,
    },

    // Edge case: Sequential awaits with computed property access
    {
      code: `
      async function computedPropertyAccess() {
        await api['getData']();
        await api['processData']();
        await api['saveData']();
        return 'completed';
      }
      `,
      errors: [error(3)],
      output: `
      async function computedPropertyAccess() {
        await Promise.all([
  api['getData'](),
  api['processData'](),
  api['saveData']()
]);
        return 'completed';
      }
      `,
    },

    // Edge case: Sequential awaits with function expressions
    {
      code: `
      async function functionExpressions() {
        await (async () => { return 'first'; })();
        await (async () => { return 'second'; })();
        return 'done';
      }
      `,
      errors: [error(2)],
      output: `
      async function functionExpressions() {
        await Promise.all([
  (async () => { return 'first'; })(),
  (async () => { return 'second'; })()
]);
        return 'done';
      }
      `,
    },

    // Edge case: Sequential awaits with conditional expressions (no dependencies)
    {
      code: `
      async function conditionalExpressions() {
        await (condition ? fetchA() : fetchB());
        await (otherCondition ? fetchC() : fetchD());
        return 'fetched';
      }
      `,
      errors: [error(2)],
      output: `
      async function conditionalExpressions() {
        await Promise.all([
  condition ? fetchA() : fetchB(),
  otherCondition ? fetchC() : fetchD()
]);
        return 'fetched';
      }
      `,
    },

    // Edge case: Sequential awaits with logical expressions (no dependencies)
    {
      code: `
      async function logicalExpressions() {
        await (shouldFetch && fetchData());
        await (shouldProcess || processData());
        return 'processed';
      }
      `,
      errors: [error(2)],
      output: `
      async function logicalExpressions() {
        await Promise.all([
  shouldFetch && fetchData(),
  shouldProcess || processData()
]);
        return 'processed';
      }
      `,
    },

    // Edge case: Sequential awaits with new expressions
    {
      code: `
      async function newExpressions() {
        await new Promise(resolve => setTimeout(resolve, 100));
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'delayed';
      }
      `,
      errors: [error(2)],
      output: `
      async function newExpressions() {
        await Promise.all([
  new Promise(resolve => setTimeout(resolve, 100)),
  new Promise(resolve => setTimeout(resolve, 200))
]);
        return 'delayed';
      }
      `,
    },

    // Edge case: Sequential awaits with tagged template literals
    {
      code: `
      async function taggedTemplateLiterals() {
        await sql\`SELECT * FROM users\`;
        await sql\`SELECT * FROM posts\`;
        return 'queried';
      }
      `,
      errors: [error(2)],
      output: `
      async function taggedTemplateLiterals() {
        await Promise.all([
  sql\`SELECT * FROM users\`,
  sql\`SELECT * FROM posts\`
]);
        return 'queried';
      }
      `,
    },

    // Edge case: Sequential awaits with array access
    {
      code: `
      async function arrayAccess() {
        await operations[0]();
        await operations[1]();
        await operations[2]();
        return 'executed';
      }
      `,
      errors: [error(3)],
      output: `
      async function arrayAccess() {
        await Promise.all([
  operations[0](),
  operations[1](),
  operations[2]()
]);
        return 'executed';
      }
      `,
    },

    // Edge case: Sequential awaits with this context
    {
      code: `
      class AsyncClass {
        async sequentialMethods() {
          await this.method1();
          await this.method2();
          await this.method3();
          return 'completed';
        }
      }
      `,
      errors: [error(3)],
      output: `
      class AsyncClass {
        async sequentialMethods() {
          await Promise.all([
  this.method1(),
  this.method2(),
  this.method3()
]);
          return 'completed';
        }
      }
      `,
    },

    // Edge case: Sequential awaits with super calls
    {
      code: `
      class ChildClass extends ParentClass {
        async sequentialSuper() {
          await super.method1();
          await super.method2();
          return 'completed';
        }
      }
      `,
      errors: [error(2)],
      output: `
      class ChildClass extends ParentClass {
        async sequentialSuper() {
          await Promise.all([
  super.method1(),
  super.method2()
]);
          return 'completed';
        }
      }
      `,
    },

    // Edge case: Sequential awaits with yield expressions (in async generator)
    {
      code: `
      async function* asyncGenerator() {
        await operation1();
        await operation2();
        yield 'done';
      }
      `,
      errors: [error(2)],
      output: `
      async function* asyncGenerator() {
        await Promise.all([
  operation1(),
  operation2()
]);
        yield 'done';
      }
      `,
    },

    // Edge case: Sequential awaits with assignment patterns (independent)
    {
      code: `
      async function assignmentPatterns() {
        const x = await getValue1();
        const y = await getValue2();
        const z = await getValue3();
        return x + y + z;
      }
      `,
      errors: [error(3)],
      output: `
      async function assignmentPatterns() {
        const [x, y, z] = await Promise.all([
  getValue1(),
  getValue2(),
  getValue3()
]);
        return x + y + z;
      }
      `,
    },

    // Edge case: Sequential awaits with unary expressions
    {
      code: `
      async function unaryExpressions() {
        await +getValue1();
        await -getValue2();
        return 'calculated';
      }
      `,
      errors: [error(2)],
      output: `
      async function unaryExpressions() {
        await Promise.all([
  +getValue1(),
  -getValue2()
]);
        return 'calculated';
      }
      `,
    },
  ],
});
