type Options = [
    {
        allowComplexBodies?: boolean;
        allowFunctionFactories?: boolean;
    }
];
export declare const preferUseCallbackOverUseMemoForFunctions: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"preferUseCallback", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default preferUseCallbackOverUseMemoForFunctions;
