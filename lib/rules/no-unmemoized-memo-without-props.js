"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnmemoizedMemoWithoutProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const ruleName = 'no-unmemoized-memo-without-props';
const isTsxFile = (filename) => filename.endsWith('.tsx') || filename.endsWith('.jsx');
const isMemoSource = (importPath) => importPath === 'react' || /(?:^|\/|\\)util\/memo$/.test(importPath);
const getIdentifierFromCallee = (callee) => {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.property.name;
    }
    return null;
};
const unwrapAssignment = (param) => {
    if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        return param.left;
    }
    return param;
};
const collectTypeNames = (typeNode) => {
    if (!typeNode) {
        return [];
    }
    switch (typeNode.type) {
        case utils_1.AST_NODE_TYPES.TSTypeReference:
            return typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier
                ? [typeNode.typeName.name]
                : [];
        case utils_1.AST_NODE_TYPES.TSUnionType:
        case utils_1.AST_NODE_TYPES.TSIntersectionType:
            return typeNode.types.flatMap(collectTypeNames);
        default:
            return [];
    }
};
const typeNodeHasNonEmptyInlineType = (typeNode) => {
    if (!typeNode) {
        return false;
    }
    switch (typeNode.type) {
        case utils_1.AST_NODE_TYPES.TSTypeLiteral:
            return typeNode.members.length > 0;
        case utils_1.AST_NODE_TYPES.TSUnionType:
        case utils_1.AST_NODE_TYPES.TSIntersectionType:
            return typeNode.types.some(typeNodeHasNonEmptyInlineType);
        case utils_1.AST_NODE_TYPES.TSMappedType:
        case utils_1.AST_NODE_TYPES.TSIndexedAccessType:
        case utils_1.AST_NODE_TYPES.TSArrayType:
        case utils_1.AST_NODE_TYPES.TSTupleType:
        case utils_1.AST_NODE_TYPES.TSFunctionType:
        case utils_1.AST_NODE_TYPES.TSTypePredicate:
            return true;
        default:
            return false;
    }
};
const isExplicitEmptyType = (typeNode) => {
    if (!typeNode) {
        return false;
    }
    if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.length === 0;
    }
    return false;
};
const hasRestProperty = (pattern) => pattern.properties.some((property) => property.type === utils_1.AST_NODE_TYPES.RestElement);
const summarizeParams = (params) => {
    if (params.length === 0) {
        return {
            paramCount: 0,
            hasRest: false,
            hasMultipleParams: false,
            isEmptyObjectPattern: false,
            referencedTypeNames: [],
            explicitEmptyAnnotation: false,
            hasInlineNonEmptyType: false,
            identifierWithUnknownShape: false,
        };
    }
    if (params.length > 1) {
        return {
            paramCount: params.length,
            hasRest: false,
            hasMultipleParams: true,
            isEmptyObjectPattern: false,
            referencedTypeNames: [],
            explicitEmptyAnnotation: false,
            hasInlineNonEmptyType: false,
            identifierWithUnknownShape: false,
        };
    }
    const param = unwrapAssignment(params[0]);
    if (param.type === utils_1.AST_NODE_TYPES.RestElement) {
        return {
            paramCount: 1,
            hasRest: true,
            hasMultipleParams: false,
            isEmptyObjectPattern: false,
            referencedTypeNames: [],
            explicitEmptyAnnotation: false,
            hasInlineNonEmptyType: false,
            identifierWithUnknownShape: false,
        };
    }
    if (param.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        const typeNode = param.typeAnnotation?.typeAnnotation ?? null;
        const referencedTypeNames = collectTypeNames(typeNode);
        return {
            paramCount: 1,
            hasRest: hasRestProperty(param),
            hasMultipleParams: false,
            isEmptyObjectPattern: param.properties.length === 0,
            referencedTypeNames,
            explicitEmptyAnnotation: isExplicitEmptyType(typeNode),
            hasInlineNonEmptyType: typeNodeHasNonEmptyInlineType(typeNode),
            identifierWithUnknownShape: false,
        };
    }
    if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
        const typeNode = param.typeAnnotation?.typeAnnotation ?? null;
        const referencedTypeNames = collectTypeNames(typeNode);
        const explicitEmptyAnnotation = isExplicitEmptyType(typeNode);
        return {
            paramCount: 1,
            hasRest: false,
            hasMultipleParams: false,
            isEmptyObjectPattern: false,
            referencedTypeNames,
            explicitEmptyAnnotation,
            hasInlineNonEmptyType: typeNodeHasNonEmptyInlineType(typeNode),
            identifierWithUnknownShape: !typeNode && !explicitEmptyAnnotation,
        };
    }
    return {
        paramCount: params.length,
        hasRest: false,
        hasMultipleParams: false,
        isEmptyObjectPattern: false,
        referencedTypeNames: [],
        explicitEmptyAnnotation: false,
        hasInlineNonEmptyType: false,
        identifierWithUnknownShape: true,
    };
};
const componentHasProps = (summary, emptyTypeNames) => {
    if (summary.paramCount === 0) {
        return false;
    }
    if (summary.hasMultipleParams || summary.hasRest) {
        return true;
    }
    if (summary.identifierWithUnknownShape) {
        return true;
    }
    if (summary.hasInlineNonEmptyType) {
        return true;
    }
    if (summary.explicitEmptyAnnotation) {
        return false;
    }
    if (summary.referencedTypeNames.length > 0) {
        const referencedTypesAreEmpty = summary.referencedTypeNames.every((name) => emptyTypeNames.has(name));
        return !referencedTypesAreEmpty;
    }
    if (summary.isEmptyObjectPattern) {
        return false;
    }
    return true;
};
const isIgnoredHookCall = (callee, ignoreHooks) => {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        ignoreHooks.has(callee.name)) {
        return true;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        ignoreHooks.has(callee.property.name)) {
        return true;
    }
    return false;
};
const traverseAst = (node, visitorKeys, visitor) => {
    const stack = [node];
    while (stack.length > 0) {
        const current = stack.pop();
        if (visitor(current)) {
            return true;
        }
        for (const key of visitorKeys[current.type] ?? []) {
            const child = current[key];
            if (Array.isArray(child)) {
                for (const value of child) {
                    if (value &&
                        typeof value === 'object' &&
                        'type' in value) {
                        stack.push(value);
                    }
                }
            }
            else if (child &&
                typeof child === 'object' &&
                'type' in child) {
                stack.push(child);
            }
        }
    }
    return false;
};
const componentUsesIgnoredHook = (node, ignoreHooks, visitorKeys) => {
    if (ignoreHooks.size === 0 || !node.body) {
        return false;
    }
    return traverseAst(node.body, visitorKeys, (current) => current.type === utils_1.AST_NODE_TYPES.CallExpression &&
        isIgnoredHookCall(current.callee, ignoreHooks));
};
exports.noUnmemoizedMemoWithoutProps = (0, createRule_1.createRule)({
    name: ruleName,
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prevent wrapping prop-less Unmemoized components in memo since memo provides no benefit without props and adds unnecessary indirection',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    ignoreHooks: {
                        type: 'array',
                        items: { type: 'string' },
                        uniqueItems: true,
                        default: [],
                    },
                    ignoreHocs: {
                        type: 'array',
                        items: { type: 'string' },
                        uniqueItems: true,
                        default: [],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            unnecessaryMemoWithoutProps: 'Component "{{componentName}}" has no props but is wrapped with memo() using the "Unmemoized" pattern. memo only skips renders when props change, so this wrapper adds indirection and a duplicate name with no performance gain. Remove memo() and drop the "Unmemoized" suffix so the component is a single function named "{{suggestedName}}".',
        },
    },
    defaultOptions: [{}],
    create(context, [options]) {
        const filename = context.getFilename();
        if (!isTsxFile(filename)) {
            return {};
        }
        const memoIdentifiers = new Set();
        const reactNamespaceNames = new Set();
        const emptyTypeNames = new Set();
        const components = new Map();
        const memoWrappers = [];
        const ignoreHooks = new Set(options?.ignoreHooks ?? []);
        const ignoreHocs = new Set(options?.ignoreHocs ?? []);
        const visitorKeys = context.getSourceCode().visitorKeys;
        const tryRecordComponent = (name, node) => {
            if (!name.endsWith('Unmemoized')) {
                return;
            }
            if (!node.body) {
                return;
            }
            const returnsJsx = ASTHelpers_1.ASTHelpers.returnsJSX(node.body);
            if (!returnsJsx) {
                return;
            }
            const summary = summarizeParams(node.params);
            const usesIgnoredHook = componentUsesIgnoredHook(node, ignoreHooks, visitorKeys);
            components.set(name, {
                node,
                summary,
                returnsJsx,
                usesIgnoredHook,
            });
        };
        const recordMemoIdentifier = (localName, sourceValue, importedName) => {
            if (!isMemoSource(sourceValue)) {
                return;
            }
            if (importedName && importedName !== 'memo') {
                return;
            }
            memoIdentifiers.add(localName);
        };
        return {
            ImportDeclaration(node) {
                if (typeof node.source.value !== 'string') {
                    return;
                }
                const importPath = node.source.value;
                for (const specifier of node.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier) {
                        recordMemoIdentifier(specifier.local.name, importPath, specifier.imported.name);
                    }
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) {
                        if (importPath === 'react') {
                            reactNamespaceNames.add(specifier.local.name);
                        }
                        if (isMemoSource(importPath) && importPath !== 'react') {
                            memoIdentifiers.add(specifier.local.name);
                        }
                    }
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                        if (importPath === 'react') {
                            reactNamespaceNames.add(specifier.local.name);
                        }
                    }
                }
            },
            TSTypeAliasDeclaration(node) {
                if (node.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeLiteral &&
                    node.typeAnnotation.members.length === 0) {
                    emptyTypeNames.add(node.id.name);
                }
            },
            TSInterfaceDeclaration(node) {
                if (node.extends && node.extends.length > 0) {
                    return;
                }
                if (node.body.body.length === 0) {
                    emptyTypeNames.add(node.id.name);
                }
            },
            FunctionDeclaration(node) {
                if (!node.id) {
                    return;
                }
                tryRecordComponent(node.id.name, node);
            },
            VariableDeclarator(node) {
                if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier || !node.init) {
                    return;
                }
                if (node.init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    node.init.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    tryRecordComponent(node.id.name, node.init);
                    return;
                }
                if (node.init.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const calleeName = getIdentifierFromCallee(node.init.callee);
                    if (calleeName && ignoreHocs.has(calleeName)) {
                        components.set(node.id.name, {
                            node: node.init,
                            summary: summarizeParams([]),
                            returnsJsx: false,
                            usesIgnoredHook: false,
                            hocCalleeName: calleeName,
                        });
                    }
                }
            },
            CallExpression(node) {
                const { callee, arguments: args } = node;
                const isMemoIdentifier = callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    memoIdentifiers.has(callee.name);
                const isMemoMemberExpression = callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !callee.computed &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'memo' &&
                    callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    reactNamespaceNames.has(callee.object.name);
                if (!isMemoIdentifier && !isMemoMemberExpression) {
                    return;
                }
                if (args.length === 0) {
                    return;
                }
                const target = args[0];
                if (target.type !== utils_1.AST_NODE_TYPES.Identifier) {
                    return;
                }
                memoWrappers.push({
                    node,
                    componentName: target.name,
                });
            },
            'Program:exit'() {
                for (const wrapper of memoWrappers) {
                    const component = components.get(wrapper.componentName);
                    if (!component) {
                        continue;
                    }
                    if (component.hocCalleeName &&
                        ignoreHocs.has(component.hocCalleeName)) {
                        continue;
                    }
                    if (!component.returnsJsx) {
                        continue;
                    }
                    if (component.usesIgnoredHook) {
                        continue;
                    }
                    const hasProps = componentHasProps(component.summary, emptyTypeNames);
                    if (hasProps) {
                        continue;
                    }
                    const suggestedName = wrapper.componentName.replace(/Unmemoized$/, '');
                    context.report({
                        node: wrapper.node,
                        messageId: 'unnecessaryMemoWithoutProps',
                        data: {
                            componentName: wrapper.componentName,
                            suggestedName,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-unmemoized-memo-without-props.js.map