"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preventChildrenClobber = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
function resolveFunctionName(node) {
    if ('id' in node && node.id?.name) {
        return node.id.name;
    }
    if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression &&
        node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.parent.id.name;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.parent.id.name;
    }
    return null;
}
function isComponentLike(node) {
    const name = resolveFunctionName(node);
    if (name && /^[A-Z]/.test(name)) {
        return true;
    }
    return ASTHelpers_1.ASTHelpers.returnsJSX(node.body);
}
function patternHasChildrenProperty(pattern) {
    return pattern.properties.some((prop) => {
        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
            return false;
        if (prop.computed)
            return false;
        const key = prop.key;
        if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
            return key.name === 'children';
        }
        if (key.type === utils_1.AST_NODE_TYPES.Literal) {
            return key.value === 'children';
        }
        return false;
    });
}
function typeNodeContainsLiteral(node, literalValue) {
    if (node.type === utils_1.AST_NODE_TYPES.TSLiteralType) {
        return node.literal.type === utils_1.AST_NODE_TYPES.Literal
            ? node.literal.value === literalValue
            : false;
    }
    if (node.type === utils_1.AST_NODE_TYPES.TSUnionType) {
        return node.types.some((t) => typeNodeContainsLiteral(t, literalValue));
    }
    if (node.type === utils_1.AST_NODE_TYPES.TSTupleType) {
        return node.elementTypes.some((t) => typeNodeContainsLiteral(t, literalValue));
    }
    if (node.type === utils_1.AST_NODE_TYPES.TSArrayType) {
        return typeNodeContainsLiteral(node.elementType, literalValue);
    }
    return false;
}
function typeNodeExcludesProperty(node, propertyName, aliasMap, seen = new Set()) {
    if (node.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
        const typeName = node.typeName.type === utils_1.AST_NODE_TYPES.Identifier
            ? node.typeName.name
            : null;
        if (typeName === 'Omit' && node.typeParameters?.params?.[1]) {
            const excluded = node.typeParameters.params[1];
            if (typeNodeContainsLiteral(excluded, propertyName) ||
                typeNodeExcludesProperty(excluded, propertyName, aliasMap, seen)) {
                return true;
            }
        }
        if (node.typeParameters?.params) {
            return node.typeParameters.params.some((param) => typeNodeExcludesProperty(param, propertyName, aliasMap, seen));
        }
        if (typeName && aliasMap?.has(typeName) && !seen.has(typeName)) {
            seen.add(typeName);
            const alias = aliasMap.get(typeName);
            if (alias &&
                typeNodeExcludesProperty(alias, propertyName, aliasMap, seen)) {
                return true;
            }
        }
    }
    if (node.type === utils_1.AST_NODE_TYPES.TSUnionType) {
        return node.types.every((typeNode) => typeNodeExcludesProperty(typeNode, propertyName, aliasMap, seen));
    }
    if (node.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
        return node.types.every((typeNode) => typeNodeExcludesProperty(typeNode, propertyName, aliasMap, seen));
    }
    return false;
}
function typeAnnotationExcludesProperty(annotation, propertyName, aliasMap) {
    if (!annotation)
        return false;
    return typeNodeExcludesProperty(annotation.typeAnnotation, propertyName, aliasMap);
}
function collectRestBindingsFromPattern(pattern, ctx, annotation, aliasMap, sourceChildrenSourceId) {
    const childrenPresent = patternHasChildrenProperty(pattern);
    for (const prop of pattern.properties) {
        if (prop.type === utils_1.AST_NODE_TYPES.RestElement &&
            prop.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
            ctx.propsLikeIdentifiers.add(prop.argument.name);
            ctx.bindings.set(prop.argument.name, {
                identifier: prop.argument,
                childrenExcluded: childrenPresent,
                typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(annotation, 'children', aliasMap),
                childrenSourceId: sourceChildrenSourceId ?? prop.argument.name,
            });
        }
        else if (prop.type === utils_1.AST_NODE_TYPES.Property &&
            prop.value.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            collectRestBindingsFromPattern(prop.value, ctx, null, aliasMap);
        }
    }
}
function recordChildrenValueBindingsFromPattern(pattern, ctx, sourceChildrenSourceId) {
    for (const prop of pattern.properties) {
        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
            continue;
        if (prop.computed)
            continue;
        const key = prop.key;
        const keyName = key.type === utils_1.AST_NODE_TYPES.Identifier
            ? key.name
            : key.type === utils_1.AST_NODE_TYPES.Literal && typeof key.value === 'string'
                ? key.value
                : null;
        if (keyName !== 'children')
            continue;
        const value = prop.value;
        if (value.type === utils_1.AST_NODE_TYPES.Identifier) {
            ctx.childrenValueSourceIds.set(value.name, sourceChildrenSourceId);
            continue;
        }
        if (value.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
            value.left.type === utils_1.AST_NODE_TYPES.Identifier) {
            ctx.childrenValueSourceIds.set(value.left.name, sourceChildrenSourceId);
        }
    }
}
function recordParamBindings(param, ctx, aliasMap) {
    if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
        ctx.propsLikeIdentifiers.add(param.name);
        ctx.bindings.set(param.name, {
            identifier: param,
            childrenExcluded: false,
            typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(param.typeAnnotation, 'children', aliasMap),
            childrenSourceId: param.name,
        });
        return;
    }
    if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === utils_1.AST_NODE_TYPES.Identifier) {
        ctx.propsLikeIdentifiers.add(param.left.name);
        ctx.bindings.set(param.left.name, {
            identifier: param.left,
            childrenExcluded: false,
            typeAnnotationExcludesProperty: typeAnnotationExcludesProperty(param.typeAnnotation, 'children', aliasMap),
            childrenSourceId: param.left.name,
        });
        return;
    }
    if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectRestBindingsFromPattern(param.left, ctx, param.typeAnnotation, aliasMap);
        return;
    }
    if (param.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectRestBindingsFromPattern(param, ctx, param.typeAnnotation, aliasMap);
    }
}
function findNearestComponentContext(stack) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].isComponent)
            return stack[i];
    }
    return undefined;
}
function findBinding(name, stack) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        const binding = stack[i].bindings.get(name);
        if (binding)
            return binding;
    }
    return undefined;
}
function findChildrenValueSourceId(name, stack) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        const sourceId = stack[i].childrenValueSourceIds.get(name);
        if (sourceId)
            return sourceId;
    }
    return undefined;
}
function isPropsLike(name, stack) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].propsLikeIdentifiers.has(name))
            return true;
    }
    return false;
}
function typeHasChildrenProperty(checker, type) {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
        return null;
    }
    const apparent = checker.getApparentType(type);
    const directProp = type.getProperty?.('children') ??
        checker.getPropertyOfType(type, 'children') ??
        checker.getPropertyOfType(apparent, 'children');
    if (directProp) {
        return true;
    }
    if (type.isUnion?.()) {
        let sawUnknown = false;
        for (const member of type.types) {
            const result = typeHasChildrenProperty(checker, member);
            if (result)
                return true;
            if (result === null)
                sawUnknown = true;
        }
        return sawUnknown ? null : false;
    }
    if (type.isIntersection?.()) {
        let sawUnknown = false;
        for (const member of type.types) {
            const result = typeHasChildrenProperty(checker, member);
            if (result)
                return true;
            if (result === null)
                sawUnknown = true;
        }
        return sawUnknown ? null : false;
    }
    return false;
}
function bindingMayContainChildren(binding, context) {
    if (binding.childrenExcluded)
        return false;
    if (binding.typeAnnotationExcludesProperty)
        return false;
    const services = context.sourceCode?.parserServices ?? context.parserServices;
    if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
        return true;
    }
    try {
        const checker = services.program.getTypeChecker();
        const tsNode = services.esTreeNodeToTSNodeMap.get(binding.identifier);
        if (!tsNode)
            return true;
        const type = checker.getTypeAtLocation(tsNode);
        const hasChildren = typeHasChildrenProperty(checker, type);
        if (hasChildren === false)
            return false;
        return true;
    }
    catch {
        return true;
    }
}
function hasExplicitChildren(element) {
    if (element.openingElement.selfClosing)
        return false;
    return element.children.some((child) => {
        if (child.type === utils_1.AST_NODE_TYPES.JSXText) {
            return child.value.trim().length > 0;
        }
        if (child.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
            return child.expression.type !== utils_1.AST_NODE_TYPES.JSXEmptyExpression;
        }
        return true; // JSXElement, JSXFragment, JSXSpreadChild, etc.
    });
}
function nodeReferencesChildren(node, propsObjectNames, childrenValueNames) {
    const stack = [node];
    while (stack.length) {
        const current = stack.pop();
        if (current.type === utils_1.AST_NODE_TYPES.Identifier) {
            if (childrenValueNames.has(current.name))
                return true;
        }
        else if (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            if (!current.computed &&
                current.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                current.property.name === 'children' &&
                current.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                propsObjectNames.has(current.object.name)) {
                return true;
            }
        }
        else if (current.type === utils_1.AST_NODE_TYPES.ChainExpression) {
            stack.push(current.expression);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const key of Object.keys(current)) {
            if (key === 'parent')
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = current[key];
            if (!value)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object' && 'type' in child) {
                        stack.push(child);
                    }
                }
            }
            else if (typeof value === 'object' && 'type' in value) {
                stack.push(value);
            }
        }
    }
    return false;
}
function childrenRenderSpreadChildren(children, propsObjectNames, childrenValueNames) {
    for (const child of children) {
        if (child.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
            if (nodeReferencesChildren(child.expression, propsObjectNames, childrenValueNames)) {
                return true;
            }
        }
        else if (child.type === utils_1.AST_NODE_TYPES.JSXElement ||
            child.type === utils_1.AST_NODE_TYPES.JSXFragment ||
            child.type === utils_1.AST_NODE_TYPES.JSXSpreadChild) {
            if (nodeReferencesChildren(child, propsObjectNames, childrenValueNames)) {
                return true;
            }
        }
        else if (child.type === utils_1.AST_NODE_TYPES.JSXText) {
            continue;
        }
    }
    return false;
}
function collectPropsObjectNamesForChildrenSourceIds(sourceIds, stack) {
    const names = new Set();
    for (const ctx of stack) {
        for (const [name, binding] of ctx.bindings) {
            if (sourceIds.has(binding.childrenSourceId)) {
                names.add(name);
            }
        }
    }
    return names;
}
function collectChildrenValueNamesForChildrenSourceIds(sourceIds, stack) {
    const names = new Set();
    for (const ctx of stack) {
        for (const [name, sourceId] of ctx.childrenValueSourceIds) {
            if (sourceIds.has(sourceId)) {
                names.add(name);
            }
        }
    }
    return names;
}
exports.preventChildrenClobber = (0, createRule_1.createRule)({
    name: 'prevent-children-clobber',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent JSX spreads from silently discarding props.children',
            recommended: 'error',
            requiresTypeChecking: false,
        },
        schema: [],
        messages: {
            childrenClobbered: "Children clobber detected: JSX spreads {{spreadNames}} which may already contain children, but the element also declares its own children. The spread children are discarded. Destructure and render children explicitly (e.g., `{ children, ...rest }` and include `{children}`) or add `'children'` to an `Omit<>` if this component should not accept children.",
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.sourceCode ??
            context.getSourceCode();
        const aliasMap = new Map();
        for (const node of sourceCode.ast.body) {
            if (node.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                aliasMap.set(node.id.name, node.typeAnnotation);
            }
        }
        const functionStack = [];
        return {
            ':function'(node) {
                const ctx = {
                    isComponent: isComponentLike(node),
                    bindings: new Map(),
                    propsLikeIdentifiers: new Set(),
                    childrenValueSourceIds: new Map(),
                };
                if (ctx.isComponent) {
                    for (const param of node.params) {
                        recordParamBindings(param, ctx, aliasMap);
                    }
                }
                functionStack.push(ctx);
            },
            ':function:exit'() {
                functionStack.pop();
            },
            VariableDeclarator(node) {
                const componentCtx = findNearestComponentContext(functionStack);
                if (!componentCtx)
                    return;
                const id = node.id;
                const init = node.init;
                if (id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    init?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const sourceBinding = findBinding(init.name, functionStack);
                    const typeExcludes = typeAnnotationExcludesProperty(id.typeAnnotation, 'children', aliasMap);
                    if (sourceBinding) {
                        componentCtx.bindings.set(id.name, {
                            identifier: id,
                            childrenExcluded: sourceBinding.childrenExcluded,
                            typeAnnotationExcludesProperty: sourceBinding.typeAnnotationExcludesProperty || typeExcludes,
                            childrenSourceId: sourceBinding.childrenSourceId,
                        });
                    }
                    else if (isPropsLike(init.name, functionStack)) {
                        const propsLikeBinding = findBinding(init.name, functionStack);
                        componentCtx.bindings.set(id.name, {
                            identifier: id,
                            childrenExcluded: false,
                            typeAnnotationExcludesProperty: typeExcludes,
                            childrenSourceId: propsLikeBinding?.childrenSourceId ?? init.name,
                        });
                    }
                    if (isPropsLike(init.name, functionStack)) {
                        componentCtx.propsLikeIdentifiers.add(id.name);
                    }
                    const childSourceId = findChildrenValueSourceId(init.name, functionStack);
                    if (childSourceId) {
                        componentCtx.childrenValueSourceIds.set(id.name, childSourceId);
                    }
                }
                else if (id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    init &&
                    (init.type === utils_1.AST_NODE_TYPES.MemberExpression ||
                        init.type === utils_1.AST_NODE_TYPES.ChainExpression)) {
                    const member = init.type === utils_1.AST_NODE_TYPES.ChainExpression
                        ? init.expression
                        : init;
                    if (member.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        !member.computed &&
                        member.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        member.property.name === 'children' &&
                        member.object.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const sourceBinding = findBinding(member.object.name, functionStack);
                        if (sourceBinding) {
                            componentCtx.childrenValueSourceIds.set(id.name, sourceBinding.childrenSourceId);
                        }
                    }
                }
                else if (id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                    init?.type === utils_1.AST_NODE_TYPES.Identifier &&
                    isPropsLike(init.name, functionStack)) {
                    const initBinding = findBinding(init.name, functionStack);
                    const sourceChildrenSourceId = initBinding?.childrenSourceId ?? init.name;
                    recordChildrenValueBindingsFromPattern(id, componentCtx, sourceChildrenSourceId);
                    collectRestBindingsFromPattern(id, componentCtx, id.typeAnnotation ?? null, aliasMap, sourceChildrenSourceId);
                }
            },
            JSXElement(node) {
                const componentCtx = findNearestComponentContext(functionStack);
                if (!componentCtx)
                    return;
                if (!hasExplicitChildren(node))
                    return;
                const spreadNamesInOrder = [];
                for (const attr of node.openingElement.attributes) {
                    if (attr.type === utils_1.AST_NODE_TYPES.JSXSpreadAttribute &&
                        attr.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                        spreadNamesInOrder.push(attr.argument.name);
                    }
                }
                if (spreadNamesInOrder.length === 0)
                    return;
                const offendingSpreads = [];
                for (const name of spreadNamesInOrder) {
                    const binding = findBinding(name, functionStack);
                    if (!binding)
                        continue;
                    if (!bindingMayContainChildren(binding, context)) {
                        continue;
                    }
                    offendingSpreads.push({ name, childrenSourceId: binding.childrenSourceId });
                }
                if (offendingSpreads.length === 0)
                    return;
                const lastOffendingChildrenSourceId = offendingSpreads[offendingSpreads.length - 1].childrenSourceId;
                const lastSourceIds = new Set([lastOffendingChildrenSourceId]);
                const propsObjectNames = collectPropsObjectNamesForChildrenSourceIds(lastSourceIds, functionStack);
                const childrenValueNames = collectChildrenValueNamesForChildrenSourceIds(lastSourceIds, functionStack);
                if (childrenRenderSpreadChildren(node.children, propsObjectNames, childrenValueNames)) {
                    return;
                }
                const clobberedNames = Array.from(new Set(offendingSpreads
                    .filter((spread) => spread.childrenSourceId === lastOffendingChildrenSourceId)
                    .map((spread) => spread.name)));
                context.report({
                    node: node.openingElement,
                    messageId: 'childrenClobbered',
                    data: { spreadNames: clobberedNames.join(', ') },
                });
            },
        };
    },
});
//# sourceMappingURL=prevent-children-clobber.js.map