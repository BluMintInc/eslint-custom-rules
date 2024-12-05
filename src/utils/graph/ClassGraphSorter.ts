import { Graph, GraphNode } from './ClassGraphBuilder';

export abstract class ClassGraphSorter {
  constructor(public graph: Graph) {}
  public abstract nodesSorted: GraphNode[];
  public abstract nodeNamesSorted: GraphNode['name'][];
}
