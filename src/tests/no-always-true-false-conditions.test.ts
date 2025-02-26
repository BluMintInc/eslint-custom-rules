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
  ].map((code) => {
    // For simplicity, we're assuming all invalid cases trigger the appropriate message
    // In a real implementation, you might want to be more specific about which message is expected
    const isAlwaysTrue = (code.includes('true') && !code.includes('!true')) ||
                         code.includes('2 > 1') ||
                         code.includes('=== "string"') ||
                         code.includes('{}') ||
                         code.includes('[]') ||
                         code.includes('"a" === "a"') ||
                         code.includes('!false') ||
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
