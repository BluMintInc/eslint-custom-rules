import { TSESTree, TSESLint } from '@typescript-eslint/utils';
export declare const noPassthroughGetters: TSESLint.RuleModule<"noPassthroughGetter", never[], {
    MethodDefinition(node: TSESTree.MethodDefinition): void;
}>;
