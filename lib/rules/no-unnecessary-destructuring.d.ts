import { TSESTree } from '@typescript-eslint/utils';
export declare const noUnnecessaryDestructuring: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"noUnnecessaryDestructuring", never[], {
    VariableDeclarator(node: TSESTree.VariableDeclarator): void;
    AssignmentExpression(node: TSESTree.AssignmentExpression): void;
}>;
