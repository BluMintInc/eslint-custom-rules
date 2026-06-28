import { TSESLint, TSESTree } from '@typescript-eslint/utils';
export type NodeWithParent = TSESTree.Node & {
    parent: NodeWithParent;
};
export type ComponentNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
export declare const requireMemo: TSESLint.RuleModule<'requireMemo', []>;
