import { TSESTree } from '@typescript-eslint/utils';
export declare const noPassthroughGetters: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"noPassthroughGetter", never[], {
    MethodDefinition(node: TSESTree.MethodDefinition): void;
}>;
