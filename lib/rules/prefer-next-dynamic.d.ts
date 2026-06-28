import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'preferNextDynamic' | 'addNextDynamicImport' | 'removeUseDynamicImport';
type Options = [
    {
        useDynamicSources?: string[];
    }?
];
export declare const preferNextDynamic: TSESLint.RuleModule<MessageIds, Options, TSESLint.RuleListener>;
export {};
