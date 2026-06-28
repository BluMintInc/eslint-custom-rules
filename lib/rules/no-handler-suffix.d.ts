type Options = [
    {
        ignoreClassMethods?: boolean;
        ignoreInterfaceImplementations?: boolean;
        interfaceAllowlist?: string[];
        allowNames?: string[];
        allowPatterns?: string[];
        allowFilePatterns?: string[];
    }
];
export declare const noHandlerSuffix: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"handlerSuffix", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
