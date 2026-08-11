import { ruleTesterTs } from '../utils/ruleTester';
import { preferUtilityFunctionOverPrivateStatic } from '../rules/prefer-utility-function-over-private-static';

const buildError = (methodName: string, className: string) => ({
  messageId: 'preferUtilityFunctionOverPrivateStatic' as const,
  data: { methodName, className },
});

const buildGetterError = (methodName: string, className: string) => ({
  messageId: 'preferUtilityFunctionOverPrivateStaticGetter' as const,
  data: { methodName, className },
});

// A helper written as a function-valued property carries its own subject noun:
// "method" would send a developer looking for a declaration the class does not
// hold (#1927).
const buildPropertyError = (methodName: string, className: string) => ({
  messageId: 'preferUtilityFunctionOverPrivateStaticProperty' as const,
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
      // `new.target` is the class the member was invoked through, so it is a
      // receiver like `this` and the class name — and like them it exempts on
      // the dereference, not on the token. Its bare twin sits in the invalid
      // list (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static describeTarget(values: number[]) {
            const limit = new.target.LIMIT;
            const doubled = values.map((value) => value * 2);
            return { limit, doubled };
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
      // A JSDoc block inside the body documents one statement; documenting a
      // helper is not what makes it worth extracting.
      {
        code: `
        export class Example {
          private static double(value: number) {
            /**
             * Doubling is the whole helper.
             */
            return value * 2;
          }
        }
      `,
      },
      // A line comment inside the body
      {
        code: `
        export class Example {
          private static double(value: number) {
            // Doubling is the whole helper.
            return value * 2;
          }
        }
      `,
      },
      // A trailing comment on the body's only statement
      {
        code: `
        export class Example {
          private static double(value: number) {
            return value * 2; // Doubling is the whole helper.
          }
        }
      `,
      },
      // Blank lines inside the body
      {
        code: `
        export class Example {
          private static double(value: number) {

            return value * 2;

          }
        }
      `,
      },
      // One statement wrapped across lines by a chained call
      {
        code: `
        export class Example {
          private static sortPositiveDoubles(values: number[]) {
            return values
              .map((value) => value * 2)
              .filter((value) => value > 0)
              .sort((a, b) => a - b);
          }
        }
      `,
      },
      // One statement wrapped across lines by an object literal
      {
        code: `
        export class Example {
          private static describe(value: number) {
            return {
              doubled: value * 2,
              squared: value * value,
              negated: -value,
            };
          }
        }
      `,
      },
      // One statement wrapped across lines by a template literal's own newlines
      {
        code: `
        export class Example {
          private static banner(value: string) {
            return \`first \${value}
second line
third line\`;
          }
        }
      `,
      },
      // One statement whose callback is an expression-bodied arrow: the arrow
      // contributes no statement of its own
      {
        code: `
        export class Example {
          private static doubleAll(
            values: number[],
          ) {
            return values.map(
              (value) => value * 2,
            );
          }
        }
      `,
      },
      // The block spelling of the same callback is the same helper, so it is
      // measured the same
      {
        code: `
        export class Example {
          private static doubleAll(values: number[]) {
            return values.map((value) => { return value * 2; });
          }
        }
      `,
      },
      // The same chained call with every callback in block spelling
      {
        code: `
        export class Example {
          private static sortPositiveDoubles(values: number[]) {
            return values
              .map((value) => { return value * 2; })
              .filter((value) => { return value > 0; })
              .sort((a, b) => { return a - b; });
          }
        }
      `,
      },
      // A void callback spelled with a block holds no statement a concise arrow
      // would not
      {
        code: `
        export class Example {
          private static logAll(values: number[]) {
            values.forEach((value) => { console.log(value); });
          }
        }
      `,
      },
      // An empty body contains no statements at all
      {
        code: `
        export class Example {
          private static noop() {}
        }
      `,
      },
      // An empty body spread across lines
      {
        code: `
        export class Example {
          private static noop() {

          }
        }
      `,
      },
      // The size escape and the class-state escape are independent: a body far
      // over the statement threshold, written on one line, still escapes on
      // `this`
      {
        code: `
        export class Example {
          private static readonly LIMIT = 3;

          private static capAll(values: number[]) { const doubled = values.map((value) => value * 2); const capped = doubled.filter((value) => value < this.LIMIT); const sorted = capped.sort((a, b) => a - b); return sorted; }
        }
      `,
      },
      // The same, escaping on the class-name-qualified spelling
      {
        code: `
        export class Example {
          private static readonly LIMIT = 3;

          private static capAll(values: number[]) { const doubled = values.map((value) => value * 2); const capped = doubled.filter((value) => value < Example.LIMIT); const sorted = capped.sort((a, b) => a - b); return sorted; }
        }
      `,
      },
      // Size alone came from wrapping: a complex return type over a single
      // statement is still a single statement
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
      },
      // A setter is silent whatever its size: it cannot become a module-level
      // function, so the prescribed extraction is not a rewrite its author can
      // perform
      {
        code: `
        export class Example {
          private static set payload(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            console.log(upper);
          }
        }
      `,
      },
      // The same setter written class-agnostically over many statements and
      // nested control flow
      {
        code: `
        export class Example {
          private static set payload(value: string[]) {
            const trimmed = value.map((entry) => entry.trim());
            for (const entry of trimmed) {
              if (entry.length > 0) {
                console.log(entry);
              }
            }
          }
        }
      `,
      },
      // A setter that writes class state escapes for two reasons at once
      {
        code: `
        export class Example {
          private static stored: string[] = [];

          private static set payload(value: string[]) {
            const trimmed = value.map((entry) => entry.trim());
            Example.stored = trimmed;
          }
        }
      `,
      },
      // The same, through `this`
      {
        code: `
        export class Example {
          private static stored: string[] = [];

          private static set payload(value: string[]) {
            const trimmed = value.map((entry) => entry.trim());
            this.stored = trimmed;
          }
        }
      `,
      },
      // A setter whose statements are joined onto one line: the size measure
      // never runs for a setter at all
      {
        code: `
        export class Example {
          private static set payload(value: string) { const trimmed = value.trim(); const upper = trimmed.toUpperCase(); console.log(upper); }
        }
      `,
      },
      // A one-statement setter
      {
        code: `
        export class Example {
          private static set payload(value: string) {
            console.log(value.trim());
          }
        }
      `,
      },
      // An empty setter body
      {
        code: `
        export class Example {
          private static set payload(value: string) {}
        }
      `,
      },
      // A string-literal-keyed setter is still a setter
      {
        code: `
        export class Example {
          private static set 'payload-value'(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            console.log(upper);
          }
        }
      `,
      },
      // A setter paired with a getter under the same key, both below the size
      // threshold
      {
        code: `
        export class Example {
          private static value = 'a';

          private static get payload() {
            return Example.value;
          }

          private static set payload(next: string) {
            console.log(next.trim());
          }
        }
      `,
      },
      // A non-static private setter is out of scope on staticness
      {
        code: `
        export class Example {
          private set payload(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            console.log(upper);
          }
        }
      `,
      },
      // A public static setter is out of scope on accessibility
      {
        code: `
        export class Example {
          public static set payload(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            console.log(upper);
          }
        }
      `,
      },
      // A protected static setter is out of scope on accessibility
      {
        code: `
        export class Example {
          protected static set payload(value: string) {
            const trimmed = value.trim();
            const upper = trimmed.toUpperCase();
            console.log(upper);
          }
        }
      `,
      },
      // A getter of a single statement is trivial, exactly as a method is
      {
        code: `
        export class Example {
          private static get config() {
            return { retries: 3 };
          }
        }
      `,
      },
      // A getter documented by a comment is still one statement
      {
        code: `
        export class Example {
          private static get config() {
            // The whole helper is the literal below.
            return { retries: 3 };
          }
        }
      `,
      },
      // An empty getter body
      {
        code: `
        export class Example {
          private static get config() {}
        }
      `,
      },
      // A getter over the size threshold escapes on `this`
      {
        code: `
        export class Example {
          private static readonly BASE = { retries: 3 };

          private static get config() {
            const base = this.BASE;
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // A getter over the size threshold escapes on the class-name-qualified
      // spelling
      {
        code: `
        export class Example {
          private static readonly BASE = { retries: 3 };

          private static get config() {
            const base = Example.BASE;
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // A getter over the size threshold escapes on `super`
      {
        code: `
        export class Base {
          protected static readonly BASE = { retries: 3 };
        }

        export class Derived extends Base {
          private static get config() {
            const base = super.BASE;
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // A non-static private getter is out of scope on staticness
      {
        code: `
        export class Example {
          private get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // A public static getter is out of scope on accessibility
      {
        code: `
        export class Example {
          public static get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // A protected static getter is out of scope on accessibility
      {
        code: `
        export class Example {
          protected static get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
      },
      // Binding the class to a local reaches the same state the qualified
      // spelling does
      {
        code: `
export class Aliased {
  private static readonly LIMIT = 10;

  public run(values: number[]) {
    return Aliased.capAll(values);
  }

  private static capAll(values: number[]) {
    const owner = Aliased;
    const capped = values.map((v) => Math.min(v, owner.LIMIT));
    return capped;
  }
}
      `,
      },
      // The alias read from inside a nested callback
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Aliased;
            return values.map((value) => {
              const cap = owner.LIMIT;
              return Math.min(value, cap);
            });
          }
        }
      `,
      },
      // An alias declared with `let` and never rebound still holds the class
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            let owner = Aliased;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
      },
      // An alias declared with `var`
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            var owner = Aliased;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
      },
      // Alias chains are followed to a fixpoint, so a second hop reads the same
      // member the first one does
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const first = Aliased;
            const second = first;
            const capped = values.map((value) => Math.min(value, second.LIMIT));
            return capped;
          }
        }
      `,
      },
      // Four hops: no chain length changes which member is read
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const a = Aliased;
            const b = a;
            const c = b;
            const d = c;
            const capped = values.map((value) => Math.min(value, d.LIMIT));
            return capped;
          }
        }
      `,
      },
      // An alias declared at module scope reaches the class just as a local one
      // does
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }

        const owner = Aliased;
      `,
      },
      // Type-only syntax around the alias initializer names the same binding
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Aliased as typeof Aliased;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
      },
      // The computed spelling through an alias reads the same member
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Aliased;
            const capped = values.map((value) => Math.min(value, owner['LIMIT']));
            return capped;
          }
        }
      `,
      },
      // Destructuring off the class binding is itself the dereference
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const { LIMIT } = Aliased;
            const capped = values.map((value) => Math.min(value, LIMIT));
            return capped;
          }
        }
      `,
      },
      // Destructuring off an alias of the class binding
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Aliased;
            const { LIMIT } = owner;
            const capped = values.map((value) => Math.min(value, LIMIT));
            return capped;
          }
        }
      `,
      },
      // A named member alongside a rest element still names a member
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { LIMIT, ...rest } = Aliased;
            const keys = Object.keys(rest);
            return keys.length + values.length + LIMIT;
          }
        }
      `,
      },
      // Aliasing `this` inside a static member reaches the class, as
      // dereferencing `this` itself does
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const self = this;
            const capped = values.map((value) => Math.min(value, self.LIMIT));
            return capped;
          }
        }
      `,
      },
      // The exempt side of the construction boundary for the `this` spelling:
      // an alias of `this` that is dereferenced reads a member, which is what
      // holds a helper inside the class. Its reporting twin sits in the invalid
      // list, so the narrowing is a boundary rather than a blanket (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static limitOf() {
            const self = this;
            return self.LIMIT;
          }
        }
      `,
      },
      // The computed spelling reads the same member the dotted one does (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static limitOf() {
            const scaled = this['LIMIT'] * 2;
            return scaled;
          }
        }
      `,
      },
      // Calling a member through `this` dereferences it (#1928)
      {
        code: `
        export class Aliased {
          private static helper(value: number) {
            return value * 2;
          }

          private static computeAll(values: number[]) {
            const doubled = values.map((value) => this.helper(value));
            return doubled;
          }
        }
      `,
      },
      // A chain of aliases off `this` is followed to a fixpoint, exactly as a
      // chain off the class binding is (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static limitOf() {
            const a = this;
            const b = a;
            return b.LIMIT;
          }
        }
      `,
      },
      // Destructuring a named member off `this` is a dereference of it: the
      // pattern is the read (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { LIMIT } = this;
            return values.length + LIMIT;
          }
        }
      `,
      },
      // Inside a nested `function`, `this` is the call-time receiver rather
      // than the class, yet a dereference through it stays exempt: deciding the
      // receiver needs the call sites, which a single member does not carry, and
      // a missed report costs less than a wrong one (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static limitOf() {
            const read = function (this: { LIMIT: number }) {
              return this.LIMIT;
            };
            return read.call(this);
          }
        }
      `,
      },
      // An alias of `new.target` is followed exactly as an alias of `this` or of
      // the class binding is: the receiver reaches the member either way, so the
      // hop cannot change the answer (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static limitOf(values: number[]) {
            const target = new.target;
            const capped = values.map((value) => Math.min(value, target.LIMIT));
            return capped;
          }
        }
      `,
      },
      // Destructuring a named member off `new.target` is a dereference of it,
      // as it is off `this` and off the class binding (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { LIMIT } = new.target;
            return values.length + LIMIT;
          }
        }
      `,
      },
      // A `super` written in the member's own class names that class's parent,
      // whose statics the member reaches — so it stays exempt, and the
      // nested-class `super` in the invalid list does not (#1931)
      {
        code: `
        export class Base {
          protected static readonly BASE = { retries: 3 };
        }

        export class Derived extends Base {
          private static describe(values: number[]) {
            const base = super.BASE;
            const doubled = values.map((value) => value * 2);
            return { base, doubled };
          }
        }
      `,
      },
      // An arrow written in the member body inherits the member's `super`, so
      // the dereference still reaches the enclosing class's parent (#1931)
      {
        code: `
        export class Base {
          protected static readonly BASE = { retries: 3 };
        }

        export class Derived extends Base {
          private static describe(values: number[]) {
            const read = () => super.BASE;
            const doubled = values.map((value) => value * 2);
            return { base: read(), doubled };
          }
        }
      `,
      },
      // A named class expression aliased through a local: the alias resolves to
      // the class's own inner binding
      {
        code: `
        const Holder = class Inner {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Inner;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        };
      `,
      },
      // A property holding no function holds no logic to extract, whatever its
      // modifiers (#1927)
      {
        code: `
        export class Repro {
          private static LIMIT = 10;
          private static readonly NAMES: string[] = ['a', 'b'];
        }
      `,
      },
      // The size escape (#1920) decides the arrow-property spelling too: this
      // body is too small to be worth extracting, and it is silent for that
      // reason rather than because properties go unexamined (#1927)
      {
        code: `
        export class Repro {
          private static computeAlt = (v: number) => {
            return v * 2;
          };
        }
      `,
      },
      // A concise arrow carries no statement at all, so it sits on the same
      // side of the size escape as its block-bodied twin (#1927)
      {
        code: `
        export class Repro {
          private static computeAlt = (v: number) => v * 2 + 1;
        }
      `,
      },
      // The class-state escape (#1913) decides the arrow-property spelling too:
      // a member reachable only from inside the class cannot move to module
      // scope (#1927)
      {
        code: `
        export class Repro {
          private static cache = new Map<number, number>();

          private static computeAlt = (v: number) => {
            const doubled = v * 2;
            const cached = Repro.cache.get(doubled);
            return cached;
          };
        }
      `,
      },
      // `this` inside a static property initializer is the class, so it reads
      // class state exactly as the method spelling does (#1927)
      {
        code: `
        export class Repro {
          private static readonly LIMIT = 10;

          private static capAll = (values: number[]) => {
            const capped = values.map((value) => Math.min(value, this.LIMIT));
            return capped;
          };
        }
      `,
      },
      // An alias of the class binding reaches class state from a property
      // initializer as it does from a method body (#1927)
      {
        code: `
        export class Repro {
          private static readonly LIMIT = 10;

          private static capAll = (values: number[]) => {
            const owner = Repro;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          };
        }
      `,
      },
      // A function expression assigned to the property reaches class state
      // through the class binding just as an arrow does (#1927)
      {
        code: `
        export class Repro {
          private static readonly LIMIT = 10;

          private static capAll = function (values: number[]) {
            const capped = values.map((value) => Math.min(value, Repro.LIMIT));
            return capped;
          };
        }
      `,
      },
      // Spelling parity is exact: the property arm reports where the method arm
      // reports and nowhere else, so a `protected static` property is out of
      // scope as a `protected static` method is (#1927)
      {
        code: `
        export class Repro {
          protected static computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
      },
      // A `public static` property is part of the class's published surface,
      // which is what the method arm's accessibility gate says too (#1927)
      {
        code: `
        export class Repro {
          public static computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
      },
      // An omitted accessibility keyword is public, so a bare `static` property
      // is out of scope on the same grounds (#1927)
      {
        code: `
        export class Repro {
          static computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
      },
      // An instance property is not a static one: it is reached through an
      // instance, so it is not the class-agnostic helper this rule names (#1927)
      {
        code: `
        export class Repro {
          private computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
      },
      // Neither static nor private: the furthest cell from the one this rule
      // reports on (#1927)
      {
        code: `
        export class Repro {
          computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
      },
      // A setter stays out of scope alongside a function-valued property: the
      // widening to properties leaves accessor scoping untouched (#1927)
      {
        code: `
        export class Repro {
          private static target = 0;

          private static set limit(value: number) {
            const doubled = value * 2;
            const capped = Math.min(doubled, 10);
            Repro.target = capped;
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
            const timestamp = Date.now();

            return {
              data,
              meta: {
                status,
                message,
                timestamp
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
      // Four statements joined onto one physical line: formatting does not buy
      // an exemption
      {
        code: `
        export class Example {
          private static compute(value: number) { const doubled = value * 2; const squared = value * value; const summed = doubled + squared; return summed; }
        }
      `,
        errors: [buildError('compute', 'Example')],
      },
      // Two statements on one physical line is the threshold itself
      {
        code: `
        export class Example {
          private static compute(value: number) { const doubled = value * 2; return doubled; }
        }
      `,
        errors: [buildError('compute', 'Example')],
      },
      // Nested statements count: one top-level `if` holding several statements
      {
        code: `
        export class Example {
          private static describe(values: number[]) {
            if (values.length > 0) {
              const first = values[0];
              const last = values[values.length - 1];
              return { first, last };
            }
          }
        }
      `,
        errors: [buildError('describe', 'Example')],
      },
      // A guard whose consequent shares its line is two statements
      {
        code: `
        export class Example {
          private static assertNonEmpty(values: number[]) {
            if (!values.length) throw new Error('empty');
          }
        }
      `,
        errors: [buildError('assertNonEmpty', 'Example')],
      },
      // Nested statements count: one top-level block holding several statements
      {
        code: `
        export class Example {
          private static describe(values: number[]) {
            {
              const first = values[0];
              const last = values[values.length - 1];
              return { first, last };
            }
          }
        }
      `,
        errors: [buildError('describe', 'Example')],
      },
      // Nested statements count: one top-level `try` holding several statements,
      // matching the documented incorrect example
      {
        code: `
        export class JsonParser {
          private static safeParseJson(input: string, fallback: unknown = null) {
            try {
              return JSON.parse(input);
            } catch (error) {
              console.error('Failed to parse JSON:', error);
              return fallback;
            }
          }
        }
      `,
        errors: [buildError('safeParseJson', 'JsonParser')],
      },
      // Nested statements count: one top-level `return` whose callback body
      // holds several statements
      {
        code: `
        export class Example {
          private static tagAll(values: string[]) {
            return values.map((value) => {
              const trimmed = value.trim();
              return 'tag:' + trimmed;
            });
          }
        }
      `,
        errors: [buildError('tagAll', 'Example')],
      },
      // A class-agnostic getter over the size threshold is a hidden utility,
      // reported with the accessor's own wording
      {
        code: `
        export class Example {
          private static get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
        errors: [buildGetterError('config', 'Example')],
      },
      // A getter whose statements are joined onto one line
      {
        code: `
        export class Example {
          private static get config() { const base = { retries: 3 }; return { ...base, timeout: 1000 }; }
        }
      `,
        errors: [buildGetterError('config', 'Example')],
      },
      // A getter whose statements are nested inside one `try`
      {
        code: `
        export class Example {
          private static get parsedDefaults() {
            try {
              return JSON.parse(readDefaults());
            } catch (error) {
              console.error('Failed to parse defaults:', error);
              return {};
            }
          }
        }
      `,
        errors: [buildGetterError('parsedDefaults', 'Example')],
      },
      // A getter reading another class's static is class-agnostic from here
      {
        code: `
        class Config {
          static readonly LIMIT = 5;
        }

        export class Runner {
          private static get plan() {
            const limit = Config.LIMIT;
            const steps = Array.from({ length: limit }, (_, index) => index);
            return steps;
          }
        }
      `,
        errors: [buildGetterError('plan', 'Runner')],
      },
      // A string-literal-keyed getter reports under its literal key
      {
        code: `
        export class Example {
          private static get 'config-value'() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        }
      `,
        errors: [buildGetterError('config-value', 'Example')],
      },
      // A getter on a class expression names the class it is bound to
      {
        code: `
        const AssignedExpression = class {
          private static get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }
        };
      `,
        errors: [buildGetterError('config', 'AssignedExpression')],
      },
      // A getter/setter pair under one key: the setter's presence does not
      // change the getter's verdict, and the setter itself stays silent
      {
        code: `
        export class Example {
          private static get payload() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }

          private static set payload(next: Record<string, number>) {
            const entries = Object.entries(next);
            const named = entries.map(([key, value]) => key + value);
            console.log(named);
          }
        }
      `,
        errors: [buildGetterError('payload', 'Example')],
      },
      // The same pair with the setter reaching class state: still exactly one
      // report, on the getter
      {
        code: `
        export class Example {
          private static stored: Record<string, number> = {};

          private static get payload() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }

          private static set payload(next: Record<string, number>) {
            const entries = Object.entries(next);
            Example.stored = Object.fromEntries(entries);
          }
        }
      `,
        errors: [buildGetterError('payload', 'Example')],
      },
      // A method and a getter in one class keep their own wordings
      {
        code: `
        export class Example {
          private static get config() {
            const base = { retries: 3 };
            const extra = { timeout: 1000 };
            return { ...base, ...extra };
          }

          private static merge(values: number[]) {
            const doubled = values.map((value) => value * 2);
            return doubled.filter((value) => value > 0);
          }
        }
      `,
        errors: [
          buildGetterError('config', 'Example'),
          buildError('merge', 'Example'),
        ],
      },
      // A method alongside a setter: the method reports, the setter does not
      {
        code: `
        export class Example {
          private static set payload(value: string) {
            const trimmed = value.trim();
            console.log(trimmed.toUpperCase());
          }

          private static merge(values: number[]) {
            const doubled = values.map((value) => value * 2);
            return doubled.filter((value) => value > 0);
          }
        }
      `,
        errors: [buildError('merge', 'Example')],
      },
      // An alias of another class is not this class's state
      {
        code: `
        declare const Other: { LIMIT: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const owner = Other;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // A binding reassigned away from the class may hold anything by the time
      // it is dereferenced, so it is not credited
      {
        code: `
        declare const Other: { LIMIT: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            let owner: { LIMIT: number } = Aliased;
            owner = Other;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // The reassignment disqualifies the alias wherever it sits, including
      // after the read
      {
        code: `
        declare const Other: { LIMIT: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            let owner: { LIMIT: number } = Aliased;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            owner = Other;
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // Constructing through an alias is not a state read: a helper that only
      // instantiates the class is exactly the class-agnostic utility this rule
      // exists to surface, and it survives the move to module scope
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static buildAll(values: number[]) {
            const owner = Aliased;
            const made = values.map(() => new owner());
            return made;
          }
        }
      `,
        errors: [buildError('buildAll', 'Aliased')],
      },
      // `instanceof` through an alias is not a state read either
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static onlyMine(values: unknown[]) {
            const owner = Aliased;
            const kept = values.filter((value) => value instanceof owner);
            return kept;
          }
        }
      `,
        errors: [buildError('onlyMine', 'Aliased')],
      },
      // The same boundary without the alias: a bare class reference that is not
      // a dereference leaves the report standing
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static buildAll(values: number[]) {
            const made = values.map(() => new Aliased());
            return made;
          }
        }
      `,
        errors: [buildError('buildAll', 'Aliased')],
      },
      // Passing the class binding along as a value is not a dereference
      {
        code: `
        declare function register(target: unknown): void;

        export class Aliased {
          private static readonly LIMIT = 10;

          private static registerAll(values: number[]) {
            const owner = Aliased;
            register(owner);
            return values.length;
          }
        }
      `,
        errors: [buildError('registerAll', 'Aliased')],
      },
      // `this` in a static member is the class, so both spellings answer one
      // question: is a member dereferenced? Constructing through an alias of
      // `this` reads none, and the helper survives the move to module scope —
      // the same verdict its `Aliased` twin above already gets (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static buildAll(values: number[]) {
            const self = this;
            const made = values.map(() => new self());
            return made;
          }
        }
      `,
        errors: [buildError('buildAll', 'Aliased')],
      },
      // `instanceof` through an alias of `this` is a type test, not a state
      // read (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static onlyMine(values: unknown[]) {
            const t = this;
            const kept = values.filter((value) => value instanceof t);
            return kept;
          }
        }
      `,
        errors: [buildError('onlyMine', 'Aliased')],
      },
      // The same boundary without the alias hop: constructing off `this`
      // directly reads no member either (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static buildAll(values: number[]) {
            const made = values.map(() => new this());
            return made;
          }
        }
      `,
        errors: [buildError('buildAll', 'Aliased')],
      },
      // `instanceof this` written directly (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static onlyMine(values: unknown[]) {
            const kept = values.filter((value) => value instanceof this);
            return kept;
          }
        }
      `,
        errors: [buildError('onlyMine', 'Aliased')],
      },
      // Binding `this` and handing the binding straight back reads no member,
      // so nothing about the class holds this helper in place (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static owner() {
            const self = this;
            return self;
          }
        }
      `,
        errors: [buildError('owner', 'Aliased')],
      },
      // Passing `this` along as a value is not a dereference, as passing the
      // class binding along is not (#1928)
      {
        code: `
        declare function register(target: unknown): void;

        export class Aliased {
          private static readonly LIMIT = 10;

          private static registerAll(values: number[]) {
            register(this);
            return values.length;
          }
        }
      `,
        errors: [buildError('registerAll', 'Aliased')],
      },
      // The chain is followed for the non-reading side too: no length of alias
      // chain off `this` turns construction into a state read (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static buildAll(values: number[]) {
            const a = this;
            const b = a;
            const made = values.map(() => new b());
            return made;
          }
        }
      `,
        errors: [buildError('buildAll', 'Aliased')],
      },
      // A lone rest element off `this` selects no property, so it aliases the
      // class rather than reading one of its members — the `Aliased` spelling
      // of this shape reports for the same reason (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { ...statics } = this;
            const keys = Object.keys(statics);
            return keys.length + values.length;
          }
        }
      `,
        errors: [buildError('describe', 'Aliased')],
      },
      // A nested `function` whose `this` is never dereferenced reads nothing
      // from any receiver, so the helper is class-agnostic (#1928)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static describeAll(values: number[]) {
            const describe = function (this: unknown) {
              return String(this);
            };
            return values.map(() => describe.call(null));
          }
        }
      `,
        errors: [buildError('describeAll', 'Aliased')],
      },
      // `new.target` is a receiver, not a state read: handing it straight back
      // dereferences no member, so the helper moves to module scope unchanged.
      // Its `new.target.LIMIT` twin in the valid list holds the other side of
      // the boundary (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static describeTarget(values: number[]) {
            const target = new.target;
            const doubled = values.map((value) => value * 2);
            return { target, doubled };
          }
        }
      `,
        errors: [buildError('describeTarget', 'Guarded')],
      },
      // The alias hop does not change that verdict either, exactly as it does
      // not for `this` or for the class binding (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static owner(values: number[]) {
            const target = new.target;
            const alias = target;
            return { alias, size: values.length };
          }
        }
      `,
        errors: [buildError('owner', 'Guarded')],
      },
      // A lone rest element off `new.target` selects no property, so it aliases
      // the receiver rather than reading one of its members (#1931)
      {
        code: `
        export class Guarded {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { ...statics } = new.target;
            const keys = Object.keys(statics);
            return keys.length + values.length;
          }
        }
      `,
        errors: [buildError('describe', 'Guarded')],
      },
      // A `super` inside a class written in the member body belongs to that
      // class, not to the enclosing one: `Inner`'s constructor calls `Base`'s,
      // which says nothing about `Aliased`'s state, so the helper still moves
      // (#1931)
      {
        code: `
        declare class Base {}

        export class Aliased {
          private static readonly LIMIT = 10;

          private static makeInner(values: number[]) {
            class Inner extends Base {
              constructor() {
                super();
              }
            }
            return { Inner, size: values.length };
          }
        }
      `,
        errors: [buildError('makeInner', 'Aliased')],
      },
      // The same holds for a nested class dereferencing through its own
      // `super`: the member read belongs to `Base`, reached from `Inner` (#1931)
      {
        code: `
        declare class Base { toString(): string; }

        export class Aliased {
          private static readonly LIMIT = 10;

          private static makeInner(values: number[]) {
            class Inner extends Base {
              public describe() {
                return super.toString();
              }
            }
            return { Inner, size: values.length };
          }
        }
      `,
        errors: [buildError('makeInner', 'Aliased')],
      },
      // A nested class that extends the enclosing class and calls its
      // constructor reads no member of it: `extends Aliased` hands the class
      // along as a value, and the `super()` belongs to `Inner` (#1931)
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static makeInner(values: number[]) {
            class Inner extends Aliased {
              constructor() {
                super();
              }
            }
            return { Inner, size: values.length };
          }
        }
      `,
        errors: [buildError('makeInner', 'Aliased')],
      },
      // A local named like the class but initialized from something else is not
      // the class, whatever it is dereferenced for
      {
        code: `
        declare const source: { LIMIT: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const Aliased2 = source;
            const capped = values.map((value) => Math.min(value, Aliased2.LIMIT));
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // An alias of a local that shadows the class name resolves to the shadow,
      // not to the class
      {
        code: `
        export class Registry {
          private static readonly ITEMS: string[] = [];

          private static collect(values: string[]) {
            const Registry = { ITEMS: values };
            const owner = Registry;
            return owner.ITEMS.map((item) => item.trim());
          }
        }
      `,
        errors: [buildError('collect', 'Registry')],
      },
      // Destructuring off a foreign object is not a class-state read
      {
        code: `
        declare const Other: { LIMIT: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const { LIMIT } = Other;
            const capped = values.map((value) => Math.min(value, LIMIT));
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // An empty pattern reads no member, so it is not a state read
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            const {} = Aliased;
            const capped = values.map((value) => value * 2);
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // A lone rest element selects no property — it is the plain assignment
      // `no-unnecessary-destructuring` rewrites it to — so it is an alias of
      // the class rather than a read of one of its members
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { ...statics } = Aliased;
            const keys = Object.keys(statics);
            return keys.length + values.length;
          }
        }
      `,
        errors: [buildError('describe', 'Aliased')],
      },
      // A rest element alongside a named member still reads that member, so the
      // named-property arm is what decides — this pair is the boundary's other
      // side and stays silent
      {
        code: `
        declare const Other: { LIMIT: number; scale: number };

        export class Aliased {
          private static readonly LIMIT = 10;

          private static describe(values: number[]) {
            const { LIMIT, ...rest } = Other;
            const keys = Object.keys(rest);
            return keys.length + values.length + LIMIT;
          }
        }
      `,
        errors: [buildError('describe', 'Aliased')],
      },
      // A binding declared without an initializer and written later is not
      // credited: the write is not the declaration the alias check requires
      {
        code: `
        export class Aliased {
          private static readonly LIMIT = 10;

          private static capAll(values: number[]) {
            let owner;
            owner = Aliased;
            const capped = values.map((value) => Math.min(value, owner.LIMIT));
            return capped;
          }
        }
      `,
        errors: [buildError('capAll', 'Aliased')],
      },
      // The same hidden utility spelled as a private static arrow property.
      // Which member syntax an author picked does not change whether the logic
      // is class-agnostic, so it does not change the verdict either. The report
      // covers the whole member, as it does for the method spelling (#1927)
      {
        code: `
