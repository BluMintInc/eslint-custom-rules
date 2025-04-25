import { ruleTesterTs } from '../utils/ruleTester';
import { preferNullishCoalescingOverride } from '../rules/prefer-nullish-coalescing-override';

ruleTesterTs.run('prefer-nullish-coalescing-override', preferNullishCoalescingOverride, {
  valid: [
    // Boolean contexts (should not suggest nullish coalescing)
    {
      code: 'if (isMatchMember || isTournamentAdmin) { console.log("Has access"); }',
    },
    {
      code: 'const element = (isMatchMember || isTournamentAdmin) && renderButton();',
    },
    {
      code: 'const canEdit = isOwner || hasEditPermission;',
    },
    {
      code: 'while (retryCount < 3 || !success) { retry(); }',
    },
    {
      code: 'const isValid = !!(value || defaultValue);',
    },
    {
      code: 'return condition1 || condition2 ? valueA : valueB;',
    },

    // Default values for strings (should not suggest nullish coalescing)
    {
      code: 'const displayName = username || "Anonymous";',
    },
    {
      code: 'const greeting = (firstName || "Guest") + " " + (lastName || "");',
    },
    {
      code: 'function greet(name) { return "Hello, " + (name || "Anonymous"); }',
    },

    // JSX-like contexts (should not suggest nullish coalescing)
    {
      code: 'const element = renderElement(message || "No message available");',
    },
    {
      code: 'const button = renderButton({ disabled: isLoading || isDisabled });',
    },

    // Function parameters (should not suggest nullish coalescing)
    {
      code: 'function process(options = {}) { const config = options.config || defaultConfig; }',
    },

    // Array methods with callbacks (should not suggest nullish coalescing)
    {
      code: 'items.filter(item => item.isActive || item.isPending)',
    },
    {
      code: 'users.map(user => user.fullName || user.username)',
    },

    // Nullish coalescing is already used correctly
    {
      code: 'const value = maybeNull ?? defaultValue;',
    },
    {
      code: 'const config = options?.advanced?.timeout ?? 1000;',
    },
  ],

  invalid: [
    // This rule doesn't report any issues itself, it just overrides the TypeScript ESLint rule
  ],
});
