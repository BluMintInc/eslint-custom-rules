"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferDocSetterSetAll = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ITERATING_METHODS = new Set(['map', 'forEach']);
const DOC_SETTER_NAMES = new Set([
    'DocSetter',
    'DocSetterTransaction',
]);
function unwrapCallee(callee) {
    return callee.type === utils_1.AST_NODE_TYPES.ChainExpression
        ? callee.expression
        : callee;
}
function getEntityIdentifier(entity) {
    if (entity.type === utils_1.AST_NODE_TYPES.Identifier) {
        return entity.name;
    }
    return getEntityIdentifier(entity.right);
}
function getTypeName(typeNode) {
    if (!typeNode || typeNode.type !== utils_1.AST_NODE_TYPES.TSTypeReference) {
        return null;
    }
    return getEntityIdentifier(typeNode.typeName);
}
function isDocSetterName(name) {
    return Boolean(name && DOC_SETTER_NAMES.has(name));
}
function getNewExpressionKind(expression) {
    if (expression?.type !== utils_1.AST_NODE_TYPES.NewExpression) {
        return null;
    }
    if (expression.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        isDocSetterName(expression.callee.name)) {
        return expression.callee.name;
    }
    return null;
}
function getTypeAnnotationKind(identifier) {
    const typeName = getTypeName(identifier.typeAnnotation?.typeAnnotation);
    if (isDocSetterName(typeName)) {
        return typeName;
    }
    return null;
}
function extractKindFromDefinition(definition) {
    const nameNode = definition.name;
    if (!nameNode || nameNode.type !== utils_1.AST_NODE_TYPES.Identifier)
        return null;
    const parent = nameNode.parent;
    if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
        const ctorKind = getNewExpressionKind(parent.init);
        if (ctorKind)
            return ctorKind;
    }
    const annotationKind = getTypeAnnotationKind(nameNode);
    if (annotationKind)
        return annotationKind;
    return null;
}
function resolveDocSetterFromScope(identifier, context) {
    let scope = context.getScope();
    while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
            for (const def of variable.defs) {
                const kind = extractKindFromDefinition(def);
                if (kind) {
                    return { setterName: identifier.name, setterKind: kind };
                }
            }
        }
        scope = scope.upper;
    }
    return null;
}
function resolveDocSetterFromClassProperty(propertyName, startNode) {
    let current = startNode;
    while (current) {
        if (current.type === utils_1.AST_NODE_TYPES.ClassBody) {
            for (const element of current.body) {
                if (element.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                    element.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    element.key.name === propertyName) {
                    const ctorKind = getNewExpressionKind(element.value);
                    if (ctorKind)
                        return ctorKind;
                    const annotationKind = getTypeName(element.typeAnnotation?.typeAnnotation);
                    if (isDocSetterName(annotationKind)) {
                        return annotationKind;
                    }
                }
            }
            const classNode = current.parent;
            if (classNode &&
                (classNode.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
                    classNode.type === utils_1.AST_NODE_TYPES.ClassExpression)) {
                const constructor = classNode.body.body.find((member) => member.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                    member.kind === 'constructor');
                if (constructor) {
                    for (const param of constructor.value.params) {
                        if (param.type === utils_1.AST_NODE_TYPES.TSParameterProperty) {
                            const parameter = param.parameter;
                            if (parameter.type === utils_1.AST_NODE_TYPES.Identifier &&
                                parameter.name === propertyName) {
                                const annotationKind = getTypeAnnotationKind(parameter);
                                if (annotationKind)
                                    return annotationKind;
                            }
                        }
                    }
                }
            }
            return null;
        }
        current = current.parent;
    }
    return null;
}
function isAncestor(ancestor, node) {
    let current = node;
    while (current) {
        if (current === ancestor)
            return true;
        current = current.parent;
    }
    return false;
}
function findIterationContext(node) {
    let current = node.parent;
    while (current) {
        switch (current.type) {
            case utils_1.AST_NODE_TYPES.ForStatement:
            case utils_1.AST_NODE_TYPES.ForInStatement:
            case utils_1.AST_NODE_TYPES.ForOfStatement:
            case utils_1.AST_NODE_TYPES.WhileStatement:
            case utils_1.AST_NODE_TYPES.DoWhileStatement:
                return { kind: 'loop', loopType: current.type };
            case utils_1.AST_NODE_TYPES.CallExpression: {
                const callee = unwrapCallee(current.callee);
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    ITERATING_METHODS.has(callee.property.name)) {
                    const callback = current.arguments[0];
                    if (callback &&
                        (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                            callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
                        isAncestor(callback, node)) {
                        return { kind: 'array-callback', methodName: callee.property.name };
                    }
                }
                break;
            }
            case utils_1.AST_NODE_TYPES.Program:
                return null;
            default:
                break;
        }
        current = current.parent;
    }
    return null;
}
function formatContext(iteration) {
    if (iteration.kind === 'array-callback') {
        return `${iteration.methodName} callback`;
    }
    switch (iteration.loopType) {
        case utils_1.AST_NODE_TYPES.ForOfStatement:
            return 'for...of loop';
        case utils_1.AST_NODE_TYPES.ForInStatement:
            return 'for...in loop';
        case utils_1.AST_NODE_TYPES.ForStatement:
            return 'for loop';
        case utils_1.AST_NODE_TYPES.WhileStatement:
            return 'while loop';
        case utils_1.AST_NODE_TYPES.DoWhileStatement:
            return 'do...while loop';
        default:
            return 'loop';
    }
}
function resolveDocSetterInfo(callee, context) {
    if (callee.property.type !== utils_1.AST_NODE_TYPES.Identifier)
        return null;
    const object = callee.object;
    if (object.type === utils_1.AST_NODE_TYPES.Identifier) {
        return resolveDocSetterFromScope(object, context);
    }
    if (object.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        object.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
        object.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        const setterKind = resolveDocSetterFromClassProperty(object.property.name, callee);
        if (setterKind) {
            return { setterName: object.property.name, setterKind };
        }
    }
    return null;
}
exports.preferDocSetterSetAll = (0, createRule_1.createRule)({
    name: 'prefer-docsetter-setall',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce batching DocSetter and DocSetterTransaction writes by using setAll instead of set inside loops or array callbacks.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            preferSetAll: '{{setterName}}.set() runs inside a {{context}}, which sends one Firestore write per iteration. Collect the document payloads and call setAll() once to batch writes, cut round-trips, and keep payload types narrow (build an updates array and mark entries as const when needed).',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                const callee = unwrapCallee(node.callee);
                if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression ||
                    callee.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
                    callee.property.name !== 'set') {
                    return;
                }
                const setterInfo = resolveDocSetterInfo(callee, context);
                if (!setterInfo)
                    return;
                const iterationContext = findIterationContext(node);
                if (!iterationContext)
                    return;
                const contextLabel = formatContext(iterationContext);
                context.report({
                    node: callee.property,
                    messageId: 'preferSetAll',
                    data: {
                        setterName: setterInfo.setterName,
                        context: contextLabel,
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=prefer-docsetter-setall.js.map