import { ruleTesterTs } from '../utils/ruleTester';
import { noUselessUseMemoprimitives } from '../rules/no-useless-usememo-primitives';

ruleTesterTs.run('no-useless-usememo-primitives', noUselessUseMemoprimitives, {
  valid: [
    // Objects and arrays should not be flagged
    {
      code: `const options = useMemo(() => ({ a, b }), [a, b]);`,
    },
    {
      code: `const list = useMemo(() => [a, b], [a, b]);`,
    },
    {
      code: `const config = useMemo(() => ({ mode: 'fast', enabled: true }), []);`,
    },

    // Functions should not be flagged (prefer useCallback rule handles this)
    {
      code: `const handler = useMemo(() => () => doThing(a), [a]);`,
    },
    {
      code: `const callback = useMemo(() => function() { return a + b; }, [a, b]);`,
    },

    // Non-deterministic functions should not be flagged
    {
      code: `const timestamp = useMemo(() => Date.now(), []);`,
    },
    {
      code: `const random = useMemo(() => Math.random(), []);`,
    },
    {
      code: `const now = useMemo(() => new Date(), []);`,
    },
    {
      code: `const id = useMemo(() => crypto.getRandomValues(new Uint32Array(1))[0], []);`,
    },

    // Side-effectful functions should not be flagged
    {
      code: `const logged = useMemo(() => { console.log('test'); return 'value'; }, []);`,
    },

    // Call expressions when ignoreCallExpressions is true (default)
    {
      code: `const result = useMemo(() => computeExpensiveValue(data), [data]);`,
    },
    {
      code: `const checksum = useMemo(() => computeChecksum(largeData), [largeData]);`,
    },
    {
      code: `const formatted = useMemo(() => formatCurrency(amount), [amount]);`,
    },

    // Complex callback bodies (multiple statements)
    {
      code: `const value = useMemo(() => {
        const temp = a + b;
        return temp * 2;
      }, [a, b]);`,
    },

    // Symbols when ignoreSymbol is true (default)
    {
      code: `const sym = useMemo(() => Symbol('test'), []);`,
    },
    {
      code: `const uniqueSym = useMemo(() => Symbol.for('unique'), []);`,
    },

    // Not useMemo calls
    {
      code: `const value = useCallback(() => 'test', []);`,
    },
    {
      code: `const value = useState('test');`,
    },
    {
      code: `const value = someOtherFunction(() => 'test', []);`,
    },

    // useMemo with non-function first argument
    {
      code: `const value = useMemo(someVariable, []);`,
    },
    {
      code: `const value = useMemo('not a function', []);`,
    },

    // Empty useMemo call
    {
      code: `const value = useMemo();`,
    },
  ],

  invalid: [
    // Basic primitive literals
    {
      code: `const label = useMemo(() => 'Hello World', []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const label = 'Hello World';`,
    },
    {
      code: `const count = useMemo(() => 42, []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const count = 42;`,
    },
    {
      code: `const isEnabled = useMemo(() => true, []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const isEnabled = true;`,
    },
    {
      code: `const nothing = useMemo(() => null, []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const nothing = null;`,
    },
    {
      code: `const undef = useMemo(() => undefined, []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const undef = undefined;`,
    },

    // Template literals
    {
      code: `const message = useMemo(() => \`Hello \${name}\`, [name]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const message = \`Hello \${name}\`;`,
    },
    {
      code: `const countText = useMemo(() => \`Count: \${count}\`, [count]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const countText = \`Count: \${count}\`;`,
    },

    // Conditional expressions returning primitives
    {
      code: `const label = useMemo(() => isPending ? 'Pending' : 'Complete', [isPending]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const label = isPending ? 'Pending' : 'Complete';`,
    },
    {
      code: `const status = useMemo(() => isActive ? 1 : 0, [isActive]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const status = isActive ? 1 : 0;`,
    },
    {
      code: `const flag = useMemo(() => condition ? true : false, [condition]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const flag = condition ? true : false;`,
    },

    // Logical expressions
    {
      code: `const isEnabled = useMemo(() => flagA && flagB, [flagA, flagB]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const isEnabled = flagA && flagB;`,
    },
    {
      code: `const hasAccess = useMemo(() => isAdmin || isOwner, [isAdmin, isOwner]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const hasAccess = isAdmin || isOwner;`,
    },

    // Arithmetic expressions
    {
      code: `const total = useMemo(() => a + b, [a, b]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const total = a + b;`,
    },
    {
      code: `const percentage = useMemo(() => (value / total) * 100, [value, total]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const percentage = (value / total) * 100;`,
    },

    // Comparison expressions
    {
      code: `const isGreater = useMemo(() => a > b, [a, b]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const isGreater = a > b;`,
    },
    {
      code: `const isEqual = useMemo(() => x === y, [x, y]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const isEqual = x === y;`,
    },

    // Unary expressions
    {
      code: `const negated = useMemo(() => -value, [value]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const negated = -value;`,
    },
    {
      code: `const inverted = useMemo(() => !flag, [flag]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const inverted = !flag;`,
    },
    {
      code: `const typeOf = useMemo(() => typeof value, [value]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const typeOf = typeof value;`,
    },

    // Block statement with single return
    {
      code: `const doubled = useMemo(() => {
        return value * 2;
      }, [value]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const doubled = value * 2;`,
    },
    {
      code: `const greeting = useMemo(() => {
        return \`Hello \${name}!\`;
      }, [name]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const greeting = \`Hello \${name}!\`;`,
    },

    // With TypeScript type parameters
    {
      code: `const value = useMemo<string>(() => 'test', []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const value = 'test';`,
    },
    {
      code: `const count = useMemo<number>(() => items.length, [items]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const count = items.length;`,
    },

    // Complex primitive expressions
    {
      code: `const result = useMemo(() => (a && b) || (c && d), [a, b, c, d]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const result = (a && b) || (c && d);`,
    },
    {
      code: `const computed = useMemo(() => x > 0 ? x * 2 : x / 2, [x]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const computed = x > 0 ? x * 2 : x / 2;`,
    },

    // Nested ternary returning primitives
    {
      code: `const status = useMemo(() =>
        loading ? 'loading' : error ? 'error' : 'success',
        [loading, error]
      );`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const status = loading ? 'loading' : error ? 'error' : 'success';`,
    },
  ],
});

// Test with ignoreCallExpressions: false
ruleTesterTs.run('no-useless-usememo-primitives with ignoreCallExpressions: false', noUselessUseMemoprimitives, {
  valid: [
    // Non-deterministic calls should still be ignored
    {
      code: `const timestamp = useMemo(() => Date.now(), []);`,
      options: [{ ignoreCallExpressions: false }],
    },
    {
      code: `const random = useMemo(() => Math.random(), []);`,
      options: [{ ignoreCallExpressions: false }],
    },
  ],

  invalid: [
    // Call expressions that return primitives should be flagged
    {
      code: `const length = useMemo(() => str.length, [str]);`,
      options: [{ ignoreCallExpressions: false }],
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const length = str.length;`,
    },
    {
      code: `const upper = useMemo(() => text.toUpperCase(), [text]);`,
      options: [{ ignoreCallExpressions: false }],
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const upper = text.toUpperCase();`,
    },
  ],
});

// Test with ignoreSymbol: false
ruleTesterTs.run('no-useless-usememo-primitives with ignoreSymbol: false', noUselessUseMemoprimitives, {
  valid: [],

  invalid: [
    // Symbols should be flagged when ignoreSymbol is false
    {
      code: `const sym = useMemo(() => Symbol('test'), []);`,
      options: [{ ignoreSymbol: false }],
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const sym = Symbol('test');`,
    },
  ],
});

