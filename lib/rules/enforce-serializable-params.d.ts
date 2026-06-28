import { TSESTree } from '@typescript-eslint/utils';
declare const _default: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"nonSerializableParam" | "nonSerializableProperty", {
    additionalNonSerializableTypes: never[];
    functionTypes: string[];
}[], {
    TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration): void;
    TSTypeReference(node: TSESTree.TSTypeReference): void;
}>;
export default _default;