export class Repro {
  private static computeAlt = (v: number) => {
    const doubled = v * 2;
    const capped = Math.min(doubled, 10);
    return capped;
  };
}
`,
        errors: [
          {
            ...buildPropertyError('computeAlt', 'Repro'),
            line: 3,
            column: 3,
            endLine: 7,
            endColumn: 5,
          },
        ],
      },
      // A function expression is the same helper as an arrow (#1927)
      {
        code: `
        export class Repro {
          private static computeAlt = function (v: number) {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
        errors: [buildPropertyError('computeAlt', 'Repro')],
      },
      // `readonly` restricts reassignment of the binding, not what the function
      // it holds reaches (#1927)
      {
        code: `
        export class Repro {
          private static readonly computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
        errors: [buildPropertyError('computeAlt', 'Repro')],
      },
      // The class-state escape's other side: the same property with its one
      // read of `Repro.cache` removed reports, so the silence of its twin is
      // owed to that read and not to the member spelling (#1927)
      {
        code: `
        export class Repro {
          private static cache = new Map<number, number>();

          private static computeAlt = (v: number) => {
            const doubled = v * 2;
            const cached = Math.min(doubled, 10);
            return cached;
          };
        }
      `,
        errors: [buildPropertyError('computeAlt', 'Repro')],
      },
      // The size escape's other side: one more statement than its silent twin
      // carries, and the same property reports (#1927)
      {
        code: `
        export class Repro {
          private static computeAlt = (v: number) => {
            const doubled = v * 2;
            return doubled;
          };
        }
      `,
        errors: [buildPropertyError('computeAlt', 'Repro')],
      },
      // A local shadowing the class name is not the class, so a property that
      // dereferences it holds nothing the class owns (#1927)
      {
        code: `
        export class Repro {
          private static readonly LIMIT = 10;

          private static capAll = (values: number[]) => {
            const Repro = { LIMIT: 5 };
            const capped = values.map((value) => Math.min(value, Repro.LIMIT));
            return capped;
          };
        }
      `,
        errors: [buildPropertyError('capAll', 'Repro')],
      },
      // Each member spelling renders its own subject noun: a getter is named a
      // getter and a function-valued property is named a property, so neither
      // falls through to the other's message (#1927)
      {
        code: `
        export class Repro {
          private static get multiplier() {
            const base = 2;
            const scaled = base * 3;
            return scaled;
          }

          private static computeAlt = (v: number) => {
            const doubled = v * 2;
            const capped = Math.min(doubled, 10);
            return capped;
          };
        }
      `,
        errors: [
          buildGetterError('multiplier', 'Repro'),
          buildPropertyError('computeAlt', 'Repro'),
        ],
      },
    ],
  },
);
