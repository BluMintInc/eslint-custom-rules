import { TSESTree } from '@typescript-eslint/utils';
/**
 * Rule to detect and remove unused useState hooks in React components
 * This rule identifies cases where the state variable from useState is ignored (e.g., replaced with _)
 */
export declare const noUnusedUseState: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"unusedUseState", never[], {
    VariableDeclarator(node: TSESTree.VariableDeclarator): void;
}>;
