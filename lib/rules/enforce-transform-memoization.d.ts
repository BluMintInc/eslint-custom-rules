import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'memoizeTransformValue' | 'memoizeTransformOnChange' | 'useCorrectHook' | 'missingDependencies';
export declare const enforceTransformMemoization: TSESLint.RuleModule<MessageIds, [], TSESLint.RuleListener>;
export {};
