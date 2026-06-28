import { Graph, GraphNode } from './ClassGraphBuilder';
export declare abstract class ClassGraphSorter {
    graph: Graph;
    constructor(graph: Graph);
    abstract nodesSorted: GraphNode[];
    abstract nodeNamesSorted: GraphNode['name'][];
}
