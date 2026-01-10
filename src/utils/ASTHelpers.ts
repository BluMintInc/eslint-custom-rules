import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Graph } from './graph/ClassGraphBuilder';
export class ASTHelpers {
  /**
   * AST node shapes vary across ESLint/typescript-eslint versions, with some
   * node types (ParenthesizedExpression, TSSatisfiesExpression) not consistently
   * available in type definitions. Type guards and runtime checks ensure correctness
   * despite these discrepancies, trading compile-time safety for cross-version
   * compatibility until type definitions stabilize.
   *
   * Semantics Contract:
   * - Helpers like getScope and returnsJSX must be invoked from the active
   *   visitor traversal context (ESLint 8 compatible).
   * - returnsJSX is a heuristic and does not perform a full control-flow proof.
   * - Reliance on runtime type guards (isParenthesizedExpression,
   *   isLoopOrLabeledStatement) is intentional.
   */

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

  /**
   * Compatibility wrapper for getting the scope of a node across ESLint versions.
   * ESLint 9 moves getScope onto sourceCode; ESLint 8 exposes context.getScope().
   */
  public static getScope(
    context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
    node: TSESTree.Node,
  ): TSESLint.Scope.Scope {
    const sourceCode = (context as any).sourceCode as any;
    const sourceGetScope = sourceCode?.getScope;
    const contextGetScope = (context as any).getScope;

    if (typeof sourceGetScope === 'function') {
      try {
        return sourceGetScope.call(sourceCode, node);
      } catch {
        // Fall through to context.getScope
      }
    }

    if (typeof contextGetScope === 'function') {
      return contextGetScope.call(context);
    }

    throw new Error('getScope is not available in this ESLint version.');
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

    switch (node.type as any) {
      case 'TSNonNullExpression':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'TSSatisfiesExpression':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'ArrayPattern':
        return (node as any).elements.some((element: any) =>
          ASTHelpers.declarationIncludesIdentifier(element),
        );
      case 'ObjectPattern':
        return (node as any).properties.some((property: any) =>
          this.declarationIncludesIdentifier(property),
        );
      case 'AssignmentPattern':
        return this.declarationIncludesIdentifier((node as any).left);
      case 'RestElement':
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'AwaitExpression':
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'AssignmentExpression':
        return (
          this.declarationIncludesIdentifier((node as any).left) ||
          this.declarationIncludesIdentifier((node as any).right)
        );
      case 'BlockStatement':
        return (node as any).body.some((statement: any) =>
          this.declarationIncludesIdentifier(statement),
        );
      case 'ExpressionStatement':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'TryStatement':
        return (
          this.declarationIncludesIdentifier((node as any).block) ||
          this.declarationIncludesIdentifier((node as any).handler) ||
          this.declarationIncludesIdentifier((node as any).finalizer)
        );
      case 'CatchClause':
        return (
          this.declarationIncludesIdentifier((node as any).param) ||
          this.declarationIncludesIdentifier((node as any).body)
        );
      case 'ReturnStatement':
      case 'ThrowStatement':
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'VariableDeclaration':
        return (node as any).declarations.some((decl: any) =>
          this.declarationIncludesIdentifier(decl),
        );
      case 'VariableDeclarator':
        return (
          this.declarationIncludesIdentifier((node as any).id) ||
          this.declarationIncludesIdentifier((node as any).init)
        );
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return (
          (node as any).params.some((param: any) =>
            this.declarationIncludesIdentifier(param),
          ) || this.declarationIncludesIdentifier((node as any).body)
        );
      case 'IfStatement':
        return (
          this.declarationIncludesIdentifier((node as any).test) ||
          this.declarationIncludesIdentifier((node as any).consequent) ||
          this.declarationIncludesIdentifier((node as any).alternate)
        );
      case 'TSTypeAssertion':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'Identifier':
        return true;
      case 'SpreadElement':
        return ASTHelpers.declarationIncludesIdentifier((node as any).argument);
      case 'ChainExpression':
        return ASTHelpers.declarationIncludesIdentifier(
          (node as any).expression,
        );
      case 'ArrayExpression':
        return (node as any).elements.some(
          (element: any) =>
            element &&
            (element.type === 'SpreadElement'
              ? ASTHelpers.declarationIncludesIdentifier(element.argument)
              : ASTHelpers.declarationIncludesIdentifier(element)),
        );
      case 'ObjectExpression':
        return (node as any).properties.some((property: any) => {
          if (property.type === 'Property') {
            return ASTHelpers.declarationIncludesIdentifier(property.value);
          } else if (property.type === 'SpreadElement') {
            return ASTHelpers.declarationIncludesIdentifier(property.argument);
          }
          return false;
        });

      case 'Property':
        return this.declarationIncludesIdentifier((node as any).value);

      case 'BinaryExpression':
      case 'LogicalExpression':
        return (
          this.declarationIncludesIdentifier((node as any).left) ||
          this.declarationIncludesIdentifier((node as any).right)
        );

      case 'UnaryExpression':
      case 'UpdateExpression':
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'MemberExpression':
        if ((node as any).object.type === 'ThisExpression') {
          return true;
        }
        return (
          this.declarationIncludesIdentifier((node as any).object) ||
          this.declarationIncludesIdentifier((node as any).property)
        );

      case 'ImportExpression':
        // Dynamic imports should be considered as having dependencies
        return true;
      case 'CallExpression':
      case 'NewExpression':
        // For function and constructor calls, we care about both the callee and the arguments.
        return (
          this.declarationIncludesIdentifier((node as any).callee) ||
          (node as any).arguments.some((arg: any) =>
            this.declarationIncludesIdentifier(arg),
          )
        );

      case 'ConditionalExpression':
        return (
          this.declarationIncludesIdentifier((node as any).test) ||
          this.declarationIncludesIdentifier((node as any).consequent) ||
          this.declarationIncludesIdentifier((node as any).alternate)
        );
      case 'TemplateLiteral':
        return (node as any).expressions.some((expr: any) =>
          this.declarationIncludesIdentifier(expr),
        );
      case 'TSAsExpression':
        return this.declarationIncludesIdentifier((node as any).expression);

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

    switch (node.type as any) {
      case 'MethodDefinition': {
        const functionBody = (node as any).value.body;
        return (functionBody?.body || [])
          .map((statement: any) =>
            ASTHelpers.classMethodDependenciesOf(statement, graph, className),
          )
          .flat();
      }

      case 'Identifier':
        dependencies.push((node as any).name);
        break;

      case 'ExpressionStatement':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).expression,
          graph,
          className,
        );

      case 'MemberExpression': {
        const memberExpr = node as any;
        if (
          (memberExpr.object.type === 'ThisExpression' &&
            memberExpr.property.type === 'Identifier') ||
          (memberExpr.object.type === 'Identifier' &&
            memberExpr.object.name === className &&
            memberExpr.property.type === 'Identifier')
        ) {
          dependencies.push(memberExpr.property.name);
        } else {
          return [
            ...ASTHelpers.classMethodDependenciesOf(
              memberExpr.object,
              graph,
              className,
            ),
            ...ASTHelpers.classMethodDependenciesOf(
              memberExpr.property,
              graph,
              className,
            ),
          ];
        }
        break;
      }

      case 'TSNonNullExpression':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).expression,
          graph,
          className,
        );
      case 'ArrayPattern':
        return (node as any).elements
          .map((element: any) =>
            ASTHelpers.classMethodDependenciesOf(element, graph, className),
          )
          .flat();
      case 'ObjectPattern':
        return (node as any).properties
          .map((property: any) =>
            ASTHelpers.classMethodDependenciesOf(property, graph, className),
          )
          .flat();
      case 'AssignmentPattern':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).left,
          graph,
          className,
        );
      case 'RestElement':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'AwaitExpression':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'AssignmentExpression': {
        const assignExpr = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            assignExpr.left,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            assignExpr.right,
            graph,
            className,
          ),
        ];
      }
      case 'BlockStatement':
        return (node as any).body
          .map((statement: any) =>
            ASTHelpers.classMethodDependenciesOf(statement, graph, className),
          )
          .flat()
          .filter(Boolean) as string[];
      case 'IfStatement': {
        const ifStmt = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            ifStmt.test,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            ifStmt.consequent,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            ifStmt.alternate,
            graph,
            className,
          ),
        ];
      }
      case 'TSTypeAssertion':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).expression,
          graph,
          className,
        );
      case 'SpreadElement':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'ChainExpression':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).expression,
          graph,
          className,
        );
      case 'ArrayExpression':
        return (node as any).elements
          .map(
            (element: any) =>
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
        return (node as any).properties
          .map((property: any) => {
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
          (node as any).value,
          graph,
          className,
        );

      case 'BinaryExpression':
      case 'LogicalExpression': {
        const binLogExpr = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            binLogExpr.left,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            binLogExpr.right,
            graph,
            className,
          ),
        ];
      }

      case 'UnaryExpression':
      case 'UpdateExpression':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'CallExpression':
      case 'NewExpression': {
        // For function and constructor calls, we care about both the callee and the arguments.
        const callNewExpr = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            callNewExpr.callee,
            graph,
            className,
          ),
          ...callNewExpr.arguments
            .map((arg: any) =>
              ASTHelpers.classMethodDependenciesOf(arg, graph, className),
            )
            .flat(),
        ];
      }

      case 'ConditionalExpression': {
        const condExpr = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            condExpr.test,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            condExpr.consequent,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            condExpr.alternate,
            graph,
            className,
          ),
        ];
      }
      case 'TSAsExpression':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).expression,
          graph,
          className,
        );
      case 'VariableDeclaration':
        return (node as any).declarations
          .map((declaration: any) =>
            ASTHelpers.classMethodDependenciesOf(declaration, graph, className),
          )
          .flat()
          .filter(Boolean);
      case 'VariableDeclarator':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).init,
          graph,
          className,
        );
      case 'ForOfStatement': {
        const forOfStmt = node as any;
        return [
          ...ASTHelpers.classMethodDependenciesOf(
            forOfStmt.left,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            forOfStmt.body,
            graph,
            className,
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            forOfStmt.right,
            graph,
            className,
          ),
        ];
      }
      case 'ForStatement': {
        const forStmt = node as any;
        return [forStmt.body, forStmt.init, forStmt.test, forStmt.update]
          .map((node: any) =>
            ASTHelpers.classMethodDependenciesOf(node, graph, className),
          )
          .flat();
      }
      case 'ThrowStatement':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'TemplateLiteral':
        return (node as any).expressions
          .map((expression: any) =>
            ASTHelpers.classMethodDependenciesOf(expression, graph, className),
          )
          .flat();
      case 'ReturnStatement':
        return ASTHelpers.classMethodDependenciesOf(
          (node as any).argument,
          graph,
          className,
        );
      case 'ArrowFunctionExpression': {
        const arrowFunc = node as any;
        return [
          ...(arrowFunc.params || []).flatMap((param: any) =>
            ASTHelpers.classMethodDependenciesOf(param, graph, className),
          ),
          ...ASTHelpers.classMethodDependenciesOf(
            arrowFunc.body,
            graph,
            className,
          ),
        ];
      }
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
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      return true;
    }
    if (node.type === AST_NODE_TYPES.IfStatement) {
      const ifStmt = node as any;
      const consequentHasReturn = ASTHelpers.hasReturnStatement(
        ifStmt.consequent,
      );
      const alternateHasReturn =
        !!ifStmt.alternate && ASTHelpers.hasReturnStatement(ifStmt.alternate);
      return consequentHasReturn && alternateHasReturn;
    }
    if (node.type === AST_NODE_TYPES.BlockStatement) {
      const blockStmt = node as any;
      for (const statement of blockStmt.body) {
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
    if (node.parent && node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      return true;
    }

    // Checking if the node is exported as default.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) {
      return true;
    }

    // Checking if the node is exported in a list of exports.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === AST_NODE_TYPES.ExportSpecifier &&
      (node.parent.parent as any).exported?.name ===
        (node as TSESTree.Identifier).name
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
  ): node is TSESTree.Node & { expression: TSESTree.Node } {
    // ParenthesizedExpression is not in AST_NODE_TYPES across all ESLint versions
    // so we check the string literal directly for cross-version compatibility.
    return (node as any)?.type === 'ParenthesizedExpression';
  }

  private static returnsJSXValue(
    node: TSESTree.Node | null | undefined,
  ): boolean {
    if (!node) {
      return false;
    }

    if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      return true;
    }

    if (node.type === AST_NODE_TYPES.LogicalExpression) {
      return (
        ASTHelpers.returnsJSXValue((node as any).left) ||
        ASTHelpers.returnsJSXValue((node as any).right)
      );
    }

    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      return (
        ASTHelpers.returnsJSXValue((node as any).consequent) ||
        ASTHelpers.returnsJSXValue((node as any).alternate)
      );
    }

    if (
      node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion ||
      node.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      return ASTHelpers.returnsJSXValue((node as any).expression);
    }

    if (ASTHelpers.isParenthesizedExpression(node)) {
      return ASTHelpers.returnsJSXValue((node as any).expression);
    }

    // Function/class values are not JSX values.
    return false;
  }

  private static returnsJSXFromStatement(
    node: TSESTree.Node | null | undefined,
    context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  ): boolean {
    if (!node) {
      return false;
    }

    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      const arg = (node as any).argument;
      if (arg?.type === AST_NODE_TYPES.Identifier && context) {
        // Resolve variable to its initializer if possible
        const scope = ASTHelpers.getScope(context, arg);

        if (scope) {
          const variable = ASTHelpers.findVariableInScope(scope, arg.name);
          if (variable && variable.defs.length === 1) {
            const def = variable.defs[0];

            // Check if the variable is reassigned after initialization.
            // We only follow variables that are defined once and never reassigned
            // to ensure we're following a deterministic JSX-returning value.
            // This is intentionally conservative to avoid ambiguous multi-write cases,
            // which affects React component detection accuracy.
            const isReassigned = variable.references.some(
              (ref) => ref.isWrite() && !(ref as any).init,
            );
            if (isReassigned) {
              return ASTHelpers.returnsJSXValue(arg);
            }

            if (
              def.type === 'Variable' &&
              def.node.type === AST_NODE_TYPES.VariableDeclarator &&
              def.node.init
            ) {
              // ReturnStatement returns a value; treat function/class initializers as non-JSX values.
              return ASTHelpers.returnsJSXValue(def.node.init);
            }
          }
        } else {
          return ASTHelpers.returnsJSXValue(arg);
        }
      }
      return ASTHelpers.returnsJSXValue(arg);
    }

    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Variable declarations don't return values from the enclosing function.
      return false;
    }

    if (node.type === AST_NODE_TYPES.BlockStatement) {
      return (node as any).body.some((stmt: any) =>
        ASTHelpers.returnsJSXFromStatement(stmt, context),
      );
    }

    if (node.type === AST_NODE_TYPES.IfStatement) {
      return (
        ASTHelpers.returnsJSXFromStatement((node as any).consequent, context) ||
        ASTHelpers.returnsJSXFromStatement((node as any).alternate, context)
      );
    }

    if (node.type === AST_NODE_TYPES.SwitchStatement) {
      return (node as any).cases.some((c: any) =>
        c.consequent.some((stmt: any) =>
          ASTHelpers.returnsJSXFromStatement(stmt, context),
        ),
      );
    }

    if (node.type === AST_NODE_TYPES.TryStatement) {
      return (
        ASTHelpers.returnsJSXFromStatement((node as any).block, context) ||
        ASTHelpers.returnsJSXFromStatement(
          (node as any).handler?.body,
          context,
        ) ||
        ASTHelpers.returnsJSXFromStatement((node as any).finalizer, context)
      );
    }

    if (ASTHelpers.isLoopOrLabeledStatement(node)) {
      return ASTHelpers.returnsJSXFromStatement((node as any).body, context);
    }

    return false;
  }

  public static returnsJSX(
    node: TSESTree.Node | null | undefined,
    context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  ): boolean {
    if (!node) {
      return false;
    }

    if (node.type === AST_NODE_TYPES.ExpressionStatement) {
      // ExpressionStatement does not produce a return value for the surrounding function, so treat as non-returning.
      return false;
    }

    if (
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionDeclaration
    ) {
      const func = node as any;
      if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
        return func.body.type === AST_NODE_TYPES.BlockStatement
          ? ASTHelpers.returnsJSXFromStatement(func.body, context)
          : ASTHelpers.returnsJSXValue(func.body);
      }
      return ASTHelpers.returnsJSXFromStatement(func.body, context);
    }

    if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      return true;
    }

    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Detects `const Component = () => <div />`-style declarations.
      return (node as any).declarations.some((decl: any) =>
        ASTHelpers.returnsJSX(decl.init, context),
      );
    }

    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      return ASTHelpers.returnsJSX((node as any).init, context);
    }

    // Treat remaining nodes as statement-path or value checks.
    return (
      ASTHelpers.returnsJSXFromStatement(node, context) ||
      ASTHelpers.returnsJSXValue(node)
    );
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
        : typeof (context as any).getDeclaredVariables === 'function'
        ? (context as any).getDeclaredVariables.bind(context)
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
