import { TSESTree } from '@typescript-eslint/utils';
declare const enforceFirebaseImports: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"noDynamicImport", never[], {
    ImportDeclaration(node: TSESTree.ImportDeclaration): void;
}>;
export default enforceFirebaseImports;
