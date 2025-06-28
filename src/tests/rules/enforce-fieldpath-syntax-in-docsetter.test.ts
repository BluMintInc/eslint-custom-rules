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
    // Spread operator usage (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        const baseData = { id: tournamentId };
        const nestedData = { contributor: FieldValue.arrayUnion(contributorId) };
        await docSetter.set({
          ...baseData,
          roles: { ...nestedData },
        });
      `,
    },
    // Computed property names (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        const fieldName = 'roles';
        await docSetter.set({
          id: tournamentId,
          [fieldName]: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
    },
    // Template literal keys (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        const prefix = 'meta';
        await docSetter.set({
          id: tournamentId,
          [\`\${prefix}data\`]: { createdAt: new Date() },
        });
      `,
    },
    // Function call returning object (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        function createRoles() {
          return { contributor: FieldValue.arrayUnion(contributorId) };
        }
        await docSetter.set({
          id: tournamentId,
          roles: createRoles(),
        });
      `,
    },
    // Variable reference (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        const rolesData = { contributor: FieldValue.arrayUnion(contributorId) };
        await docSetter.set({
          id: tournamentId,
          roles: rolesData,
        });
      `,
    },
    // Method chaining with non-DocSetter
    {
      code: `
        const someService = {
          getDocSetter: () => ({ set: (data) => console.log(data) })
        };
        await someService.getDocSetter().set({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
    },
    // Array with nested objects (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          teams: [
            { name: 'Team A', members: { captain: 'user1' } },
            { name: 'Team B', members: { captain: 'user2' } }
          ],
        });
      `,
    },
    // Conditional object properties (should be ignored)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          ...(condition && { roles: { contributor: FieldValue.arrayUnion(contributorId) } }),
        });
      `,
    },
    // Object with null/undefined values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          name: null,
          description: undefined,
          active: true,
        });
      `,
    },
    // Object with mixed property types but no nested objects
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          count: 42,
          active: true,
          tags: ['tag1', 'tag2'],
          'metadata.version': '1.0',
        });
      `,
    },
    // Empty object
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({});
      `,
    },
    // Object with only id
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
        });
      `,
    },
    // Non-DocSetter variable with similar name
    {
      code: `
        const docSetterLike = { set: (data) => console.log(data) };
        await docSetterLike.set({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
    },
    // DocSetter method called on different object
    {
      code: `
        const otherObject = { set: (data) => console.log(data) };
        await otherObject.set({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
    },
    // Object with numeric keys
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          0: 'first',
          1: 'second',
        });
      `,
    },
    // Object with boolean keys
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          true: 'yes',
          false: 'no',
        });
      `,
    },
    // Object with special characters in keys
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          'special-key': 'value',
          'key_with_underscore': 'value',
          'key with spaces': 'value',
        });
      `,
    },
    // Object with already flattened mixed syntax
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          'roles.contributor': FieldValue.arrayUnion(contributorId),
          'metadata.createdAt': new Date(),
          name: 'Tournament Name',
        });
      `,
    },
    // Promise chain instead of await
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        docSetter.set({
          id: tournamentId,
          name: 'Tournament Name',
        }).then(() => console.log('done'));
      `,
    },
    // Object with function values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          callback: () => console.log('callback'),
          handler: function() { return 'handler'; },
        });
      `,
    },
    // Object with Date and other built-in types
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          createdAt: new Date(),
          regex: /pattern/g,
          map: new Map(),
          set: new Set(),
        });
      `,
    },
    // Object with FieldValue operations
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          count: FieldValue.increment(1),
          tags: FieldValue.arrayUnion('newTag'),
          timestamp: FieldValue.serverTimestamp(),
        });
      `,
    },
    // Object with comments (should still work)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId, // tournament identifier
          name: 'Tournament Name', // tournament name
          active: true, // is active
        });
      `,
    },
    // Object with trailing comma
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
    // Multiple DocSetter instances
    {
      code: `
        const docSetter1 = new DocSetter<Tournament>(ref1);
        const docSetter2 = new DocSetter<User>(ref2);
        await docSetter1.set({
          id: tournamentId,
          name: 'Tournament',
        });
        await docSetter2.set({
          id: userId,
          email: 'user@example.com',
        });
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
    // Nested object with string literal key
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          'roles': { contributor: FieldValue.arrayUnion(contributorId) },
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
    // Multiple levels of nesting with mixed types
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          config: {
            ui: { theme: 'dark' },
            api: { timeout: 5000 },
            features: { enabled: true }
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'config.ui.theme': 'dark',
  'config.api.timeout': 5000,
  'config.features.enabled': true,
});
      `,
    },
    // Nested object with FieldValue operations
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          stats: {
            views: FieldValue.increment(1),
            lastViewed: FieldValue.serverTimestamp()
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'stats.views': FieldValue.increment(1),
  'stats.lastViewed': FieldValue.serverTimestamp(),
});
      `,
    },
    // Nested object with null/undefined values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          metadata: {
            description: null,
            tags: undefined,
            version: '1.0'
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'metadata.description': null,
  'metadata.tags': undefined,
  'metadata.version': '1.0',
});
      `,
    },
    // Nested object with numeric values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          scores: {
            total: 100,
            average: 85.5,
            count: 0
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'scores.total': 100,
  'scores.average': 85.5,
  'scores.count': 0,
});
      `,
    },
    // Nested object with boolean values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          flags: {
            active: true,
            public: false,
            featured: true
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'flags.active': true,
  'flags.public': false,
  'flags.featured': true,
});
      `,
    },
    // Nested object with array values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          data: {
            tags: ['tag1', 'tag2'],
            categories: []
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'data.tags': ['tag1', 'tag2'],
  'data.categories': [],
});
      `,
    },
    // Nested object with Date values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          timestamps: {
            created: new Date(),
            updated: new Date('2023-01-01')
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'timestamps.created': new Date(),
  'timestamps.updated': new Date('2023-01-01'),
});
      `,
    },
    // Very deeply nested object (4 levels)
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          deep: {
            level1: {
              level2: {
                level3: 'value'
              }
            }
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'deep.level1.level2.level3': 'value',
});
      `,
    },
    // Multiple separate nested objects
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          metadata: { version: '1.0' },
          settings: { theme: 'dark' },
          stats: { count: 0 },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'metadata.version': '1.0',
  'settings.theme': 'dark',
  'stats.count': 0,
});
      `,
    },
    // Nested object without id field
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          name: 'Tournament Name',
          metadata: { version: '1.0' },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  name: 'Tournament Name',
  'metadata.version': '1.0',
});
      `,
    },
    // Nested object with mixed property key types
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          data: {
            'string-key': 'value1',
            numericKey: 'value2',
            123: 'value3'
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'data.string-key': 'value1',
  'data.numericKey': 'value2',
  'data.123': 'value3',
});
      `,
    },
    // Nested object with special characters in values
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          text: {
            title: 'Title with "quotes"',
            description: \`Template \${literal}\`,
            regex: '/pattern/g'
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'text.title': 'Title with "quotes"',
  'text.description': \`Template \${literal}\`,
  'text.regex': '/pattern/g',
});
      `,
    },
    // Different DocSetter variable names
    {
      code: `
        const setter = new DocSetter<Tournament>(tournamentRef.parent);
        await setter.set({
          id: tournamentId,
          roles: { contributor: FieldValue.arrayUnion(contributorId) },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const setter = new DocSetter<Tournament>(tournamentRef.parent);
        await setter.set({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
      `,
    },
    // DocSetter with different generic type
    {
      code: `
        const userSetter = new DocSetter<User>(userRef.parent);
        await userSetter.set({
          id: userId,
          profile: { name: 'John Doe', age: 30 },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const userSetter = new DocSetter<User>(userRef.parent);
        await userSetter.set({
  id: userId,
  'profile.name': 'John Doe',
  'profile.age': 30,
});
      `,
    },
    // Promise chain with nested object
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        docSetter.set({
          id: tournamentId,
          metadata: { version: '1.0' },
        }).then(() => console.log('done'));
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        docSetter.set({
  id: tournamentId,
  'metadata.version': '1.0',
}).then(() => console.log('done'));
      `,
    },
    // Nested object with trailing commas
    {
      code: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
          id: tournamentId,
          metadata: {
            version: '1.0',
            author: 'system',
          },
        });
      `,
      errors: [{ messageId: 'enforceFieldPathSyntax' }],
      output: `
        const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
        await docSetter.set({
  id: tournamentId,
  'metadata.version': '1.0',
  'metadata.author': 'system',
});
      `,
    },
    // Multiple DocSetter instances with nested objects
    {
      code: `
        const tournamentSetter = new DocSetter<Tournament>(tournamentRef);
        const userSetter = new DocSetter<User>(userRef);
        await tournamentSetter.set({
          id: tournamentId,
          metadata: { version: '1.0' },
        });
        await userSetter.set({
          id: userId,
          profile: { name: 'John' },
        });
      `,
      errors: [
        { messageId: 'enforceFieldPathSyntax' },
        { messageId: 'enforceFieldPathSyntax' }
      ],
      output: `
        const tournamentSetter = new DocSetter<Tournament>(tournamentRef);
        const userSetter = new DocSetter<User>(userRef);
        await tournamentSetter.set({
  id: tournamentId,
  'metadata.version': '1.0',
});
        await userSetter.set({
  id: userId,
  'profile.name': 'John',
});
      `,
    },
  ],
});
