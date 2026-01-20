"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASTHelpers = void 0;
const utils_1 = require("@typescript-eslint/utils");
class ASTHelpers {
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
    static findVariableInScope(scope, name) {
        let current = scope;
        while (current) {
            const variable = current.set?.get(name) ??
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
    static getScope(context, node) {
        const sourceCode = context.sourceCode;
        const sourceGetScope = sourceCode?.getScope;
        const contextGetScope = context.getScope;
        if (typeof sourceGetScope === 'function') {
            try {
                return sourceGetScope.call(sourceCode, node);
            }
            catch {
                // Fall through to context.getScope
            }
        }
        if (typeof contextGetScope === 'function') {
            return contextGetScope.call(context);
        }
        throw new Error('getScope is not available in this ESLint version.');
    }
    static blockIncludesIdentifier(block) {
        for (const statement of block.body) {
            if (this.declarationIncludesIdentifier(statement)) {
                return true;
            }
        }
        return false;
    }
    static declarationIncludesIdentifier(node) {
        if (!node) {
            return false;
        }
        // Gracefully handle ParenthesizedExpression without widening AST node types
        if (this.isParenthesizedExpression(node)) {
            return this.declarationIncludesIdentifier(node.expression);
        }
        switch (node.type) {
            case 'TSNonNullExpression':
                return this.declarationIncludesIdentifier(node.expression);
            case 'TSSatisfiesExpression':
                return this.declarationIncludesIdentifier(node.expression);
            case 'ArrayPattern':
                return node.elements.some((element) => this.declarationIncludesIdentifier(element));
            case 'ObjectPattern':
                return node.properties.some((property) => this.declarationIncludesIdentifier(property));
            case 'AssignmentPattern':
                return this.declarationIncludesIdentifier(node.right);
            case 'RestElement':
                return this.declarationIncludesIdentifier(node.argument);
            case 'AwaitExpression':
                return this.declarationIncludesIdentifier(node.argument);
            case 'AssignmentExpression':
                return (this.declarationIncludesIdentifier(node.left) ||
                    this.declarationIncludesIdentifier(node.right));
            case 'BlockStatement':
                return node.body.some((statement) => this.declarationIncludesIdentifier(statement));
            case 'ExpressionStatement':
                return this.declarationIncludesIdentifier(node.expression);
            case 'TryStatement':
                return (this.declarationIncludesIdentifier(node.block) ||
                    this.declarationIncludesIdentifier(node.handler) ||
                    this.declarationIncludesIdentifier(node.finalizer));
            case 'CatchClause':
                return (this.patternHasDependency(node.param) ||
                    this.declarationIncludesIdentifier(node.body));
            case 'ReturnStatement':
            case 'ThrowStatement':
                return this.declarationIncludesIdentifier(node.argument);
            case 'VariableDeclaration':
                return node.declarations.some((decl) => this.declarationIncludesIdentifier(decl));
            case 'VariableDeclarator':
                return (this.patternHasDependency(node.id) ||
                    this.declarationIncludesIdentifier(node.init));
            case 'FunctionDeclaration':
            case 'FunctionExpression':
            case 'ArrowFunctionExpression':
                return (node.params.some((param) => this.patternHasDependency(param)) || this.declarationIncludesIdentifier(node.body));
            case 'IfStatement':
                return (this.declarationIncludesIdentifier(node.test) ||
                    this.declarationIncludesIdentifier(node.consequent) ||
                    this.declarationIncludesIdentifier(node.alternate));
            case 'TSTypeAssertion':
                return this.declarationIncludesIdentifier(node.expression);
            case 'Identifier':
                return true;
            case 'SpreadElement':
                return this.declarationIncludesIdentifier(node.argument);
            case 'ChainExpression':
                return this.declarationIncludesIdentifier(node.expression);
            case 'ArrayExpression':
                return node.elements.some((element) => element &&
                    (element.type === 'SpreadElement'
                        ? this.declarationIncludesIdentifier(element.argument)
                        : this.declarationIncludesIdentifier(element)));
            case 'ObjectExpression':
                return node.properties.some((property) => {
                    if (property.type === 'Property') {
                        return ((property.computed &&
                            this.declarationIncludesIdentifier(property.key)) ||
                            this.declarationIncludesIdentifier(property.value));
                    }
                    else if (property.type === 'SpreadElement') {
                        return this.declarationIncludesIdentifier(property.argument);
                    }
                    return false;
                });
            case 'Property':
                return ((node.computed &&
                    this.declarationIncludesIdentifier(node.key)) ||
                    this.declarationIncludesIdentifier(node.value));
            case 'BinaryExpression':
            case 'LogicalExpression':
                return (this.declarationIncludesIdentifier(node.left) ||
                    this.declarationIncludesIdentifier(node.right));
            case 'UnaryExpression':
            case 'UpdateExpression':
                return this.declarationIncludesIdentifier(node.argument);
            case 'MemberExpression':
                if (node.object.type === 'ThisExpression') {
                    return true;
                }
                return (this.declarationIncludesIdentifier(node.object) ||
                    this.declarationIncludesIdentifier(node.property));
            case 'ImportExpression':
                // Dynamic imports should be considered as having dependencies
                return true;
            case 'CallExpression':
            case 'NewExpression':
                // For function and constructor calls, we care about both the callee and the arguments.
                return (this.declarationIncludesIdentifier(node.callee) ||
                    node.arguments.some((arg) => this.declarationIncludesIdentifier(arg)));
            case 'ConditionalExpression':
                return (this.declarationIncludesIdentifier(node.test) ||
                    this.declarationIncludesIdentifier(node.consequent) ||
                    this.declarationIncludesIdentifier(node.alternate));
            case 'TemplateLiteral':
                return node.expressions.some((expr) => this.declarationIncludesIdentifier(expr));
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
    /**
     * Checks if a pattern (in a declaration or parameter) contains any dependencies.
     * Patterns themselves define new bindings (Identifiers), but they can contain
     * dependencies in computed keys or default values (AssignmentPattern).
     */
    static patternHasDependency(node) {
        if (!node) {
            return false;
        }
        switch (node.type) {
            case 'Identifier':
                return false; // Declaration site, not a reference
            case 'AssignmentPattern':
                return this.declarationIncludesIdentifier(node.right);
            case 'ArrayPattern':
                return node.elements.some((element) => this.patternHasDependency(element));
            case 'ObjectPattern':
                return node.properties.some((property) => this.patternHasDependency(property));
            case 'Property':
                return ((node.computed &&
                    this.declarationIncludesIdentifier(node.key)) ||
                    this.patternHasDependency(node.value));
            case 'RestElement':
                return this.patternHasDependency(node.argument);
            default:
                // For anything else (like nested expressions in computed keys),
                // fall back to the general check.
                return this.declarationIncludesIdentifier(node);
        }
    }
    static classMethodDependenciesOf(node, graph, className) {
        const dependencies = [];
        if (!node) {
            return dependencies;
        }
        // Gracefully handle ParenthesizedExpression without widening AST node types
        if (this.isParenthesizedExpression(node)) {
            return this.classMethodDependenciesOf(node.expression, graph, className);
        }
        switch (node.type) {
            case 'MethodDefinition': {
                const functionBody = node.value.body;
                return (functionBody?.body || [])
                    .map((statement) => this.classMethodDependenciesOf(statement, graph, className))
                    .flat();
            }
            case 'Identifier':
                dependencies.push(node.name);
                break;
            case 'ExpressionStatement':
                return this.classMethodDependenciesOf(node.expression, graph, className);
            case 'MemberExpression': {
                const memberExpr = node;
                if ((memberExpr.object.type === 'ThisExpression' &&
                    memberExpr.property.type === 'Identifier') ||
                    (memberExpr.object.type === 'Identifier' &&
                        memberExpr.object.name === className &&
                        memberExpr.property.type === 'Identifier')) {
                    dependencies.push(memberExpr.property.name);
                }
                else {
                    return [
                        ...this.classMethodDependenciesOf(memberExpr.object, graph, className),
                        ...this.classMethodDependenciesOf(memberExpr.property, graph, className),
                    ];
                }
                break;
            }
            case 'TSNonNullExpression':
                return this.classMethodDependenciesOf(node.expression, graph, className);
            case 'ArrayPattern':
                return node.elements
                    .map((element) => this.classMethodDependenciesOf(element, graph, className))
                    .flat();
            case 'ObjectPattern':
                return node.properties
                    .map((property) => this.classMethodDependenciesOf(property, graph, className))
                    .flat();
            case 'AssignmentPattern':
                return this.classMethodDependenciesOf(node.left, graph, className);
            case 'RestElement':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'AwaitExpression':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'AssignmentExpression': {
                const assignExpr = node;
                return [
                    ...this.classMethodDependenciesOf(assignExpr.left, graph, className),
                    ...this.classMethodDependenciesOf(assignExpr.right, graph, className),
                ];
            }
            case 'BlockStatement':
                return node.body
                    .map((statement) => this.classMethodDependenciesOf(statement, graph, className))
                    .flat()
                    .filter(Boolean);
            case 'IfStatement': {
                const ifStmt = node;
                return [
                    ...this.classMethodDependenciesOf(ifStmt.test, graph, className),
                    ...this.classMethodDependenciesOf(ifStmt.consequent, graph, className),
                    ...this.classMethodDependenciesOf(ifStmt.alternate, graph, className),
                ];
            }
            case 'TSTypeAssertion':
                return this.classMethodDependenciesOf(node.expression, graph, className);
            case 'SpreadElement':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'ChainExpression':
                return this.classMethodDependenciesOf(node.expression, graph, className);
            case 'ArrayExpression':
                return node.elements
                    .map((element) => element &&
                    (element.type === 'SpreadElement'
                        ? this.classMethodDependenciesOf(element.argument, graph, className)
                        : this.classMethodDependenciesOf(element, graph, className)))
                    .flat()
                    .filter(Boolean);
            case 'ObjectExpression':
                return node.properties
                    .map((property) => {
                    if (property.type === 'Property') {
                        return this.classMethodDependenciesOf(property.value, graph, className);
                    }
                    else if (property.type === 'SpreadElement') {
                        return this.classMethodDependenciesOf(property.argument, graph, className);
                    }
                    return false;
                })
                    .flat()
                    .filter(Boolean);
            case 'Property':
                return this.classMethodDependenciesOf(node.value, graph, className);
            case 'BinaryExpression':
            case 'LogicalExpression': {
                const binLogExpr = node;
                return [
                    ...this.classMethodDependenciesOf(binLogExpr.left, graph, className),
                    ...this.classMethodDependenciesOf(binLogExpr.right, graph, className),
                ];
            }
            case 'UnaryExpression':
            case 'UpdateExpression':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'CallExpression':
            case 'NewExpression': {
                // For function and constructor calls, we care about both the callee and the arguments.
                const callNewExpr = node;
                return [
                    ...this.classMethodDependenciesOf(callNewExpr.callee, graph, className),
                    ...callNewExpr.arguments
                        .map((arg) => this.classMethodDependenciesOf(arg, graph, className))
                        .flat(),
                ];
            }
            case 'ConditionalExpression': {
                const condExpr = node;
                return [
                    ...this.classMethodDependenciesOf(condExpr.test, graph, className),
                    ...this.classMethodDependenciesOf(condExpr.consequent, graph, className),
                    ...this.classMethodDependenciesOf(condExpr.alternate, graph, className),
                ];
            }
            case 'TSAsExpression':
                return this.classMethodDependenciesOf(node.expression, graph, className);
            case 'VariableDeclaration':
                return node.declarations
                    .map((declaration) => this.classMethodDependenciesOf(declaration, graph, className))
                    .flat()
                    .filter(Boolean);
            case 'VariableDeclarator':
                return this.classMethodDependenciesOf(node.init, graph, className);
            case 'ForOfStatement': {
                const forOfStmt = node;
                return [
                    ...this.classMethodDependenciesOf(forOfStmt.left, graph, className),
                    ...this.classMethodDependenciesOf(forOfStmt.body, graph, className),
                    ...this.classMethodDependenciesOf(forOfStmt.right, graph, className),
                ];
            }
            case 'ForStatement': {
                const forStmt = node;
                return [forStmt.body, forStmt.init, forStmt.test, forStmt.update]
                    .map((node) => this.classMethodDependenciesOf(node, graph, className))
                    .flat();
            }
            case 'ThrowStatement':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'TemplateLiteral':
                return node.expressions
                    .map((expression) => this.classMethodDependenciesOf(expression, graph, className))
                    .flat();
            case 'ReturnStatement':
                return this.classMethodDependenciesOf(node.argument, graph, className);
            case 'ArrowFunctionExpression': {
                const arrowFunc = node;
                return [
                    ...(arrowFunc.params || []).flatMap((param) => this.classMethodDependenciesOf(param, graph, className)),
                    ...this.classMethodDependenciesOf(arrowFunc.body, graph, className),
                ];
            }
            default:
                break;
        }
        // Removing duplicates and ensuring exact matches only
        return [
            ...new Set(dependencies.filter((dep) => {
                // Only include dependencies that exist exactly in the graph
                // This prevents substring matches (e.g., 'nextMatches' vs 'nextMatchesWithResults')
                return (graph?.[dep] !== undefined && graph?.[dep]?.type !== 'property');
            })),
        ];
    }
    static isNode(value) {
        return typeof value === 'object' && value !== null && 'type' in value;
    }
    static hasReturnStatement(node) {
        if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
            return true;
        }
        if (node.type === utils_1.AST_NODE_TYPES.IfStatement) {
            const ifStmt = node;
            const consequentHasReturn = this.hasReturnStatement(ifStmt.consequent);
            const alternateHasReturn = !!ifStmt.alternate && this.hasReturnStatement(ifStmt.alternate);
            return consequentHasReturn && alternateHasReturn;
        }
        if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
            const blockStmt = node;
            for (const statement of blockStmt.body) {
                if (this.hasReturnStatement(statement)) {
                    return true;
                }
            }
        }
        for (const key in node) {
            if (key === 'parent') {
                continue; // Ignore the parent property
            }
            const value = node[key];
            if (this.isNode(value)) {
                if (this.hasReturnStatement(value)) {
                    return true;
                }
            }
        }
        return false;
    }
    static isNodeExported(node) {
        // Checking if the node is exported as a named export.
        if (node.parent &&
            node.parent.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
            return true;
        }
        // Checking if the node is exported as default.
        if (node.parent &&
            node.parent.parent &&
            node.parent.parent.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration) {
            return true;
        }
        // Checking if the node is exported in a list of exports.
        if (node.parent &&
            node.parent.parent &&
            node.parent.parent.type === utils_1.AST_NODE_TYPES.ExportSpecifier &&
            node.parent.parent.exported?.name ===
                node.name) {
            return true;
        }
        return false;
    }
    static isLoopOrLabeledStatement(node) {
        return (node.type === utils_1.AST_NODE_TYPES.WhileStatement ||
            node.type === utils_1.AST_NODE_TYPES.DoWhileStatement ||
            node.type === utils_1.AST_NODE_TYPES.ForStatement ||
            node.type === utils_1.AST_NODE_TYPES.ForInStatement ||
            node.type === utils_1.AST_NODE_TYPES.ForOfStatement ||
            node.type === utils_1.AST_NODE_TYPES.LabeledStatement);
    }
    static isParenthesizedExpression(node) {
        // ParenthesizedExpression is not in AST_NODE_TYPES across all ESLint versions
        // so we check the string literal directly for cross-version compatibility.
        return node?.type === 'ParenthesizedExpression';
    }
    static returnsJSXValue(node) {
        if (!node) {
            return false;
        }
        if (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
            node.type === utils_1.AST_NODE_TYPES.JSXFragment) {
            return true;
        }
        if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
            return (this.returnsJSXValue(node.left) ||
                this.returnsJSXValue(node.right));
        }
        if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
            return (this.returnsJSXValue(node.consequent) ||
                this.returnsJSXValue(node.alternate));
        }
        if (node.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            node.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
            node.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
            node.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
            return this.returnsJSXValue(node.expression);
        }
        if (this.isParenthesizedExpression(node)) {
            return this.returnsJSXValue(node.expression);
        }
        // Function/class values are not JSX values.
        return false;
    }
    static returnsJSXFromStatement(node, context) {
        if (!node) {
            return false;
        }
        if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
            const arg = node.argument;
            if (arg?.type === utils_1.AST_NODE_TYPES.Identifier && context) {
                // Resolve variable to its initializer if possible
                const scope = this.getScope(context, arg);
                if (scope) {
                    const variable = this.findVariableInScope(scope, arg.name);
                    if (variable && variable.defs.length === 1) {
                        const def = variable.defs[0];
                        // Check if the variable is reassigned after initialization.
                        // We only follow variables that are defined once and never reassigned
                        // to ensure we're following a deterministic JSX-returning value.
                        // This is intentionally conservative to avoid ambiguous multi-write cases,
                        // which affects React component detection accuracy.
                        const isReassigned = variable.references.some((ref) => ref.isWrite() && !ref.init);
                        if (isReassigned) {
                            return this.returnsJSXValue(arg);
                        }
                        if (def.type === 'Variable' &&
                            def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                            def.node.init) {
                            // ReturnStatement returns a value; treat function/class initializers as non-JSX values.
                            return this.returnsJSXValue(def.node.init);
                        }
                    }
                }
                else {
                    return this.returnsJSXValue(arg);
                }
            }
            return this.returnsJSXValue(arg);
        }
        if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            // Variable declarations don't return values from the enclosing function.
            return false;
        }
        if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
            return node.body.some((stmt) => this.returnsJSXFromStatement(stmt, context));
        }
        if (node.type === utils_1.AST_NODE_TYPES.IfStatement) {
            return (this.returnsJSXFromStatement(node.consequent, context) ||
                this.returnsJSXFromStatement(node.alternate, context));
        }
        if (node.type === utils_1.AST_NODE_TYPES.SwitchStatement) {
            return node.cases.some((c) => c.consequent.some((stmt) => this.returnsJSXFromStatement(stmt, context)));
        }
        if (node.type === utils_1.AST_NODE_TYPES.TryStatement) {
            return (this.returnsJSXFromStatement(node.block, context) ||
                this.returnsJSXFromStatement(node.handler?.body, context) ||
                this.returnsJSXFromStatement(node.finalizer, context));
        }
        if (this.isLoopOrLabeledStatement(node)) {
            return this.returnsJSXFromStatement(node.body, context);
        }
        return false;
    }
    static returnsJSX(node, context) {
        if (!node) {
            return false;
        }
        if (node.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
            // ExpressionStatement does not produce a return value for the surrounding function, so treat as non-returning.
            return false;
        }
        if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
            const func = node;
            if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                return func.body.type === utils_1.AST_NODE_TYPES.BlockStatement
                    ? this.returnsJSXFromStatement(func.body, context)
                    : this.returnsJSXValue(func.body);
            }
            return this.returnsJSXFromStatement(func.body, context);
        }
        if (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
            node.type === utils_1.AST_NODE_TYPES.JSXFragment) {
            return true;
        }
        if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            // Detects `const Component = () => <div />`-style declarations.
            return node.declarations.some((decl) => this.returnsJSX(decl.init, context));
        }
        if (node.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
            return this.returnsJSX(node.init, context);
        }
        // Treat remaining nodes as statement-path or value checks.
        return (this.returnsJSXFromStatement(node, context) || this.returnsJSXValue(node));
    }
    static hasParameters(node) {
        return node.params && node.params.length > 0;
    }
    /**
     * Compatibility wrapper for getting declared variables across ESLint versions.
     */
    static getDeclaredVariables(context, node) {
        const sourceCode = context.sourceCode;
        const sourceCodeWithDeclaredVariables = sourceCode;
        const fn = typeof sourceCodeWithDeclaredVariables?.getDeclaredVariables ===
            'function'
            ? sourceCodeWithDeclaredVariables.getDeclaredVariables.bind(sourceCodeWithDeclaredVariables)
            : typeof context.getDeclaredVariables === 'function'
                ? context.getDeclaredVariables.bind(context)
                : null;
        if (!fn) {
            throw new Error('getDeclaredVariables is not available in this ESLint version.');
        }
        return fn(node);
    }
    /**
     * Helper to get ancestors of a node in a way that is compatible with both ESLint v8 and v9.
     * In ESLint v9, context.getAncestors() is deprecated and moved to context.sourceCode.getAncestors(node).
     */
    static getAncestors(context, node) {
        const sourceCode = context.sourceCode;
        return (sourceCode?.getAncestors?.(node) ??
            (context.getAncestors ? context.getAncestors() : []));
    }
}
exports.ASTHelpers = ASTHelpers;
//# sourceMappingURL=ASTHelpers.js.map