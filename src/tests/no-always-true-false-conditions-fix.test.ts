import { noAlwaysTrueFalseConditions } from '../rules/no-always-true-false-conditions';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'no-always-true-false-conditions-fix',
  noAlwaysTrueFalseConditions,
  {
    valid: [
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
    ],
    invalid: [
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
    ],
  },
);
