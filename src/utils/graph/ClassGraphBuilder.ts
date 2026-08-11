import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { ClassGraphSorterReadability } from './ClassGraphSorterReadability';
import { ASTHelpers } from '../ASTHelpers';
import { ClassGraphSorter } from './ClassGraphSorter';

export type GraphNode = {
  name: string;
  type: 'method' | 'property' | 'constructor';
  accessibility?: TSESTree.Accessibility;
  isStatic: boolean;
  dependencies: string[];
};

export type Graph = Record<string, GraphNode>;

type ClassMethodASTNode =
  | TSESTree.MethodDefinitionComputedName
  | TSESTree.MethodDefinitionNonComputedName;

type ClassPropertyASTNode =
  | TSESTree.PropertyDefinitionComputedName
  | TSESTree.PropertyDefinitionNonComputedName;

type ClassMemberASTNode =
  | ClassMethodASTNode
  | ClassPropertyASTNode
  | TSESTree.TSAbstractMethodDefinition
  | TSESTree.TSAbstractPropertyDefinition
  | TSESTree.TSAbstractAccessorProperty;

/**
 * Names the member a class element declares, or null when the key names no
 * member statically (a computed key, a static block, an index signature).
 *
 * An ECMA private key keeps its `#`, because `#foo` and `foo` are two distinct
 * members of the same class and a bare `.name` collapses them onto one graph
 * node. Every consumer must spell the name this way, since the graph and the
 * source order are compared by name.
 */
export function classMemberNameOf(
  member: TSESTree.ClassElement,
): string | null {
  if (!ClassGraphBuilder.isClassMember(member)) {
    return null;
  }
  const { key } = member;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${key.name}`;
  }
  return null;
}

/**
 * The accessibility a member is ranked by. An ECMA private member carries no
 * `accessibility` modifier because `private #foo` is a TypeScript error
 * (TS18010), yet it is exactly as private as `private foo`, so the two
 * spellings must rank identically.
 */
function accessibilityOf(
  member: ClassMemberASTNode,
): TSESTree.Accessibility | undefined {
  if (member.key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return 'private';
  }
  return member.accessibility;
}

/**
 * Builds a graph of class methods and properties with their dependencies from a class declaration.
 * A dependency in this case is the name of another class method.
 */

export class ClassGraphBuilder {
  public graph: Graph = {};
  private sorter: ClassGraphSorter;
  constructor(
    private className: string,
    private classBody: TSESTree.ClassBody,
  ) {
    this.buildGraph();
    // Note: extension requires injection of other sorters
    this.sorter = new ClassGraphSorterReadability(this.graph);
  }

  private buildGraph(): void {
    // NOTE: these need to be run sequentially for each member,
    // since we need to know the class members before we can search
    // methods for dependencies
    this.classBody.body.forEach((member) => {
      if (ClassGraphBuilder.isClassMember(member)) {
        this.addMemberToGraph(member);
      }
    });

    this.classBody.body.forEach((member) => {
      if (ClassGraphBuilder.isNamedClassMethod(member)) {
        const name = classMemberNameOf(member);
        if (name !== null) {
          this.addDependencies(member, name);
        }
      }
    });
  }

  public static isClassMember(
    node: TSESTree.ClassElement,
  ): node is ClassMemberASTNode {
    return (
      node.type === 'MethodDefinition' ||
      node.type === 'PropertyDefinition' ||
      node.type === 'TSAbstractMethodDefinition' ||
      node.type === 'TSAbstractPropertyDefinition' ||
      node.type === 'TSAbstractAccessorProperty'
    );
  }

  private addMemberToGraph(member: ClassMemberASTNode): void {
    const name = classMemberNameOf(member);
    // A member whose key names nothing statically stays out of the graph: an
    // `undefined` key would fabricate a node that no source member matches,
    // and consumers already refuse to reorder a body they cannot name in full.
    if (name === null) {
      return;
    }
    const type = ClassGraphBuilder.nodeTypeOf(member);
    const node = ClassGraphBuilder.createGraphNode(
      name,
      type,
      accessibilityOf(member),
      member.static,
    );
    this.graph[name] = node;
  }

  private static nodeTypeOf(
    member: TSESTree.ClassElement,
  ): 'method' | 'property' | 'constructor' {
    if (member.type === 'MethodDefinition') {
      return member.kind === 'constructor' ? 'constructor' : 'method';
    }
    // Abstract methods can never be constructors, so they are always methods.
    if (member.type === 'TSAbstractMethodDefinition') {
      return 'method';
    }
    return 'property';
  }

  private static createGraphNode(
    name: GraphNode['name'],
    type: GraphNode['type'],
    accessibility?: GraphNode['accessibility'],
    isStatic: GraphNode['isStatic'] = false,
  ): GraphNode {
    return {
      name,
      type,
      accessibility,
      isStatic,
      dependencies: [],
    };
  }

  private static isNamedClassMethod(
    node: TSESTree.ClassElement,
  ): node is ClassMethodASTNode {
    return node.type === 'MethodDefinition';
  }

  private addDependencies(node: TSESTree.Node, methodName: string): void {
    const newDependencies = ASTHelpers.classMethodDependenciesOf(
      node,
      this.graph,
      this.className,
    ).filter((name) => {
      // Only include dependencies that exist exactly in the graph and aren't self-references
      return !!this.graph[name] && name !== methodName;
    });

    if (this.graph[methodName]) {
      // Ensure dependencies is initialized as an array
      if (!Array.isArray(this.graph[methodName].dependencies)) {
        this.graph[methodName].dependencies = [];
      }
      this.graph[methodName].dependencies.push(...newDependencies);
    }
  }

  public get graphSorted() {
    return this.sorter.nodesSorted;
  }

  public get memberNamesSorted() {
    return this.sorter.nodeNamesSorted;
  }
}
