import { TSESTree } from '@typescript-eslint/utils';
import { Graph } from './graph/ClassGraphBuilder';
export declare class ASTHelpers {
    static blockIncludesIdentifier(block: TSESTree.BlockStatement): boolean;
    static declarationIncludesIdentifier(node: TSESTree.Node | null): boolean;
    static classMethodDependenciesOf(node: TSESTree.Node | null, graph: Graph, className: string): string[];
    static isNode(value: unknown): value is TSESTree.Node;
    static hasReturnStatement(node: TSESTree.Node): boolean;
    static isNodeExported(node: TSESTree.Node): boolean;
    static returnsJSX(node: TSESTree.Node): boolean;
    static hasParameters(node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration): boolean;
}
