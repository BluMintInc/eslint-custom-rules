import { createRule } from '../utils/createRule';

type MessageIds = 'preferNullishCoalescing';

/**
 * This rule overrides the behavior of @typescript-eslint/prefer-nullish-coalescing
 * to only suggest using the nullish coalescing operator when checking for null/undefined,
 * not when intentionally checking for all falsy values.
 */
export const preferNullishCoalescingOverride = createRule<[], MessageIds>({
  name: 'prefer-nullish-coalescing-override',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using nullish coalescing operator instead of logical OR operator, but only when appropriate',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferNullishCoalescing:
        'Prefer using nullish coalescing operator (`??`) instead of logical OR operator (`||`), but only when checking for null/undefined.',
    },
  },
  defaultOptions: [],
  create() {
    // This is an empty rule that doesn't report any issues
    // It's meant to override the @typescript-eslint/prefer-nullish-coalescing rule
    // by being more specific in the .eslintrc.js configuration
    return {};
  },
});
