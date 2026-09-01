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
    const sourceCode = (context as any).getSourceCode?.();
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
      if (this.declarationIncludesIdentifier(statement)) {
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
    if (this.isParenthesizedExpression(node)) {
      return this.declarationIncludesIdentifier((node as any).expression);
    }

    switch (node.type as any) {
      case 'TSNonNullExpression':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'TSSatisfiesExpression':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'ArrayPattern':
        return (node as any).elements.some((element: any) =>
          this.declarationIncludesIdentifier(element),
        );
      case 'ObjectPattern':
        return (node as any).properties.some((property: any) =>
          this.declarationIncludesIdentifier(property),
        );
      case 'AssignmentPattern':
        return this.declarationIncludesIdentifier((node as any).right);
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
          this.patternHasDependency((node as any).param) ||
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
          this.patternHasDependency((node as any).id) ||
          this.declarationIncludesIdentifier((node as any).init)
        );
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return (
          (node as any).params.some((param: any) =>
            this.patternHasDependency(param),
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
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'ChainExpression':
        return this.declarationIncludesIdentifier((node as any).expression);
      case 'ArrayExpression':
        return (node as any).elements.some(
          (element: any) =>
            element &&
            (element.type === 'SpreadElement'
              ? this.declarationIncludesIdentifier(element.argument)
              : this.declarationIncludesIdentifier(element)),
        );
      case 'ObjectExpression':
        return (node as any).properties.some((property: any) => {
          if (property.type === 'Property') {
            return (
              (property.computed &&
                this.declarationIncludesIdentifier(property.key)) ||
              this.declarationIncludesIdentifier(property.value)
            );
          } else if (property.type === 'SpreadElement') {
            return this.declarationIncludesIdentifier(property.argument);
          }
          return false;
        });

      case 'Property':
        return (
          ((node as any).computed &&
            this.declarationIncludesIdentifier((node as any).key)) ||
          this.declarationIncludesIdentifier((node as any).value)
        );

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

      /**
       * Loops, switches and the remaining compound forms. Every node type this
       * switch omits falls to `default: false` — "references nothing" — so an
       * omission is not a missed detection but an inverted answer: a function
       * whose only dependencies sit inside a `for` body reads as free-standing.
       */
      case 'ForStatement':
        return (
          this.declarationIncludesIdentifier((node as any).init) ||
          this.declarationIncludesIdentifier((node as any).test) ||
          this.declarationIncludesIdentifier((node as any).update) ||
          this.declarationIncludesIdentifier((node as any).body)
        );
      case 'ForOfStatement':
      case 'ForInStatement':
        return (
          this.declarationIncludesIdentifier((node as any).left) ||
          this.declarationIncludesIdentifier((node as any).right) ||
          this.declarationIncludesIdentifier((node as any).body)
        );
      case 'WhileStatement':
      case 'DoWhileStatement':
        return (
          this.declarationIncludesIdentifier((node as any).test) ||
          this.declarationIncludesIdentifier((node as any).body)
        );
      case 'SwitchStatement':
        return (
          this.declarationIncludesIdentifier((node as any).discriminant) ||
          (node as any).cases.some((switchCase: any) =>
            this.declarationIncludesIdentifier(switchCase),
          )
        );
      case 'SwitchCase':
        return (
          this.declarationIncludesIdentifier((node as any).test) ||
          (node as any).consequent.some((statement: any) =>
            this.declarationIncludesIdentifier(statement),
          )
        );
      case 'LabeledStatement':
        return this.declarationIncludesIdentifier((node as any).body);
      case 'SequenceExpression':
        return (node as any).expressions.some((expression: any) =>
          this.declarationIncludesIdentifier(expression),
        );
      case 'TaggedTemplateExpression':
        return (
          this.declarationIncludesIdentifier((node as any).tag) ||
          this.declarationIncludesIdentifier((node as any).quasi)
        );
      case 'YieldExpression':
        return this.declarationIncludesIdentifier((node as any).argument);
      case 'ClassDeclaration':
      case 'ClassExpression':
        return (
          this.declarationIncludesIdentifier((node as any).superClass) ||
          this.declarationIncludesIdentifier((node as any).body)
        );
      case 'ClassBody':
        return (node as any).body.some((member: any) =>
          this.declarationIncludesIdentifier(member),
        );
      case 'MethodDefinition':
      case 'PropertyDefinition':
        return (
          ((node as any).computed &&
            this.declarationIncludesIdentifier((node as any).key)) ||
          this.declarationIncludesIdentifier((node as any).value)
        );
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        return this.declarationIncludesIdentifier((node as any).declaration);

      /**
       * JSX subtrees carry references like any other expression. Without these
       * cases a component that renders `<Component />` or `<div x={value} />`
       * reads as depending on nothing, so a caller asking "can this be hoisted
       * out of its enclosing scope?" gets `true` for a closure that cannot be.
       */
      case 'JSXElement':
        return (
          this.declarationIncludesIdentifier((node as any).openingElement) ||
          (node as any).children.some((child: any) =>
            this.declarationIncludesIdentifier(child),
          )
        );
      case 'JSXFragment':
        return (node as any).children.some((child: any) =>
          this.declarationIncludesIdentifier(child),
        );
      case 'JSXOpeningElement':
        return (
          this.declarationIncludesIdentifier((node as any).name) ||
          (node as any).attributes.some((attribute: any) =>
            this.declarationIncludesIdentifier(attribute),
          )
        );
      case 'JSXIdentifier':
        // A lowercase tag is an intrinsic element (`div`), not a binding; an
        // capitalized one resolves to a component in scope.
        return !/^[a-z]/.test((node as any).name);
      case 'JSXMemberExpression':
        // `<Foo.Bar />` references `Foo`.
        return true;
      case 'JSXAttribute':
        return this.declarationIncludesIdentifier((node as any).value);
      case 'JSXSpreadAttribute':
      case 'JSXSpreadChild':
        return this.declarationIncludesIdentifier(
          (node as any).argument ?? (node as any).expression,
        );
      case 'JSXExpressionContainer':
        return this.declarationIncludesIdentifier((node as any).expression);

      default:
        return false;
    }
  }

  /**
   * Checks if a pattern (in a declaration or parameter) contains any dependencies.
   * Patterns themselves define new bindings (Identifiers), but they can contain
   * dependencies in computed keys or default values (AssignmentPattern).
   */
  private static patternHasDependency(node: TSESTree.Node | null): boolean {
    if (!node) {
      return false;
    }

    switch (node.type as any) {
      case 'Identifier':
        return false; // Declaration site, not a reference
      case 'AssignmentPattern':
        return this.declarationIncludesIdentifier((node as any).right);
      case 'ArrayPattern':
        return (node as any).elements.some((element: any) =>
          this.patternHasDependency(element),
        );
      case 'ObjectPattern':
        return (node as any).properties.some((property: any) =>
          this.patternHasDependency(property),
        );
      case 'Property':
        return (
          ((node as any).computed &&
            this.declarationIncludesIdentifier((node as any).key)) ||
          this.patternHasDependency((node as any).value)
        );
      case 'RestElement':
        return this.patternHasDependency((node as any).argument);
      default:
        // For anything else (like nested expressions in computed keys),
        // fall back to the general check.
        return this.declarationIncludesIdentifier(node);
    }
  }

  /**
   * Keys that a child walk must not follow: `parent` is the only back-edge in
   * an ESTree tree and would make traversal non-terminating, while the rest
   * carry positions and raw source rather than referenceable expressions.
   */
  private static readonly NON_TRAVERSABLE_NODE_KEYS = new Set([
    'parent',
    'range',
    'loc',
    'type',
    'comments',
    'tokens',
  ]);

  /**
   * Collects the class members a method body references, for the ordering
   * graph of class-methods-read-top-to-bottom.
   *
   * An edge exists exactly when a member is reached through `this.<member>`
   * (or `<ClassName>.<member>` for statics), anywhere in the body and under
   * any enclosing statement or expression form. A bare identifier is never an
   * edge: a local, a parameter, a destructured binding or an import that
   * happens to share a member's name is not a reference to that member.
   */
  public static classMethodDependenciesOf(
    node: TSESTree.Node | null,
    graph: Graph,
    className: string,
  ): string[] {
    return this.classMemberNamesReferenced(node, className).filter((dep) => {
      // Only include dependencies that exist exactly in the graph
      // This prevents substring matches (e.g., 'nextMatches' vs 'nextMatchesWithResults')
      return graph?.[dep] !== undefined && graph?.[dep]?.type !== 'property';
    });
  }

  /**
   * Every class member a node reaches through `this.<member>` (or
   * `<ClassName>.<member>`), fields included and unfiltered by any graph.
   *
   * Whatever a member's body reads, it reads as soon as that body runs, so a
   * caller deciding whether an invocation is order-sensitive needs the field
   * reads that `classMethodDependenciesOf` drops. A read nested in a callback
   * counts: `arr.map((x) => this.field)` runs the callback before the
   * enclosing body returns.
   */
  public static classMemberNamesReferenced(
    node: TSESTree.Node | null,
    className: string,
  ): string[] {
    const references: string[] = [];
    this.collectClassMemberReferences(node, className, true, references);
    return [...new Set(references)];
  }

  /**
   * Collects the class members a property initializer reads while that
   * initializer runs.
   *
   * Field declaration order is observable, unlike method order: a field read
   * before its own declaration evaluates to `undefined` under the `private`
   * spelling and throws under the ECMA `#` spelling, so a reordering fixer must
   * not hoist a reader above the field it reads. A read inside a function body
   * is deferred to call time and constrains nothing — except when that function
   * is an immediately invoked arrow, which runs during initialization and keeps
   * the enclosing `this`.
   */
  public static classMemberNamesReadEagerly(
    node: TSESTree.Node | null,
    className: string,
  ): string[] {
    const names: string[] = [];
    this.collectEagerClassMemberReads(node, className, names);
    return [...new Set(names)];
  }

  private static collectEagerClassMemberReads(
    node: unknown,
    className: string,
    names: string[],
  ): void {
    if (!this.isNode(node)) {
      return;
    }

    switch (node.type as string) {
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'ClassDeclaration':
      case 'ClassExpression':
        return;

      case 'CallExpression': {
        const { callee } = node as TSESTree.CallExpression;
        // A non-arrow IIFE rebinds `this`, so only an arrow's body reads this
        // instance eagerly.
        if (callee.type === 'ArrowFunctionExpression') {
          this.collectEagerClassMemberReads(callee.body, className, names);
        }
        break;
      }

      case 'MemberExpression': {
        const memberName = this.classMemberNameReferencedBy(
          node,
          className,
          true,
        );
        if (memberName !== null) {
          names.push(memberName);
        }
        break;
      }

      default:
        break;
    }

    for (const [key, value] of Object.entries(node)) {
      if (ASTHelpers.NON_TRAVERSABLE_NODE_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const element of value) {
          this.collectEagerClassMemberReads(element, className, names);
        }
        continue;
      }
      this.collectEagerClassMemberReads(value, className, names);
    }
  }

  /**
   * @param isThisTheInstance whether `this` still denotes the instance of the
   * class being graphed. A nested non-arrow function or class rebinds it, so a
   * `this.member` inside one names a different object entirely.
   */
  private static collectClassMemberReferences(
    node: unknown,
    className: string,
    isThisTheInstance: boolean,
    dependencies: string[],
  ): void {
    if (!this.isNode(node)) {
      return;
    }

    switch (node.type as string) {
      case 'MethodDefinition':
      case 'TSAbstractMethodDefinition': {
        // The method's own function expression does not rebind `this`, so its
        // parameters and body PRESERVE whatever context they were handed —
        // they do not restore one. Hardcoding `true` here discarded the
        // `false` a nested class had just handed down, crediting `this.x`
        // inside a nested class's method to the enclosing class (#2193).
        // A computed key and decorators evaluate outside the instance, hence
        // the split.
        const method = node as any;
        this.collectClassMemberReferences(
          method.key,
          className,
          false,
          dependencies,
        );
        for (const decorator of method.decorators || []) {
          this.collectClassMemberReferences(
            decorator,
            className,
            false,
            dependencies,
          );
        }
        for (const param of method.value?.params || []) {
          this.collectClassMemberReferences(
            param,
            className,
            isThisTheInstance,
            dependencies,
          );
        }
        this.collectClassMemberReferences(
          method.value?.body,
          className,
          isThisTheInstance,
          dependencies,
        );
        return;
      }

      case 'FunctionExpression':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'ClassDeclaration':
      case 'ClassExpression': {
        // Traversal continues so `<ClassName>.<member>` statics stay visible,
        // but `this` no longer denotes the graphed instance.
        const nested: string[] = [];
        this.walkChildNodes(node, className, false, nested);
        // A nested class body SHADOWS the private names it declares: its `#q`
        // is a member of that class, distinct from an enclosing class's `#q`,
        // so reads of it constrain the nested layout rather than this one.
        // Private names the nested class does not declare still resolve
        // outward, so only the declared ones are dropped. Filtering as the
        // recursion unwinds composes across any depth of nesting.
        const shadowed = this.privateNamesDeclaredBy(node);
        dependencies.push(...nested.filter((name) => !shadowed.has(name)));
        return;
      }

      case 'MemberExpression': {
        const memberName = this.classMemberNameReferencedBy(
          node,
          className,
          isThisTheInstance,
        );
        if (memberName !== null) {
          dependencies.push(memberName);
        }
        break;
      }

      default:
        break;
    }

    // Every remaining node type reaches its children through the generic walk.
    // An allowlist of node types silently drops whatever it forgets, which
    // loses edges rather than reporting them (try/catch, switch, loops).
    this.walkChildNodes(node, className, isThisTheInstance, dependencies);
  }

  /**
   * Resolves the class member a member expression names, or null when the
   * expression reads some other object.
   */
  private static classMemberNameReferencedBy(
    node: TSESTree.Node,
    className: string,
    isThisTheInstance: boolean,
  ): string | null {
    const { object, property, computed } = node as any;

    // A `#name` resolves LEXICALLY: it is a syntax error unless a class body
    // enclosing the reference declares it, so the receiver it is read through
    // cannot change which member it names. `other.#helper` and `this.#helper`
    // reach the same member, which is why this branch precedes the receiver
    // test that the dotted spellings need. Requiring `this`/<ClassName> here
    // dropped the read a static initializer makes through another value of
    // the same class, and with it the constraint that keeps the field's
    // declaration above its reader (#2022). The `#` is part of the name so
    // `#helper` and `helper` stay distinct members.
    if (!computed && property?.type === 'PrivateIdentifier') {
      return `#${property.name}`;
    }

    const readsInstance =
      object?.type === 'ThisExpression' && isThisTheInstance;
    // An anonymous class expression has an empty name, which no identifier
    // can match.
    const readsStatic =
      !!className && object?.type === 'Identifier' && object.name === className;
    if (!readsInstance && !readsStatic) {
      return null;
    }

    if (!computed && property?.type === 'Identifier') {
      return property.name;
    }
    // `this['helper']` names the member as precisely as `this.helper` does,
    // whereas `this[key]` names one only at runtime.
    if (
      computed &&
      property?.type === 'Literal' &&
      typeof property.value === 'string'
    ) {
      return property.value;
    }
    return null;
  }

  /**
   * The ECMA private names a class body declares, spelled as the graph spells
   * them. A private name is scoped to the body that declares it, so this set
   * is what an enclosing class must not mistake for its own members.
   */
  private static privateNamesDeclaredBy(node: TSESTree.Node): Set<string> {
    const names = new Set<string>();
    const members = (node as any).body?.body;
    if (!Array.isArray(members)) {
      return names;
    }
    for (const member of members) {
      const key = member?.key;
      if (key?.type === 'PrivateIdentifier') {
        names.add(`#${key.name}`);
      }
    }
    return names;
  }

  private static walkChildNodes(
    node: TSESTree.Node,
    className: string,
    isThisTheInstance: boolean,
    dependencies: string[],
  ): void {
    for (const [key, value] of Object.entries(node)) {
      if (ASTHelpers.NON_TRAVERSABLE_NODE_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const element of value) {
          this.collectClassMemberReferences(
            element,
            className,
            isThisTheInstance,
            dependencies,
          );
        }
        continue;
      }
      this.collectClassMemberReferences(
        value,
        className,
        isThisTheInstance,
        dependencies,
      );
    }
  }

  public static isNode(value: unknown): value is TSESTree.Node {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  /**
   * A `return` inside a nested function returns from THAT function, so it can
   * never satisfy the enclosing one. Descent stops at every function boundary
   * for that reason.
   *
   * The boundary applies to CHILDREN only: a caller handing a function node is
   * asking about that function's own body, so unwrapping the handed node is the
   * question, not a leak. Without the boundary the answer was decided by
   * spelling — a `function inner() { return true; }` nested in a filter
   * callback was credited to the callback (`body` is a single-node key the
   * generic walk descends), while the identical `const inner = function () {
   * return true; };` was not (`declarations` is an array key it skips) (#2194).
   */
  private static isFunctionScopeBoundary(node: TSESTree.Node): boolean {
    return (
      node.type === AST_NODE_TYPES.FunctionDeclaration ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      (node.type as string) === 'TSDeclareFunction'
    );
  }

  /** `hasReturnStatement` for a CHILD node, which a function boundary stops. */
  private static childHasReturnStatement(node: TSESTree.Node): boolean {
    if (this.isFunctionScopeBoundary(node)) {
      return false;
    }
    return this.hasReturnStatement(node);
  }

  public static hasReturnStatement(node: TSESTree.Node): boolean {
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      return true;
    }
    if (node.type === AST_NODE_TYPES.IfStatement) {
      const ifStmt = node as any;
      const consequentHasReturn = this.childHasReturnStatement(
        ifStmt.consequent,
      );
      const alternateHasReturn =
        !!ifStmt.alternate && this.childHasReturnStatement(ifStmt.alternate);
      return consequentHasReturn && alternateHasReturn;
    }
    if (node.type === AST_NODE_TYPES.BlockStatement) {
      const blockStmt = node as any;
      for (const statement of blockStmt.body) {
        if (this.childHasReturnStatement(statement)) {
          return true;
        }
      }
    }

    for (const key in node) {
      if (key === 'parent') {
        continue; // Ignore the parent property
      }
      const value = node[key as keyof typeof node];
      if (this.isNode(value)) {
        if (this.childHasReturnStatement(value)) {
          return true;
        }
      }
    }

    return false;
  }

  public static isNodeExported(node: TSESTree.Node) {
    // Checking if the node is exported as a named export.
    if (
      node.parent &&
      node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
    ) {
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

  /**
   * Is this VALUE a JSX value?
   *
   * The identifier arm is what makes the answer independent of where the value
   * sits. It used to live only in `returnsJSXFromStatement`'s ReturnStatement
   * branch, so `() => { return view; }` resolved `view` to its initializer
   * while the identical `() => view` did not, and a component spelled with a
   * concise body was silently exempt (#2186). Both spellings route here now.
   *
   * `resolving` carries the declarators already followed: `const a = a` and
   * mutually-referential bindings would otherwise recur forever.
   */
  private static returnsJSXValue(
    node: TSESTree.Node | null | undefined,
    context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
    resolving?: ReadonlySet<TSESTree.Node>,
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
        this.returnsJSXValue((node as any).left, context, resolving) ||
        this.returnsJSXValue((node as any).right, context, resolving)
      );
    }

    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      return (
        this.returnsJSXValue((node as any).consequent, context, resolving) ||
        this.returnsJSXValue((node as any).alternate, context, resolving)
      );
    }

    if (
      node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion ||
      node.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      return this.returnsJSXValue((node as any).expression, context, resolving);
    }

    if (this.isParenthesizedExpression(node)) {
      return this.returnsJSXValue((node as any).expression, context, resolving);
    }

    if (node.type === AST_NODE_TYPES.Identifier && context) {
      return this.identifierHoldsJSXValue(node, context, resolving);
    }

    // Function/class values are not JSX values.
    return false;
  }

  /**
   * Whether an identifier names a binding whose value is JSX.
   *
   * Only a binding written exactly once is followed: a reassigned one does not
   * deterministically name its initializer's value, and following it would
   * trade a conservative miss for a wrong answer. A function or class
   * initializer answers `false` here, same as anywhere else — the value is a
   * function, not JSX.
   */
  private static identifierHoldsJSXValue(
    node: TSESTree.Identifier,
    context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
    resolving?: ReadonlySet<TSESTree.Node>,
  ): boolean {
    const scope = this.getScope(context, node);
    if (!scope) {
      return false;
    }

    const variable = this.findVariableInScope(scope, node.name);
    if (!variable || variable.defs.length !== 1) {
      return false;
    }

    const isReassigned = variable.references.some(
      (ref) => ref.isWrite() && !(ref as any).init,
    );
    if (isReassigned) {
      return false;
    }

    const def = variable.defs[0];
    if (
      def.type !== 'Variable' ||
      def.node.type !== AST_NODE_TYPES.VariableDeclarator ||
      !def.node.init
    ) {
      return false;
    }

    if (resolving?.has(def.node)) {
      return false;
    }

    const followed = new Set(resolving ?? []);
    followed.add(def.node);
    return this.returnsJSXValue(def.node.init, context, followed);
  }

  private static returnsJSXFromStatement(
    node: TSESTree.Node | null | undefined,
    context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  ): boolean {
    if (!node) {
      return false;
    }

    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      // A ReturnStatement returns a VALUE, so the whole question — identifier
      // resolution included — belongs to returnsJSXValue. Keeping a private
      // copy of the resolution here is what made the answer depend on whether
      // the value sat behind a `return` or in a concise arrow body (#2186).
      return this.returnsJSXValue((node as any).argument, context);
    }

    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Variable declarations don't return values from the enclosing function.
      return false;
    }

    if (node.type === AST_NODE_TYPES.BlockStatement) {
      return (node as any).body.some((stmt: any) =>
        this.returnsJSXFromStatement(stmt, context),
      );
    }

    if (node.type === AST_NODE_TYPES.IfStatement) {
      return (
        this.returnsJSXFromStatement((node as any).consequent, context) ||
        this.returnsJSXFromStatement((node as any).alternate, context)
      );
    }

    if (node.type === AST_NODE_TYPES.SwitchStatement) {
      return (node as any).cases.some((c: any) =>
        c.consequent.some((stmt: any) =>
          this.returnsJSXFromStatement(stmt, context),
        ),
      );
    }

    if (node.type === AST_NODE_TYPES.TryStatement) {
      return (
        this.returnsJSXFromStatement((node as any).block, context) ||
        this.returnsJSXFromStatement((node as any).handler?.body, context) ||
        this.returnsJSXFromStatement((node as any).finalizer, context)
      );
    }

    if (this.isLoopOrLabeledStatement(node)) {
      return this.returnsJSXFromStatement((node as any).body, context);
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
          ? this.returnsJSXFromStatement(func.body, context)
          : this.returnsJSXValue(func.body, context);
      }
      return this.returnsJSXFromStatement(func.body, context);
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
        this.returnsJSX(decl.init, context),
      );
    }

    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      return this.returnsJSX((node as any).init, context);
    }

    // Treat remaining nodes as statement-path or value checks.
    return (
      this.returnsJSXFromStatement(node, context) ||
      this.returnsJSXValue(node, context)
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
    const sourceCode = context.getSourceCode();
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
   * Checks if a call expression or new expression is a call to HttpsError.
   * Handles both 'HttpsError' and 'https.HttpsError'.
   */
  public static isHttpsErrorCall(
    callee: TSESTree.LeftHandSideExpression,
  ): boolean {
    if (callee.type === AST_NODE_TYPES.MemberExpression) {
      return (
        callee.object.type === AST_NODE_TYPES.Identifier &&
        callee.object.name === 'https' &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'HttpsError'
      );
    } else if (callee.type === AST_NODE_TYPES.Identifier) {
      return callee.name === 'HttpsError';
    }
    return false;
  }

  /**
   * Checks if a call expression is a call to toHttpsError.
   * Handles both 'toHttpsError' and 'https.toHttpsError'.
   */
  public static isToHttpsErrorCall(
    callee: TSESTree.LeftHandSideExpression,
  ): boolean {
    if (callee.type === AST_NODE_TYPES.MemberExpression) {
      return (
        callee.object.type === AST_NODE_TYPES.Identifier &&
        callee.object.name === 'https' &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'toHttpsError'
      );
    } else if (callee.type === AST_NODE_TYPES.Identifier) {
      return callee.name === 'toHttpsError';
    }
    return false;
  }

  /**
   * Unwraps TypeScript-specific nodes (assertions, non-null, satisfies) and
   * parenthesized expressions to get to the underlying expression.
   */
  public static unwrapTSAssertions(node: TSESTree.Node): TSESTree.Node {
    let inner = node;
    while (
      inner &&
      (inner.type === AST_NODE_TYPES.TSAsExpression ||
        inner.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        inner.type === AST_NODE_TYPES.TSNonNullExpression ||
        inner.type === AST_NODE_TYPES.TSTypeAssertion ||
        (inner as any).type === 'ParenthesizedExpression')
    ) {
      inner = (inner as any).expression;
    }
    return inner;
  }

  /**
   * Calls that wrap a component/hook definition without renaming it, so the
   * binding they are assigned to still names the wrapped function
   * (`const Component = memo(() => ...)`).
   */
  private static readonly TRANSPARENT_WRAPPER_CALLEES = new Set([
    'forwardRef',
    'memo',
    'observer',
    'useCallback',
    'useMemo',
  ]);

  private static isFunctionNode(
    node: TSESTree.Node,
  ): node is
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration {
    return (
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionDeclaration
    );
  }

  private static isTransparentWrapperCall(
    node: TSESTree.CallExpression,
  ): boolean {
    return this.hasCalleeNamed(node, this.TRANSPARENT_WRAPPER_CALLEES);
  }

  /**
   * Calls whose function argument IS a component render function. `memo`,
   * `forwardRef` and `observer` define a component out of the callback they are
   * handed, so that callback is a render path even with no binding to take a
   * name from. `useCallback`/`useMemo` are deliberately absent: they wrap a
   * value or an event handler produced inside a component, not a component.
   */
  private static readonly COMPONENT_DEFINING_CALLEES = new Set([
    'forwardRef',
    'memo',
    'observer',
  ]);

  private static hasCalleeNamed(
    node: TSESTree.CallExpression,
    names: ReadonlySet<string>,
  ): boolean {
    const { callee } = node;
    if (callee.type === AST_NODE_TYPES.Identifier) {
      return names.has(callee.name);
    }
    return (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      names.has(callee.property.name)
    );
  }

  /**
   * Whether an anonymous function is the argument of a call that defines a
   * component from it (`memo(() => <div />)`, `React.forwardRef((p, ref) =>
   * ...)`). TS assertions between the function and the call are stepped over so
   * `memo((() => <div />) as FC)` classifies the same way.
   */
  private static isComponentDefiningArgument(node: TSESTree.Node): boolean {
    let child: TSESTree.Node = node;
    let parent: TSESTree.Node | undefined = node.parent;
    while (parent) {
      if (
        parent.type === AST_NODE_TYPES.TSAsExpression ||
        parent.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        parent.type === AST_NODE_TYPES.TSNonNullExpression ||
        parent.type === AST_NODE_TYPES.TSTypeAssertion
      ) {
        child = parent;
        parent = parent.parent;
        continue;
      }
      if (parent.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      return (
        parent.arguments.includes(child as TSESTree.CallExpressionArgument) &&
        this.hasCalleeNamed(parent, this.COMPONENT_DEFINING_CALLEES)
      );
    }
    return false;
  }

  private static staticPropertyName(
    key: TSESTree.Node,
    computed: boolean,
  ): string | null {
    if (computed) {
      return null;
    }
    if (key.type === AST_NODE_TYPES.Identifier) {
      return key.name;
    }
    if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
      return key.value;
    }
    return null;
  }

  /**
   * Resolves the name a function is known by: its own identifier, or the
   * binding it is assigned to (variable, object property, class field,
   * assignment target). Returns null only when the function is truly
   * anonymous, e.g. an inline callback argument such as `items.map(() => ...)`.
   */
  public static inferFunctionName(
    node:
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionExpression
      | TSESTree.FunctionDeclaration,
  ): string | null {
    if (node.id?.name) {
      return node.id.name;
    }

    let child: TSESTree.Node = node;
    let parent: TSESTree.Node | undefined = node.parent;

    while (parent) {
      switch (parent.type) {
        case AST_NODE_TYPES.VariableDeclarator:
          return parent.id.type === AST_NODE_TYPES.Identifier
            ? parent.id.name
            : null;
        case AST_NODE_TYPES.Property:
          return this.staticPropertyName(parent.key, parent.computed);
        case AST_NODE_TYPES.PropertyDefinition:
        case AST_NODE_TYPES.MethodDefinition:
          return this.staticPropertyName(parent.key, parent.computed);
        case AST_NODE_TYPES.AssignmentExpression: {
          const { left } = parent;
          if (left.type === AST_NODE_TYPES.Identifier) {
            return left.name;
          }
          if (left.type === AST_NODE_TYPES.MemberExpression) {
            return this.staticPropertyName(left.property, left.computed);
          }
          return null;
        }
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
          child = parent;
          parent = parent.parent;
          continue;
        case AST_NODE_TYPES.CallExpression:
          // Only step through wrappers that preserve identity; an arbitrary
          // callback argument (`items.map(fn)`) is not named by whatever the
          // call's result is assigned to.
          if (
            parent.arguments.includes(
              child as TSESTree.CallExpressionArgument,
            ) &&
            this.isTransparentWrapperCall(parent)
          ) {
            child = parent;
            parent = parent.parent;
            continue;
          }
          return null;
        default:
          return null;
      }
    }

    return null;
  }

  /**
   * React's universal convention: only PascalCase-initial identifiers are
   * components, and only `use`-prefixed ones are hooks. A camelCase name is a
   * plain helper or a render-prop callback.
   */
  private static isComponentOrHookName(name: string): boolean {
    return /^[A-Z]/.test(name) || /^use[A-Z0-9_]/.test(name);
  }

  /**
   * Reports whether a node sits anywhere inside a React component or hook, so a
   * rule whose remediation is a hook call (useCallback/useMemo/useState) can
   * stay silent where that call would be a Rules-of-Hooks violation: module
   * scope, a plain helper function, or a test body such as `it(() => ...)`.
   *
   * The whole enclosing-function ancestry is consulted, not just the nearest
   * function: a `.map()` render callback inside a component is still a render
   * path and must stay reportable.
   *
   * Classification is name-first. A function the developer named is judged by
   * that name alone — `buildTree` is not a component even though it returns
   * JSX, because the name is an explicit signal about its role. Only a truly
   * anonymous function falls back to "does it return JSX", which is what makes
   * `memo(() => <div />)` a component.
   *
   * Both component spellings answer the moment they are met, walking outwards,
   * so the question stays RELATIVE: is a render function interposed between the
   * node and whatever encloses it further out? A component nested in a plain
   * helper is still a component, and the hook is legal inside it — `function
   * makeCard() { return memo(() => <X onClick={...} />); }` is a render path
   * even though `makeCard` is not.
   *
   * The remaining `hasNamedNonComponent` veto only settles the case where no
   * component was found at all. It keeps a bare callback such as
   * `items.map((i) => <Row />)` inside a plain helper silent: that callback is
   * anonymous and returns JSX, but nothing turns it into a component, so it is
   * no more of a render path than the helper holding it.
   */
  public static isInsideComponentOrHook(
    node: TSESTree.Node,
    context?: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  ): boolean {
    const anonymousFunctions: TSESTree.Node[] = [];
    let hasNamedNonComponent = false;

    let current: TSESTree.Node | undefined = node.parent;
    while (current) {
      if (this.isFunctionNode(current)) {
        const name = this.inferFunctionName(current);
        if (name === null) {
          if (
            this.isComponentDefiningArgument(current) &&
            this.returnsJSX(current, context)
          ) {
            return true;
          }
          anonymousFunctions.push(current);
        } else if (this.isComponentOrHookName(name)) {
          return true;
        } else {
          hasNamedNonComponent = true;
        }
      }
      current = current.parent;
    }

    if (hasNamedNonComponent) {
      return false;
    }

    return anonymousFunctions.some((fn) => this.returnsJSX(fn, context));
  }

  /**
   * Helper to get ancestors of a node in a way that is compatible with both ESLint v8 and v9.
   * ESLint v9 drops the rule-context `getAncestors()` in favour of
   * `SourceCode#getAncestors(node)`, so the SourceCode is asked first and the
   * context method is the fallback. The SourceCode itself is reached through
   * `getSourceCode()`, which every supported major exposes.
   */
  public static getAncestors(
    context: {
      getSourceCode?: () => unknown;
      getAncestors?: () => TSESTree.Node[];
    },
    node: TSESTree.Node,
  ): TSESTree.Node[] {
    const sourceCode = context.getSourceCode?.() as
      | { getAncestors?: (node: TSESTree.Node) => TSESTree.Node[] }
      | null
      | undefined;
    return (
      sourceCode?.getAncestors?.(node) ??
      (context.getAncestors ? context.getAncestors() : [])
    );
  }
}
