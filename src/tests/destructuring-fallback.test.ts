import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';
import { ruleTesterTs } from '../utils/ruleTester';

// This test verifies that the rule correctly handles object destructuring with fallback patterns
ruleTesterTs.run(
  'no-always-true-false-conditions-destructuring',
  noAlwaysTrueFalseConditions,
  {
    valid: [
      // Valid object destructuring with fallback - this should not trigger the rule
      `
      function test() {
        const after = { data: () => null };
        const { phase: phaseAfter } = after.data() || {};
        return phaseAfter;
      }
      `,
      // Another valid example with different variable names
      `
      function test() {
        const response = { data: () => undefined };
        const { user } = response.data() || {};
        return user;
      }
      `,
      // Valid nested destructuring with fallback
      `
      function test() {
        const response = { data: () => null };
        const { user: { name } = {} } = response.data() || {};
        return name;
      }
      `,
      // Valid array destructuring with fallback
      `
      function test() {
        const items = { data: () => undefined };
        const [first, second] = items.data() || [];
        return [first, second];
      }
      `,
      // Valid with if statement using the destructured value
      `
      function test() {
        const after = { data: () => null };
        const { phase: phaseAfter } = after.data() || {};
        if (phaseAfter) {
          return true;
        }
        return false;
      }
      `,
    ],
    invalid: []
  }
);
