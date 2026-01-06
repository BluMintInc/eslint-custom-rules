import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'componentLiteral' | 'nestedHookLiteral' | 'hookReturnLiteral' | 'memoizeLiteralSuggestion';
export declare const reactMemoizeLiterals: TSESLint.RuleModule<MessageIds, [], TSESLint.RuleListener>;
export {};
