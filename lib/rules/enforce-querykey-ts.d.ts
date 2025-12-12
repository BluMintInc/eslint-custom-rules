import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'enforceQueryKeyImport' | 'enforceQueryKeyConstant';
/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export declare const enforceQueryKeyTs: TSESLint.RuleModule<MessageIds, [], TSESLint.RuleListener>;
export {};
