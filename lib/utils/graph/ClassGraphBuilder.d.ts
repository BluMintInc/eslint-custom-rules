import { TSESTree } from '@typescript-eslint/utils';
export type GraphNode = {
    name: string;
    type: 'method' | 'property' | 'constructor';
    accessibility?: TSESTree.Accessibility;
    isStatic: boolean;
    dependencies: string[];
};
export type Graph = Record<string, GraphNode>;
/**
 * Builds a graph of class methods and properties with their dependencies from a class declaration.
 * A dependency in this case is the name of another class method.
 */
export declare class ClassGraphBuilder {
    private className;
    private classBody;
    graph: Graph;
    private sorter;
    constructor(className: string, classBody: TSESTree.ClassBody);
    private buildGraph;
    private static isClassMember;
    private addMemberToGraph;
    private static nodeTypeOf;
    private static createGraphNode;
    private static isNamedClassMethod;
    private addDependencies;
    get graphSorted(): GraphNode[];
    get memberNamesSorted(): string[];
}
