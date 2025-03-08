import { Graph, GraphNode } from './ClassGraphBuilder';
import { ClassGraphSorter } from './ClassGraphSorter';

type GraphNodeModifier = 'isStatic' | 'accessibility';

export class ClassGraphSorterReadability extends ClassGraphSorter {
  public static readonly MODIFIER_PRIORITY_MAP: Record<
    GraphNodeModifier,
    // This typing makes me sad. The idea is to have an array of values for each
    // field of GraphNode, where all possible values are represented, and
    // the order in the array represents the priority
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  > = {
    isStatic: [true, false],
    accessibility: ['public', undefined, 'private'],
  };

  private static readonly SEARCH_NODE_PRIORITY_FUNCTIONS: Array<
    (method: GraphNode, methods: GraphNode[]) => boolean
  > = [
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (method, _methods) => method.type === 'constructor',
    (method, _methods) =>
      !_methods.some((node) => node.dependencies.includes(method.name)),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (method, _methods) => method.dependencies.length === 0,
  ];

  constructor(public graph: Graph) {
    super(graph);
  }

  public get nodeNamesSorted() {
    return this.nodesSorted.map((node) => node.name);
  }

  public get nodesSorted() {
    return this.sortNodes();
  }

  public sortNodes() {
    const { methods, properties, classConstructor } = this.groupNodesByType();
    const [propertiesSorted, methodsSorted] = [properties, methods].map(
      (nodeGroup) =>
        nodeGroup.sort(ClassGraphSorterReadability.sortMembersForReadability),
    );
    const searchNodeCandidates = [classConstructor, ...methodsSorted].filter(
      (node): node is GraphNode => !!node,
    );

    const searchNodeCandidatesValidated = searchNodeCandidates.filter(
      (method, _index, arr) =>
        ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.some(
          (fn) => !!fn(method, arr),
        ),
    );
    const searchNodesSorted = searchNodeCandidatesValidated.sort((a, b) => {
      const getPriority = (method: GraphNode) => {
        const priority =
          ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.findIndex(
            (fn) => !!fn(method, methodsSorted),
          );
        return priority === -1
          ? ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.length
          : priority;
      };
      return getPriority(a) - getPriority(b);
    });

    const dfsSortedNodes = this.dependencyDfs(searchNodesSorted);

    return [...propertiesSorted, ...dfsSortedNodes];
  }

  private groupNodesByType() {
    const nodes = Object.values(this.graph);
    return nodes.reduce(
      (acc, node) => {
        switch (node.type) {
          case 'property':
            acc.properties.push(node);
            break;
          case 'constructor':
            acc.classConstructor = node;
            break;
          case 'method':
            acc.methods.push(node);
            break;
        }
        return acc;
      },
      {
        properties: [] as GraphNode[],
        methods: [] as GraphNode[],
        classConstructor: null as GraphNode | null,
      },
    );
  }

  private static sortMembersForReadability(a: GraphNode, b: GraphNode) {
    // NOTE: the ordering from Object.entries is safe here since it is readonly
    for (const [key, priorities] of Object.entries(
      ClassGraphSorterReadability.MODIFIER_PRIORITY_MAP,
    )) {
      const indexA = priorities.indexOf(a[key as GraphNodeModifier]);
      const indexB = priorities.indexOf(b[key as GraphNodeModifier]);
      if (indexA !== indexB) {
        return indexA - indexB;
      }
    }
    return 0;
  }

  private dependencyDfs(searchNodes: GraphNode[]) {
    const visited = new Set<string>();
    const dfsSortedNodes: GraphNode[] = [];
    const dfs = (node: GraphNode) => {
      if (!node || visited.has(node.name)) {
        return;
      }
      visited.add(node.name);
      dfsSortedNodes.push(node);
      // Ensure node.dependencies exists and is an array before iterating
      const dependencies = Array.isArray(node.dependencies)
        ? node.dependencies
        : [];
      for (const dep of dependencies) {
        const depNode = this.graph[String(dep)];
        if (depNode) {
          dfs(depNode);
        }
      }
    };
    searchNodes.forEach((node) => dfs(node));
    return dfsSortedNodes;
  }
}
