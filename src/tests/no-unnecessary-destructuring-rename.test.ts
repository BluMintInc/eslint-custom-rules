import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryDestructuringRename } from '../rules/no-unnecessary-destructuring-rename';

const ruleTester = ruleTesterTs;

ruleTester.run(
  'no-unnecessary-destructuring-rename',
  noUnnecessaryDestructuringRename,
  {
    valid: [
      // Renamed value used multiple times is allowed
      `
      const { nextMatchId: nextId } = afterData ?? {};
      console.log(nextId);
      const resultSummaryUpdate = {
        nextMatchId: nextId,
        processedMatchId: nextId,
      };
      `,

      // Renaming for clarity to a different property key is allowed
      `
      const { id: userId } = user;
      const payload = { userId };
      `,

      // Renaming but computed property names are skipped
      `
      const { [dynamicKey]: renamedValue } = data;
      const update = { [dynamicKey]: renamedValue };
      `,

      // Alias is used for additional logic before assignment
      `
      const { score: rawScore } = match;
      const normalized = rawScore / 100;
      const payload = { score: rawScore, normalized };
      `,

      // Destructuring without rename is fine
      `
      const { nextMatchId } = afterData ?? {};
      const resultSummaryUpdate = { nextMatchId };
      `,

      // Array destructuring is out of scope
      `
      const [first, second] = list;
      const payload = { firstValue: first, secondValue: second };
      `,

      // Alias only used in non-object contexts
      `
      const { id: renamedId } = data;
      doSomething(renamedId);
      `,

      // Different property key usage should not be flagged
      `
      const { internalId: externalId } = record;
      const payload = { id: externalId };
      `,

      // Default value with multiple uses should be allowed
      `
      const { id: identifier = 'fallback' } = source ?? {};
      const payload = { id: identifier, cacheKey: identifier };
      `,

      // Nested destructuring where alias is used for multiple fields
      `
      const { user: { name: userName } } = data;
      const card = { displayName: userName, payload: { name: userName } };
      `,

      // Rename avoids collision with existing binding
      `
      const id = 'outer';
      const { id: renamedId } = data;
      const payload = { id: renamedId };
      const echo = id;
      `,

      // Alias is used inside a scope that already binds the original name
      `
      const { id: renamedId } = source;
      const buildPayload = (id: string) => ({ id: renamedId, incoming: id });
      `,
    ],
    invalid: [
      // Basic pattern from the issue
      {
        code: `
        const { nextMatchId: nextId } = afterData ?? {};
        const resultSummaryUpdate: UpdateData<ResultSummary> = {
          nextMatchId: nextId,
        };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { nextMatchId } = afterData ?? {};
        const resultSummaryUpdate: UpdateData<ResultSummary> = {
          nextMatchId: nextMatchId,
        };
        `,
      },

      // With default value in destructuring
      {
        code: `
        const { nextMatchId: nextId = 'default' } = afterData ?? {};
        const update = { nextMatchId: nextId };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { nextMatchId = 'default' } = afterData ?? {};
        const update = { nextMatchId: nextMatchId };
        `,
      },

      // Optional chaining in initializer
      {
        code: `
        const { nextMatchId: nextId } = afterData?.snapshot ?? {};
        const update = { nextMatchId: nextId };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { nextMatchId } = afterData?.snapshot ?? {};
        const update = { nextMatchId: nextMatchId };
        `,
      },

      // Object literal used as function argument
      {
        code: `
        const { id: renamedId } = record;
        sendUpdate({ id: renamedId });
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { id } = record;
        sendUpdate({ id: id });
        `,
      },

      // Nested object literal still assigning to the original key
      {
        code: `
        const { id: renamedId } = data;
        const payload = { meta: { id: renamedId } };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { id } = data;
        const payload = { meta: { id: id } };
        `,
      },

      // Type annotation on destructured binding
      {
        code: `
        const { id: renamedId }: SomeType = data;
        const payload: Record<string, string> = { id: renamedId };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { id }: SomeType = data;
        const payload: Record<string, string> = { id: id };
        `,
      },

      // Rest properties present alongside the rename
      {
        code: `
        const { id: renamedId, ...rest } = data ?? {};
        const payload = { id: renamedId, rest };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { id, ...rest } = data ?? {};
        const payload = { id: id, rest };
        `,
      },

      // Function parameter destructuring with rename
      {
        code: `
        function buildUpdate({ id: renamedId }: UpdateInput) {
          return { id: renamedId };
        }
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        function buildUpdate({ id }: UpdateInput) {
          return { id: id };
        }
        `,
      },

      // Arrow function parameter destructuring with rename
      {
        code: `
        const makeUpdate = ({ id: renamedId }: UpdateInput) => ({
          id: renamedId,
        });
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const makeUpdate = ({ id }: UpdateInput) => ({
          id: id,
        });
        `,
      },

      // Multiple renamed properties each mapped back to originals
      {
        code: `
        const { firstName: fname, lastName: lname } = author;
        const payload = { firstName: fname, lastName: lname };
        `,
        errors: [
          { messageId: 'unnecessaryDestructuringRename' },
          { messageId: 'unnecessaryDestructuringRename' },
        ],
        output: `
        const { firstName, lastName } = author;
        const payload = { firstName: firstName, lastName: lastName };
        `,
      },

      // With nullish coalescing and inline return
      {
        code: `
        const { token: authToken } = session ?? {};
        return { token: authToken };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { token } = session ?? {};
        return { token: token };
        `,
      },

      // Nested destructuring rename
      {
        code: `
        const { user: { name: userName } } = data;
        const card = { name: userName };
        `,
        errors: [{ messageId: 'unnecessaryDestructuringRename' }],
        output: `
        const { user: { name } } = data;
        const card = { name: name };
        `,
      },
    ],
  },
);
