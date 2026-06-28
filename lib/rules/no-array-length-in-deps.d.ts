import { TSESLint } from '@typescript-eslint/utils';
export type MessageIds = 'noArrayLengthInDeps';
type Options = [
    {
        hashImport?: {
            source?: string;
            importName?: string;
        };
    }?
];
export declare const noArrayLengthInDeps: TSESLint.RuleModule<"noArrayLengthInDeps", Options, TSESLint.RuleListener>;
export {};
