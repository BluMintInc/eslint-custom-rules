import { TSESTree } from '@typescript-eslint/utils';
export declare const RULE_NAME = "require-dynamic-firebase-imports";
declare const _default: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"requireDynamicImport", never[], {
    ImportDeclaration(node: TSESTree.ImportDeclaration): void;
}>;
export default _default;
