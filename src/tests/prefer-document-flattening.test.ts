import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { preferDocumentFlattening } from '../rules/prefer-document-flattening';

type AddShouldFlattenSuggestion = {
  messageId: 'addShouldFlatten';
  output: string;
};

type PreferDocumentFlatteningError = {
  messageId: 'preferDocumentFlattening';
  data: {
    instanceName: string;
    className: 'DocSetter' | 'DocSetterTransaction';
  };
  suggestions?: AddShouldFlattenSuggestion[];
};

const buildMessage = (
  instanceName: string,
  className: 'DocSetter' | 'DocSetterTransaction' = 'DocSetter',
) =>
  `${className} instance "${instanceName}" sets nested Firestore data without enabling shouldFlatten. Nested object writes overwrite sibling fields and require read-modify-write cycles, which increases contention and hides field-level query paths. Add shouldFlatten: true in the ${className} options or pass flattened field paths (for example, "profile.settings.theme") so nested updates stay atomic and queryable.`;

const errorsFor = (
  instanceName: string,
  className: 'DocSetter' | 'DocSetterTransaction' = 'DocSetter',
): PreferDocumentFlatteningError[] => [
  {
    messageId: 'preferDocumentFlattening',
    data: { instanceName, className },
  },
];

/**
 * Asserting the exact suggestion output makes RuleTester parse the fixed text,
 * so a separator mistake (a doubled comma, a property swallowed by a comment)
 * surfaces as a test failure instead of shipping unparsable autofixed code.
 */
const errorsWithSuggestions = (
  instanceName: string,
  suggestions: AddShouldFlattenSuggestion[],
  className: 'DocSetter' | 'DocSetterTransaction' = 'DocSetter',
): PreferDocumentFlatteningError[] => [
  {
    messageId: 'preferDocumentFlattening',
    data: { instanceName, className },
    suggestions,
  },
];

const suggests = (output: string): AddShouldFlattenSuggestion[] => [
  { messageId: 'addShouldFlatten', output },
];

describe('prefer-document-flattening message', () => {
  it('explains why flattening is required and how to fix it', () => {
    const template =
      preferDocumentFlattening.meta.messages.preferDocumentFlattening;
    const formatted = template
      .replace(/{{className}}/g, 'DocSetter')
      .replace(/{{instanceName}}/g, 'userSetter');

    expect(formatted).toBe(buildMessage('userSetter'));
  });
});

