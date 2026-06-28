import type { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        prefixes?: string[];
        ignoreOverriddenGetters?: boolean;
    }
];
export declare const enforceBooleanNamingPrefixes: TSESLint.RuleModule<"missingBooleanPrefix", Options, TSESLint.RuleListener>;
export {};
