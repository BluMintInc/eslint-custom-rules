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
    // Private static method that uses this.constructor
    {
      code: `
        export class Example {
          private static methodUsingThisConstructor() {
            const className = this.constructor.name;
            return \`Class name: \${className}\`;
          }
        }
      `,
    },
    // Private static method that uses this in a nested function
    {
      code: `
        export class Example {
          private static methodWithNestedThisReference() {
            const helper = () => {
              return this.name;
            };
            return helper();
          }
        }
      `,
    },
    // Private static method that uses this in a callback
    {
      code: `
        export class Example {
          private static methodWithThisInCallback() {
            const items = [1, 2, 3];
            return items.map(item => {
              return item * this.multiplier;
            });
          }

          private static get multiplier() {
            return 2;
          }
        }
      `,
    },
    // Private static method with exactly 3 lines (including braces) - edge case
    {
      code: `
        export class Example {
          private static exactlyThreeLines() {
            return 42;
          }
        }
      `,
    },
    // Private static method that accesses static class properties
    {
      code: `
        export class Example {
          private static readonly CONFIG = { baseUrl: 'https://api.example.com' };

          private static getApiUrl(endpoint: string) {
            return this.CONFIG.baseUrl + endpoint;
          }
        }
      `,
    },
    // Private static method that uses class name directly - with this reference
    {
      code: `
        export class Example {
          private static readonly CACHE = new Map<string, any>();

          private static getCachedValue(key: string) {
            if (!this.CACHE.has(key)) {
              return null;
            }
            return this.CACHE.get(key);
          }
        }
      `,
    },
    // Private static method with JSDoc comments that might make it look larger
    {
      code: `
        export class Example {
          /**
           * This is a small method with a large JSDoc comment
           * that spans multiple lines but the actual method
           * body is still small.
           */
          private static smallMethodWithLargeComment() {
            return 42;
          }
        }
      `,
    },
    // Private static method with generic type
    {
      code: `
        export class Example {
          private static identity<T>(value: T): T {
            return value;
          }
        }
      `,
    },
    // Private static method with destructuring that uses this
    {
      code: `
        export class Example {
          private static readonly CONFIG = { timeout: 1000, retries: 3 };

          private static getConfig() {
            const { timeout, retries } = this.CONFIG;
            return { timeout, retries, timestamp: Date.now() };
          }
        }
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
    // Private static method with generic types
    {
      code: `
        export class Transformer {
          private static transform<T, U>(input: T[], transformFn: (item: T) => U): U[] {
            const result: U[] = [];
            for (const item of input) {
              const transformed = transformFn(item);
              result.push(transformed);
            }
            return result;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with destructuring parameters
    {
      code: `
        export class ConfigParser {
          private static parseConfig({ baseUrl, timeout, retries }: Config) {
            const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
            const effectiveTimeout = timeout || 5000;
            const effectiveRetries = retries || 3;

            return {
              url: normalizedUrl,
              timeout: effectiveTimeout,
              retries: effectiveRetries,
              timestamp: Date.now()
            };
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with complex return type
    {
      code: `
        export class ResponseFormatter {
          private static formatResponse<T>(
            data: T,
            status: number,
            message: string
          ): { data: T; meta: { status: number; message: string; timestamp: number } } {
            return {
              data,
              meta: {
                status,
                message,
                timestamp: Date.now()
              }
            };
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with complex control flow
    {
      code: `
        export class PathResolver {
          private static resolvePath(basePath: string, relativePath: string): string {
            if (!basePath) {
              throw new Error('Base path is required');
            }

            if (relativePath.startsWith('/')) {
              relativePath = relativePath.slice(1);
            }

            let normalized = basePath;
            if (!normalized.endsWith('/')) {
              normalized += '/';
            }

            const segments = relativePath.split('/');
            const result = segments.reduce((path, segment) => {
              if (segment === '..') {
                const parts = path.split('/');
                parts.pop();
                return parts.join('/');
              } else if (segment === '.' || segment === '') {
                return path;
              } else {
                return path + segment + '/';
              }
            }, normalized);

            return result.endsWith('/') ? result.slice(0, -1) : result;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with try/catch
    {
      code: `
        export class JsonParser {
          private static safeParseJson(input: string, fallback: any = null) {
            try {
              const trimmed = input.trim();
              if (!trimmed) {
                return fallback;
              }

              const parsed = JSON.parse(trimmed);
              return parsed;
            } catch (error) {
              console.error('Failed to parse JSON:', error);
              return fallback;
            }
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with complex regex
    {
      code: `
        export class UrlParser {
          private static extractQueryParams(url: string): Record<string, string> {
            const queryParamRegex = /[?&]([^=#]+)=([^&#]*)/g;
            const params: Record<string, string> = {};

            if (!url || !url.includes('?')) {
              return params;
            }

            let match;
            while ((match = queryParamRegex.exec(url))) {
              const key = decodeURIComponent(match[1]);
              const value = decodeURIComponent(match[2]);
              params[key] = value;
            }

            return params;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with nested functions
    {
      code: `
        export class StringFormatter {
          private static formatCamelCaseToTitleCase(input: string): string {
            if (!input) {
              return '';
            }

            // Helper function to capitalize first letter
            function capitalize(str: string): string {
              return str.charAt(0).toUpperCase() + str.slice(1);
            }

            // Helper function to insert spaces before capital letters
            function insertSpaces(str: string): string {
              return str.replace(/([A-Z])/g, ' $1');
            }

            const withSpaces = insertSpaces(input);
            const capitalized = capitalize(withSpaces.trim());

            return capitalized;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with complex array operations
    {
      code: `
        export class ArrayProcessor {
          private static groupByProperty<T>(
            items: T[],
            property: keyof T
          ): Record<string, T[]> {
            const result: Record<string, T[]> = {};

            for (const item of items) {
              const key = String(item[property]);

              if (!result[key]) {
                result[key] = [];
              }

              result[key].push(item);
            }

            // Sort each group by the property
            Object.keys(result).forEach(key => {
              result[key].sort((a, b) => {
                const valueA = String(a[property]);
                const valueB = String(b[property]);
                return valueA.localeCompare(valueB);
              });
            });

            return result;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
    // Private static method with template literals and string manipulation
    {
      code: `
        export class TemplateEngine {
          private static renderTemplate(template: string, context: Record<string, any>): string {
            const variableRegex = /\\{\\{\\s*([\\w.]+)\\s*\\}\\}/g;

            const rendered = template.replace(variableRegex, (match, path) => {
              const keys = path.split('.');
              let value = context;

              for (const key of keys) {
                if (value === undefined || value === null) {
                  return '';
                }
                value = value[key];
              }

              if (value === undefined || value === null) {
                return '';
              }

              return String(value);
            });

            return rendered;
          }
        }
      `,
      errors: [{ messageId: 'preferUtilityFunctionOverPrivateStatic' }],
    },
  ],
});
