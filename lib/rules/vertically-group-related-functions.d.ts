import { TSESLint } from '@typescript-eslint/utils';
type GroupName = 'event-handlers' | 'utilities' | 'other';
type DependencyDirection = 'callers-first' | 'callees-first';
type ExportPlacement = 'top' | 'bottom' | 'ignore';
type Options = [
    Partial<{
        exportPlacement: ExportPlacement;
        dependencyDirection: DependencyDirection;
        groupOrder: GroupName[];
        eventHandlerPattern: string;
        utilityPattern: string;
    }>
];
type MessageIds = 'misorderedFunction';
export declare const verticallyGroupRelatedFunctions: TSESLint.RuleModule<MessageIds, Options>;
export {};
