import { Graph, GraphNode } from './ClassGraphBuilder';
import { ClassGraphSorter } from './ClassGraphSorter';
type GraphNodeModifier = 'isStatic' | 'accessibility';
export declare class ClassGraphSorterReadability extends ClassGraphSorter {
    graph: Graph;
    static readonly MODIFIER_PRIORITY_MAP: Record<GraphNodeModifier, any[]>;
    private static readonly SEARCH_NODE_PRIORITY_FUNCTIONS;
    constructor(graph: Graph);
    get nodeNamesSorted(): string[];
    get nodesSorted(): GraphNode[];
    sortNodes(): GraphNode[];
    private groupNodesByType;
    private static sortMembersForReadability;
    private dependencyDfs;
}
export {};
