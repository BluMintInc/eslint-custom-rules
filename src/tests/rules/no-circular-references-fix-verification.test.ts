import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../../utils/ruleTester';
import { noCircularReferences } from '../../rules/no-circular-references';

const buildMessage = (referenceText: string) =>
  noCircularReferences.meta.messages.circularReference.replace(
    '{{referenceText}}',
    () => referenceText,
  );

const error = (
  referenceText: string,
): TSESLint.TestCaseError<'circularReference'> =>
  ({
    message: buildMessage(referenceText),
  } as unknown as TSESLint.TestCaseError<'circularReference'>);

ruleTesterTs.run('no-circular-references-fix-verification', noCircularReferences, {
  valid: [
    // Non-circular computed literal access
    {
      code: `
        const obj = { 'foo': 1 };
        const val = obj['foo'];
      `,
    },
    // Chained member expression that is not circular
    {
      code: `
        const level1 = { a: { b: 1 } };
        const level2 = { c: level1.a };
        const val = level2.c.b;
      `,
    },
  ],
  invalid: [
    // Comment 3: Computed literal property access circularity
    {
      code: `
        const obj = { 'foo': {} };
        obj['foo'].self = obj;
      `,
      errors: [error('obj')],
    },
    {
      code: `
        const obj = { 'foo': {} };
        const inner = obj['foo'];
        inner.self = obj;
      `,
      errors: [error('obj')],
    },
    // Comment 1: MemberExpression recursive resolution
    {
      code: `
        const level1 = { a: {} };
        const level2 = { b: level1.a };
        const obj = { c: level2.b };
        level1.a.ref = obj;
      `,
      errors: [error('obj')],
    },
    // Chained MemberExpression circularity
    {
      code: `
        const obj = { a: { b: {} } };
        const ref = obj.a.b;
        ref.circular = obj;
      `,
      errors: [error('obj')],
    },
  ],
});
