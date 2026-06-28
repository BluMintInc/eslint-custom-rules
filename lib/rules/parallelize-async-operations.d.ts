import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        sideEffectPatterns?: Array<string | RegExp>;
    }
];
export declare const parallelizeAsyncOperations: TSESLint.RuleModule<"parallelizeAsyncOperations", Options, TSESLint.RuleListener>;
export {};
