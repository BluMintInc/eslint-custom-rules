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
  ],
  invalid: [
    // Basic case of independent sequential awaits
    {
      code: 'async function sequentialAwaits() { const data1 = await fetchData1(); const data2 = await fetchData2(); return { data1, data2 }; }',
      errors: [{ messageId: 'sequentialAwaits' }],
      output: 'async function sequentialAwaits() { const [data1, data2] = await Promise.all([fetchData1(), fetchData2()]); return { data1, data2 }; }',
    },
    // Multiple independent awaits in expressions
    {
      code: 'async function multipleAwaits() { await task1(); await task2(); await task3(); }',
      errors: [{ messageId: 'sequentialAwaits' }],
      output: 'async function multipleAwaits() { await Promise.all([task1(), task2(), task3()]); }',
    },
    // Independent awaits with variable declarations
    {
      code: 'async function independentAwaits() { const result1 = await processData1(); const result2 = await processData2(); return { result1, result2 }; }',
      errors: [{ messageId: 'sequentialAwaits' }],
      output: 'async function independentAwaits() { const [result1, result2] = await Promise.all([processData1(), processData2()]); return { result1, result2 }; }',
    },
  ],
});
