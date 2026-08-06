import { ruleTesterTs } from '../utils/ruleTester';
import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';

const formatAlwaysTrueMessage = (condition: string) =>
  `What's wrong → Condition "${condition}" is always true.\nWhy it matters → The guarded branch runs every time, which can hide logic errors and leave redundant checks.\nHow to fix → Remove the check, or rewrite "${condition}" so it depends on runtime values instead of constants.`;

const formatAlwaysFalseMessage = (condition: string) =>
  `What's wrong → Condition "${condition}" is always false.\nWhy it matters → The guarded branch is unreachable, which leaves misleading or dead code.\nHow to fix → Remove the unreachable branch, or adjust "${condition}" so it can evaluate to true when intended.`;

const expectAlwaysTrue = (condition: string) => ({
  message: formatAlwaysTrueMessage(condition),
});

const expectAlwaysFalse = (condition: string) => ({
  message: formatAlwaysFalseMessage(condition),
});

const invalidMapped = [
  // Always true literal in if statement
  {
    code: `
if (true) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('true')],
  },
  // Always false literal in if statement
  {
    code: `
if (false) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('false')],
  },
  // Always true numeric comparison
  {
    code: `
if (2 > 1) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('2 > 1')],
  },
  // Always false numeric comparison
  {
    code: `
if (1 > 2) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('1 > 2')],
  },
  // Always true string comparison
  {
    code: `
if ("a" === "a") {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('"a" === "a"')],
  },
  // Always false string comparison
  {
    code: `
if ("a" === "b") {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('"a" === "b"')],
  },
  // Always true with as const
  {
    code: `
const GRAND_FINAL_MATCH_COUNT = 2 as const;
if (GRAND_FINAL_MATCH_COUNT > 1) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('GRAND_FINAL_MATCH_COUNT > 1')],
  },
  // Always false with as const
  {
    code: `
const MAX_RETRIES = 3 as const;
if (MAX_RETRIES < 1) {
  retryOperation();
}
`,
    errors: [expectAlwaysFalse('MAX_RETRIES < 1')],
  },
  // Always true type check
  {
    code: `
if (typeof "hello" === "string") {
  handleString();
}
`,
    errors: [expectAlwaysTrue('typeof "hello" === "string"')],
  },
  // Always false type check
  {
    code: `
if (typeof "hello" === "number") {
  handleNumber();
}
`,
    errors: [expectAlwaysFalse('typeof "hello" === "number"')],
  },
  // Always true with object literal
  {
    code: `
if ({}) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('{}')],
  },
  // Always true with array literal
  {
    code: `
if ([]) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('[]')],
  },
  // Always true in ternary
  {
    code: `
const value = true ? "yes" : "no";
`,
    errors: [expectAlwaysTrue('true')],
  },
  // Always false in ternary
  {
    code: `
const value = false ? "yes" : "no";
`,
    errors: [expectAlwaysFalse('false')],
  },
  // Always true in while loop
  {
    code: `
while (true) {
  doSomething();
  if (shouldBreak()) break;
}
`,
    errors: [expectAlwaysTrue('true')],
  },
  // Always false in while loop
  {
    code: `
while (false) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('false')],
  },
  // Always true in do-while loop
  {
    code: `
do {
  doSomething();
} while (true);
`,
    errors: [expectAlwaysTrue('true')],
  },
  // Always false in do-while loop
  {
    code: `
do {
  doSomething();
} while (false);
`,
    errors: [expectAlwaysFalse('false')],
  },
  // Always true in for loop
  {
    code: `
for (let i = 0; true; i++) {
  doSomething();
  if (shouldBreak()) break;
}
`,
    errors: [expectAlwaysTrue('true')],
  },
  // Always false in for loop
  {
    code: `
for (let i = 0; false; i++) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('false')],
  },
  // Always true with negation
  {
    code: `
if (!false) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('!false')],
  },
  // Always false with negation
  {
    code: `
if (!true) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('!true')],
  },
  // Always true with double negation
  {
    code: `
if (!!true) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('!!true')],
  },
  // Always false with double negation
  {
    code: `
if (!!false) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('!!false')],
  },
  // Always true with logical AND
  {
    code: `
if (true && true) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('true && true')],
  },
  // Always false with logical AND
  {
    code: `
if (true && false) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('true && false')],
  },
  // Always false with logical AND (different order)
  {
    code: `
if (false && true) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('false && true')],
  },
  // Always true with logical OR
  {
    code: `
if (true || false) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('true || false')],
  },
  // Always true with logical OR (different order)
  {
    code: `
if (false || true) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('false || true')],
  },
  // Always false with logical OR
  {
    code: `
if (false || false) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('false || false')],
  },
  // Always true with optional chaining on literal
  {
    code: `
const obj = { prop: "value" };
if (obj?.prop) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('obj?.prop')],
  },
  // Always true with instanceof
  {
    code: `
if (new Date() instanceof Date) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('new Date() instanceof Date')],
  },
  // Always false with instanceof
  {
    code: `
if (new Date() instanceof Array) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('new Date() instanceof Array')],
  },
  // Always true with in operator
  {
    code: `
if ("toString" in {}) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('"toString" in {}')],
  },
  // Always false with in operator
  {
    code: `
if ("nonExistentProp" in { existingProp: true }) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('"nonExistentProp" in { existingProp: true }')],
  },
  // Always true with typeof null
  {
    code: `
if (typeof null === "object") {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('typeof null === "object"')],
  },
  // Always false with typeof null
  {
    code: `
if (typeof null === "null") {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('typeof null === "null"')],
  },
  // Always true with NaN checks
  {
    code: `
if (NaN !== NaN) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('NaN !== NaN')],
  },
  // Always false with NaN checks
  {
    code: `
if (NaN === NaN) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('NaN === NaN')],
  },
  // Always true with Infinity checks
  {
    code: `
if (Infinity > 0) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('Infinity > 0')],
  },
  // Always false with Infinity checks
  {
    code: `
if (Infinity < 0) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Infinity < 0')],
  },
  // Always true with void 0
  {
    code: `
if (void 0 === undefined) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('void 0 === undefined')],
  },
  // Always false with void 0
  {
    code: `
if (void 0 !== undefined) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('void 0 !== undefined')],
  },
  // Always true with regex literals
  {
    code: `
if (/abc/.test("abc")) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('/abc/.test("abc")')],
  },
  // Always false with regex literals
  {
    code: `
if (/abc/.test("xyz")) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('/abc/.test("xyz")')],
  },
  // Always true with array methods
  {
    code: `
if ([1, 2, 3].includes(2)) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('[1, 2, 3].includes(2)')],
  },
  // Always false with array methods
  {
    code: `
if ([1, 2, 3].includes(4)) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('[1, 2, 3].includes(4)')],
  },
  // Always true with string methods
  {
    code: `
if ("hello".startsWith("he")) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('"hello".startsWith("he")')],
  },
  // Always false with string methods
  {
    code: `
if ("hello".startsWith("xy")) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('"hello".startsWith("xy")')],
  },
  // Always true with Date comparisons
  {
    code: `
if (new Date(2023, 0, 1) < new Date(2023, 0, 2)) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('new Date(2023, 0, 1) < new Date(2023, 0, 2)')],
  },
  // Always false with Date comparisons
  {
    code: `
if (new Date(2023, 0, 2) < new Date(2023, 0, 1)) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('new Date(2023, 0, 2) < new Date(2023, 0, 1)')],
  },
  // Always true with Object methods
  {
    code: `
if (Object.keys({a: 1, b: 2}).length === 2) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('Object.keys({a: 1, b: 2}).length === 2')],
  },
  // Always false with Object methods
  {
    code: `
if (Object.keys({a: 1, b: 2}).length === 3) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Object.keys({a: 1, b: 2}).length === 3')],
  },
  // Always true with JSON operations
  {
    code: `
if (JSON.stringify({a: 1}) === '{"a":1}') {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('JSON.stringify({a: 1}) === \'{"a":1}\'')],
  },
  // Always false with JSON operations
  {
    code: `
if (JSON.stringify({a: 1}) === '{"a":2}') {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('JSON.stringify({a: 1}) === \'{"a":2}\'')],
  },
  // Switch case comparison flagged as always true when identifier matches literal
  {
    code: `
const value = "a";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // Switch case comparison flagged as always false with different identifier value
  {
    code: `
const value = "b";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysFalse('value')],
  },
  // Switch case comparison flagged when identifier holds null literal
  {
    code: `
const value = null;
switch (null) {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // "as const" makes the case value more certain, not less
  {
    code: `
const value = "a" as const;
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // A "satisfies" annotation leaves the case value untouched
  {
    code: `
const value = "b" satisfies string;
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysFalse('value')],
  },
  // A non-null assertion leaves the case value untouched
  {
    code: `
const value = "a"!;
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // An angle-bracket assertion leaves the case value untouched
  {
    code: `
const value = <string>"a";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // Stacked assertions still resolve to the literal underneath
  {
    code: `
const value = ("a" as const) satisfies string;
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('value')],
  },
  // Literal discriminant against a MATCHING literal case test. Spelling the case
  // test as a literal rather than an identifier is what reaches the
  // literal-vs-literal branch instead of the identifier-resolution one.
  {
    code: `
switch ("a") {
  case "a":
    doSomething();
    break;
}
`,
    errors: [expectAlwaysTrue('"a"')],
  },
  // Literal discriminant against a NON-matching literal case test
  {
    code: `
switch (42) {
  case 99:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysFalse('99')],
  },
  // "as const" around a compared literal
  {
    code: `
if (("a" as const) === "a") {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('("a" as const) === "a"')],
  },
  // "satisfies" around a compared literal
  {
    code: `
if (("a" satisfies string) === "b") {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('("a" satisfies string) === "b"')],
  },
  // Assertions around numeric operands still fold
  {
    code: `
if ((2 as const) > (1 as number)) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('(2 as const) > (1 as number)')],
  },
  // An asserted object literal is still an object literal
  {
    code: `
if ({ a: 1 } as const) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('{ a: 1 } as const')],
  },
  // Optional chaining resolves regardless of how the binding is named
  {
    code: `
const thing = { prop: "value" };
if (thing?.prop) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('thing?.prop')],
  },
  // Optional chaining resolves regardless of how the property is named
  {
    code: `
const data = { items: [1, 2, 3] };
if (data?.items) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('data?.items')],
  },
  // A resolved property holding a falsy literal is always false
  {
    code: `
const flags = { enabled: "" };
if (flags?.enabled) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('flags?.enabled')],
  },
  // "as const" does not hide the object literal behind the binding
  {
    code: `
const config = { enabled: true } as const;
if (config?.enabled) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('config?.enabled')],
  },
  // A literal computed key resolves like a static one
  {
    code: `
const settings = { mode: "dark" };
if (settings?.["mode"]) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('settings?.["mode"]')],
  },
  // A quoted key in the object literal resolves too
  {
    code: `
const settings = { "mode": "dark" };
if (settings?.mode) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('settings?.mode')],
  },
  // The last declaration of a duplicated key wins
  {
    code: `
const settings = { mode: "dark", ["mode"]: "" };
if (settings?.mode) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('settings?.mode')],
  },
  // A binding declared in an enclosing scope resolves too
  {
    code: `
const feature = { flag: true };
function render() {
  if (feature?.flag) {
    doSomething();
  }
}
`,
    errors: [expectAlwaysTrue('feature?.flag')],
  },
  // An inline object literal resolves through the same path
  {
    code: `
if ({ prop: "value" }?.prop) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('{ prop: "value" }?.prop')],
  },
  // A property holding a nested object literal is always truthy
  {
    code: `
const registry = { entries: { first: 1 } };
if (registry?.entries) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('registry?.entries')],
  },
  // A property holding an empty template literal is always falsy
  {
    code: `
const labels = { title: \`\` };
while (labels?.title) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('labels?.title')],
  },
  // The optional chain resolves in a ternary test as well
  {
    code: `
const thing = { prop: 0 };
const result = thing?.prop ? "yes" : "no";
`,
    errors: [expectAlwaysFalse('thing?.prop')],
  },
];

const invalidRest = [
  // Always true condition in if statement (should still be flagged)
  {
    code: `
    if (true) {
      doSomething();
    }
    `,
    errors: [expectAlwaysTrue('true')],
  },

  // Always false condition in if statement (should still be flagged)
  {
    code: `
    if (false) {
      doSomething();
    }
    `,
    errors: [expectAlwaysFalse('false')],
  },

  // Always true comparison (should still be flagged)
  {
    code: `
    if (1 === 1) {
      doSomething();
    }
    `,
    errors: [expectAlwaysTrue('1 === 1')],
  },

  // Always false comparison (should still be flagged)
  {
    code: `
    if (1 === 2) {
      doSomething();
    }
    `,
    errors: [expectAlwaysFalse('1 === 2')],
  },

  // Always true ternary (should still be flagged)
  {
    code: `
    const result = true ? 'yes' : 'no';
    `,
    errors: [expectAlwaysTrue('true')],
  },

  // Always false ternary (should still be flagged)
  {
    code: `
    const result = false ? 'yes' : 'no';
    `,
    errors: [expectAlwaysFalse('false')],
  },
  {
    code: `
if (Math.max(1, 2) === 0) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Math.max(1, 2) === 0')],
  },
  {
    code: `
if (Math.min(1, 2) === 1) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('Math.min(1, 2) === 1')],
  },
  {
    code: `
if (0 === Math.max(1, 2)) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('0 === Math.max(1, 2)')],
  },
  {
    code: `
while (Math.max(1, 2) > 5) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Math.max(1, 2) > 5')],
  },

  // Bare Math.max call as the whole condition keeps reporting
  {
    code: `
if (Math.max(1, 2)) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('Math.max(1, 2)')],
  },

  // Math comparison inside a ternary test
  {
    code: `
const result = Math.max(1, 2) === 0 ? 'yes' : 'no';
`,
    errors: [expectAlwaysFalse('Math.max(1, 2) === 0')],
  },

  // Negated Math comparison
  {
    code: `
if (!(Math.max(1, 2) === 0)) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('!(Math.max(1, 2) === 0)')],
  },

  // Inequality against the folded Math result
  {
    code: `
if (Math.min(4, 7) !== 4) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Math.min(4, 7) !== 4')],
  },

  // Relational operators against the folded Math result
  {
    code: `
if (Math.min(3, 9) <= 3) {
  doSomething();
}
`,
    errors: [expectAlwaysTrue('Math.min(3, 9) <= 3')],
  },

  // Math call on both sides of the comparison
  {
    code: `
if (Math.max(1, 2) < Math.min(1, 2)) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Math.max(1, 2) < Math.min(1, 2)')],
  },

  // Math comparison inside a for loop test
  {
    code: `
for (let i = 0; Math.max(1, 2) >= 5; i++) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('Math.max(1, 2) >= 5')],
  },

  // A constant-false Math comparison short-circuits the whole conjunction
  {
    code: `
if (foo && Math.max(1, 2) === 0) {
  doSomething();
}
`,
    errors: [expectAlwaysFalse('foo && Math.max(1, 2) === 0')],
  },
];

