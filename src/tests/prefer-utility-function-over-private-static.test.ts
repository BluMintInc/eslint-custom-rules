import { ruleTesterTs } from '../utils/ruleTester';
import { preferUtilityFunctionOverPrivateStatic } from '../rules/prefer-utility-function-over-private-static';

const buildError = (methodName: string, className: string) => ({
  messageId: 'preferUtilityFunctionOverPrivateStatic' as const,
  data: { methodName, className },
});

ruleTesterTs.run(
  'prefer-utility-function-over-private-static',
  preferUtilityFunctionOverPrivateStatic,
  {
    valid: [
      {
        code: `
type Item = { price: number; active: boolean };

export class PriceTotals {
  private static readonly EMPTY_PRICES: readonly number[] = [];

  constructor(private readonly items: Item[]) {}

  public get total() {
    return PriceTotals.sumActivePrices(this.items);
  }

  private static sumActivePrices(items: Item[]) {
    const active = items.filter((item) => item.active);
    const prices = active.length
      ? active.map((item) => item.price)
      : PriceTotals.EMPTY_PRICES;
    return prices.reduce((sum, price) => sum + price, 0);
  }
}
        `,
      },
      {
        code: `
export class ApiClient {
  private static readonly RETRY_LIMIT = 3;

  public send(requests: string[]) {
    return ApiClient.buildRetryPlan(requests);
  }

  private static buildRetryPlan(requests: string[]) {
    const normalized = requests.map((request) => request.trim());
    const deduped = Array.from(new Set(normalized));
    const limit = ApiClient.RETRY_LIMIT;
    return deduped.map((request) => ({ request, limit }));
  }
}
        `,
      },
      // Class-name-qualified call of a sibling private static method
      {
        code: `
        export class Formatter {
          private static normalize(value: string) {
            return value.trim();
          }

          private static formatAll(values: string[]) {
            const trimmed = values.map((value) => Formatter.normalize(value));
            const unique = Array.from(new Set(trimmed));
            return unique.sort();
          }
        }
      `,
      },
      // Class-name-qualified read of a private static getter
      {
        code: `
        export class Scaler {
          private static get multiplier() {
            return 2;
          }

          private static scaleAll(values: number[]) {
            const scaled = values.map((value) => value * Scaler.multiplier);
            const total = scaled.reduce((sum, value) => sum + value, 0);
            return { scaled, total };
          }
        }
      `,
      },
      // Class-name-qualified read inside a nested arrow callback
      {
        code: `
        export class Tagger {
          private static readonly PREFIX = 'tag:';

          private static tagAll(values: string[]) {
            return values.map((value) => {
              const trimmed = value.trim();
              return Tagger.PREFIX + trimmed;
            });
          }
        }
      `,
      },
      // Class-name-qualified read inside a nested function declaration
      {
        code: `
        export class Joiner {
          private static readonly SEPARATOR = ',';

          private static joinAll(values: string[]) {
            function combine(parts: string[]) {
              return parts.join(Joiner.SEPARATOR);
            }
            return combine(values);
          }
        }
      `,
      },
      // Class-name-qualified read inside a template literal
      {
        code: `
        export class Labeler {
          private static readonly PREFIX = 'id';

          private static labelAll(values: number[]) {
            const labels = values.map((value) => \`\${Labeler.PREFIX}-\${value}\`);
            const joined = labels.join(' ');
            return joined;
          }
        }
      `,
      },
      // Optional-chained class-name-qualified read (ChainExpression wrapper)
      {
        code: `
        export class Lookup {
          private static readonly TABLE: Record<string, number> = {};

          private static lookupAll(keys: string[]) {
            const found = keys.map((key) => Lookup?.TABLE[key]);
            const defined = found.filter((value) => value !== undefined);
            return defined;
          }
        }
      `,
      },
      // Computed class-name-qualified read
      {
        code: `
        export class Bracket {
          private static readonly LIMIT = 5;

          private static capAll(values: number[]) {
            const limit = Bracket['LIMIT'];
            const capped = values.map((value) => Math.min(value, limit));
            return capped;
          }
        }
      `,
      },
      // Class expression assigned to a const, read through the const name
      {
        code: `
        const Bounds = class {
          private static readonly MAX = 10;

          private static clampAll(values: number[]) {
            const clamped = values.map((value) => Math.min(value, Bounds.MAX));
            const sorted = clamped.sort((a, b) => a - b);
            return sorted;
          }
        };
      `,
      },
      // Named class expression read through its own inner binding
      {
        code: `
        const Exported = class InnerBounds {
          private static readonly MAX = 10;

          private static clampAll(values: number[]) {
            const clamped = values.map((value) => Math.min(value, InnerBounds.MAX));
            const sorted = clamped.sort((a, b) => a - b);
            return sorted;
          }
        };
      `,
      },
      // Class expression assigned through an assignment expression
      {
        code: `
        let Assigned;
        Assigned = class {
          private static readonly SIZE = 4;

          private static chunk(values: number[]) {
            const size = Assigned.SIZE;
            const head = values.slice(0, size);
            return head;
          }
        };
      `,
      },
      // Class nested inside a function, read through its function-scoped name
      {
        code: `
        export function createCounter() {
          class Counter {
            private static readonly STEP = 2;

            private static advance(values: number[]) {
              const stepped = values.map((value) => value + Counter.STEP);
              const filtered = stepped.filter((value) => value > 0);
              return filtered;
            }

            public static run(values: number[]) {
              return Counter.advance(values);
            }
          }
          return Counter;
        }
      `,
      },
      // super.x reaches the base class's static state
      {
        code: `
        export class Base {
          protected static readonly DEFAULTS = [1, 2, 3];
        }

        export class Derived extends Base {
          private static withDefaults(values: number[]) {
            const merged = [...values, ...super.DEFAULTS];
            const unique = Array.from(new Set(merged));
            return unique;
          }
        }
      `,
      },
      // new.target reads the constructor the method is invoked on
      {
        code: `
        export class Guarded {
          private static describeTarget(values: number[]) {
            const target = new.target;
            const doubled = values.map((value) => value * 2);
            return { target, doubled };
          }
        }
      `,
      },
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
        errors: [
          buildError(
            'extractUniqueIdentifiers',
            'TemporaryChannelGroupCategorizer',
          ),
        ],
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
        errors: [buildError('processData', 'DataProcessor')],
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
        errors: [buildError('calculateTotal', 'Calculator')],
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
        errors: [buildError('fetchAndTransform', 'ApiClient')],
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
        errors: [buildError('transform', 'Transformer')],
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
        errors: [buildError('parseConfig', 'ConfigParser')],
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
        errors: [buildError('formatResponse', 'ResponseFormatter')],
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
        errors: [buildError('resolvePath', 'PathResolver')],
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
        errors: [buildError('safeParseJson', 'JsonParser')],
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
        errors: [buildError('extractQueryParams', 'UrlParser')],
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
        errors: [buildError('formatCamelCaseToTitleCase', 'StringFormatter')],
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
        errors: [buildError('groupByProperty', 'ArrayProcessor')],
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
        errors: [buildError('renderTemplate', 'TemplateEngine')],
      },
      // Class expression with named identifier
      {
        code: `
        const ClassExpression = class NamedExpression {
          private static compute(value: number) {
            const doubled = value * 2;
            const squared = value * value;
            return { doubled, squared };
          }
        };
      `,
        errors: [buildError('compute', 'NamedExpression')],
      },
      // Class expression relying on variable declarator name
      {
        code: `
        const AssignedExpression = class {
          private static format(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            return upper;
          }
        };
      `,
        errors: [buildError('format', 'AssignedExpression')],
      },
      // A different class's static member is class-agnostic from here
      {
        code: `
        class Config {
          static readonly LIMIT = 5;
        }

        export class Runner {
          private static planAll(values: number[]) {
            const limited = values.filter((value) => value < Config.LIMIT);
            const sorted = limited.sort((a, b) => a - b);
            return sorted;
          }
        }
      `,
        errors: [buildError('planAll', 'Runner')],
      },
      // A different class's static reached through optional chaining
      {
        code: `
        export class Sender {
          private static prepare(values: string[]) {
            const limit = Config?.LIMIT;
            const capped = values.slice(0, limit);
            return capped;
          }
        }
      `,
        errors: [buildError('prepare', 'Sender')],
      },
      // A local declaration shadowing the class name is not class state
      {
        code: `
        export class Registry {
          private static readonly ITEMS: string[] = [];

          private static collect(values: string[]) {
            const Registry = { ITEMS: values };
            const items = Registry.ITEMS;
            return items.map((item) => item.trim());
          }
        }
      `,
        errors: [buildError('collect', 'Registry')],
      },
      // A parameter shadowing the class name is not class state
      {
        code: `
        export class Loader {
          private static readonly PATHS: string[] = [];

          private static resolveAll(Loader: { PATHS: string[] }) {
            const paths = Loader.PATHS;
            const trimmed = paths.map((path) => path.trim());
            return trimmed;
          }
        }
      `,
        errors: [buildError('resolveAll', 'Loader')],
      },
      // A nested class shadowing the outer class name is not the outer's state
      {
        code: `
        export class Outer {
          private static readonly TOKEN = 'a';

          private static build(values: string[]) {
            const helper = () => {
              class Outer {
                static readonly TOKEN = 'b';
              }
              return Outer.TOKEN;
            };
            return helper() + values.length;
          }
        }
      `,
        errors: [buildError('build', 'Outer')],
      },
      // A module-level constant is reachable from a module-level utility
      {
        code: `
        const DEFAULT_LIMIT = 10;

        export class Limiter {
          private static applyLimit(values: number[]) {
            const limited = values.slice(0, DEFAULT_LIMIT);
            const sorted = limited.sort((a, b) => a - b);
            return sorted;
          }
        }
      `,
        errors: [buildError('applyLimit', 'Limiter')],
      },
      // A pure computation over its parameters
      {
        code: `
        export class MathUtils {
          private static average(values: number[]) {
            const total = values.reduce((sum, value) => sum + value, 0);
            const count = values.length || 1;
            return total / count;
          }
        }
      `,
        errors: [buildError('average', 'MathUtils')],
      },
      // import.meta is a MetaProperty but reaches no class
      {
        code: `
        export class Env {
          private static describe(values: string[]) {
            const url = import.meta.url;
            const joined = values.join(',');
            return \`\${url}:\${joined}\`;
          }
        }
      `,
        errors: [buildError('describe', 'Env')],
      },
      // Anonymous class expression passed as an argument has no name to match
      {
        code: `
        register(class {
          private static compute(value: number) {
            const doubled = value * 2;
            const squared = value * value;
            return { doubled, squared };
          }
        });
      `,
        errors: [buildError('compute', 'this class')],
      },
      // Anonymous default-exported class has no name to match
      {
        code: `
        export default class {
          private static compute(value: number) {
            const doubled = value * 2;
            const squared = value * value;
            return { doubled, squared };
          }
        }
      `,
        errors: [buildError('compute', 'this class')],
      },
    ],
  },
);
