import { TSESLint } from '@typescript-eslint/utils';
type Options = [
    {
        ignoreTestFiles?: boolean;
        testFilePatterns?: string[];
        ignoreUseLatestCallback?: boolean;
    }
];
type MessageIds = 'preferUtilityFunction' | 'preferUtilityLatest';
export declare const noEmptyDependencyUseCallbacks: TSESLint.RuleModule<MessageIds, Options, TSESLint.RuleListener>;
export default noEmptyDependencyUseCallbacks;
