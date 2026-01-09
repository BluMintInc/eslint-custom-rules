import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Graph } from './graph/ClassGraphBuilder';
export class ASTHelpers {
  /**
   * Finds a variable by name in the scope chain starting from the given scope.
   */
  public static findVariableInScope(
    scope: TSESLint.Scope.Scope,
    name: string,
  ): TSESLint.Scope.Variable | null {
    let current: TSESLint.Scope.Scope | null = scope;
    while (current) {
      const variable =
        current.set?.get(name) ??
        current.variables.find((v) => v.name === name);
      if (variable) {
        return variable;
      }
      current = current.upper;
    }
    return null;
  }

  public static blockIncludesIdentifier(
    block: TSESTree.BlockStatement,
  ): boolean {
    for (const statement of block.body) {
      if (ASTHelpers.declarationIncludesIdentifier(statement)) {
        return true;
      }
    }
    return false;
  }

  public static declarationIncludesIdentifier(
    node: TSESTree.Node | null,
  ): boolean {
    if (!node) {
      return false;
    }

    // Gracefully handle ParenthesizedExpression without widening AST node types
    if (ASTHelpers.isParenthesizedExpression(node)) {
      return this.declarationIncludesIdentifier((node as any).expression);
    }

    switch (node.type) {
      case 'TSNonNullExpression':
        return this.declarationIncludesIdentifier(node.expression);
      case 'TSSatisfiesExpression':
        return this.declarationIncludesIdentifier(node.expression);
      case 'ArrayPattern':
        return node.elements.some((element) =>
          ASTHelpers.declarationIncludesIdentifier(element),
        );
      case 'ObjectPattern':
        return node.properties.some((property) =>
          this.declarationIncludesIdentifier(property.value || null),
        );
      case 'AssignmentPattern':
        return this.declarationIncludesIdentifier(node.left);
      case 'RestElement':
        return this.declarationIncludesIdentifier(node.argument);
      case 'AwaitExpression':
        return this.declarationIncludesIdentifier(node.argument);
      case 'AssignmentExpression':
        return (
          this.declarationIncludesIdentifier(node.left) ||
          this.declarationIncludesIdentifier(node.right)
        );
      case 'BlockStatement':
        return node.body.some(
          (statement) =>
            statement.type === 'BlockStatement' &&
            ASTHelpers.blockIncludesIdentifier(statement),
        );
      case 'IfStatement':
        return (
          this.declarationIncludesIdentifier(node.test) ||
          this.declarationIncludesIdentifier(node.consequent) ||
          this.declarationIncludesIdentifier(node.alternate)
        );
      case 'TSTypeAssertion':
        return this.declarationIncludesIdentifier(node.expression);
      case 'Identifier':
        return true;
      case 'SpreadElement':
        return ASTHelpers.declarationIncludesIdentifier(node.argument);
      case 'ChainExpression':
        return ASTHelpers.declarationIncludesIdentifier(node.expression);
      case 'ArrayExpression':
        return node.elements.some(
          (element) =>
            element &&
            (element.type === 'SpreadElement'
              ? ASTHelpers.declarationIncludesIdentifier(element.argument)
              : ASTHelpers.declarationIncludesIdentifier(element)),
        );
      case 'ObjectExpression':
        return node.properties.some((property) => {
          if (property.type === 'Property') {
            return ASTHelpers.declarationIncludesIdentifier(property.value);
          } else if (property.type === 'SpreadElement') {
            return ASTHelpers.declarationIncludesIdentifier(property.argument);
          }
          return false;
        });

      case 'Property':
        return this.declarationIncludesIdentifier(node.value);

      case 'BinaryExpression':
      case 'LogicalExpression':
        return (
          this.declarationIncludesIdentifier(node.left) ||
          this.declarationIncludesIdentifier(node.right)
        );

      case 'UnaryExpression':
      case 'UpdateExpression':
        return this.declarationIncludesIdentifier(node.argument);
      case 'MemberExpression':
        if (node.object.type === 'ThisExpression') {
          return true;
        }
        return (
          this.declarationIncludesIdentifier(node.object) ||
          this.declarationIncludesIdentifier(node.property)
        );

      case 'ImportExpression':
        // Dynamic imports should be considered as having dependencies
        return true;
      case 'CallExpression':
      case 'NewExpression':
        // For function and constructor calls, we care about both the callee and the arguments.
        return (
          this.declarationIncludesIdentifier(node.callee) ||
          node.arguments.some((arg) => this.declarationIncludesIdentifier(arg))
        );

      case 'ConditionalExpression':
        return (
          this.declarationIncludesIdentifier(node.test) ||
          this.declarationIncludesIdentifier(node.consequent) ||
          this.declarationIncludesIdentifier(node.alternate)
        );
      case 'TemplateLiteral':
        return node.expressions.some((expr) =>
          this.declarationIncludesIdentifier(expr),
        );
      case 'TSAsExpression':
        return this.declarationIncludesIdentifier(node.expression);

      case 'TSTypeReference':
        // Handle type references (e.g., T in generic types)
        return false;

      case 'TSTypeParameterDeclaration':
        // Handle type parameter declarations (e.g., <T extends ...>)
        return false;

      case 'TSTypeParameterInstantiation':
        // Handle type parameter instantiations (e.g., <string>)
        return false;

      case 'TSIntersectionType':
      case 'TSUnionType':
      case 'TSTypeLiteral':
        // Handle type constraints and literals
        return false;

      default:
        return false;
    }
  }

