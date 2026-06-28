type MessageIds = 'tooManyParams' | 'sameTypeParams';
type Options = [
    {
        minimumParameters?: number;
        checkSameTypeParameters?: boolean;
        ignoreBoundMethods?: boolean;
        ignoreVariadicFunctions?: boolean;
    }
];
export declare const preferSettingsObject: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
