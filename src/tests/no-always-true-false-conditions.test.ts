import { ruleTesterTs } from '../utils/ruleTester';
import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';

const formatAlwaysTrueMessage = (condition: string) =>
  `Condition "${condition}" is always true, so the guarded branch runs every time and hides logic errors or redundant checks. Remove the check or rewrite the condition so it depends on runtime values instead of constants.`;

const formatAlwaysFalseMessage = (condition: string) =>
  `Condition "${condition}" is always false, so the guarded branch is unreachable and leaves misleading or dead code. Remove the unreachable branch or adjust the condition so it can evaluate to true when intended.`;

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
    errors: [
      expectAlwaysFalse('"nonExistentProp" in { existingProp: true }'),
    ],
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
    errors: [
      expectAlwaysTrue(
        'new Date(2023, 0, 1) < new Date(2023, 0, 2)',
      ),
    ],
  },
  // Always false with Date comparisons
  {
    code: `
if (new Date(2023, 0, 2) < new Date(2023, 0, 1)) {
  doSomething();
}
`,
    errors: [
      expectAlwaysFalse(
        'new Date(2023, 0, 2) < new Date(2023, 0, 1)',
      ),
    ],
  },
  // Always true with Object methods
  {
    code: `
if (Object.keys({a: 1, b: 2}).length === 2) {
  doSomething();
}
`,
    errors: [
      expectAlwaysTrue('Object.keys({a: 1, b: 2}).length === 2'),
    ],
  },
  // Always false with Object methods
  {
    code: `
if (Object.keys({a: 1, b: 2}).length === 3) {
  doSomething();
}
`,
    errors: [
      expectAlwaysFalse('Object.keys({a: 1, b: 2}).length === 3'),
    ],
  },
  // Always true with JSON operations
  {
    code: `
if (JSON.stringify({a: 1}) === '{"a":1}') {
  doSomething();
}
`,
    errors: [
      expectAlwaysTrue('JSON.stringify({a: 1}) === \'{"a":1}\''),
    ],
  },
  // Always false with JSON operations
  {
    code: `
if (JSON.stringify({a: 1}) === '{"a":2}') {
  doSomething();
}
`,
    errors: [
      expectAlwaysFalse('JSON.stringify({a: 1}) === \'{"a":2}\''),
    ],
  },
  // Switch case comparison flagged as always false when using identifier
  {
    code: `
const value = "a";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
    errors: [expectAlwaysFalse('value')],
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
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invalid: [...invalidMapped, ...invalidRest] as any[],
  },
);
