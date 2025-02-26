import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-always-true-false-conditions', noAlwaysTrueFalseConditions, {
  valid: [
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
    if (`${getPrefix()}-${getSuffix()}` === expectedValue) {
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
  invalid: [
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

    // Always true with mixed logical operators
    `
    if (true || (false && true)) {
      doSomething();
    }
    `,

    // Always false with mixed logical operators
    `
    if (false && (true || false)) {
      doSomething();
    }
    `,

    // Always true with complex logical expression
    `
    if ((2 > 1) || (3 === 3 && "a" !== "b")) {
      doSomething();
    }
    `,

    // Always false with complex logical expression
    `
    if ((1 > 2) && (3 === 3 || "a" !== "b")) {
      doSomething();
    }
    `,

    // Always true with nullish coalescing
    `
    const value = "defined" ?? "default";
    if (value) {
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

    // Always true with template literals
    `
    if (`${"a"}${"b"}` === "ab") {
      doSomething();
    }
    `,

    // Always false with template literals
    `
    if (`${"a"}${"b"}` === "cd") {
      doSomething();
    }
    `,

    // Always true with bitwise operations
    `
    if ((1 & 1) === 1) {
      doSomething();
    }
    `,

    // Always false with bitwise operations
    `
    if ((1 & 0) === 1) {
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

    // Always true with Math operations
    `
    if (Math.max(1, 2) === 2) {
      doSomething();
    }
    `,

    // Always false with Math operations
    `
    if (Math.min(1, 2) === 2) {
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
    // For simplicity, we're assuming all invalid cases trigger the appropriate message
    // In a real implementation, you might want to be more specific about which message is expected
    const isAlwaysTrue = (code.includes('true') && !code.includes('!true') && !code.includes('!!false')) ||
                         code.includes('2 > 1') ||
                         code.includes('=== "string"') ||
                         code.includes('{}') ||
                         code.includes('[]') ||
                         code.includes('"a" === "a"') ||
                         code.includes('!false') ||
                         code.includes('!!true') ||
                         code.includes('true || false') ||
                         code.includes('false || true') ||
                         code.includes('true && true') ||
                         code.includes('(2 > 1) ||') ||
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

    return {
      code,
      errors: [
        {
          messageId: isAlwaysTrue ? 'alwaysTrueCondition' : 'alwaysFalseCondition',
        },
      ],
    };
  }),
});