ruleTesterTs.run('prefer-document-flattening', preferDocumentFlattening, {
  valid: [
    // Test: DocSetter with shouldFlatten option
    `
      const userSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await userSetter.set({
        id: 'user123',
        profile: {
          personal: {
            firstName: 'John',
            lastName: 'Doe'
          },
          settings: {
            theme: 'dark',
            notifications: {
              email: true,
              push: false
            }
          }
        }
      });
    `,

    // Test: DocSetterTransaction with shouldFlatten option
    `
      const userTx = new DocSetterTransaction<UserDocument>(
        db.collection('users'),
        {
          transaction,
          shouldFlatten: true,
          convertDate: true
        }
      );

      await userTx.set({
        id: 'user123',
        profile: {
          settings: { theme: 'dark' }
        }
      });
    `,

    // Test: DocSetter without shouldFlatten but setting flat document
    `
      const userSetter = new DocSetter<SimpleUser>(db.collection('simpleUsers'));

      await userSetter.set({
        id: 'user123',
        name: 'John Doe',
        email: 'john@example.com'
      });
    `,

    // Test: DocSetter with shouldFlatten and using field path notation
    `
      const userSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await userSetter.updateIfExists({
        id: 'user123',
        'profile.settings.theme': 'light'
      });
    `,

    // Test: DocSetter without shouldFlatten but only arrays of primitives
    `
      const userSetter = new DocSetter<UserDocument>(db.collection('users'));

      await userSetter.set({
        id: 'user123',
        tags: ['developer', 'admin', 'tester'],
        scores: [95, 87, 92]
      });
    `,

    // Test: DocSetter without shouldFlatten but only primitive values
    `
      const simpleSetter = new DocSetter<SimpleDocument>(db.collection('simple'));

      await simpleSetter.set({
        id: 'doc1',
        title: 'Test Document',
        count: 42,
        isActive: true,
        timestamp: new Date()
      });
    `,

    // Test: DocSetter without shouldFlatten but empty object
    `
      const emptySetter = new DocSetter<EmptyDocument>(db.collection('empty'));

      await emptySetter.set({});
    `,

    // Test: DocSetter without shouldFlatten but null/undefined values
    `
      const nullSetter = new DocSetter<NullDocument>(db.collection('nulls'));

      await nullSetter.set({
        id: 'doc1',
        optionalField: null,
        undefinedField: undefined,
        name: 'test'
      });
    `,

    // Test: DocSetter with shouldFlatten explicitly enabled
    `
      const explicitSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await explicitSetter.set({
        id: 'user123',
        profile: {
          settings: { theme: 'dark' }
        }
      });
    `,

    // Test: DocSetter instance never used for setting documents
    `
      const unusedSetter = new DocSetter<UserDocument>(db.collection('users'));

      // Only used for non-set operations
      const user = await unusedSetter.fetch('user123');
      await unusedSetter.delete('user123');
    `,

    // Test: DocSetter with arrays containing objects but no nested objects
    `
      const arraySetter = new DocSetter<ArrayDocument>(db.collection('arrays'));

      await arraySetter.set({
        id: 'doc1',
        items: [
          { name: 'item1', value: 10 },
          { name: 'item2', value: 20 }
        ]
      });
    `,

    // Test: DocSetter with computed property names (no nesting)
    `
      const computedSetter = new DocSetter<ComputedDocument>(db.collection('computed'));
      const key = 'dynamicKey';

      await computedSetter.set({
        id: 'doc1',
        [key]: 'value',
        ['static']: 'value2'
      });
    `,

    // Test: DocSetter with spread operator but no nesting
    `
      const spreadSetter = new DocSetter<SpreadDocument>(db.collection('spread'));
      const baseData = { id: 'doc1', name: 'test' };

      await spreadSetter.set({
        ...baseData,
        extra: 'value'
      });
    `,

    // Test: DocSetter with method shorthand but no nesting
    `
      const methodSetter = new DocSetter<MethodDocument>(db.collection('methods'));

      await methodSetter.set({
        id: 'doc1',
        getName() { return this.id; },
        data: 'value'
      });
    `,

    // Test: DocSetter with numeric and string literal keys but no nesting
    `
      const keySetter = new DocSetter<KeyDocument>(db.collection('keys'));

      await keySetter.set({
        id: 'doc1',
        123: 'numeric key',
        'string-key': 'string value',
        normalKey: 'normal value'
      });
    `,

    // Test: DocSetter used only for updateIfExists with flat data
    `
      const updateSetter = new DocSetter<UserDocument>(db.collection('users'));

      await updateSetter.updateIfExists({
        id: 'user123',
        name: 'Updated Name',
        email: 'new@email.com'
      });
    `,

    // Test: DocSetter with setAll containing only flat documents
    `
      const flatBatchSetter = new DocSetter<SimpleDocument>(db.collection('simple'));

      await flatBatchSetter.setAll([
        { id: 'doc1', name: 'Alice', age: 25 },
        { id: 'doc2', name: 'Bob', age: 30 },
        { id: 'doc3', name: 'Charlie', age: 35 }
      ]);
    `,

    // Test: DocSetter with arrays containing mixed primitives and non-nested objects
    `
      const mixedArraySetter = new DocSetter<MixedArrayDocument>(db.collection('mixed'));

      await mixedArraySetter.set({
        id: 'doc1',
        mixedArray: [
          'string',
          42,
          true,
          { simple: 'object' },
          null
        ]
      });
    `,

    // Test: DocSetter with Date objects and functions (non-plain objects)
    `
      const specialSetter = new DocSetter<SpecialDocument>(db.collection('special'));

      await specialSetter.set({
        id: 'doc1',
        createdAt: new Date(),
        updatedAt: Date.now(),
        handler: function() { return 'test'; }
      });
    `,

    // Test: Multiple DocSetter instances with different patterns (valid ones)
    `
      const flatSetter = new DocSetter<SimpleDocument>(db.collection('simple'));
      const nestedSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await flatSetter.set({ id: 'doc1', name: 'test' });
      await nestedSetter.set({
        id: 'user1',
        profile: { settings: { theme: 'dark' } }
      });
    `,

    // Test: DocSetter with template literal keys but no nesting
    `
      const templateSetter = new DocSetter<TemplateDocument>(db.collection('template'));
      const prefix = 'user';

      await templateSetter.set({
        id: 'doc1',
        [\`\${prefix}_name\`]: 'John',
        [\`\${prefix}_email\`]: 'john@example.com'
      });
    `,

    // Test: DocSetter with getter/setter properties but no nesting
    `
      const getterSetter = new DocSetter<GetterDocument>(db.collection('getter'));

      await getterSetter.set({
        id: 'doc1',
        _name: 'John',
        get name() { return this._name; },
        set name(value) { this._name = value; }
      });
    `,

    // Test: DocSetter in async/await context with flat data
    `
      async function saveUser() {
        const userSetter = new DocSetter<SimpleUser>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          name: 'John Doe',
          email: 'john@example.com'
        });
      }
    `,

    // Test: DocSetter in try/catch block with flat data
    `
      try {
        const userSetter = new DocSetter<SimpleUser>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          name: 'John Doe',
          email: 'john@example.com'
        });
      } catch (error) {
        console.error(error);
      }
    `,

    // Test: DocSetter with conditional flat data
    `
      const conditionalSetter = new DocSetter<ConditionalDocument>(db.collection('conditional'));
      const useAdvanced = false;

      await conditionalSetter.set({
        id: 'doc1',
        name: 'test',
        ...(useAdvanced ? { advanced: 'value' } : { basic: 'value' })
      });
    `,

    // Test: DocSetter with Symbol keys but no nesting
    `
      const symbolSetter = new DocSetter<SymbolDocument>(db.collection('symbol'));
      const sym = Symbol('test');

      await symbolSetter.set({
        id: 'doc1',
        [sym]: 'symbol value',
        regular: 'regular value'
      });
    `,

    // Test: DocSetter with rest/spread syntax but no nesting
    `
      const restSetter = new DocSetter<RestDocument>(db.collection('rest'));
      const { id, ...rest } = { id: 'doc1', name: 'test', value: 42 };

      await restSetter.set({
        id,
        ...rest
      });
    `,

    // Test: DocSetter with shorthand properties but no nesting
    `
      const shorthandSetter = new DocSetter<ShorthandDocument>(db.collection('shorthand'));
      const name = 'John';
      const age = 30;

      await shorthandSetter.set({
        id: 'doc1',
        name,
        age,
        active: true
      });
    `,

    // Test: DocSetter with conditional nested objects (static analysis limitation)
    // Note: This pattern cannot be reliably detected by static analysis
    `
      const conditionalNestedSetter = new DocSetter<ConditionalNestedDocument>(db.collection('conditionalNested'));
      const includeProfile = true;

      await conditionalNestedSetter.set({
        id: 'doc1',
        name: 'test',
        ...(includeProfile ? {
          profile: {
            bio: 'test bio'
          }
        } : {})
      });
    `,

    // Test: DocSetter with spread operator and variable references (static analysis limitation)
    // Note: Variable reference tracking is beyond scope of static analysis
    `
      const spreadNestedSetter = new DocSetter<SpreadNestedDocument>(db.collection('spreadNested'));
      const baseData = { id: 'doc1' };
      const profileData = { settings: { theme: 'dark' } };

      await spreadNestedSetter.set({
        ...baseData,
        profile: profileData
      });
    `,

    // Test: DocSetter with shorthand properties referencing variables (static analysis limitation)
    // Note: Variable reference tracking is beyond scope of static analysis
    `
      const shorthandNestedSetter = new DocSetter<ShorthandNestedDocument>(db.collection('shorthandNested'));
      const id = 'doc1';
      const profile = { settings: { theme: 'dark' } };

      await shorthandNestedSetter.set({
        id,
        profile
      });
    `,

    // Test: DocSetter with rest/spread syntax containing nested objects (static analysis limitation)
    // Note: Destructuring analysis is beyond scope of static analysis
    `
      const restNestedSetter = new DocSetter<RestNestedDocument>(db.collection('restNested'));
      const { id, ...rest } = {
        id: 'doc1',
        profile: { settings: { theme: 'dark' } },
        name: 'test'
      };

      await restNestedSetter.set({
        id,
        ...rest
      });
    `,
    // Test: a string key enables flattening just as an identifier key does
    `
      const setter = new DocSetter<VirtualWallet>(walletCollection, { 'shouldFlatten': true });

      await setter.set({ id, roles: { owner: { id } } });
    `,

    // Test: a computed key holding a string literal names the same option
    `
      const setter = new DocSetter<VirtualWallet>(walletCollection, { ['shouldFlatten']: true });

      await setter.set({ id, roles: { owner: { id } } });
    `,

    // Test: a template key with no expressions names the same option
    `
      const setter = new DocSetter<VirtualWallet>(walletCollection, { [\`shouldFlatten\`]: true });

      await setter.set({ id, roles: { owner: { id } } });
    `,

    // Test: an inline instantiation with shouldFlatten enabled
    `
      await new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true }).set({
        id,
        roles: { owner: { id } },
      });
    `,
  ],

  invalid: [
    // Test: DocSetter without shouldFlatten setting nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          profile: {
            personal: {
              firstName: 'John',
              lastName: 'Doe'
            }
          }
        });
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetterTransaction without shouldFlatten setting nested objects
    {
      code: `
        const userTx = new DocSetterTransaction<UserDocument>(
          db.collection('users'),
          {
            transaction,
            convertDate: true
          }
        );

        await userTx.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('userTx', 'DocSetterTransaction'),
    },

    // Test: DocSetter without shouldFlatten using setAll with nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.setAll([
          {
            id: 'user1',
            data: { name: 'Alice' }
          },
          {
            id: 'user2',
            data: {
              profile: {
                settings: { theme: 'dark' }
              }
            }
          }
        ]);
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter with complex constructor but missing shouldFlatten
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(
          db.collection('users'),
          {
            convertDate: true,
            lowercaseEvmAddress: true,
            // shouldFlatten is missing
          }
        );

        await userSetter.set({
          id: 'user123',
          profile: {
            settings: {
              theme: 'dark'
            }
          }
        });
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: Very deep nesting (4+ levels)
    {
      code: `
        const deepSetter = new DocSetter<DeepDocument>(db.collection('deep'));

        await deepSetter.set({
          id: 'doc1',
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep'
                }
              }
            }
          }
        });
      `,
      errors: errorsFor('deepSetter'),
    },

    // Test: Mixed arrays with some nested objects
    {
      code: `
        const mixedSetter = new DocSetter<MixedDocument>(db.collection('mixed'));

        await mixedSetter.set({
          id: 'doc1',
          items: [
            'simple string',
            42,
            {
              nested: {
                object: 'value'
              }
            }
          ]
        });
      `,
      errors: errorsFor('mixedSetter'),
    },

    // Test: Objects with nested arrays containing objects
    {
      code: `
        const arrayNestedSetter = new DocSetter<ArrayNestedDocument>(db.collection('arrayNested'));

        await arrayNestedSetter.set({
          id: 'doc1',
          data: {
            items: [
              { name: 'item1', details: { type: 'A' } },
              { name: 'item2', details: { type: 'B' } }
            ]
          }
        });
      `,
      errors: errorsFor('arrayNestedSetter'),
    },

    // Test: Complex nested structures with multiple branches
    {
      code: `
        const complexSetter = new DocSetter<ComplexDocument>(db.collection('complex'));

        await complexSetter.set({
          id: 'doc1',
          userInfo: {
            personal: { name: 'John', age: 30 },
            contact: { email: 'john@example.com' }
          },
          settings: {
            preferences: { theme: 'dark' },
            notifications: { email: true }
          }
        });
      `,
      errors: errorsFor('complexSetter'),
    },

    // Test: Nested objects in different property positions
    {
      code: `
        const positionSetter = new DocSetter<PositionDocument>(db.collection('position'));

        await positionSetter.set({
          id: 'doc1',
          first: 'value',
          nested: {
            inner: 'value'
          },
          last: 'value'
        });
      `,
      errors: errorsFor('positionSetter'),
    },

    // Test: Objects with both primitive and nested properties
    {
      code: `
        const mixedPropSetter = new DocSetter<MixedPropDocument>(db.collection('mixedProp'));

        await mixedPropSetter.set({
          id: 'doc1',
          name: 'John',
          age: 30,
          isActive: true,
          profile: {
            bio: 'Software developer'
          },
          count: 42
        });
      `,
      errors: errorsFor('mixedPropSetter'),
    },

    // Test: DocSetterTransaction with partial options object but missing shouldFlatten
    {
      code: `
        const partialTx = new DocSetterTransaction<UserDocument>(
          db.collection('users'),
          {
            transaction,
            convertDate: true,
            lowercaseEvmAddress: false
            // shouldFlatten is missing
          }
        );

        await partialTx.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('partialTx', 'DocSetterTransaction'),
    },

    // Test: Nested objects with boolean, number, string, and object values mixed
    {
      code: `
        const mixedValueSetter = new DocSetter<MixedValueDocument>(db.collection('mixedValue'));

        await mixedValueSetter.set({
          id: 'doc1',
          config: {
            enabled: true,
            maxCount: 100,
            name: 'test config',
            details: {
              description: 'nested description'
            }
          }
        });
      `,
      errors: errorsFor('mixedValueSetter'),
    },

    // Test: Objects with nested objects that have empty objects
    {
      code: `
        const emptyNestedSetter = new DocSetter<EmptyNestedDocument>(db.collection('emptyNested'));

        await emptyNestedSetter.set({
          id: 'doc1',
          data: {
            empty: {},
            notEmpty: { value: 'test' }
          }
        });
      `,
      errors: errorsFor('emptyNestedSetter'),
    },

    // Test: Objects with nested objects containing arrays
    {
      code: `
        const nestedArraySetter = new DocSetter<NestedArrayDocument>(db.collection('nestedArray'));

        await nestedArraySetter.set({
          id: 'doc1',
          container: {
            items: ['item1', 'item2', 'item3'],
            metadata: { count: 3 }
          }
        });
      `,
      errors: errorsFor('nestedArraySetter'),
    },

    // Test: Conditional nested objects (static analysis limitation - moved to valid)
    // Note: This pattern cannot be reliably detected by static analysis
    // since the condition value is not known at compile time

    // Test: Multiple DocSetter instances with different nesting patterns (invalid ones)
    {
      code: `
        const validSetter = new DocSetter<SimpleDocument>(
          db.collection('simple'),
          { shouldFlatten: true }
        );
        const invalidSetter = new DocSetter<UserDocument>(db.collection('users'));

        await validSetter.set({ id: 'doc1', name: 'test' });
        await invalidSetter.set({
          id: 'user1',
          profile: { settings: { theme: 'dark' } }
        });
      `,
      errors: errorsFor('invalidSetter'),
    },

    // Test: DocSetter with let declaration
    {
      code: `
        let userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter with var declaration
    {
      code: `
        var userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter in async function with nested objects
    {
      code: `
        async function saveUser() {
          const userSetter = new DocSetter<UserDocument>(db.collection('users'));

          await userSetter.set({
            id: 'user123',
            profile: {
              personal: { name: 'John' }
            }
          });
        }
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter in try/catch block with nested objects
    {
      code: `
        try {
          const userSetter = new DocSetter<UserDocument>(db.collection('users'));

          await userSetter.set({
            id: 'user123',
            profile: {
              settings: { theme: 'dark' }
            }
          });
        } catch (error) {
          console.error(error);
        }
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter with Promise chain and nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        userSetter.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        }).then(() => {
          console.log('Saved');
        });
      `,
      errors: errorsFor('userSetter'),
    },

    // Test: DocSetter with computed property names and nesting
    {
      code: `
        const computedNestedSetter = new DocSetter<ComputedNestedDocument>(db.collection('computedNested'));
        const key = 'profile';

        await computedNestedSetter.set({
          id: 'doc1',
          [key]: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('computedNestedSetter'),
    },

    // Test: DocSetter with spread operator and direct nested objects
    {
      code: `
        const spreadNestedSetter = new DocSetter<SpreadNestedDocument>(db.collection('spreadNested'));
        const baseData = { id: 'doc1' };

        await spreadNestedSetter.set({
          ...baseData,
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('spreadNestedSetter'),
    },

    // Test: DocSetter with template literal keys and nesting
    {
      code: `
        const templateNestedSetter = new DocSetter<TemplateNestedDocument>(db.collection('templateNested'));
        const prefix = 'user';

        await templateNestedSetter.set({
          id: 'doc1',
          [\`\${prefix}_profile\`]: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('templateNestedSetter'),
    },

    // Test: DocSetter with numeric keys and nesting
    {
      code: `
        const numericNestedSetter = new DocSetter<NumericNestedDocument>(db.collection('numericNested'));

        await numericNestedSetter.set({
          id: 'doc1',
          123: {
            nested: { value: 'test' }
          }
        });
      `,
      errors: errorsFor('numericNestedSetter'),
    },

    // Test: DocSetter with string literal keys and nesting
    {
      code: `
        const stringNestedSetter = new DocSetter<StringNestedDocument>(db.collection('stringNested'));

        await stringNestedSetter.set({
          id: 'doc1',
          'user-profile': {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('stringNestedSetter'),
    },

    // Test: DocSetter with shorthand properties and direct nested objects
    {
      code: `
        const shorthandNestedSetter = new DocSetter<ShorthandNestedDocument>(db.collection('shorthandNested'));
        const id = 'doc1';

        await shorthandNestedSetter.set({
          id,
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('shorthandNestedSetter'),
    },

    // Test: DocSetter with method definitions and nesting
    {
      code: `
        const methodNestedSetter = new DocSetter<MethodNestedDocument>(db.collection('methodNested'));

        await methodNestedSetter.set({
          id: 'doc1',
          getData() { return this.data; },
          data: {
            nested: { value: 'test' }
          }
        });
      `,
      errors: errorsFor('methodNestedSetter'),
    },

    // Test: DocSetter with rest/spread syntax and direct nested objects
    {
      code: `
        const restNestedSetter = new DocSetter<RestNestedDocument>(db.collection('restNested'));
        const { id, ...rest } = { id: 'doc1', name: 'test' };

        await restNestedSetter.set({
          id,
          ...rest,
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: errorsFor('restNestedSetter'),
    },

    // Test: DocSetter with deeply nested arrays containing objects
    {
      code: `
        const deepArraySetter = new DocSetter<DeepArrayDocument>(db.collection('deepArray'));

        await deepArraySetter.set({
          id: 'doc1',
          categories: [
            {
              name: 'category1',
              items: [
                {
                  id: 'item1',
                  metadata: {
                    tags: ['tag1', 'tag2']
                  }
                }
              ]
            }
          ]
        });
      `,
      errors: errorsFor('deepArraySetter'),
    },

    // Test: DocSetter with mixed nested and flat properties in complex structure
    {
      code: `
        const mixedComplexSetter = new DocSetter<MixedComplexDocument>(db.collection('mixedComplex'));

        await mixedComplexSetter.set({
          id: 'doc1',
          title: 'Document Title',
          metadata: {
            author: {
              name: 'John Doe',
              contact: {
                email: 'john@example.com'
              }
            },
            tags: ['important', 'draft'],
            created: new Date()
          },
          content: 'Document content',
          settings: {
            visibility: 'public',
            permissions: {
              read: ['user1', 'user2'],
              write: ['user1']
            }
          }
        });
      `,
      errors: errorsFor('mixedComplexSetter'),
    },

    // Test: DocSetter with nested objects in different array positions
    {
      code: `
        const arrayPositionSetter = new DocSetter<ArrayPositionDocument>(db.collection('arrayPosition'));

        await arrayPositionSetter.set({
          id: 'doc1',
          items: [
            'simple string',
            {
              type: 'object',
              data: {
                nested: 'value'
              }
            },
            42,
            {
              another: {
                nested: {
                  object: 'here'
                }
              }
            }
          ]
        });
      `,
      errors: errorsFor('arrayPositionSetter'),
    },

    // Test: DocSetter with setAll containing mixed complexity
    {
      code: `
        const mixedSetAllSetter = new DocSetter<MixedSetAllDocument>(db.collection('mixedSetAll'));

        await mixedSetAllSetter.setAll([
          {
            id: 'doc1',
            data: { simple: 'value' }
          },
          {
            id: 'doc2',
            data: {
              complex: {
                nested: {
                  deeply: 'value'
                }
              }
            }
          },
          {
            id: 'doc3',
            data: {
              array: [
                {
                  item: {
                    nested: 'value'
                  }
                }
              ]
            }
          }
        ]);
      `,
      errors: errorsFor('mixedSetAllSetter'),
    },

    // Test: DocSetter with extremely deep nesting (5+ levels)
    {
      code: `
        const extremelyDeepSetter = new DocSetter<ExtremelyDeepDocument>(db.collection('extremelyDeep'));

        await extremelyDeepSetter.set({
          id: 'doc1',
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    level6: {
                      value: 'extremely deep'
                    }
                  }
                }
              }
            }
          }
        });
      `,
      errors: errorsFor('extremelyDeepSetter'),
    },

    // Test: DocSetter with nested objects containing various data types
    {
      code: `
        const dataTypesSetter = new DocSetter<DataTypesDocument>(db.collection('dataTypes'));

        await dataTypesSetter.set({
          id: 'doc1',
          data: {
            string: 'text',
            number: 42,
            boolean: true,
            date: new Date(),
            array: [1, 2, 3],
            nested: {
              innerString: 'inner text',
              innerNumber: 100
            },
            nullValue: null,
            undefinedValue: undefined
          }
        });
      `,
      errors: errorsFor('dataTypesSetter'),
    },

    // Test: DocSetter with nested objects using various key types
    {
      code: `
        const keyTypesSetter = new DocSetter<KeyTypesDocument>(db.collection('keyTypes'));

        await keyTypesSetter.set({
          id: 'doc1',
          'string-key': {
            nested: 'value'
          },
          123: {
            numeric: {
              key: 'value'
            }
          },
          [\`template-\${'key'}\`]: {
            template: {
              nested: 'value'
            }
          }
        });
      `,
      errors: errorsFor('keyTypesSetter'),
    },

    // Test: options object with a trailing comma (the Prettier-formatted default)
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager,
});

await setter.set({
  id,
  roles: { owner: { id } },
});
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager, shouldFlatten: true
});

await setter.set({
  id,
  roles: { owner: { id } },
});
`),
      ),
    },

    // Test: multiline options object without a trailing comma
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager
});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager, shouldFlatten: true
});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: single-line options object
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { batchManager });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { batchManager, shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: single-line options object with a trailing comma
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { batchManager, });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { batchManager, shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: empty options object has no property to anchor the insertion on
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: options object whose last entry is a spread element
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { ...options });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { ...options, shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: spread element followed by a trailing comma
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager,
  ...options,
});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager,
  ...options, shouldFlatten: true
});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: line comment after the last property must not swallow the addition
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager, // keep the batch
});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager, shouldFlatten: true // keep the batch
});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: line comment after a last property that has no trailing comma
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager // keep the batch
});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager, shouldFlatten: true // keep the batch
});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: block comment inside an otherwise empty options object
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {/* no options */});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true /* no options */});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: no options argument at all
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection);

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: argument list with a trailing comma and no options argument
    {
      code: `
const setter = new DocSetter<VirtualWallet>(
  walletCollection,
);

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(
  walletCollection, { shouldFlatten: true }
);

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: options passed by reference cannot be edited in place, so the
    // violation is reported without a suggestion
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, options);

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: an asserted options object is not an ObjectExpression argument, so
    // the edit is declined rather than appended after the type assertion
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  batchManager,
} as DocSetterOptions);

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: spread arguments hide which position the options occupy
    {
      code: `
const setter = new DocSetter<VirtualWallet>(...args);

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: no arguments leaves nowhere to anchor an options object
    {
      code: `
const setter = new DocSetter<VirtualWallet>();

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: DocSetterTransaction options object with a trailing comma
    {
      code: `
const tx = new DocSetterTransaction<VirtualWallet>(walletCollection, {
  transaction,
  convertDate: true,
});

await tx.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'tx',
        suggests(`
const tx = new DocSetterTransaction<VirtualWallet>(walletCollection, {
  transaction,
  convertDate: true, shouldFlatten: true
});

await tx.set({ id, roles: { owner: { id } } });
`),
        'DocSetterTransaction',
      ),
    },

    // Test: options already declaring shouldFlatten: false must have that value
    // rewritten, never a second shouldFlatten appended (issue #2304)
    {
      code: `
const s = new DocSetter(db.collection('u'), { shouldFlatten: false });
await s.set({ id: 'a', profile: { personal: { firstName: 'J' } } });
`,
      errors: [
        {
          messageId: 'preferDocumentFlattening' as const,
          suggestions: [
            {
              messageId: 'addShouldFlatten' as const,
              output: `
const s = new DocSetter(db.collection('u'), { shouldFlatten: true });
await s.set({ id: 'a', profile: { personal: { firstName: 'J' } } });
`,
            },
          ],
        },
      ],
    },

    // Test: shouldFlatten: false alongside other options is rewritten in place
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { convertDate: true, shouldFlatten: false });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { convertDate: true, shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: DocSetterTransaction options declaring shouldFlatten: false
    {
      code: `
const tx = new DocSetterTransaction<VirtualWallet>(walletCollection, { transaction, shouldFlatten: false });

await tx.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'tx',
        suggests(`
const tx = new DocSetterTransaction<VirtualWallet>(walletCollection, { transaction, shouldFlatten: true });

await tx.set({ id, roles: { owner: { id } } });
`),
        'DocSetterTransaction',
      ),
    },

    // Test: the member to rewrite is not the anchor the append path would use
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: false, convertDate: true });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true, convertDate: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: multiline options with a trailing comma keep their formatting
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  shouldFlatten: false,
  convertDate: true,
});

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, {
  shouldFlatten: true,
  convertDate: true,
});

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: a string key writes the same property, so it is rewritten rather
    // than joined by an identifier-keyed duplicate
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { 'shouldFlatten': false });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { 'shouldFlatten': true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: a computed key holding a string literal denotes the same property
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { ['shouldFlatten']: false });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { ['shouldFlatten']: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: a key built from an expression names an unknown property, so the
    // append path still applies and cannot duplicate anything
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { [flattenKey]: false });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { [flattenKey]: false, shouldFlatten: true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: only the value is rewritten, so a comment on the member survives
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: /* disabled */ false });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        'setter',
        suggests(`
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: /* disabled */ true });

await setter.set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: an inline instantiation reaches the same rewrite
    {
      code: `
await new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: false }).set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions(
        '(inline-0)',
        suggests(`
await new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: true }).set({ id, roles: { owner: { id } } });
`),
      ),
    },

    // Test: a variable value may already be true at runtime, so the suggestion
    // is declined instead of guessing; appending would duplicate the key
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: isFlattened });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: a conditional value is unknown, so the suggestion is declined
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: isLegacy ? false : true });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: a call result is unknown, so the suggestion is declined
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: resolveFlatten() });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: a shorthand member writes the key just as a longhand one does
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: an asserted value is not a literal, so the suggestion is declined
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { shouldFlatten: false as boolean });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },

    // Test: a getter occupies the key, and no value node can be rewritten
    {
      code: `
const setter = new DocSetter<VirtualWallet>(walletCollection, { get shouldFlatten() { return false; } });

await setter.set({ id, roles: { owner: { id } } });
`,
      errors: errorsWithSuggestions('setter', []),
    },
  ],
});

