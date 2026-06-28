import { TSESTree } from '@typescript-eslint/utils';
declare const _default: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"useHttpsError" | "useProprietaryHttpsError", never[], {} | {
    ImportDeclaration(node: TSESTree.ImportDeclaration): void;
    ThrowStatement(node: TSESTree.ThrowStatement): void;
}>;
export = _default;
