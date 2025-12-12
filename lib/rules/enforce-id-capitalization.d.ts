import { TSESLint } from '@typescript-eslint/utils';

type MessageIds = 'enforceIdCapitalization';

/**
 * This rule ensures consistency in user-facing text by enforcing the use of "ID"
 * instead of "id" when referring to identifiers in UI labels, instructions,
 * error messages, and other visible strings.
 */
export declare const enforceIdCapitalization: TSESLint.RuleModule<
  MessageIds,
  [],
  TSESLint.RuleListener
>;

export {};
