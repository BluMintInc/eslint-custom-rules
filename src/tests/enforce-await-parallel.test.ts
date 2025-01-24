import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAwaitParallel } from '../rules/enforce-await-parallel';

ruleTesterTs.run('enforce-await-parallel', enforceAwaitParallel, {
  valid: [
    // Single await is valid
    {
      code: 'async function singleAwait() { const data = await fetchData(); return data; }',
    },
    // Already using Promise.all is valid
    {
      code: 'async function alreadyParallel() { const [data1, data2] = await Promise.all([fetchData1(), fetchData2()]); return { data1, data2 }; }',
    },
    // Dependent awaits are valid
    {
      code: 'async function dependentAwaits() { const user = await fetchUser(); const details = await fetchUserDetails(user.id); return { user, details }; }',
    },
    // Different scopes are valid
    {
      code: 'async function differentScopes() { if (condition) { await task1(); } else { await task2(); } }',
    },
    // Complex dependent awaits with intermediate processing
    {
      code: `async function complexDependentAwaits() {
        const user = await fetchUser();
        const processedId = user.id.toString().padStart(10, '0');
        const details = await fetchUserDetails(processedId);
        return { user, details };
      }`,
    },
    // Awaits with shared state modification
    {
      code: `async function sharedStateModification() {
        let state = { count: 0 };
        await updateState(state);
        state.count += 1;
        await updateState(state);
        return state;
      }`,
    },
    // Awaits in try-catch blocks
    {
      code: `async function tryCatchAwaits() {
        try {
          const result = await riskyOperation();
          await cleanup(result);
        } catch (error) {
          await errorHandler(error);
        }
      }`,
    },
    // Awaits with complex destructuring
    {
      code: `async function complexDestructuring() {
        const { data: { users } } = await fetchUsers();
        const { permissions: { roles } } = await fetchPermissions(users[0].id);
        return { users, roles };
      }`,
    },
    // Awaits with complex conditional logic
    {
      code: `async function complexConditional() {
        const data = await fetchInitialData();
        if (data.needsExtra && data.type === 'special') {
          await processSpecialCase(data);
        } else if (data.fallback) {
          await processFallback();
        }
      }`,
    },
    // Awaits with loop dependencies
    {
      code: `async function loopDependencies() {
        const items = await fetchItems();
        for (const item of items) {
          await processItem(item);
        }
      }`,
    },
    // Awaits with complex template literals
    {
      code: `async function templateLiterals() {
        const base = await fetchBaseUrl();
        const path = await fetchPath(\`\${base}/api/v1\`);
        return path;
      }`,
    },
    // Awaits with complex object manipulation
    {
      code: `async function objectManipulation() {
        const obj = await fetchObject();
        Object.keys(obj).forEach(key => { obj[key] *= 2; });
        const result = await processObject(obj);
        return result;
      }`,
    },
  ],
  invalid: [
    // Basic case of independent sequential awaits
    {
      code: 'async function sequentialAwaits() { const data1 = await fetchData1(); const data2 = await fetchData2(); return { data1, data2 }; }',
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Multiple independent awaits in expressions
    {
      code: 'async function multipleAwaits() { await task1(); await task2(); await task3(); }',
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits with variable declarations
    {
      code: 'async function independentAwaits() { const result1 = await processData1(); const result2 = await processData2(); return { result1, result2 }; }',
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits separated by unrelated code
    {
      code: `async function separatedAwaits() {
        const data1 = await fetchData1();
        console.log('Processing...');
        logMetrics('fetch1');
        const data2 = await fetchData2();
        return { data1, data2 };
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Complex independent awaits with method calls
    {
      code: `async function complexMethodCalls() {
        const result1 = await service.api.users.fetch({ id: 1 }).then(r => r.data);
        const result2 = await service.api.posts.fetch({ userId: 2 }).then(r => r.data);
        return { result1, result2 };
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits with complex destructuring
    {
      code: `async function complexDestructuring() {
        const { data: { users: [firstUser] } } = await fetchUsers();
        const { data: { posts: [firstPost] } } = await fetchPosts();
        return { firstUser, firstPost };
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits with template literals and expressions
    {
      code: `async function templateLiterals() {
        const data1 = await fetch(\`/api/users/\${userId}\`);
        const data2 = await fetch(\`/api/posts/\${postId}\`);
        return { data1, data2 };
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits with complex object property access
    {
      code: `async function complexPropertyAccess() {
        const result1 = await (await import('./module1')).default.method();
        const result2 = await (await import('./module2')).default.method();
        return { result1, result2 };
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
    // Independent awaits with array operations
    {
      code: `async function arrayOperations() {
        const items1 = (await fetchItems1()).filter(i => i.active);
        const items2 = (await fetchItems2()).filter(i => i.active);
        return [...items1, ...items2];
      }`,
      errors: [{ messageId: 'sequentialAwaits' }],
    },
  ],
});
