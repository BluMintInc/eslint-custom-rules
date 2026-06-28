import { TSESTree } from '@typescript-eslint/utils';
/**
 * Extracts a stable, human-readable name from method/property/member nodes.
 * Use the options to align prefixing and computed-key handling with rule semantics.
 */
export type GetMethodNameOptions = {
    /**
     * Prefix applied to private identifiers:
     * - undefined (default): empty prefix
     * - null: return the raw name without any prefix
     * - string (e.g., '#'): prepend the given prefix
     */
    privateIdentifierPrefix?: string | null;
    /**
     * When true (default), computed keys fall back to source text; when false, returns empty string.
     */
    computedFallbackToText?: boolean;
};
export declare const getMethodName: (method: TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition | TSESTree.PropertyDefinition, sourceCode: Readonly<{
    getText: (node: TSESTree.Node) => string;
}>, options?: GetMethodNameOptions) => string;
export declare const getPropertyName: (key: TSESTree.PropertyName | TSESTree.PrivateIdentifier, sourceCode: Readonly<{
    getText: (node: TSESTree.Node) => string;
}>, options?: GetMethodNameOptions) => string;
export declare const getMemberExpressionName: (member: TSESTree.MemberExpression, sourceCode: Readonly<{
    getText: (node: TSESTree.Node) => string;
}>, options?: GetMethodNameOptions) => string;
