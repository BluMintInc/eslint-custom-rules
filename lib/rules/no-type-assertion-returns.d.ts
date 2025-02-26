type MessageIds = 'noTypeAssertionReturns' | 'useExplicitVariable';
type Options = [
    {
        allowAsConst?: boolean;
        allowTypePredicates?: boolean;
    }
];
export declare const noTypeAssertionReturns: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
