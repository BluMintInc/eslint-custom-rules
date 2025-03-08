import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';
import { ruleTesterTs } from '../utils/ruleTester';

const invalidMapped = [
  // Always true literal in if statement
  `
if (true) {
  doSomething();
}
`,

  // Always false literal in if statement
  `
if (false) {
  doSomething();
}
`,

  // Always true numeric comparison
  `
if (2 > 1) {
  doSomething();
}
`,

  // Always false numeric comparison
  `
if (1 > 2) {
  doSomething();
}
`,

  // Always true string comparison
  `
if ("a" === "a") {
  doSomething();
}
`,

  // Always false string comparison
  `
if ("a" === "b") {
  doSomething();
}
`,

  // Always true with as const
  `
const GRAND_FINAL_MATCH_COUNT = 2 as const;
if (GRAND_FINAL_MATCH_COUNT > 1) {
  doSomething();
}
`,

  // Always false with as const
  `
const MAX_RETRIES = 3 as const;
if (MAX_RETRIES < 1) {
  retryOperation();
}
`,

  // Always true type check
  `
if (typeof "hello" === "string") {
  handleString();
}
`,

  // Always false type check
  `
if (typeof "hello" === "number") {
  handleNumber();
}
`,

  // Always true with object literal
  `
if ({}) {
  doSomething();
}
`,

  // Always true with array literal
  `
if ([]) {
  doSomething();
}
`,

  // Always true in ternary
  `
const value = true ? "yes" : "no";
`,

  // Always false in ternary
  `
const value = false ? "yes" : "no";
`,

  // Always true in while loop
  `
while (true) {
  doSomething();
  if (shouldBreak()) break;
}
`,

  // Always false in while loop
  `
while (false) {
  doSomething();
}
`,

  // Always true in do-while loop
  `
do {
  doSomething();
} while (true);
`,

  // Always false in do-while loop
  `
do {
  doSomething();
} while (false);
`,

  // Always true in for loop
  `
for (let i = 0; true; i++) {
  doSomething();
  if (shouldBreak()) break;
}
`,

  // Always false in for loop
  `
for (let i = 0; false; i++) {
  doSomething();
}
`,

  // Always true with negation
  `
if (!false) {
  doSomething();
}
`,

  // Always false with negation
  `
if (!true) {
  doSomething();
}
`,

  // Always true with double negation
  `
if (!!true) {
  doSomething();
}
`,

  // Always false with double negation
  `
if (!!false) {
  doSomething();
}
`,

  // Always true with logical AND
  `
if (true && true) {
  doSomething();
}
`,

  // Always false with logical AND
  `
if (true && false) {
  doSomething();
}
`,

  // Always false with logical AND (different order)
  `
if (false && true) {
  doSomething();
}
`,

  // Always true with logical OR
  `
if (true || false) {
  doSomething();
}
`,

  // Always true with logical OR (different order)
  `
if (false || true) {
  doSomething();
}
`,

  // Always false with logical OR
  `
if (false || false) {
  doSomething();
}
`,

  // Always true with optional chaining on literal
  `
const obj = { prop: "value" };
if (obj?.prop) {
  doSomething();
}
`,

  // Always true with instanceof
  `
if (new Date() instanceof Date) {
  doSomething();
}
`,

  // Always false with instanceof
  `
if (new Date() instanceof Array) {
  doSomething();
}
`,

  // Always true with in operator
  `
if ("toString" in {}) {
  doSomething();
}
`,

  // Always false with in operator
  `
if ("nonExistentProp" in { existingProp: true }) {
  doSomething();
}
`,

  // Always true with typeof null
  `
if (typeof null === "object") {
  doSomething();
}
`,

  // Always false with typeof null
  `
if (typeof null === "null") {
  doSomething();
}
`,

  // Always true with NaN checks
  `
if (NaN !== NaN) {
  doSomething();
}
`,

  // Always false with NaN checks
  `
if (NaN === NaN) {
  doSomething();
}
`,

  // Always true with Infinity checks
  `
if (Infinity > 0) {
  doSomething();
}
`,

  // Always false with Infinity checks
  `
if (Infinity < 0) {
  doSomething();
}
`,

  // Always true with void 0
  `
if (void 0 === undefined) {
  doSomething();
}
`,

  // Always false with void 0
  `
if (void 0 !== undefined) {
  doSomething();
}
`,

  // Always true with regex literals
  `
if (/abc/.test("abc")) {
  doSomething();
}
`,

  // Always false with regex literals
  `
if (/abc/.test("xyz")) {
  doSomething();
}
`,

  // Always true with array methods
  `
if ([1, 2, 3].includes(2)) {
  doSomething();
}
`,

  // Always false with array methods
  `
if ([1, 2, 3].includes(4)) {
  doSomething();
}
`,

  // Always true with string methods
  `
if ("hello".startsWith("he")) {
  doSomething();
}
`,

  // Always false with string methods
  `
if ("hello".startsWith("xy")) {
  doSomething();
}
`,

  // Always true with Date comparisons
  `
if (new Date(2023, 0, 1) < new Date(2023, 0, 2)) {
  doSomething();
}
`,

  // Always false with Date comparisons
  `
if (new Date(2023, 0, 2) < new Date(2023, 0, 1)) {
  doSomething();
}
`,

  // Always true with Object methods
  `
if (Object.keys({a: 1, b: 2}).length === 2) {
  doSomething();
}
`,

  // Always false with Object methods
  `
if (Object.keys({a: 1, b: 2}).length === 3) {
  doSomething();
}
`,

  // Always true with JSON operations
  `
if (JSON.stringify({a: 1}) === '{"a":1}') {
  doSomething();
}
`,

  // Always false with JSON operations
  `
if (JSON.stringify({a: 1}) === '{"a":2}') {
  doSomething();
}
`,

  // Always true with switch case comparison
  `
const value = "a";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,

  // Always false with switch case comparison
  `
const value = "b";
switch ("a") {
  case value:
    doSomething();
    break;
}
`,
].map((code) => {
  // Determine the appropriate message ID based on the expression
  const isAlwaysTrue =
    (code.includes('true') &&
      !code.includes('!true') &&
      !code.includes('!!false') &&
      !code.includes('false && true') &&
      !code.includes('true && false')) ||
    code.includes('2 > 1') ||
    code.includes('=== "string"') ||
    code.includes('{}') ||
    code.includes('[]') ||
    code.includes('"a" === "a"') ||
    code.includes('!false') ||
    code.includes('!!true') ||
    (code.includes('true || false') &&
      !code.includes('false && (true || false)')) ||
    code.includes('false || true') ||
    code.includes('true && true') ||
    (code.includes('(2 > 1) ||') && !code.includes('& (2 > 1)')) ||
    code.includes('new Date() instanceof Date') ||
    code.includes('"toString" in {}') ||
    code.includes('typeof null === "object"') ||
    code.includes('NaN !== NaN') ||
    code.includes('Infinity > 0') ||
    code.includes('void 0 === undefined') ||
    code.includes('/abc/.test("abc")') ||
    code.includes('[1, 2, 3].includes(2)') ||
    code.includes('"hello".startsWith("he")') ||
    code.includes('Math.max(1, 2) === 2') ||
    code.includes('new Date(2023, 0, 1) < new Date(2023, 0, 2)') ||
    code.includes('Object.keys({a: 1, b: 2}).length === 2') ||
    code.includes('JSON.stringify({a: 1}) === \'{"a":1}\'') ||
    (code.includes('GRAND_FINAL_MATCH_COUNT') && code.includes('> 1'));

  // Special cases for more complex expressions that need specific handling
  if (code.includes('!!false')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  if (code.includes('true && false') || code.includes('false && true')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  if (code.includes('false || false')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Complex nested expressions
  if (code.includes('true || (false && true)')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('false && (true || false)')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  if (code.includes('(2 > 1) || (3 === 3 && "a" !== "b")')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('(1 > 2) && (3 === 3 || "a" !== "b")')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Special case for property access
  if (code.includes('obj?.prop')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  // Template literal tests
  if (code.includes('`${"a"}${"b"}` === "ab"')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('`${"a"}${"b"}` === "cd"')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // The in operator should work correctly
  if (code.includes('"nonExistentProp" in { existingProp: true }')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Nullish coalescing
  if (code.includes('const value = "defined" ?? "default"')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  // Bitwise operations
  if (code.includes('(1 & 1) === 1')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('(1 & 0) === 1')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Math operations
  if (code.includes('Math.max(1, 2) === 2')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('Math.min(1, 2) === 2')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Date comparisons
  if (code.includes('new Date(2023, 0, 2) < new Date(2023, 0, 1)')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Object keys length
  if (code.includes('Object.keys({a: 1, b: 2}).length === 2')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('Object.keys({a: 1, b: 2}).length === 3')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // JSON stringify
  if (code.includes('JSON.stringify({a: 1}) === \'{"a":1}\'')) {
    return {
      code,
      errors: [{ messageId: 'alwaysTrueCondition' }],
    };
  }

  if (code.includes('JSON.stringify({a: 1}) === \'{"a":2}\'')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // String methods
  if (code.includes('"hello".startsWith("xy")')) {
    return {
      code,
      errors: [{ messageId: 'alwaysFalseCondition' }],
    };
  }

  // Default case
  return {
    code,
    errors: [
      {
        messageId: isAlwaysTrue
          ? 'alwaysTrueCondition'
          : 'alwaysFalseCondition',
      },
    ],
  };
});

const invalidRest = [
  // Always true condition in if statement (should still be flagged)
  {
    code: `
    if (true) {
      doSomething();
    }
    `,
    errors: [{ messageId: 'alwaysTrueCondition' }],
  },

  // Always false condition in if statement (should still be flagged)
  {
    code: `
    if (false) {
      doSomething();
    }
    `,
    errors: [{ messageId: 'alwaysFalseCondition' }],
  },

  // Always true comparison (should still be flagged)
  {
    code: `
    if (1 === 1) {
      doSomething();
    }
    `,
    errors: [{ messageId: 'alwaysTrueCondition' }],
  },

  // Always false comparison (should still be flagged)
  {
    code: `
    if (1 === 2) {
      doSomething();
    }
    `,
    errors: [{ messageId: 'alwaysFalseCondition' }],
  },

  // Always true ternary (should still be flagged)
  {
    code: `
    const result = true ? 'yes' : 'no';
    `,
    errors: [{ messageId: 'alwaysTrueCondition' }],
  },

  // Always false ternary (should still be flagged)
  {
    code: `
    const result = false ? 'yes' : 'no';
    `,
    errors: [{ messageId: 'alwaysFalseCondition' }],
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
