/**
 * This rule is a wrapper around the core ESLint no-restricted-properties rule
 * that adds special handling for Object.keys() and Object.values() results.
 * It prevents false positives when accessing standard array properties/methods
 * on the arrays returned by Object.keys() and Object.values().
 */
export declare const noRestrictedPropertiesFix: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"restrictedProperty", [{
    object?: string | undefined;
    property?: string | undefined;
    message?: string | undefined;
    allowObjects?: string[] | undefined;
}[]], import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