  public static classMethodDependenciesOf(
    node: TSESTree.Node | null,
    graph: Graph,
    className: string,
  ): string[] {
    const dependencies: string[] = [];

    if (!node) {
      return dependencies;
    }

    // Gracefully handle ParenthesizedExpression without widening AST node types
    if (ASTHelpers.isParenthesizedExpression(node)) {
      return ASTHelpers.classMethodDependenciesOf(
        (node as any).expression,
        graph,
        className,
      );
    }

    switch (node.type) {
      case 'MethodDefinition':
        const functionBody = node.value.body;
        return (functionBody?.body || [])
          .map((statement) =>
            ASTHelpers.classMethodDependenciesOf(statement, graph, className),
          )
          .flat();

      case 'Identifier':
        dependencies.push(node.name);
        break;

      case 'ExpressionStatement':
        return ASTHelpers.classMethodDependenciesOf(
          node.expression,
          graph,
          className,
        );

      case 'MemberExpression':
        if (
          (node.object.type === 'ThisExpression' &&
            node.property.type === 'Identifier') ||
          (node.object.type === 'Identifier' &&
            node.object.name === className &&
            node.property.type === 'Identifier')
        ) {
          dependencies.push(node.property.name);
        } else {
          return [
            ...ASTHelpers.classMethodDependenciesOf(
              node.object,
              graph,
              className,
            ),
            ...ASTHelpers.classMethodDependenciesOf(
              node.property,
              graph,
              className,
            ),
          ];
        }
        break;

      case 'TSNonNullExpression':
        return ASTHelpers.classMethodDependenciesOf(
          node.expression,
          graph,
          className,
        );
      case 'ArrayPattern':
        return node.elements
          .map((element) =>
            ASTHelpers.classMethodDependenciesOf(element, graph, className),
          )
          .flat();
      case 'ObjectPattern':
        return node.properties
          .map((property) =>
            ASTHelpers.classMethodDependenciesOf(
              property.value || null,
              graph,
              className,
            ),
          )
          .flat();
      case 'AssignmentPattern':
        return ASTHelpers.classMethodDependenciesOf(
          node.left,
          graph,
          className,
        );
      case 'RestElement':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'AwaitExpression':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'AssignmentExpression':
        return [
          ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
        ];
      case 'BlockStatement':
        return node.body
          .map((statement) =>
            ASTHelpers.classMethodDependenciesOf(statement, graph, className),
          )
          .flat()
          .filter(Boolean) as string[];
      case 'IfStatement':
        return [
          ...ASTHelpers.classMethodDependenciesOf(node.test, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(
            node.consequent,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            node.alternate,
            graph,
            className,
          ),
        ];
      case 'TSTypeAssertion':
        return ASTHelpers.classMethodDependenciesOf(
          node.expression,
          graph,
          className,
        );
      case 'Identifier':
        return dependencies;
      case 'SpreadElement':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'ChainExpression':
        return ASTHelpers.classMethodDependenciesOf(
          node.expression,
          graph,
          className,
        );
      case 'ArrayExpression':
        return node.elements
          .map(
            (element) =>
              element &&
              (element.type === 'SpreadElement'
                ? ASTHelpers.classMethodDependenciesOf(
                    element.argument,
                    graph,
                    className,
                  )
                : ASTHelpers.classMethodDependenciesOf(
                    element,
                    graph,
                    className,
                  )),
          )
          .flat()
          .filter(Boolean) as string[];
      case 'ObjectExpression':
        return node.properties
          .map((property) => {
            if (property.type === 'Property') {
              return ASTHelpers.classMethodDependenciesOf(
                property.value,
                graph,
                className,
              );
            } else if (property.type === 'SpreadElement') {
              return ASTHelpers.classMethodDependenciesOf(
                property.argument,
                graph,
                className,
              );
            }
            return false;
          })
          .flat()
          .filter(Boolean) as string[];

      case 'Property':
        return ASTHelpers.classMethodDependenciesOf(
          node.value,
          graph,
          className,
        );

      case 'BinaryExpression':
      case 'LogicalExpression':
        return [
          ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
        ];

      case 'UnaryExpression':
      case 'UpdateExpression':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'CallExpression':
      case 'NewExpression':
        // For function and constructor calls, we care about both the callee and the arguments.

        return [
          ...ASTHelpers.classMethodDependenciesOf(
            node.callee,
            graph,
            className,
          ),
          ...node.arguments
            .map((arg) =>
              ASTHelpers.classMethodDependenciesOf(arg, graph, className),
            )
            .flat(),
        ];

      case 'ConditionalExpression':
        return [
          ...ASTHelpers.classMethodDependenciesOf(node.test, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(
            node.consequent,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            node.alternate,
            graph,
            className,
          ),
        ];
      case 'TSAsExpression':
        return ASTHelpers.classMethodDependenciesOf(
          node.expression,
          graph,
          className,
        );
      case 'VariableDeclaration':
        return node.declarations
          .map((declaration) =>
            ASTHelpers.classMethodDependenciesOf(declaration, graph, className),
          )
          .flat()
          .filter(Boolean);
      case 'VariableDeclarator':
        return ASTHelpers.classMethodDependenciesOf(
          node.init,
          graph,
          className,
        );
      case 'ForOfStatement':
        return [
          ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(node.body, graph, className),
          ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
        ];
      case 'ForStatement':
        return [node.body, node.init, node.test, node.update]
          .map((node) =>
            ASTHelpers.classMethodDependenciesOf(node, graph, className),
          )
          .flat();
      case 'ThrowStatement':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'TemplateLiteral':
        return node.expressions
          .map((expression) =>
            ASTHelpers.classMethodDependenciesOf(expression, graph, className),
          )
          .flat();
      case 'ReturnStatement':
        return ASTHelpers.classMethodDependenciesOf(
          node.argument,
          graph,
          className,
        );
      case 'ArrowFunctionExpression':
        return [
          ...node.params.flatMap((param) =>
            ASTHelpers.classMethodDependenciesOf(param, graph, className),
          ),
          ...ASTHelpers.classMethodDependenciesOf(node.body, graph, className),
        ];
      default:
        break;
    }

    // Removing duplicates and ensuring exact matches only
    return [
      ...new Set(
        dependencies.filter((dep) => {
          // Only include dependencies that exist exactly in the graph
          // This prevents substring matches (e.g., 'nextMatches' vs 'nextMatchesWithResults')
          return (
            graph?.[dep] !== undefined && graph?.[dep]?.type !== 'property'
          );
        }),
      ),
    ];
  }

  public static isNode(value: unknown): value is TSESTree.Node {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  public static hasReturnStatement(node: TSESTree.Node): boolean {
    if (node.type === 'ReturnStatement') {
      return true;
    }
    if (node.type === 'IfStatement') {
      const consequentHasReturn = ASTHelpers.hasReturnStatement(
        node.consequent,
      );
      const alternateHasReturn =
        !!node.alternate && ASTHelpers.hasReturnStatement(node.alternate);
      return consequentHasReturn && alternateHasReturn;
    }
    if (node.type === 'BlockStatement') {
      for (const statement of node.body) {
        if (ASTHelpers.hasReturnStatement(statement)) {
          return true;
        }
      }
    }

    for (const key in node) {
      if (key === 'parent') {
        continue; // Ignore the parent property
      }
      const value = node[key as keyof typeof node];
      if (ASTHelpers.isNode(value)) {
        if (ASTHelpers.hasReturnStatement(value)) {
          return true;
        }
      }
    }

    return false;
  }

  public static isNodeExported(node: TSESTree.Node) {
    // Checking if the node is exported as a named export.
    if (node.parent && node.parent.type === 'ExportNamedDeclaration') {
      return true;
    }

    // Checking if the node is exported as default.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === 'ExportDefaultDeclaration'
    ) {
      return true;
    }

    // Checking if the node is exported in a list of exports.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === 'ExportSpecifier' &&
      node.parent.parent.exported.name === (node as TSESTree.Identifier).name
    ) {
      return true;
    }

    return false;
  }

  private static isLoopOrLabeledStatement(
    node: TSESTree.Node,
  ): node is
    | TSESTree.WhileStatement
    | TSESTree.DoWhileStatement
    | TSESTree.ForStatement
    | TSESTree.ForInStatement
    | TSESTree.ForOfStatement
    | TSESTree.LabeledStatement {
    return (
      node.type === AST_NODE_TYPES.WhileStatement ||
      node.type === AST_NODE_TYPES.DoWhileStatement ||
      node.type === AST_NODE_TYPES.ForStatement ||
      node.type === AST_NODE_TYPES.ForInStatement ||
      node.type === AST_NODE_TYPES.ForOfStatement ||
      node.type === AST_NODE_TYPES.LabeledStatement
    );
  }

  private static isParenthesizedExpression(
    node: TSESTree.Node | null | undefined,
  ): boolean {
    return (node as any)?.type === 'ParenthesizedExpression';
  }

  public static returnsJSX(node: TSESTree.Node | null | undefined): boolean {
    if (!node) {
      return false;
    }

    if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      return true;
    }

    if (node.type === AST_NODE_TYPES.BlockStatement) {
      for (const statement of node.body) {
        if (ASTHelpers.returnsJSX(statement)) {
          return true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      return ASTHelpers.returnsJSX(node.argument);
    }

    if (node.type === AST_NODE_TYPES.IfStatement) {
      return (
        ASTHelpers.returnsJSX(node.consequent) ||
        ASTHelpers.returnsJSX(node.alternate)
      );
    }

    if (node.type === AST_NODE_TYPES.SwitchStatement) {
      for (const switchCase of node.cases) {
        for (const statement of switchCase.consequent) {
          if (ASTHelpers.returnsJSX(statement)) {
            return true;
          }
        }
      }
    }

    if (ASTHelpers.isLoopOrLabeledStatement(node)) {
      return ASTHelpers.returnsJSX(node.body);
    }

    if (node.type === AST_NODE_TYPES.LogicalExpression) {
      return (
        ASTHelpers.returnsJSX(node.left) || ASTHelpers.returnsJSX(node.right)
      );
    }

    if (node.type === AST_NODE_TYPES.TryStatement) {
      return (
        ASTHelpers.returnsJSX(node.block) ||
        ASTHelpers.returnsJSX(node.handler?.body) ||
        ASTHelpers.returnsJSX(node.finalizer)
      );
    }

    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      return (
        ASTHelpers.returnsJSX(node.consequent) ||
        ASTHelpers.returnsJSX(node.alternate)
      );
    }

    if (
      node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion ||
      node.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      return ASTHelpers.returnsJSX(node.expression);
    }

    if (ASTHelpers.isParenthesizedExpression(node)) {
      return ASTHelpers.returnsJSX((node as any).expression);
    }

    return false;
  }

  public static hasParameters(
    node:
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | TSESTree.FunctionDeclaration,
  ): boolean {
    return node.params && node.params.length > 0;
  }

  /**
   * Compatibility wrapper for getting declared variables across ESLint versions.
   */
  public static getDeclaredVariables(
    context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
    node: TSESTree.Node,
  ): readonly TSESLint.Scope.Variable[] {
    const sourceCode = context.sourceCode;
    const sourceCodeWithDeclaredVariables = sourceCode as unknown as {
      getDeclaredVariables?: (
        targetNode: TSESTree.Node,
      ) => readonly TSESLint.Scope.Variable[];
    };

    const fn =
      typeof sourceCodeWithDeclaredVariables?.getDeclaredVariables ===
      'function'
        ? sourceCodeWithDeclaredVariables.getDeclaredVariables.bind(
            sourceCodeWithDeclaredVariables,
          )
        : typeof context.getDeclaredVariables === 'function'
          ? context.getDeclaredVariables.bind(context)
          : null;

    if (!fn) {
      throw new Error(
        'getDeclaredVariables is not available in this ESLint version.',
      );
    }

    return fn(node);
  }

  /**
   * Helper to get ancestors of a node in a way that is compatible with both ESLint v8 and v9.
   * In ESLint v9, context.getAncestors() is deprecated and moved to context.sourceCode.getAncestors(node).
   */
  public static getAncestors(
    context: {
      sourceCode?: unknown;
      getAncestors?: () => TSESTree.Node[];
    },
    node: TSESTree.Node,
  ): TSESTree.Node[] {
    const sourceCode = context.sourceCode as
      | { getAncestors?: (node: TSESTree.Node) => TSESTree.Node[] }
      | null
      | undefined;
    return (
      sourceCode?.getAncestors?.(node) ??
      (context.getAncestors ? context.getAncestors() : [])
    );
  }
}
