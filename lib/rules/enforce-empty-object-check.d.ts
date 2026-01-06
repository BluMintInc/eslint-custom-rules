import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        objectNamePattern?: string[];
        ignoreInLoops?: boolean;
        emptyCheckFunctions?: string[];
    }
];
type MessageIds = 'missingEmptyObjectCheck';
export declare const enforceEmptyObjectCheck: TSESLint.RuleModule<MessageIds, Options>;
export {};
