import { ruleTesterTs } from '../utils/ruleTester';
import { preferDocumentFlattening } from '../rules/prefer-document-flattening';

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

    // Test: DocSetter with shouldFlatten: false explicitly set
    `
      const explicitSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: false }
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },

    // Test: DocSetter without shouldFlatten using setAll with nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.setAll([
          {
            id: 'user1',
            name: 'Alice'
          },
          {
            id: 'user2',
            profile: {
              settings: { theme: 'dark' }
            }
          }
        ]);
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },

    // Test: DocSetter with setAll containing mixed complexity
    {
      code: `
        const mixedSetAllSetter = new DocSetter<MixedSetAllDocument>(db.collection('mixedSetAll'));

        await mixedSetAllSetter.setAll([
          {
            id: 'doc1',
            simple: 'value'
          },
          {
            id: 'doc2',
            complex: {
              nested: {
                deeply: 'value'
              }
            }
          },
          {
            id: 'doc3',
            array: [
              {
                item: {
                  nested: 'value'
                }
              }
            ]
          }
        ]);
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
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
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },
  ],
});