// RuleTester compares a suggestion's output as a string, so a fixture only
// catches the defect it was written for. This block runs the suggestion the
// rule actually offers and scores the result with core `no-dupe-keys`, which
// is the property the bug broke: the writer appended `shouldFlatten: true`
// without reading the key the target literal already wrote (issue #2304).
describe('prefer-document-flattening: the suggestion writes shouldFlatten once (issue #2304)', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-document-flattening';

  const parserOptions = {
    ecmaVersion: 2020 as const,
    sourceType: 'module' as const,
  };

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      preferDocumentFlattening as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const reports = (code: string) =>
    makeLinter()
      .verify(
        code,
        {
          parser: '@typescript-eslint/parser',
          parserOptions,
          rules: { [RULE_ID]: 'error' as const },
        },
        'save.ts',
      )
      .filter((message) => message.ruleId === RULE_ID);

  const duplicateKeys = (code: string) =>
    makeLinter()
      .verify(
        code,
        {
          parser: '@typescript-eslint/parser',
          parserOptions,
          rules: { 'no-dupe-keys': 'error' as const },
        },
        'save.ts',
      )
      .filter((message) => message.ruleId === 'no-dupe-keys').length;

  /** The rule offers at most one suggestion per report, so no fix can overlap. */
  const applySuggestion = (code: string) => {
    const [message] = reports(code);
    const suggestion = message.suggestions?.[0];
    if (!suggestion) {
      throw new Error('no suggestion offered');
    }
    const [start, end] = suggestion.fix.range;
    return code.slice(0, start) + suggestion.fix.text + code.slice(end);
  };

  const source = (construction: string) =>
    `${construction}\nsetter.set({ id, roles: { owner: { id } } });\n`;

  /** `[name, source, the text the applied suggestion must contain]` */
  const REWRITES = [
    [
      'shouldFlatten: false alone',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: false });",
      ),
      '{ shouldFlatten: true }',
    ],
    [
      'shouldFlatten: false after another option',
      source(
        "const setter = new DocSetter(db.collection('u'), { convertDate: true, shouldFlatten: false });",
      ),
      '{ convertDate: true, shouldFlatten: true }',
    ],
    [
      'shouldFlatten: false before another option',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: false, convertDate: true });",
      ),
      '{ shouldFlatten: true, convertDate: true }',
    ],
    [
      'DocSetterTransaction options',
      source(
        'const setter = new DocSetterTransaction(db, { transaction, shouldFlatten: false });',
      ),
      '{ transaction, shouldFlatten: true }',
    ],
    [
      'a string key names the same option',
      source(
        "const setter = new DocSetter(db.collection('u'), { 'shouldFlatten': false });",
      ),
      "{ 'shouldFlatten': true }",
    ],
    [
      'a computed string key names the same option',
      source(
        "const setter = new DocSetter(db.collection('u'), { ['shouldFlatten']: false });",
      ),
      "{ ['shouldFlatten']: true }",
    ],
    [
      'multiline options with a trailing comma',
      source(
        "const setter = new DocSetter(db.collection('u'), {\n  shouldFlatten: false,\n  convertDate: true,\n});",
      ),
      'shouldFlatten: true,',
    ],
    [
      'no options object: the append path still applies',
      source("const setter = new DocSetter(db.collection('u'));"),
      '{ shouldFlatten: true }',
    ],
    [
      'options without the key: the append path still applies',
      source(
        "const setter = new DocSetter(db.collection('u'), { convertDate: true });",
      ),
      'convertDate: true, shouldFlatten: true',
    ],
    [
      'empty options: the append path still applies',
      source("const setter = new DocSetter(db.collection('u'), {});"),
      '{ shouldFlatten: true }',
    ],
    [
      'a key built from an expression names an unknown option',
      source(
        "const setter = new DocSetter(db.collection('u'), { [flattenKey]: false });",
      ),
      '[flattenKey]: false, shouldFlatten: true',
    ],
  ] as const;

  it.each(REWRITES)('writes one shouldFlatten: %s', (_name, code, emitted) => {
    // Non-vacuity: the input must be duplicate-free for the suggestion to be
    // the thing that introduces a duplicate
    expect(duplicateKeys(code)).toBe(0);
    expect(reports(code)).toHaveLength(1);

    const output = applySuggestion(code);

    expect(output).toContain(emitted);
    expect(duplicateKeys(output)).toBe(0);
    expect(output.match(/shouldFlatten/g)).toHaveLength(1);
    // The suggestion has to reach a fixpoint, or it is offered again forever
    expect(reports(output)).toHaveLength(0);
  });

  /** Values that may already be true, where appending would duplicate the key. */
  const DECLINES = [
    [
      'a variable',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: isFlattened });",
      ),
    ],
    [
      'a conditional',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: isLegacy ? false : true });",
      ),
    ],
    [
      'a call',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: resolveFlatten() });",
      ),
    ],
    [
      'a shorthand reference',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten });",
      ),
    ],
    [
      'an asserted literal',
      source(
        "const setter = new DocSetter(db.collection('u'), { shouldFlatten: false as boolean });",
      ),
    ],
    [
      'a getter',
      source(
        "const setter = new DocSetter(db.collection('u'), { get shouldFlatten() { return false; } });",
      ),
    ],
  ] as const;

  it.each(DECLINES)(
    'reports without a suggestion rather than guessing: %s',
    (_name, code) => {
      const [message, ...rest] = reports(code);

      expect(rest).toHaveLength(0);
      expect(message.suggestions ?? []).toHaveLength(0);
    },
  );

  // Without this the oracle above would pass on any output: it states that the
  // emission the bug produced does score as a duplicate.
  it('scores the duplicate the bug emitted', () => {
    expect(
      duplicateKeys(
        source(
          "const setter = new DocSetter(db.collection('u'), { shouldFlatten: false, shouldFlatten: true });",
        ),
      ),
    ).toBe(1);
  });

  // A silent drop of every shape would leave both oracles asserting nothing.
  it('exercises both arms', () => {
    expect(REWRITES.length).toBeGreaterThanOrEqual(9); // measured 11
    expect(DECLINES.length).toBeGreaterThanOrEqual(5); // measured 6
  });
});
