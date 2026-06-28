import { TSESLint } from '@typescript-eslint/utils';
type EnforceFExtensionOptions = [
    {
        entryPoints?: string[];
    }
];
export declare const enforceFExtensionForEntryPoints: TSESLint.RuleModule<"requireFExtension", EnforceFExtensionOptions, TSESLint.RuleListener>;
export {};
