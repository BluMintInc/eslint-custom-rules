import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        readonly assertSafeImportPath?: string;
    }
];
export declare const enforceAssertSafeObjectKey: TSESLint.RuleModule<"useAssertSafe", Options, TSESLint.RuleListener>;
export {};
