import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        allowRecursiveFunctions?: boolean;
        allowOverloadedFunctions?: boolean;
        allowInterfaceMethodSignatures?: boolean;
        allowAbstractMethodSignatures?: boolean;
        allowDtsFiles?: boolean;
        allowFirestoreFunctionFiles?: boolean;
    }
];
export declare const noExplicitReturnType: TSESLint.RuleModule<'noExplicitReturnType', Options>;
export {};
