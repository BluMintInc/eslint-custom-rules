import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        props?: string[];
        allowRenderProps?: boolean;
        allowModuleScopeFactories?: boolean;
    }
];
export declare const noInlineComponentProp: TSESLint.RuleModule<"inlineComponentProp", Options, TSESLint.RuleListener>;
export {};
