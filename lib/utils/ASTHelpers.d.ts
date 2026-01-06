import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Graph } from './graph/ClassGraphBuilder';
export declare class ASTHelpers {
    /**
     * Finds a variable by name in the scope chain starting from the given scope.
     */
    static findVariableInScope(scope: TSESLint.Scope.Scope, name: string): TSESLint.Scope.Variable | null;
    static blockIncludesIdentifier(block: TSESTree.BlockStatement): boolean;
    static declarationIncludesIdentifier(node: TSESTree.Node | null): boolean;
    static classMethodDependenciesOf(node: TSESTree.Node | null, graph: Graph, className: string): string[];
    static isNode(value: unknown): value is TSESTree.Node;
    static hasReturnStatement(node: TSESTree.Node): boolean;
    static isNodeExported(node: TSESTree.Node): boolean;
    static returnsJSX(node: TSESTree.Node): boolean;
    static hasParameters(node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration): boolean;
    /**
     * Helper to get ancestors of a node in a way that is compatible with both ESLint v8 and v9.
     * In ESLint v9, context.getAncestors() is deprecated and moved to context.sourceCode.getAncestors(node).
     */
    static getAncestors(context: {
        sourceCode?: unknown;
        getAncestors?: () => TSESTree.Node[];
    }, node: TSESTree.Node): TSESTree.Node[];
}
