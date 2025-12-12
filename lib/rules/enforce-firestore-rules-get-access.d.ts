import { TSESLint } from '@typescript-eslint/utils';

type MessageIds = 'useGetAccess' | 'requireGetDefault';

/**
 * Rule to enforce proper usage of getAccess in Firestore security rules.
 */
export declare const enforceFirestoreRulesGetAccess: TSESLint.RuleModule<
  MessageIds,
  [],
  TSESLint.RuleListener
>;

export {};
