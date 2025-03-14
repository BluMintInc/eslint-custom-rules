import { ruleTesterTs } from '../../utils/ruleTester';
import { enforceFieldPathSyntaxInDocSetter } from '../../rules/enforce-fieldpath-syntax-in-docsetter';

ruleTesterTs.run('enforce-fieldpath-syntax-in-docsetter', enforceFieldPathSyntaxInDocSetter, {
  valid: [
    // Already using FieldPath syntax
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          'roles.contributor': FieldValue.arrayUnion(contributorId),
        });
      `,
    },
    // Multiple fields with FieldPath syntax
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          'metadata.createdAt': new Date(),
          'metadata.updatedBy': userId,
        });
      `,
    },
    // Non-nested object
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          name: 'Tournament Name',
          active: true,
        });
      `,
    },
    // Using overwrite method (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.overwrite({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
    },
    // Not a DocSetter call
    {
      code: `
        const someObject = {
          set: (data) => console.log(data)
        };
        await someObject.set({
          id: 'id',
          roles: { contributor: 'value' },
        });
      `,
    },
    // Array of objects (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          players: [{ id: 'player1', score: 10 }],
        });
      `,
    },
    // Dynamic object construction (should be ignored)
    {
      code: `
        const data = { id: tournamentId };
        data.roles = { contributor: FieldValue.arrayUnion(contributorId) };
        await docSetter.set(data);
      `,
    },
  ],
  invalid: [
    // Basic nested object
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
      `,
    },
    // Multiple nested fields
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          metadata: { createdAt: new Date(), updatedBy: userId },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'metadata.createdAt': new Date(),
  'metadata.updatedBy': userId,
});
      `,
    },
    // Deeply nested fields
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          settings: {
            display: {
              theme: 'dark',
              fontSize: 14
            }
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'settings.display.theme': 'dark',
  'settings.display.fontSize': 14,
});
      `,
    },
    // Using updateIfExists method
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.updateIfExists({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.updateIfExists({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
      `,
    },
    // Mixed nested and non-nested fields
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          name: 'Tournament Name',
          metadata: { createdAt: new Date() },
          active: true,
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  name: 'Tournament Name',
  'metadata.createdAt': new Date(),
  active: true,
});
      `,
    },
  ],
});
