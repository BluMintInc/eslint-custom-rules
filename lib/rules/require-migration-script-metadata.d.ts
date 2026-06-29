type MessageIds = 'missingMetadata' | 'metadataAfterStatement' | 'missingMigrationTag' | 'invalidMigrationTag' | 'missingPhaseTag' | 'invalidPhaseTag' | 'missingDependenciesTag' | 'invalidDependenciesTag' | 'missingDescriptionTag' | 'extensionInDependencies' | 'noneCasing' | 'legacyHeaderNotAllowed' | 'multipleMetadataBlocks';
type Options = [
    {
        targetGlobs?: string[];
        allowLegacyHeader?: boolean;
    }
];
export declare const requireMigrationScriptMetadata: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
