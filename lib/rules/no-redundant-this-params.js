"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noRedundantThisParams = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noRedundantThisParams = (0, createRule_1.createRule)({
    name: 'no-redundant-this-params',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow passing class instance members (this.foo) into class instance methods; access the member from this inside the method instead.',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [],
        messages: {
            redundantInstanceArg: 'Method "{{methodName}}" receives "{{memberText}}"{{parameterNote}}. Instance state already lives on "this"; threading it through parameters duplicates class state and bloats the signature. Read "{{memberText}}" inside "{{methodName}}" instead of accepting it as an argument.',
            redundantInstanceValueInObject: 'Method "{{methodName}}" receives an argument that contains "{{memberText}}"{{parameterNote}}. Routing instance state through parameters hides the shared `this` contract and complicates refactors. Remove that property from the call and read "{{memberText}}" directly inside "{{methodName}}".',
        },
    },
    defaultOptions: [],
    create(context) {
        const classInfoMap = new WeakMap();
        function isFunctionLike(node) {
            return (node?.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                node?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                node?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration);
        }
        function getNameFromPropertyName(key) {
            if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
                return key.name;
            }
            if (key.type === utils_1.AST_NODE_TYPES.Literal) {
                return typeof key.value === 'string' ? key.value : String(key.value);
            }
            if (key.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
                return `#${key.name}`;
            }
            return null;
        }
        function getMethodNameFromCallee(callee) {
            const maybeChain = callee;
            const unwrapped = maybeChain.type === utils_1.AST_NODE_TYPES.ChainExpression
                ? maybeChain.expression
                : callee;
            if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !unwrapped.computed &&
                unwrapped.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                (unwrapped.property.type === utils_1.AST_NODE_TYPES.Identifier ||
                    unwrapped.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier)) {
                return getNameFromPropertyName(unwrapped.property);
            }
            return null;
        }
        function getMethodParams(member) {
            const value = member.value;
            if (value &&
                (value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    value.type === utils_1.AST_NODE_TYPES.TSEmptyBodyFunctionExpression)) {
                return value.params;
            }
            return [];
        }
        function getPropertyMethodParams(member) {
            if (member.value &&
                (member.value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    member.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                return member.value.params;
            }
            const annotation = member.typeAnnotation?.typeAnnotation;
            if (!member.value &&
                member.optional &&
                annotation &&
                annotation.type === utils_1.AST_NODE_TYPES.TSFunctionType) {
                return annotation.params;
            }
            return [];
        }
        function collectClassInfo(node) {
            const methods = new Map();
            function setMethod(methodName, meta) {
                /**
                 * Prefer instance methods over static methods when names collide.
                 * Calls like `this.method()` always resolve to the instance member, so the rule tracks the
                 * instance signature even if a static overload exists in the AST.
                 */
                const existing = methods.get(methodName);
                if (!existing) {
                    methods.set(methodName, meta);
                    return;
                }
                if (existing.isStatic && !meta.isStatic) {
                    methods.set(methodName, meta);
                    return;
                }
                if (!existing.isStatic && meta.isStatic) {
                    return;
                }
                methods.set(methodName, meta);
            }
            for (const member of node.body.body) {
                if (member.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                    member.type === utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition) {
                    if (member.kind === 'constructor') {
                        continue;
                    }
                    const methodName = getNameFromPropertyName(member.key);
                    if (!methodName) {
                        continue;
                    }
                    setMethod(methodName, {
                        params: getMethodParams(member),
                        isStatic: Boolean(member.static),
                        isAbstract: member.type === utils_1.AST_NODE_TYPES.TSAbstractMethodDefinition,
                    });
                }
                else if (member.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
                    const methodName = member.key
                        ? getNameFromPropertyName(member.key)
                        : null;
                    if (!methodName || member.static) {
                        continue;
                    }
                    const params = getPropertyMethodParams(member);
                    if (params.length === 0) {
                        continue;
                    }
                    setMethod(methodName, {
                        params,
                        isStatic: false,
                        isAbstract: false,
                    });
                }
            }
            classInfoMap.set(node, { methods });
        }
        function findEnclosingClass(node) {
            let current = node.parent;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.ClassExpression) {
                    return current;
                }
                current = current.parent;
            }
            return null;
        }
        function findEnclosingMember(node) {
            let current = node.parent;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                    current.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
                    return current;
                }
                current = current.parent;
            }
            return null;
        }
        function getMemberFunction(member) {
            if (!member) {
                return null;
            }
            if (member.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                member.value &&
                member.value.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                return member.value;
            }
            if (member.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                member.value &&
                (member.value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    member.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                return member.value;
            }
            return null;
        }
        function hasNestedFunctionBetween(leaf, boundary) {
            let current = leaf.parent;
            while (current && current !== boundary) {
                if (isFunctionLike(current)) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }
        function isTransparentExpressionWrapper(node) {
            // Babel emits ParenthesizedExpression nodes that are not modeled in TSESTree; treating them
            // as transparent prevents parentheses from changing nested/transformed classification.
            return (node.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
                node.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
                node.type === utils_1.AST_NODE_TYPES.TSNonNullExpression ||
                node.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
                node.type === utils_1.AST_NODE_TYPES.TSInstantiationExpression ||
                node.type === 'ParenthesizedExpression');
        }
        function unwrapTransparentExpression(node) {
            let current = node;
            while (isTransparentExpressionWrapper(current)) {
                current = current.expression;
            }
            return current;
        }
        function isExpressionMemberChainObject(node) {
            let current = node;
            let parent = current.parent;
            while (parent &&
                isTransparentExpressionWrapper(parent) &&
                parent.expression === current) {
                current = parent;
                parent = current.parent;
            }
            return (parent?.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                parent.object === current);
        }
        function getMemberText(propertyName) {
            return `this.${propertyName}`;
        }
        function isTransformingNode(node) {
            switch (node.type) {
                case utils_1.AST_NODE_TYPES.CallExpression:
                case utils_1.AST_NODE_TYPES.NewExpression:
                case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
                case utils_1.AST_NODE_TYPES.TemplateLiteral:
                case utils_1.AST_NODE_TYPES.BinaryExpression:
                case utils_1.AST_NODE_TYPES.LogicalExpression:
                case utils_1.AST_NODE_TYPES.ConditionalExpression:
                case utils_1.AST_NODE_TYPES.SequenceExpression:
                case utils_1.AST_NODE_TYPES.UnaryExpression:
                case utils_1.AST_NODE_TYPES.UpdateExpression:
                case utils_1.AST_NODE_TYPES.AwaitExpression:
                case utils_1.AST_NODE_TYPES.YieldExpression:
                case utils_1.AST_NODE_TYPES.AssignmentExpression:
                    return true;
                default:
                    return false;
            }
        }
        function collectThisAccesses(expression) {
            const normalized = unwrapTransparentExpression(expression);
            const results = [];
            function visit(node, nested, transformed) {
                const isParenthesized = node.type === 'ParenthesizedExpression';
                const isMemberChainObject = isExpressionMemberChainObject(node);
                if (isParenthesized) {
                    visit(node.expression, nested || (node !== normalized && !isMemberChainObject), transformed);
                    return;
                }
                const nextNested = nested || (node !== normalized && !isMemberChainObject);
                const nextTransformed = transformed || isTransformingNode(node);
                switch (node.type) {
                    case utils_1.AST_NODE_TYPES.MemberExpression: {
                        if (!node.computed &&
                            node.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                            (node.property.type === utils_1.AST_NODE_TYPES.Identifier ||
                                node.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier)) {
                            const propertyName = getNameFromPropertyName(node.property);
                            if (propertyName && !nextTransformed) {
                                results.push({
                                    node,
                                    propertyName,
                                    nested: nextNested,
                                    transformed: nextTransformed,
                                });
                                return;
                            }
                        }
                        visit(node.object, nextNested, nextTransformed);
                        if (node.computed) {
                            visit(node.property, true, nextTransformed);
                        }
                        return;
                    }
                    case utils_1.AST_NODE_TYPES.ChainExpression:
                        visit(node.expression, nextNested, nextTransformed);
                        return;
                    case utils_1.AST_NODE_TYPES.ObjectExpression:
                        for (const prop of node.properties) {
                            if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                                if (prop.computed) {
                                    visit(prop.key, true, nextTransformed);
                                }
                                visit(prop.value, true, nextTransformed);
                            }
                            else if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                                visit(prop.argument, true, nextTransformed);
                            }
                        }
                        return;
                    case utils_1.AST_NODE_TYPES.ArrayExpression:
                        for (const element of node.elements) {
                            if (!element) {
                                continue;
                            }
                            if (element.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                                visit(element.argument, true, nextTransformed);
                                continue;
                            }
                            visit(element, true, nextTransformed);
                        }
                        return;
                    case utils_1.AST_NODE_TYPES.CallExpression:
                    case utils_1.AST_NODE_TYPES.NewExpression:
                        for (const arg of node.arguments) {
                            if (arg) {
                                visit(arg, true, true);
                            }
                        }
                        return;
                    case utils_1.AST_NODE_TYPES.SpreadElement:
                        visit(node.argument, true, nextTransformed);
                        return;
                    case utils_1.AST_NODE_TYPES.BinaryExpression:
                    case utils_1.AST_NODE_TYPES.LogicalExpression:
                        visit(node.left, true, true);
                        visit(node.right, true, true);
                        return;
                    case utils_1.AST_NODE_TYPES.ConditionalExpression:
                        visit(node.test, true, true);
                        visit(node.consequent, true, true);
                        visit(node.alternate, true, true);
                        return;
                    case utils_1.AST_NODE_TYPES.TemplateLiteral:
                        node.expressions.forEach((expr) => visit(expr, true, true));
                        return;
                    case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
                        visit(node.tag, true, true);
                        visit(node.quasi, true, true);
                        return;
                    case utils_1.AST_NODE_TYPES.SequenceExpression:
                        node.expressions.forEach((expr) => visit(expr, true, true));
                        return;
                    case utils_1.AST_NODE_TYPES.UnaryExpression:
                    case utils_1.AST_NODE_TYPES.UpdateExpression:
                    case utils_1.AST_NODE_TYPES.AwaitExpression:
                    case utils_1.AST_NODE_TYPES.YieldExpression:
                        if (node.argument) {
                            visit(node.argument, true, true);
                        }
                        return;
                    case utils_1.AST_NODE_TYPES.AssignmentExpression:
                        visit(node.left, true, true);
                        visit(node.right, true, true);
                        return;
                    case utils_1.AST_NODE_TYPES.TSAsExpression:
                    case utils_1.AST_NODE_TYPES.TSTypeAssertion:
                    case utils_1.AST_NODE_TYPES.TSNonNullExpression:
                    case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
                    case utils_1.AST_NODE_TYPES.TSInstantiationExpression:
                        visit(node.expression, nextNested, nextTransformed);
                        return;
                    default:
                        if (isFunctionLike(node)) {
                            return;
                        }
                }
            }
            visit(normalized, false, false);
            return results;
        }
        function getParameterName(param) {
            if (!param) {
                return null;
            }
            if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
                return param.name;
            }
            if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
                if (param.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return param.left.name;
                }
                if (param.left.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    return null;
                }
            }
            if (param.type === utils_1.AST_NODE_TYPES.RestElement) {
                return param.argument.type === utils_1.AST_NODE_TYPES.Identifier
                    ? param.argument.name
                    : null;
            }
            if (param.type === utils_1.AST_NODE_TYPES.TSParameterProperty) {
                const { parameter } = param;
                if (parameter.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return parameter.name;
                }
                if (parameter.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                    parameter.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return parameter.left.name;
                }
            }
            return null;
        }
        function buildParameterNote(paramName) {
            return paramName ? ` (parameter "${paramName}")` : '';
        }
        function reportAccess(methodName, methodMeta, argIndex, access) {
            const paramName = getParameterName(methodMeta.params[argIndex]);
            const parameterNote = buildParameterNote(paramName);
            const memberText = getMemberText(access.propertyName);
            const messageId = access.nested
                ? 'redundantInstanceValueInObject'
                : 'redundantInstanceArg';
            context.report({
                node: access.node,
                messageId,
                data: {
                    methodName,
                    memberText,
                    parameterNote,
                },
            });
        }
        return {
            'ClassDeclaration, ClassExpression'(node) {
                collectClassInfo(node);
            },
            CallExpression(node) {
                const methodName = getMethodNameFromCallee(node.callee);
                if (!methodName || methodName === 'constructor') {
                    return;
                }
                const classNode = findEnclosingClass(node);
                if (!classNode) {
                    return;
                }
                const classInfo = classInfoMap.get(classNode);
                const methodMeta = classInfo?.methods.get(methodName);
                if (!methodMeta || methodMeta.isStatic) {
                    return;
                }
                const member = findEnclosingMember(node);
                const memberFunction = getMemberFunction(member);
                if (memberFunction) {
                    if (hasNestedFunctionBetween(node, memberFunction)) {
                        return;
                    }
                }
                else {
                    if (!member || member.type !== utils_1.AST_NODE_TYPES.PropertyDefinition) {
                        return;
                    }
                    if (hasNestedFunctionBetween(node, member)) {
                        return;
                    }
                }
                node.arguments.forEach((arg, index) => {
                    if (!arg) {
                        return;
                    }
                    const targetNode = arg.type === utils_1.AST_NODE_TYPES.SpreadElement ? arg.argument : arg;
                    const accesses = collectThisAccesses(targetNode);
                    for (const access of accesses) {
                        reportAccess(methodName, methodMeta, index, access);
                    }
                });
            },
        };
    },
});
//# sourceMappingURL=no-redundant-this-params.js.map