// Edge cases and complex scenarios
ruleTesterTs.run('no-useless-usememo-primitives edge cases', noUselessUseMemoprimitives, {
  valid: [
    // Multiple statements in callback
    {
      code: `const value = useMemo(() => {
        console.log('computing');
        return a + b;
      }, [a, b]);`,
    },

    // Callback with no return statement
    {
      code: `const value = useMemo(() => {
        const temp = a + b;
      }, [a, b]);`,
    },

    // Callback returning object
    {
      code: `const config = useMemo(() => ({ enabled: true }), []);`,
    },

    // Callback returning array
    {
      code: `const items = useMemo(() => [1, 2, 3], []);`,
    },

    // React.useMemo (should work with qualified names)
    {
      code: `const value = React.useMemo(() => 'test', []);`,
    },

    // useMemo as property access
    {
      code: `const value = hooks.useMemo(() => 'test', []);`,
    },
  ],

  invalid: [
    // Simple cases that should be caught
    {
      code: `const simple = useMemo(() => 42, []);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const simple = 42;`,
    },

    // Parenthesized expressions
    {
      code: `const result = useMemo(() => (a + b), [a, b]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const result = a + b;`,
    },

    // String concatenation
    {
      code: `const fullName = useMemo(() => firstName + ' ' + lastName, [firstName, lastName]);`,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `const fullName = firstName + ' ' + lastName;`,
    },
  ],
});

// TypeScript-specific tests
ruleTesterTs.run('no-useless-usememo-primitives TypeScript', noUselessUseMemoprimitives, {
  valid: [
    // Union types with non-primitives should not be flagged
    {
      code: `
        type Value = string | { name: string };
        const value: Value = useMemo(() => condition ? 'string' : { name: 'object' }, [condition]);
      `,
    },

    // Generic types that might not be primitives
    {
      code: `
        function useValue<T>(getValue: () => T, deps: any[]): T {
          return useMemo(getValue, deps);
        }
      `,
    },
  ],

  invalid: [
    // Union of primitives should be flagged
    {
      code: `
        type Status = 'loading' | 'success' | 'error';
        const status: Status = useMemo(() => loading ? 'loading' : 'success', [loading]);
      `,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `
        type Status = 'loading' | 'success' | 'error';
        const status: Status = loading ? 'loading' : 'success';
      `,
    },

    // Literal types should be flagged
    {
      code: `
        const mode: 'light' | 'dark' = useMemo(() => isDark ? 'dark' : 'light', [isDark]);
      `,
      errors: [{ messageId: 'uselessUseMemo' }],
      output: `
        const mode: 'light' | 'dark' = isDark ? 'dark' : 'light';
      `,
    },
  ],
});
