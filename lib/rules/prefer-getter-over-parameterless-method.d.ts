type OptionShape = {
    stripPrefixes?: string[];
    ignoredMethods?: string[];
    ignoreAsync?: boolean;
    ignoreVoidReturn?: boolean;
    ignoreAbstract?: boolean;
    respectJsDocSideEffects?: boolean;
    minBodyLines?: number;
};
type Options = [OptionShape];
type MessageIds = 'preferGetter' | 'preferGetterSideEffect';
export declare const preferGetterOverParameterlessMethod: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export default preferGetterOverParameterlessMethod;
