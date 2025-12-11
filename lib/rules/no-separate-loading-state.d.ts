import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        patterns?: string[];
    }?
];
export declare const noSeparateLoadingState: TSESLint.RuleModule<"separateLoadingState", Options, TSESLint.RuleListener>;
export {};
