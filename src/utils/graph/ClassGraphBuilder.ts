import { ASTUtils, TSESTree } from '@typescript-eslint/utils';
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

type ClassMemberASTNode = ClassMethodASTNode | ClassPropertyASTNode;

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
        const { key } = member;
        if (ASTUtils.isIdentifier(key)) {
          this.addDependencies(member, key.name);
        }
      }
    });
  }

  private static isClassMember(
    node: TSESTree.ClassElement,
  ): node is ClassMemberASTNode {
    return (
      node.type === 'MethodDefinition' || node.type === 'PropertyDefinition'
    );
  }

  private addMemberToGraph(member: ClassMemberASTNode): void {
    const name = (member.key as TSESTree.Identifier).name;
    const type = ClassGraphBuilder.nodeTypeOf(member);
    const node = ClassGraphBuilder.createGraphNode(
      name,
      type,
      member.accessibility,
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
    ).filter((name) => !!this.graph[name] && name !== methodName);

    if (this.graph[methodName]) {
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
