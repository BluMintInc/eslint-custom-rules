import { ruleTesterTs } from '../utils/ruleTester';
import { preferUtilityFunctionOverPrivateStatic } from '../rules/prefer-utility-function-over-private-static';

ruleTesterTs.run('prefer-utility-function-over-private-static', preferUtilityFunctionOverPrivateStatic, {
  valid: [
    // Non-static private method
    {
      code: `
        export class Example {
          private nonStaticMethod() {
            const result = this.someValue + 42;
            return result;
          }
        }
      `,
    },
    // Public static method
    {
      code: `
        export class Example {
          public static publicStaticMethod() {
            return computeSomething();
          }
        }
      `,
    },
    // Protected static method
    {
      code: `
        export class Example {
          protected static protectedStaticMethod() {
            return computeSomething();
          }
        }
      `,
    },
    // Private static method that uses this
    {
      code: `
        export class Example {
          private static methodUsingThis() {
            return this.anotherMethod();
          }

          private static anotherMethod() {
            return 42;
          }
        }
      `,
    },
    // Private static method that is very small (less than 3 lines)
    {
      code: `
        export class Example {
          private static smallMethod() { return 42; }
        }
      `,
    },
    // Private static method with small body
    {
      code: `
        export class Example {
          private static anotherSmallMethod() {
            return 42;
          }
        }
      `,
    },
    // Already a utility function
    {
      code: `
        export const utilityFunction = (param: string) => {
          const result = param.toUpperCase();
          return result + '!';
        };
      `,
    },
  ],
  invalid: [
    // Basic case: private static method that should be a utility function
    {
      code: `
        export class TemporaryChannelGroupCategorizer {
          private static extractUniqueIdentifiers(sessionStorage: SessionStorage) {
            const identifiersAll = Object.values(sessionStorage).reduce<
              ChannelGroupUrlIdentifier[]
            >((prev, curr) => {
              return curr.temporaryChannelGroups
                ? [...prev, curr.temporaryChannelGroups]
                : prev;
            }, []);

            const uniqueStringified = new Set(
              identifiersAll.map((identifier) => {
                return stableStringify(identifier);
              }),
            );

            return [...uniqueStringified].map((identifier) => {
              return JSON.parse(identifier);
            });
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with complex logic
    {
      code: `
        export class DataProcessor {
          private static processData(data: any[]) {
            const filtered = data.filter(item => item.active);
            const mapped = filtered.map(item => ({
              id: item.id,
              name: item.name,
              value: item.value * 2
            }));
            const sorted = mapped.sort((a, b) => a.value - b.value);
            return sorted;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with multiple parameters
    {
      code: `
        export class Calculator {
          private static calculateTotal(items: Item[], taxRate: number, discount: number) {
            const subtotal = items.reduce((sum, item) => sum + item.price, 0);
            const afterDiscount = subtotal * (1 - discount);
            const withTax = afterDiscount * (1 + taxRate);
            return withTax;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with async/await
    {
      code: `
        export class ApiClient {
          private static async fetchAndTransform(url: string) {
            const response = await fetch(url);
            const data = await response.json();
            const transformed = data.map(item => ({
              id: item.id,
              displayName: \`\${item.firstName} \${item.lastName}\`
            }));
            return transformed;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
  ],
});
