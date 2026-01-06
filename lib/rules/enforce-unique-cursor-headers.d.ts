import { TSESLint } from '@typescript-eslint/utils';
type NormalizedOptions = {
    requiredPatterns: string[];
    excludedPatterns: string[];
    requiredTags: string[];
    allowSplitHeaders: boolean;
    headerTemplate: string | null;
    ignoreGeneratedFiles: boolean;
    generatedMarkers: string[];
    excludedAtDirectives: string[];
};
type Options = [Partial<NormalizedOptions>];
type MessageIds = 'missingHeader' | 'duplicateHeader' | 'splitHeaderFragment';
export declare const RULE_NAME = "enforce-unique-cursor-headers";
export declare const enforceUniqueCursorHeaders: TSESLint.RuleModule<MessageIds, Options, TSESLint.RuleListener>;
export {};
