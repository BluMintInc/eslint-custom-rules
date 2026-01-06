import { TSESLint } from '@typescript-eslint/utils';
type RuleOptions = [
    {
        allowInTests?: boolean;
        allow?: string[];
    }?
];
export declare const enforceStorageContext: TSESLint.RuleModule<"useStorageContext", RuleOptions, TSESLint.RuleListener>;
export {};
