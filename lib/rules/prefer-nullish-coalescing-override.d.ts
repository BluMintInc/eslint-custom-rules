/**
 * This rule overrides the behavior of @typescript-eslint/prefer-nullish-coalescing
 * to only suggest using the nullish coalescing operator when checking for null/undefined,
 * not when intentionally checking for all falsy values.
 */
export declare const preferNullishCoalescingOverride: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"preferNullishCoalescing", [], import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
