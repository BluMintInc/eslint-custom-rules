"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noHandlerSuffix = void 0;
const utils_1 = require("@typescript-eslint/utils");
const minimatch_1 = require("minimatch");
const createRule_1 = require("../utils/createRule");
const DEFAULT_OPTIONS = {
    ignoreClassMethods: false,
    ignoreInterfaceImplementations: false,
    interfaceAllowlist: [],
    allowNames: [],
    allowPatterns: [],
    allowFilePatterns: [],
};
function toEntityName(entity) {
    if (entity.type === utils_1.AST_NODE_TYPES.Identifier) {
        return entity.name;
    }
    if (entity.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
        return `${toEntityName(entity.left)}.${entity.right.name}`;
    }
    return '';
}
function isUnsafeAllowPattern(pattern) {
    // Flag nested quantifiers that commonly lead to catastrophic backtracking
    const nestedQuantifierPattern = /\((?:[^()\\]|\\.)*[+*{][^)]*\)\s*[+*{]/;
    return nestedQuantifierPattern.test(pattern);
}
function getStaticKeyName(key) {
    if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
        return key.name;
    }
    if (key.type === utils_1.AST_NODE_TYPES.Literal && typeof key.value === 'string') {
        return key.value;
    }
    return null;
}
function getHandlerSuffix(name) {
    const match = name.match(/^(.*?)(Handlers?)$/i);
    if (!match)
        return null;
    const [, baseName, suffix] = match;
    if (!suffix)
        return null;
    const normalizedSuffix = suffix.toLowerCase() === 'handlers' ? 'Handlers' : 'Handler';
    return {
        baseName,
        suffix: normalizedSuffix,
    };
}
function isInAllowedFile(filename, allowFilePatterns) {
    return allowFilePatterns.some((pattern) => (0, minimatch_1.minimatch)(filename, pattern));
}
function toMemberExpressionName(expr) {
    if (expr.computed || expr.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const objectName = expr.object.type === utils_1.AST_NODE_TYPES.Identifier
        ? expr.object.name
        : expr.object.type === utils_1.AST_NODE_TYPES.MemberExpression
            ? toMemberExpressionName(expr.object)
            : null;
    return objectName ? `${objectName}.${expr.property.name}` : null;
}
function getImplementedInterfaces(classNode) {
    return (classNode.implements?.flatMap((impl) => {
        const expr = impl.expression;
        const name = expr.type === utils_1.AST_NODE_TYPES.Identifier
            ? expr.name
            : expr.type === utils_1.AST_NODE_TYPES.MemberExpression
                ? toMemberExpressionName(expr)
                : null;
        return name ? [name] : [];
    }) ?? []);
}
function getClassFromMember(node) {
    const classBody = node.parent;
    if (classBody &&
        classBody.type === utils_1.AST_NODE_TYPES.ClassBody &&
        classBody.parent &&
        (classBody.parent.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            classBody.parent.type === utils_1.AST_NODE_TYPES.ClassExpression)) {
        return classBody.parent;
    }
    return null;
}
function getTypeAnnotationName(annotation) {
    if (!annotation)
        return null;
    if (annotation.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
        const typeName = annotation.typeAnnotation.typeName;
        if (typeName.type === utils_1.AST_NODE_TYPES.Identifier ||
            typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
            return toEntityName(typeName);
        }
    }
    return null;
}
exports.noHandlerSuffix = (0, createRule_1.createRule)({
    name: 'no-handler-suffix',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow the generic "handler" suffix in callback names so names explain the action they perform',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    ignoreClassMethods: { type: 'boolean' },
                    ignoreInterfaceImplementations: { type: 'boolean' },
                    interfaceAllowlist: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    allowNames: { type: 'array', items: { type: 'string' } },
                    allowPatterns: { type: 'array', items: { type: 'string' } },
                    allowFilePatterns: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            handlerSuffix: 'Function "{{name}}" ends with the generic {{suffix}} suffix. Handler names hide the outcome of the callback and make call sites indistinguishable. Rename it to describe the effect (e.g., "{{suggestedName}}" or another action phrase) so readers know what the function actually does.',
        },
    },
    defaultOptions: [DEFAULT_OPTIONS],
    create(context, [options]) {
        const filename = context.getFilename();
        const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
        const allowNames = new Set(resolvedOptions.allowNames);
        const interfaceAllowlist = new Set(resolvedOptions.interfaceAllowlist);
        const invalidAllowPatterns = [];
        const unsafeAllowPatterns = [];
        const allowPatterns = (resolvedOptions.allowPatterns ?? []).flatMap((pattern) => {
            try {
                if (isUnsafeAllowPattern(pattern)) {
                    unsafeAllowPatterns.push(pattern);
                    return [];
                }
                return [new RegExp(pattern)];
            }
            catch (error) {
                const reason = error && typeof error === 'object' && 'message' in error
                    ? ` (${String(error.message)})`
                    : '';
                invalidAllowPatterns.push(`${pattern}${reason}`);
                return [];
            }
        });
        if (invalidAllowPatterns.length > 0 || unsafeAllowPatterns.length > 0) {
            const errorParts = [];
            if (invalidAllowPatterns.length > 0) {
                errorParts.push(`invalid allowPatterns: ${invalidAllowPatterns.join(', ')}`);
            }
            if (unsafeAllowPatterns.length > 0) {
                errorParts.push(`unsafe allowPatterns (avoid nested quantifiers that risk catastrophic backtracking): ${unsafeAllowPatterns.join(', ')}`);
            }
            throw new Error(`no-handler-suffix: ${errorParts.join('; ')}`);
        }
        if (isInAllowedFile(filename, resolvedOptions.allowFilePatterns ?? [])) {
            return {};
        }
        function isAllowedName(name) {
            if (allowNames.has(name))
                return true;
            return allowPatterns.some((regex) => regex.test(name));
        }
        function shouldIgnoreForInterfaces(node) {
            const { ignoreInterfaceImplementations } = resolvedOptions;
            if ((node.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                node.type === utils_1.AST_NODE_TYPES.PropertyDefinition) &&
                !node.computed &&
                (node.key.type === utils_1.AST_NODE_TYPES.Identifier ||
                    node.key.type === utils_1.AST_NODE_TYPES.PrivateIdentifier ||
                    (node.key.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof node.key.value === 'string'))) {
                const classNode = getClassFromMember(node);
                if (!classNode)
                    return false;
                const implemented = getImplementedInterfaces(classNode);
                if (implemented.length === 0)
                    return false;
                if (ignoreInterfaceImplementations) {
                    return true;
                }
                if (interfaceAllowlist.size > 0) {
                    return implemented.some((iface) => interfaceAllowlist.has(iface));
                }
            }
            if (node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                const annotationName = getTypeAnnotationName(node.id.typeAnnotation);
                if (annotationName &&
                    (interfaceAllowlist.has(annotationName) ||
                        resolvedOptions.ignoreInterfaceImplementations)) {
                    return true;
                }
            }
            return false;
        }
        function getParentName(parent) {
            if (!parent)
                return null;
            if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                return parent.id.name;
            }
            if ((parent.type === utils_1.AST_NODE_TYPES.Property ||
                parent.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                parent.type === utils_1.AST_NODE_TYPES.PropertyDefinition) &&
                !parent.computed &&
                parent.key.type !== utils_1.AST_NODE_TYPES.PrivateIdentifier) {
                return getStaticKeyName(parent.key);
            }
            return null;
        }
        function reportIfHandlerName(name, identifierNode, owner) {
            if (!name || !identifierNode)
                return;
            const suffixInfo = getHandlerSuffix(name);
            if (!suffixInfo)
                return;
            if (isAllowedName(name))
                return;
            if ((owner.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                owner.type === utils_1.AST_NODE_TYPES.PropertyDefinition) &&
                resolvedOptions.ignoreClassMethods) {
                return;
            }
            if (owner.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
                owner.type === utils_1.AST_NODE_TYPES.PropertyDefinition ||
                owner.type === utils_1.AST_NODE_TYPES.VariableDeclarator ||
                owner.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                if (shouldIgnoreForInterfaces(owner)) {
                    return;
                }
            }
            const suggestedName = suffixInfo.baseName || 'a verb phrase that states the outcome';
            context.report({
                node: identifierNode,
                messageId: 'handlerSuffix',
                data: {
                    name,
                    suffix: suffixInfo.suffix,
                    suggestedName,
                },
            });
        }
        return {
            FunctionDeclaration(node) {
                if (node.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    reportIfHandlerName(node.id.name, node.id, node);
                }
            },
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.init?.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                    reportIfHandlerName(node.id.name, node.id, node);
                }
            },
            MethodDefinition(node) {
                if (!node.computed) {
                    const name = getStaticKeyName(node.key);
                    if (name) {
                        reportIfHandlerName(name, node.key, node);
                    }
                }
            },
            PropertyDefinition(node) {
                if (!node.computed &&
                    (node.value?.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.value?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                    const name = getStaticKeyName(node.key);
                    if (name) {
                        reportIfHandlerName(name, node.key, node);
                    }
                }
            },
            Property(node) {
                if (!node.computed &&
                    (node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                    const name = getStaticKeyName(node.key);
                    if (name) {
                        reportIfHandlerName(name, node.key, node);
                    }
                }
            },
            FunctionExpression(node) {
                if (!node.id)
                    return;
                // Avoid double-reporting when the parent already names the function
                const parentName = getParentName(node.parent);
                if (parentName && parentName === node.id.name) {
                    return;
                }
                reportIfHandlerName(node.id.name, node.id, node);
            },
        };
    },
});
//# sourceMappingURL=no-handler-suffix.js.map