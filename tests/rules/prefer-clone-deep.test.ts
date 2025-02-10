import { ruleTesterTs } from '../utils/ruleTester';
import { preferCloneDeep } from '../../src/rules/prefer-clone-deep';

ruleTesterTs.run('prefer-clone-deep', preferCloneDeep, {
  valid: [
    // Single level spread is allowed
    {
      code: `const updatedUser = { ...user, active: true };`,
    },
    // Objects with functions should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          method: () => console.log('Hello'),
          data: { ...otherData }
        };
      `,
    },
    // Objects with symbols should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          [Symbol('id')]: 123,
          data: { ...otherData }
        };
      `,
    },
    // Single level spread with multiple properties
    {
      code: `
        const config = {
          ...defaultConfig,
          enabled: true,
          timeout: 5000,
          retries: 3
        };
      `,
    },
    // Single level spread with computed properties
    {
      code: `
        const key = 'dynamicKey';
        const obj = {
          ...baseObj,
          [key]: value,
          ['computed' + key]: otherValue
        };
      `,
    },
    // Object with class methods should not trigger
    {
      code: `
        class Example {
          getData() {
            return {
              ...this.baseData,
              handler: this.handleEvent.bind(this),
              cleanup: () => this.cleanup()
            };
          }
        }
      `,
    },
    // Object with getters/setters should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          get value() { return this._value; },
          set value(v) { this._value = v; }
        };
      `,
    },
    // Object with prototype methods should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          __proto__: protoObj,
          toString() { return 'custom'; }
        };
      `,
    },
    // Object with async functions should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          async fetch() { return await api.get(); },
          data: { ...otherData }
        };
      `,
    },
    // Object with generator functions should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          *generator() { yield 1; },
          data: { ...otherData }
        };
      `,
    },
    // Spread in array should not trigger
    {
      code: `
        const arr = [...items, { ...newItem }];
      `,
    },
    // Disabled with eslint comment
    {
      code: `
        // eslint-disable-next-line prefer-clone-deep
        const obj = {
          ...baseObj,
          nested: {
            ...baseObj.nested,
            value: 42
          }
        };
      `,
    },
  ],
  invalid: [
    // Basic nested spread
    {
      code: `
        const result = {
          ...baseObj,
          data: {
            ...baseObj.data,
            nested: {
              ...baseObj.data.nested,
              value: 42
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const result = cloneDeep(baseObj, {
          data: {
            nested: {
              value: 42
            }
          }
        } as const);
      `,
    },
    // Complex membership object
    {
      code: `
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: {
            ...membershipIncomplete,
            sender: {
              ...membershipIncomplete.sender,
              request: {
                ...membershipIncomplete.sender.request,
                status: 'accepted',
              },
            },
            receiver: {
              ...membershipIncomplete.receiver,
              request: {
                ...membershipIncomplete.receiver.request,
                status: 'accepted',
              },
            },
          },
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: cloneDeep(membershipIncomplete, {
            sender: {
              request: {
                status: 'accepted',
              },
            },
            receiver: {
              request: {
                status: 'accepted',
              },
            },
          } as const),
        };
      `,
    },
    // Nested spread with arrays
    {
      code: `
        const config = {
          ...baseConfig,
          features: {
            ...baseConfig.features,
            items: [
              ...baseConfig.features.items,
              {
                ...newItem,
                settings: {
                  ...newItem.settings,
                  enabled: true
                }
              }
            ]
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const config = cloneDeep(baseConfig, {
          features: {
            items: [
              ...baseConfig.features.items,
              {
                settings: {
                  enabled: true
                }
              }
            ]
          }
        } as const);
      `,
    },
    // Multiple nested objects with computed properties
    {
      code: `
        const key = 'config';
        const result = {
          ...baseObj,
          [key]: {
            ...baseObj[key],
            nested: {
              ...baseObj[key].nested,
              ['dynamic' + key]: {
                ...baseObj[key].nested['dynamic' + key],
                value: 42
              }
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const key = 'config';
        const result = cloneDeep(baseObj, {
          [key]: {
            nested: {
              ['dynamic' + key]: {
                value: 42
              }
            }
          }
        } as const);
      `,
    },
    // Deeply nested object with mixed content
    {
      code: `
        const state = {
          ...prevState,
          ui: {
            ...prevState.ui,
            modal: {
              ...prevState.ui.modal,
              content: {
                ...prevState.ui.modal.content,
                form: {
                  ...prevState.ui.modal.content.form,
                  values: {
                    ...prevState.ui.modal.content.form.values,
                    submitted: true
                  }
                }
              }
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const state = cloneDeep(prevState, {
          ui: {
            modal: {
              content: {
                form: {
                  values: {
                    submitted: true
                  }
                }
              }
            }
          }
        } as const);
      `,
    },
    // Nested spread with conditional properties
    {
      code: `
        const result = {
          ...baseObj,
          settings: {
            ...baseObj.settings,
            ...(condition ? {
              advanced: {
                ...baseObj.settings.advanced,
                enabled: true
              }
            } : {}),
            basic: {
              ...baseObj.settings.basic,
              value: 42
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const result = cloneDeep(baseObj, {
          settings: {
            ...(condition ? {
              advanced: {
                enabled: true
              }
            } : {}),
            basic: {
              value: 42
            }
          }
        } as const);
      `,
    },
    // Nested spread with template literals in property names
    {
      code: `
        const prefix = 'test';
        const obj = {
          ...baseObj,
          [\`\${prefix}Config\`]: {
            ...baseObj[\`\${prefix}Config\`],
            nested: {
              ...baseObj[\`\${prefix}Config\`].nested,
              value: 42
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const prefix = 'test';
        const obj = cloneDeep(baseObj, {
          [\`\${prefix}Config\`]: {
            nested: {
              value: 42
            }
          }
        } as const);
      `,
    },
    // Nested spread with null coalescing
    {
      code: `
        const config = {
          ...baseConfig,
          features: {
            ...(baseConfig?.features ?? {}),
            advanced: {
              ...(baseConfig?.features?.advanced ?? {}),
              enabled: true
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const config = cloneDeep(baseConfig, {
          features: {
            advanced: {
              enabled: true
            }
          }
        } as const);
      `,
    },
  ],
});
