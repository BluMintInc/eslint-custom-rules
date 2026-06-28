"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noExplicitReturnType = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = {
    allowRecursiveFunctions: true,
    allowOverloadedFunctions: true,
    allowInterfaceMethodSignatures: true,
    allowAbstractMethodSignatures: true,
    allowDtsFiles: true,
    allowFirestoreFunctionFiles: true,
};
function getNameFromIdentifierOrLiteral(key) {
    if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
        return key.name;
    }
    if (typeof key.value === 'string') {
        return key.value;
    }
    return undefined;
}
function describeClassMethod(node) {
    if (!node.computed &&
        (node.key.type === utils_1.AST_NODE_TYPES.Identifier ||
            (node.key.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.key.value === 'string'))) {
        const name = getNameFromIdentifierOrLiteral(node.key);
        if (name) {
            return `class method "${name}"`;
        }
    }
    return 'class method';
}
function describeMethodSignature(node) {
    if (!node.computed &&
        (node.key.type === utils_1.AST_NODE_TYPES.Identifier ||
            (node.key.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.key.value === 'string'))) {
        const name = getNameFromIdentifierOrLiteral(node.key);
        if (name) {
            return `interface method "${name}"`;
        }
    }
    return 'interface method';
}
function describeFunctionDeclaration(node) {
    if (node.id?.name) {
        return `function "${node.id.name}"`;
    }
    return 'function';
}
function describeTSDeclareFunction(node) {
    if (node.id?.name) {
        return `function "${node.id.name}"`;
    }
    return 'function';
}
function describeFunctionExpression(node) {
    if (node.id?.name) {
        return `function "${node.id.name}"`;
    }
    if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return `function "${node.parent.id.name}"`;
    }
    if (node.parent?.type === utils_1.AST_NODE_TYPES.Property &&
        !node.parent.computed &&
        (node.parent.key.type === utils_1.AST_NODE_TYPES.Identifier ||
            (node.parent.key.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.parent.key.value === 'string'))) {
        const name = getNameFromIdentifierOrLiteral(node.parent.key);
        if (name) {
            return `object method "${name}"`;
        }
    }
    return 'function expression';
}
function describeArrowFunction(node) {
    if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return `arrow function "${node.parent.id.name}"`;
    }
    return 'arrow function';
}
function describeFunctionKind(node) {
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.MethodDefinition:
            return describeClassMethod(node);
        case utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition:
            return describeClassMethod(node);
        case utils_1.AST_NODE_TYPES.TSMethodSignature:
            return describeMethodSignature(node);
        case utils_1.AST_NODE_TYPES.TSDeclareFunction:
            return describeTSDeclareFunction(node);
        case utils_1.AST_NODE_TYPES.FunctionDeclaration:
            return describeFunctionDeclaration(node);
        case utils_1.AST_NODE_TYPES.FunctionExpression:
            return describeFunctionExpression(node);
        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
            return describeArrowFunction(node);
        default:
            return 'function';
    }
}
function isRecursiveFunction(node) {
    const functionName = node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration
        ? node.id?.name
        : node.type === utils_1.AST_NODE_TYPES.FunctionExpression && node.id
            ? node.id.name
            : undefined;
    if (!functionName || !node.body)
        return false;
    let hasRecursiveCall = false;
    function checkNode(node) {
        if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
            node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
            node.callee.name === functionName) {
            hasRecursiveCall = true;
            return;
        }
        // Only traverse specific node types to avoid circular references
        if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
            node.body.forEach(checkNode);
        }
        else if (node.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
            checkNode(node.expression);
        }
        else if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
            checkNode(node.callee);
            node.arguments.forEach(checkNode);
        }
        else if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
            checkNode(node.left);
            checkNode(node.right);
        }
        else if (node.type === utils_1.AST_NODE_TYPES.ReturnStatement && node.argument) {
            checkNode(node.argument);
        }
        else if (node.type === utils_1.AST_NODE_TYPES.IfStatement) {
            checkNode(node.test);
            checkNode(node.consequent);
            if (node.alternate) {
                checkNode(node.alternate);
            }
        }
    }
    checkNode(node.body);
    return hasRecursiveCall;
}
function isOverloadedFunction(node) {
    if (!node.parent)
        return false;
    if (node.type === utils_1.AST_NODE_TYPES.TSMethodSignature) {
        const interfaceBody = node.parent;
        if (interfaceBody.type !== utils_1.AST_NODE_TYPES.TSInterfaceBody)
            return false;
        if (node.computed)
            return false;
        const methodName = node.key.type === utils_1.AST_NODE_TYPES.Identifier ||
            node.key.type === utils_1.AST_NODE_TYPES.Literal
            ? getNameFromIdentifierOrLiteral(node.key)
            : undefined;
        if (!methodName)
            return false;
        return (interfaceBody.body.filter((member) => member.type === utils_1.AST_NODE_TYPES.TSMethodSignature &&
            !member.computed &&
            (member.key.type === utils_1.AST_NODE_TYPES.Identifier ||
                member.key.type === utils_1.AST_NODE_TYPES.Literal) &&
            getNameFromIdentifierOrLiteral(member.key) === methodName).length > 1);
    }
    return false;
}
function isOverloadedTsDeclareFunction(node) {
    const functionName = node.id?.name;
    if (!functionName)
        return false;
    let container = node.parent;
    while (container) {
        if (container.type === utils_1.AST_NODE_TYPES.Program ||
            container.type === utils_1.AST_NODE_TYPES.TSModuleBlock) {
            const declarations = container.body
                .map((statement) => {
                if (statement.type === utils_1.AST_NODE_TYPES.TSDeclareFunction) {
                    return statement;
                }
                if (statement.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration &&
                    statement.declaration?.type === utils_1.AST_NODE_TYPES.TSDeclareFunction) {
                    return statement.declaration;
                }
                return undefined;
            })
                .filter((value) => Boolean(value?.id?.name))
                .filter((decl) => decl.id.name === functionName);
            return declarations.length > 1;
        }
        container = container.parent;
    }
    return false;
}
function isInterfaceOrAbstractMethodSignature(node) {
    if (node.type === utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition)
        return true;
    if (node.type === utils_1.AST_NODE_TYPES.TSMethodSignature)
        return true;
    if (node.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
        let current = node;
        while (current) {
            if (current.type === utils_1.AST_NODE_TYPES.ClassDeclaration &&
                current.abstract) {
                return true;
            }
            current = current.parent;
        }
    }
    return false;
}
function isTypeGuardFunction(node) {
    if (!('returnType' in node) || !node.returnType)
        return false;
    const returnType = node.returnType;
    if (returnType.type !== utils_1.AST_NODE_TYPES.TSTypeAnnotation)
        return false;
    const typeAnnotation = returnType.typeAnnotation;
    // Check for type predicates (is keyword)
    if (typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypePredicate)
        return true;
    // Check for assertion functions (asserts keyword)
    if (typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeAnnotation.typeName;
        if (typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
            typeName.name === 'asserts') {
            return true;
        }
    }
    return false;
}
exports.noExplicitReturnType = (0, createRule_1.createRule)({
    name: 'no-explicit-return-type',
    meta: {
        type: 'suggestion',
        docs: {
            description: "Disallow explicit return type annotations on functions when TypeScript can infer them. This reduces code verbosity and maintenance burden while leveraging TypeScript's powerful type inference. Exceptions are made for type guard functions (using the `is` keyword), recursive functions, overloaded functions, interface methods, and abstract methods where explicit types improve clarity.",
            recommended: 'error',
            requiresTypeChecking: false,
            extendsBaseRule: false,
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    allowRecursiveFunctions: { type: 'boolean' },
                    allowOverloadedFunctions: { type: 'boolean' },
                    allowInterfaceMethodSignatures: { type: 'boolean' },
                    allowAbstractMethodSignatures: { type: 'boolean' },
                    allowDtsFiles: { type: 'boolean' },
                    allowFirestoreFunctionFiles: { type: 'boolean' },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            noExplicitReturnTypeInferable: "What's wrong: {{functionKind}} has an explicit return type annotation. \u2192 Why it matters: it must be updated manually and can drift from what the implementation actually returns, hiding bugs behind a stale type. \u2192 How to fix: remove the return type annotation so TypeScript infers it from the implementation.",
            noExplicitReturnTypeNonInferable: "What's wrong: {{functionKind}} has an explicit return type annotation but no implementation body. \u2192 Why it matters: TypeScript cannot infer the return type here; removing it widens the return type to `any`. \u2192 How to fix: keep the annotation, or provide an implementation body where inference can succeed.",
        },
    },
    defaultOptions: [defaultOptions],
    create(context, [options]) {
        const mergedOptions = { ...defaultOptions, ...options };
        const filename = context.getFilename();
        if ((mergedOptions.allowDtsFiles && filename.endsWith('.d.ts')) ||
            (mergedOptions.allowFirestoreFunctionFiles &&
                filename.endsWith('.f.ts'))) {
            return {};
        }
        function fixReturnType(fixer, node) {
            // Some nodes expose returnType directly while others nest it under value.
            const returnType = 'returnType' in node
                ? node.returnType
                : 'value' in node
                    ? node.value.returnType
                    : null;
            if (!returnType)
                return null;
            return fixer.remove(returnType);
        }
        return {
            FunctionDeclaration(node) {
                const returnType = node.returnType;
                if (!returnType)
                    return;
                if (isTypeGuardFunction(node) ||
                    (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node))) {
                    return;
                }
                const isInferable = Boolean(node.body);
                context.report({
                    node: returnType,
                    messageId: isInferable
                        ? 'noExplicitReturnTypeInferable'
                        : 'noExplicitReturnTypeNonInferable',
                    data: { functionKind: describeFunctionKind(node) },
                    ...(isInferable
                        ? { fix: (fixer) => fixReturnType(fixer, node) }
                        : {}),
                });
            },
            FunctionExpression(node) {
                const returnType = node.returnType;
                if (!returnType)
                    return;
                if (node.parent?.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                    return;
                }
                if (isTypeGuardFunction(node) ||
                    (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node))) {
                    return;
                }
                context.report({
                    node: returnType,
                    messageId: 'noExplicitReturnTypeInferable',
                    data: { functionKind: describeFunctionKind(node) },
                    fix: (fixer) => fixReturnType(fixer, node),
                });
            },
            ArrowFunctionExpression(node) {
                const returnType = node.returnType;
                if (!returnType)
                    return;
                if (isTypeGuardFunction(node)) {
                    return;
                }
                context.report({
                    node: returnType,
                    messageId: 'noExplicitReturnTypeInferable',
                    data: { functionKind: describeFunctionKind(node) },
                    fix: (fixer) => fixReturnType(fixer, node),
                });
            },
            TSMethodSignature(node) {
                const returnType = node.returnType;
                if (!returnType)
                    return;
                if (mergedOptions.allowInterfaceMethodSignatures) {
                    return;
                }
                if (mergedOptions.allowOverloadedFunctions &&
                    isOverloadedFunction(node)) {
                    return;
                }
                context.report({
                    node: returnType,
                    messageId: 'noExplicitReturnTypeNonInferable',
                    data: { functionKind: describeFunctionKind(node) },
                });
            },
            MethodDefinition(node) {
                const returnType = node.value.returnType;
                if (!returnType)
                    return;
                if (isTypeGuardFunction(node.value) ||
                    (mergedOptions.allowAbstractMethodSignatures &&
                        isInterfaceOrAbstractMethodSignature(node))) {
                    return;
                }
                const isInferable = Boolean(node.value.body);
                context.report({
                    node: returnType,
                    messageId: isInferable
                        ? 'noExplicitReturnTypeInferable'
                        : 'noExplicitReturnTypeNonInferable',
                    data: { functionKind: describeFunctionKind(node) },
                    ...(isInferable
                        ? { fix: (fixer) => fixReturnType(fixer, node) }
                        : {}),
                });
            },
            TSAbstractMethodDefinition(node) {
                const returnType = node.value.returnType;
                if (!returnType)
                    return;
                if (isTypeGuardFunction(node.value) ||
                    (mergedOptions.allowAbstractMethodSignatures &&
                        isInterfaceOrAbstractMethodSignature(node))) {
                    return;
                }
                // Abstract methods never have bodies; they are always non-inferable and
                // intentionally have no fixer.
                context.report({
                    node: returnType,
                    messageId: 'noExplicitReturnTypeNonInferable',
                    data: { functionKind: describeFunctionKind(node) },
                });
            },
            TSDeclareFunction(node) {
                const returnType = node.returnType;
                if (!returnType)
                    return;
                if (isTypeGuardFunction(node)) {
                    return;
                }
                if (mergedOptions.allowOverloadedFunctions &&
                    isOverloadedTsDeclareFunction(node)) {
                    return;
                }
                context.report({
                    node: returnType,
                    messageId: 'noExplicitReturnTypeNonInferable',
                    data: { functionKind: describeFunctionKind(node) },
                });
            },
        };
    },
});
//# sourceMappingURL=no-explicit-return-type.js.map