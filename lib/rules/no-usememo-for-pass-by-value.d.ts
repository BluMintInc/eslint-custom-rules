import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        /**
         * Patterns (regex strings) that describe call expressions considered "expensive"
         * and therefore allowed even when they return pass-by-value types.
         */
        allowExpensiveCalleePatterns?: string[];
    }
];
type MessageIds = 'primitiveMemo' | 'invalidRegex';
export declare const noUsememoForPassByValue: TSESLint.RuleModule<MessageIds, Options, TSESLint.RuleListener>;
export default noUsememoForPassByValue;
