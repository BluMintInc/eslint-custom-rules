type Options = [
    {
        ignoreCallExpressions?: boolean;
        ignoreSymbol?: boolean;
        tsOnly?: boolean;
    }
];
export declare const noUselessUsememoPrimitives: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"uselessUseMemoPrimitive", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default noUselessUsememoPrimitives;