ruleTesterTs.run(
  'no-always-true-false-conditions',
  noAlwaysTrueFalseConditions,
  {
    valid: [
      // Test case for the bug with optional chaining on array length
      `
      function countOwned() {
        const filtered = itemsInFirestore.filter((token) => {
          return \`\${token.contract.itemId}\` === \`\${identifier}\`;
        });
        if (filtered?.length) {
          return filtered[0]?.amount || 0;
        }
        return 0;
      }
      `,
      // Test case for object property access with OR operator for default value
      `
      const roles = (channel.data?.roles || {}) as RoleMap<T>;
      `,

      // Test case for array property access with OR operator for default value
      `
      return (roles[assertSafe(role)] || []).includes(uid);
      `,

      // Test case for nested property access with OR operator
      `
      const value = (obj.prop?.subProp || {}).value;
      `,

      // Test case for function result with OR operator
      `
      const result = (getResult() || {}).value;
      `,

      // Common patterns for default values
      `
      const safeArray = items || [];
      `,

      `
      const safeObject = config || {};
      `,

      `
      const safeString = message || '';
      `,

      `
      const safeNumber = count || 0;
      `,

      `
      const safeBool = isEnabled ?? false;
      `,

      // Variable used in both condition and value in ternary
      `
      const displayName = username ? username : 'Anonymous';
      `,

      // Variable used in both condition and value in logical OR
      `
      const safeConfig = config || { defaults: true };
      `,

      // Variable used in both condition and value in logical AND
      `
      const filteredItems = items && items.filter(item => item.isActive);
      `,

      // Destructuring with default values
      `
      const { name = 'Unknown', age = 0 } = user || {};
      `,

      // Function parameters with default values
      `
      function processUser(user = defaultUser) {
        return user;
      }
      `,

      // Arrow function with default parameters
      `
      const getDisplayName = (user = {}) => user.name || 'Guest';
      `,

      // Default values in object destructuring
      `
      const { count = 0, label = '' } = props;
      `,

      // Default values in array destructuring
      `
      const [first = 'default', second = 0] = array;
      `,

      // Logical OR in return statement
      `
      function getName() {
        return username || 'Anonymous';
      }
      `,

      // Nullish coalescing in return statement
      `
      function getConfig() {
        return userConfig ?? defaultConfig;
      }
      `,

      // Ternary in return statement with variable used in both condition and value
      `
      function getStatus() {
        return status ? status : 'unknown';
      }
      `,

      // Logical OR in variable assignment
      `
      let options = userOptions || defaultOptions;
      `,

      // Nullish coalescing in variable assignment
      `
      let theme = preferredTheme ?? 'light';
      `,

      // Ternary in variable assignment with variable used in both condition and value
      `
      let displayMode = mode ? mode : 'default';
      `,

      // Function call with default value
      `
      const result = processData(data || defaultData);
      `,

      // Object property with default value
      `
      const config = {
        timeout: timeout || 5000,
        retries: retries || 3,
        baseUrl: baseUrl || 'https://api.example.com'
      };
      `,

      // Array with default values
      `
      const items = [
        first || 'default',
        second || 0,
        third || true
      ];
      `,

      // Complex logical expressions for defaults
      `
      const value = primary || secondary || tertiary || 'default';
      `,

      // Conditional expression with logical operators
      `
      if (isEnabled && (count || 0) > threshold) {
        doSomething();
      }
      `,

      // Template literal with default value
      `
      const greeting = \`Hello, \${name || 'Guest'}\`;
      `,

      // Function with multiple default parameters
      `
      function configure(options = {}, timeout = 1000, callback = () => {}) {
        return { ...options, timeout, callback };
      }
      `,

      // Spread with default value
      `
      const mergedConfig = {
        ...baseConfig,
        ...userConfig || {}
      };
      `,

      // Conditional chain with default
      `
      const length = array?.length || 0;
      `,

      // Nested ternary with default values
      `
      const status = isPrimary
        ? primary || 'default'
        : isSecondary
          ? secondary || 'fallback'
          : 'none';
      `,

      // Default value in callback
      `
      items.map(item => item || defaultItem);
      `,

      // Default value in filter
      `
      const validItems = items.filter(item => item?.isValid || false);
      `,
      // Dynamic conditions
      `
    const x = getValue();
    if (x > 0) {
      doSomething();
    }
    `,

      // Valid type narrowing
      `
    function process(input: unknown) {
      if (typeof input === "string") {
        return input.toLowerCase();
      }
    }
    `,

      // Valid comparison with dynamic values
      `
    const MIN_PLAYERS = 2 as const;
    const playerCount = getPlayerCount();
    if (playerCount < MIN_PLAYERS) {
      showError();
    }
    `,

      // Valid nullable checks
      `
    const maybeObj: object | null = getObject();
    if (maybeObj) {
      useObject(maybeObj);
    }
    `,

      // Valid dynamic array checks
      `
    const items = fetchItems();
    if (items.length > 0) {
      processItems(items);
    }
    `,

      // Valid switch case with dynamic value
      `
    const status = getStatus();
    switch (status) {
      case 'active':
        handleActive();
        break;
      case 'pending':
        handlePending();
        break;
    }
    `,

      // Valid ternary with dynamic condition
      `
    const value = isEnabled() ? "enabled" : "disabled";
    `,

      // Valid logical expressions with dynamic values
      `
    if (isValid() && hasPermission()) {
      proceed();
    }
    `,

      // Valid dynamic logical expressions with short-circuit
      `
    if (getCondition() && evaluateExpression()) {
      doSomething();
    }
    `,

      // Valid dynamic nullish coalescing
      `
    const value = getValue() ?? defaultValue;
    `,

      // Valid dynamic optional chaining
      `
    const value = obj?.prop?.method?.();
    `,

      // Valid dynamic template literal condition
      `
    if (\`\${getPrefix()}-\${getSuffix()}\` === expectedValue) {
      doSomething();
    }
    `,

      // Valid dynamic bitwise operations
      `
    if ((getFlags() & PERMISSION_READ) !== 0) {
      allowReading();
    }
    `,

      // Valid dynamic instanceof check
      `
    if (obj instanceof getExpectedClass()) {
      handleInstance(obj);
    }
    `,

      // Valid dynamic in operator
      `
    if (propertyName in getDynamicObject()) {
      accessProperty(propertyName);
    }
    `,

      // Valid dynamic spread with conditional
      `
    const config = {
      ...baseConfig,
      ...(isProduction() ? productionConfig : developmentConfig)
    };
    `,

      // Valid dynamic destructuring with default values
      `
    const { value = getDefaultValue() } = options;
    `,

      // Valid dynamic array methods with conditions
      `
    const filteredItems = items.filter(item => isVisible(item) && matchesSearch(item));
    `,

      // Valid dynamic promise conditions
      `
    async function fetchData() {
      if (await isDataAvailable()) {
        return fetchFromSource();
      }
      return fetchFromCache();
    }
    `,

      // Valid dynamic regex test
      `
    if (/^[a-z]+$/.test(getDynamicString())) {
      validateInput();
    }
    `,

      // Valid dynamic date comparison
      `
    if (new Date() > getTargetDate()) {
      handleExpired();
    }
    `,

      // Math call with a runtime argument stays unresolved
      `
    if (Math.max(x, 2) === 0) {
      doSomething();
    }
    `,

      // Spread arguments hide the operand values
      `
    if (Math.max(...arr) === 0) {
      doSomething();
    }
    `,

      // Argument-less Math calls are left alone
      `
    if (Math.max() === 0) {
      doSomething();
    }
    `,

      // Single-argument Math calls are left alone
      `
    if (Math.max(1) === 1) {
      doSomething();
    }
    `,

      // A Math result stored in a variable is not folded through the binding
      `
    const largest = Math.max(1, 2);
    if (largest === 0) {
      doSomething();
    }
    `,

      // Folded Math result compared against a runtime value
      `
    if (Math.max(1, 2) === getThreshold()) {
      doSomething();
    }
    `,

      // Computed member access resolves at runtime, so it is not Math.max
      `
    const max = pickMathMethod();
    if (Math[max](1, 2) === 1) {
      doSomething();
    }
    `,

      // Unrelated Math methods stay unresolved
      `
    if (Math.random() === 0) {
      doSomething();
    }
    `,

      // Non-numeric Math arguments stay unresolved
      `
    if (Math.max('1', '2') === 0) {
      doSomething();
    }
    `,

      // Optional chaining guards a binding that really can be undefined
      `
    let thing: { prop: string } | undefined;
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A declared binding carries no initializer to resolve
      `
    declare const thing: { prop: string } | undefined;
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A call result is not an object literal
      `
    const thing = getThing();
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A property absent from the literal can still come from the prototype
      `
    const thing = { other: 1 };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A spread can contribute or overwrite the property
      `
    const thing = { ...base, prop: 'value' };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A key computed at runtime hides which property is read
      `
    const thing = { prop: 'value' };
    if (thing?.[key]) {
      doSomething();
    }
    `,

      // An accessor returns whatever it likes
      `
    const thing = { get prop() { return compute(); } };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A shorthand property carries a runtime value
      `
    const thing = { prop };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A property holding a call result stays unresolved
      `
    const thing = { prop: compute() };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A const binds the reference, not the object: the property is rewritten
      `
    const thing = { prop: 'value' };
    thing.prop = compute();
    if (thing?.prop) {
      doSomething();
    }
    `,

      // The property is incremented before the check
      `
    const counters = { count: 1 };
    counters.count++;
    if (counters?.count) {
      doSomething();
    }
    `,

      // The property is deleted before the check
      `
    const thing = { prop: 'value' };
    delete thing.prop;
    if (thing?.prop) {
      doSomething();
    }
    `,

      // The object escapes to code that can mutate it
      `
    const thing = { prop: 'value' };
    register(thing);
    if (thing?.prop) {
      doSomething();
    }
    `,

      // A reassignable binding is not a constant
      `
    let thing = { prop: 'value' };
    if (thing?.prop) {
      doSomething();
    }
    `,

      // An optional call is not a property read the rule resolves
      `
    const thing = { prop: 'value' };
    if (thing?.prop?.()) {
      doSomething();
    }
    `,
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invalid: [...invalidMapped, ...invalidRest] as any[],
  },
);
