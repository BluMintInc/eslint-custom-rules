import { TSESLint, TSESTree } from '@typescript-eslint/utils';
export declare const noUnusedProps: TSESLint.RuleModule<"unusedProp", never[], {
    TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration): void;
    VariableDeclaration(node: TSESTree.VariableDeclaration): void;
    'VariableDeclaration:exit'(node: never): void;
    JSXElement(): void;
    JSXFragment(): void;
    'Program:exit'(): void;
}>;
