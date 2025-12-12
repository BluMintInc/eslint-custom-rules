import { TSESTree } from '@typescript-eslint/utils';
export declare const noUnusedProps: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"unusedProp", never[], {
    TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration): void;
    VariableDeclaration(node: TSESTree.VariableDeclaration): void;
    'VariableDeclaration:exit'(node: never): void;
    JSXElement(): void;
    JSXFragment(): void;
    'Program:exit'(): void;
}>;
