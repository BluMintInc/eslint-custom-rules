"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASTHelpers = void 0;
class ASTHelpers {
    static blockIncludesIdentifier(block) {
        for (const statement of block.body) {
            if (ASTHelpers.declarationIncludesIdentifier(statement)) {
                return true;
            }
        }
        return false;
    }
    static declarationIncludesIdentifier(node) {
        if (!node) {
            return false;
        }
        switch (node.type) {
            case 'TSNonNullExpression':
                return this.declarationIncludesIdentifier(node.expression);
            case 'ArrayPattern':
                return node.elements.some((element) => ASTHelpers.declarationIncludesIdentifier(element));
            case 'ObjectPattern':
                return node.properties.some((property) => this.declarationIncludesIdentifier(property.value || null));
            case 'AssignmentPattern':
                return this.declarationIncludesIdentifier(node.left);
            case 'RestElement':
                return this.declarationIncludesIdentifier(node.argument);
            case 'AwaitExpression':
                return this.declarationIncludesIdentifier(node.argument);
            case 'AssignmentExpression':
                return (this.declarationIncludesIdentifier(node.left) ||
                    this.declarationIncludesIdentifier(node.right));
            case 'BlockStatement':
                return node.body.some((statement) => statement.type === 'BlockStatement' &&
                    ASTHelpers.blockIncludesIdentifier(statement));
            case 'IfStatement':
                return (this.declarationIncludesIdentifier(node.test) ||
                    this.declarationIncludesIdentifier(node.consequent) ||
                    this.declarationIncludesIdentifier(node.alternate));
            case 'TSTypeAssertion':
                return this.declarationIncludesIdentifier(node.expression);
            case 'Identifier':
                return true;
            case 'SpreadElement':
                return ASTHelpers.declarationIncludesIdentifier(node.argument);
            case 'ChainExpression':
                return ASTHelpers.declarationIncludesIdentifier(node.expression);
            case 'ArrayExpression':
                return node.elements.some((element) => element &&
                    (element.type === 'SpreadElement'
                        ? ASTHelpers.declarationIncludesIdentifier(element.argument)
                        : ASTHelpers.declarationIncludesIdentifier(element)));
            case 'ObjectExpression':
                return node.properties.some((property) => {
                    if (property.type === 'Property') {
                        return ASTHelpers.declarationIncludesIdentifier(property.value);
                    }
                    else if (property.type === 'SpreadElement') {
                        return ASTHelpers.declarationIncludesIdentifier(property.argument);
                    }
                    return false;
                });
            case 'Property':
                return this.declarationIncludesIdentifier(node.value);
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
    static classMethodDependenciesOf(node, graph, className) {
        const dependencies = [];
        if (!node) {
            return dependencies;
        }
        switch (node.type) {
            case 'MethodDefinition':
                const functionBody = node.value.body;
                return (functionBody?.body || [])
                    .map((statement) => ASTHelpers.classMethodDependenciesOf(statement, graph, className))
                    .flat();
            case 'Identifier':
                dependencies.push(node.name);
                break;
            case 'ExpressionStatement':
                return ASTHelpers.classMethodDependenciesOf(node.expression, graph, className);
            case 'MemberExpression':
                if ((node.object.type === 'ThisExpression' &&
                    node.property.type === 'Identifier') ||
                    (node.object.type === 'Identifier' &&
                        node.object.name === className &&
                        node.property.type === 'Identifier')) {
                    dependencies.push(node.property.name);
                }
                else {
                    return [
                        ...ASTHelpers.classMethodDependenciesOf(node.object, graph, className),
                        ...ASTHelpers.classMethodDependenciesOf(node.property, graph, className),
                    ];
                }
                break;
            case 'TSNonNullExpression':
                return ASTHelpers.classMethodDependenciesOf(node.expression, graph, className);
            case 'ArrayPattern':
                return node.elements
                    .map((element) => ASTHelpers.classMethodDependenciesOf(element, graph, className))
                    .flat();
            case 'ObjectPattern':
                return node.properties
                    .map((property) => ASTHelpers.classMethodDependenciesOf(property.value || null, graph, className))
                    .flat();
            case 'AssignmentPattern':
                return ASTHelpers.classMethodDependenciesOf(node.left, graph, className);
            case 'RestElement':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'AwaitExpression':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'AssignmentExpression':
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
                ];
            case 'BlockStatement':
                return node.body
                    .map((statement) => ASTHelpers.classMethodDependenciesOf(statement, graph, className))
                    .flat()
                    .filter(Boolean);
            case 'IfStatement':
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.test, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.consequent, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.alternate, graph, className),
                ];
            case 'TSTypeAssertion':
                return ASTHelpers.classMethodDependenciesOf(node.expression, graph, className);
            case 'Identifier':
                return dependencies;
            case 'SpreadElement':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'ChainExpression':
                return ASTHelpers.classMethodDependenciesOf(node.expression, graph, className);
            case 'ArrayExpression':
                return node.elements
                    .map((element) => element &&
                    (element.type === 'SpreadElement'
                        ? ASTHelpers.classMethodDependenciesOf(element.argument, graph, className)
                        : ASTHelpers.classMethodDependenciesOf(element, graph, className)))
                    .flat()
                    .filter(Boolean);
            case 'ObjectExpression':
                return node.properties
                    .map((property) => {
                    if (property.type === 'Property') {
                        return ASTHelpers.classMethodDependenciesOf(property.value, graph, className);
                    }
                    else if (property.type === 'SpreadElement') {
                        return ASTHelpers.classMethodDependenciesOf(property.argument, graph, className);
                    }
                    return false;
                })
                    .flat()
                    .filter(Boolean);
            case 'Property':
                return ASTHelpers.classMethodDependenciesOf(node.value, graph, className);
            case 'BinaryExpression':
            case 'LogicalExpression':
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
                ];
            case 'UnaryExpression':
            case 'UpdateExpression':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'CallExpression':
            case 'NewExpression':
                // For function and constructor calls, we care about both the callee and the arguments.
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.callee, graph, className),
                    ...node.arguments
                        .map((arg) => ASTHelpers.classMethodDependenciesOf(arg, graph, className))
                        .flat(),
                ];
            case 'ConditionalExpression':
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.test, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.consequent, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.alternate, graph, className),
                ];
            case 'TSAsExpression':
                return ASTHelpers.classMethodDependenciesOf(node.expression, graph, className);
            case 'VariableDeclaration':
                return node.declarations
                    .map((declaration) => ASTHelpers.classMethodDependenciesOf(declaration, graph, className))
                    .flat()
                    .filter(Boolean);
            case 'VariableDeclarator':
                return ASTHelpers.classMethodDependenciesOf(node.init, graph, className);
            case 'ForOfStatement':
                return [
                    ...ASTHelpers.classMethodDependenciesOf(node.left, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.body, graph, className),
                    ...ASTHelpers.classMethodDependenciesOf(node.right, graph, className),
                ];
            case 'ForStatement':
                return [node.body, node.init, node.test, node.update]
                    .map((node) => ASTHelpers.classMethodDependenciesOf(node, graph, className))
                    .flat();
            case 'ThrowStatement':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'TemplateLiteral':
                return node.expressions
                    .map((expression) => ASTHelpers.classMethodDependenciesOf(expression, graph, className))
                    .flat();
            case 'ReturnStatement':
                return ASTHelpers.classMethodDependenciesOf(node.argument, graph, className);
            case 'ArrowFunctionExpression':
                return [
                    ...node.params.flatMap((param) => ASTHelpers.classMethodDependenciesOf(param, graph, className)),
                    ...ASTHelpers.classMethodDependenciesOf(node.body, graph, className),
                ];
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
        if (node.type === 'ReturnStatement') {
            return true;
        }
        if (node.type === 'IfStatement') {
            const consequentHasReturn = ASTHelpers.hasReturnStatement(node.consequent);
            const alternateHasReturn = !!node.alternate && ASTHelpers.hasReturnStatement(node.alternate);
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
            const value = node[key];
            if (ASTHelpers.isNode(value)) {
                if (ASTHelpers.hasReturnStatement(value)) {
                    return true;
                }
            }
        }
        return false;
    }
    static isNodeExported(node) {
        // Checking if the node is exported as a named export.
        if (node.parent && node.parent.type === 'ExportNamedDeclaration') {
            return true;
        }
        // Checking if the node is exported as default.
        if (node.parent &&
            node.parent.parent &&
            node.parent.parent.type === 'ExportDefaultDeclaration') {
            return true;
        }
        // Checking if the node is exported in a list of exports.
        if (node.parent &&
            node.parent.parent &&
            node.parent.parent.type === 'ExportSpecifier' &&
            node.parent.parent.exported.name === node.name) {
            return true;
        }
        return false;
    }
    static returnsJSX(node) {
        if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
            return true;
        }
        if (node.type === 'BlockStatement') {
            for (const statement of node.body) {
                if (statement.type === 'ReturnStatement' &&
                    (statement.argument?.type === 'JSXElement' ||
                        statement.argument?.type === 'JSXFragment')) {
                    return true;
                }
                // Handle conditional returns
                if (statement.type === 'ReturnStatement' &&
                    statement.argument?.type === 'ConditionalExpression') {
                    const conditionalExpr = statement.argument;
                    if (ASTHelpers.returnsJSX(conditionalExpr.consequent) ||
                        ASTHelpers.returnsJSX(conditionalExpr.alternate)) {
                        return true;
                    }
                }
            }
        }
        if (node.type === 'ConditionalExpression') {
            return (ASTHelpers.returnsJSX(node.consequent) ||
                ASTHelpers.returnsJSX(node.alternate));
        }
        return false;
    }
    static hasParameters(node) {
        return node.params && node.params.length > 0;
    }
}
exports.ASTHelpers = ASTHelpers;
//# sourceMappingURL=ASTHelpers.js.map