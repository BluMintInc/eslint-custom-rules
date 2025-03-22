export declare const RULE_NAME = "no-restricted-imports-dynamic";
type Options = [
    {
        paths?: (string | {
            name: string;
            message?: string;
            allowTypeImports?: boolean;
            allowDynamicImports?: boolean;
        })[];
        patterns?: (string | {
            group: string[];
            message?: string;
            caseSensitive?: boolean;
            allowTypeImports?: boolean;
            allowDynamicImports?: boolean;
        })[];
    } | (string | {
        name: string;
        message?: string;
        allowTypeImports?: boolean;
        allowDynamicImports?: boolean;
    })[]
];
declare const _default: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"restrictedImport" | "restrictedImportPattern", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default _default;
