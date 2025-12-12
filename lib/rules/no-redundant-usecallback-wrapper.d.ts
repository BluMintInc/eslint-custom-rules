type Options = [
    {
        memoizedHookNames?: string[];
        assumeAllUseAreMemoized?: boolean;
    }
];
export declare const noRedundantUseCallbackWrapper: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"redundantWrapper", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default noRedundantUseCallbackWrapper;
