import type { TSESLint } from '@typescript-eslint/utils';
interface RuleOptions {
    containers?: string[];
    allowNestedIn?: string[];
}
export declare const preferFieldPathsInTransforms: TSESLint.RuleModule<"preferFieldPathsInTransforms", [(RuleOptions | undefined)?], TSESLint.RuleListener>;
export {};
