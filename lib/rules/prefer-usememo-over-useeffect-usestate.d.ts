import { TSESTree } from '@typescript-eslint/utils';
export declare const preferUseMemoOverUseEffectUseState: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"preferUseMemo", never[], {
    VariableDeclarator(node: TSESTree.VariableDeclarator): void;
    CallExpression(node: TSESTree.CallExpression): void;
}>;
