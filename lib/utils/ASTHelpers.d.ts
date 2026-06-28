import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Graph } from './graph/ClassGraphBuilder';
export declare class ASTHelpers {
    /**
     * AST node shapes vary across ESLint/typescript-eslint versions, with some
     * node types (ParenthesizedExpression, TSSatisfiesExpression) not consistently
     * available in type definitions. Type guards and runtime checks ensure correctness
     * despite these discrepancies, trading compile-time safety for cross-version
     * compatibility until type definitions stabilize.
     *
     * Semantics Contract:
     * - Helpers like getScope and returnsJSX must be invoked from the active
     *   visitor traversal context (ESLint 8 compatible).
     * - returnsJSX is a heuristic and does not perform a full control-flow proof.
     * - Reliance on runtime type guards (isParenthesizedExpression,
     *   isLoopOrLabeledStatement) is intentional.
     */
    /**
     * Finds a variable by name in the scope chain starting from the given scope.
     */
    static findVariableInScope(scope: TSESLint.Scope.Scope, name: string): TSESLint.Scope.Variable | null;
    /**
     * Compatibility wrapper for getting the scope of a node across ESLint versions.
     * ESLint 9 moves getScope onto sourceCode; ESLint 8 exposes context.getScope().
     */
    static getScope(context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>, node: TSESTree.Node): TSESLint.Scope.Scope;
    static blockIncludesIdentifier(block: TSESTree.BlockStatement): boolean;
    static declarationIncludesIdentifier(node: TSESTree.Node | null): boolean;
    /**
     * Checks if a pattern (in a declaration or parameter) contains any dependencies.
     * Patterns themselves define new bindings (Identifiers), but they can contain
     * dependencies in computed keys or default values (AssignmentPattern).
     */
    private static patternHasDependency;
    static classMethodDependenciesOf(node: TSESTree.Node | null, graph: Graph, className: string): string[];
    static isNode(value: unknown): value is TSESTree.Node;
    static hasReturnStatement(node: TSESTree.Node): boolean;
    static isNodeExported(node: TSESTree.Node): boolean;
    private static isLoopOrLabeledStatement;
    private static isParenthesizedExpression;
    private static returnsJSXValue;
    private static returnsJSXFromStatement;
    static returnsJSX(node: TSESTree.Node | null | undefined, context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>): boolean;
    static hasParameters(node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration): boolean;
    /**
     * Compatibility wrapper for getting declared variables across ESLint versions.
     */
    static getDeclaredVariables(context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>, node: TSESTree.Node): readonly TSESLint.Scope.Variable[];
    /**
     * Helper to get ancestors of a node in a way that is compatible with both ESLint v8 and v9.
     * In ESLint v9, context.getAncestors() is deprecated and moved to context.sourceCode.getAncestors(node).
     */
    static getAncestors(context: {
        sourceCode?: unknown;
        getAncestors?: () => TSESTree.Node[];
    }, node: TSESTree.Node): TSESTree.Node[];
}
