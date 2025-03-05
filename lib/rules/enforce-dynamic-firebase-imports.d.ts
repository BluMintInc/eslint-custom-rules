import { TSESTree } from '@typescript-eslint/utils';
export declare const enforceFirebaseImports: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"noDynamicImport", never[], {
    ImportDeclaration(node: TSESTree.ImportDeclaration): void;
}>;
