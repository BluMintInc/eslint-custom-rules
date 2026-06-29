export declare const RULE_NAME = "enforce-dynamic-imports";
type Options = [
    {
        ignoredLibraries?: string[];
        allowImportType?: boolean;
    }
];
export declare const DEFAULT_IGNORED_LIBRARIES: string[];
declare const _default: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"dynamicImportRequired", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default _default;
