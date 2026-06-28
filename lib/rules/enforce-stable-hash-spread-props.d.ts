import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        hashImport?: {
            source?: string;
            importName?: string;
        };
        allowedHashFunctions?: string[];
        hookNames?: string[];
    }?
];
export declare const enforceStableHashSpreadProps: TSESLint.RuleModule<"wrapSpreadPropsWithStableHash", Options, TSESLint.RuleListener>;
export {};
