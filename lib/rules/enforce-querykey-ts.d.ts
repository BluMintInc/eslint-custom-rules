type MessageIds = 'enforceQueryKeyImport' | 'enforceQueryKeyConstant';
/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export declare const enforceQueryKeyTs: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, [], import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
