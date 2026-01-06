import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        object?: boolean;
        enforceForRenamedProperties?: boolean;
    }
];
export declare const preferDestructuringNoClass: TSESLint.RuleModule<"preferDestructuring", Options, TSESLint.RuleListener>;
export {};
