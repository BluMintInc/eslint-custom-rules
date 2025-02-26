import { TSESTree } from '@typescript-eslint/utils';
import { FunctionGraphSorterReadability } from './FunctionGraphSorterReadability';

export type FunctionGraphNode = {
  name: string;
  type: 'function' | 'arrow' | 'expression';
  dependencies: string[];
  node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
};

export type FunctionGraph = Record<string, FunctionGraphNode>;

/**
 * Builds a graph of functions with their dependencies from a program.
 * A dependency in this case is the name of another function that is called.
 */
export class FunctionGraphBuilder {
  public graph: FunctionGraph = {};
  private sorter: FunctionGraphSorterReadability;

  constructor(
    private functionDeclarations: TSESTree.FunctionDeclaration[],
    private functionExpressions: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression)[],
  ) {
    this.buildGraph();
    this.sorter = new FunctionGraphSorterReadability(this.graph);
  }

  private buildGraph(): void {
    // First, add all functions to the graph
    [...this.functionDeclarations, ...this.functionExpressions].forEach((func) => {
      this.addFunctionToGraph(func);
    });

    // Then, analyze dependencies
    [...this.functionDeclarations, ...this.functionExpressions].forEach((func) => {
      const name = this.getFunctionName(func);
      if (name) {
        this.addDependencies(func, name);
      }
    });
  }

  private getFunctionName(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): string | null {
    if (node.type === 'FunctionDeclaration' && node.id) {
      return node.id.name;
    } else if (
      (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
      node.parent &&
      node.parent.type === 'VariableDeclarator' &&
      node.parent.id.type === 'Identifier'
    ) {
      return node.parent.id.name;
    }
    return null;
  }

  private addFunctionToGraph(func: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): void {
    const name = this.getFunctionName(func);
    if (!name) return;

    let type: FunctionGraphNode['type'] = 'function';
    if (func.type === 'ArrowFunctionExpression') {
      type = 'arrow';
    } else if (func.type === 'FunctionExpression') {
      type = 'expression';
    }

    this.graph[name] = {
      name,
      type,
      dependencies: [],
      node: func,
    };
  }

  private addDependencies(func: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression, functionName: string): void {
    const dependencies = this.findFunctionDependencies(func);

    // Filter out dependencies that don't exist in our graph or are self-references
    const validDependencies = dependencies.filter(
      (dep) => !!this.graph[dep] && dep !== functionName
    );

    if (this.graph[functionName]) {
      this.graph[functionName].dependencies = validDependencies;
    }
  }

  private findFunctionDependencies(func: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): string[] {
    const dependencies: string[] = [];
    const functionNames = Object.keys(this.graph);

    // Helper function to traverse the AST and find function calls
    const traverse = (node: TSESTree.Node | null): void => {
      if (!node) return;

      // Check for function calls
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
        const calledFunctionName = node.callee.name;
        if (functionNames.includes(calledFunctionName)) {
          dependencies.push(calledFunctionName);
        }
      }

      // Recursively traverse all properties of the node
      for (const key in node) {
        if (key === 'parent') continue; // Skip parent to avoid circular references

        const value = node[key as keyof typeof node];
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && 'type' in item) {
              traverse(item as TSESTree.Node);
            }
          });
        } else if (value && typeof value === 'object' && 'type' in value) {
          traverse(value as TSESTree.Node);
        }
      }
    };

    // Start traversal with the function body
    if (func.body) {
      traverse(func.body);
    }

    // Remove duplicates
    return [...new Set(dependencies)];
  }

  public get functionNamesSorted(): string[] {
    return this.sorter.nodeNamesSorted;
  }
}
