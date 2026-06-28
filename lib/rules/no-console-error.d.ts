import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        ignorePatterns?: string[];
        allowWithUseAlertDialog?: boolean;
    }
];
export declare const noConsoleError: TSESLint.RuleModule<"noConsoleError", Options, TSESLint.RuleListener>;
export {};
