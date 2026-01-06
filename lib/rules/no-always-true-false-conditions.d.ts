import type { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'alwaysTrueCondition' | 'alwaysFalseCondition';
export declare const noAlwaysTrueFalseConditions: TSESLint.RuleModule<MessageIds, [], TSESLint.RuleListener>;
export {};
