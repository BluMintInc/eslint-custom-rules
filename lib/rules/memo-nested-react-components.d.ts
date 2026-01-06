import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        ignorePatterns?: string[];
    }
];
export declare const memoNestedReactComponents: TSESLint.RuleModule<"memoizeNestedComponent", Options, TSESLint.RuleListener>;
export {};
