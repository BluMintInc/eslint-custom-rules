"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferFieldPathsInTransforms = void 0;
const utils_1 = require("@typescript-eslint/utils");
const minimatch_1 = require("minimatch");
const createRule_1 = require("../utils/createRule");
// Defaults aim to catch common BluMint aggregation container names
const DEFAULT_CONTAINERS = ['*Aggregation', 'previews', '*Previews'];
function describeNestedPath(containerValue) {
    let objectFallback = null;
    let primitiveFallback = null;
    for (const prop of containerValue.properties) {
        if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement)
            continue;
        if (!isProperty(prop))
            continue;
        if (prop.computed)
            continue;
        const firstKey = getPropertyName(prop);
        if (!firstKey)
            continue;
        if (isObjectExpression(prop.value)) {
            for (const child of prop.value.properties) {
                if (child.type === utils_1.AST_NODE_TYPES.SpreadElement)
                    continue;
                if (!isProperty(child))
                    continue;
                if (child.computed)
                    continue;
                const childKey = getPropertyName(child);
                if (childKey)
                    return `${firstKey}.${childKey}`;
            }
            // Object container without usable child keys still signals nested intent
            if (!objectFallback)
                objectFallback = firstKey;
            continue;
        }
        if (!primitiveFallback)
            primitiveFallback = firstKey;
    }
    return objectFallback ?? primitiveFallback;
}
function isObjectExpression(node) {
    return !!node && node.type === utils_1.AST_NODE_TYPES.ObjectExpression;
}
function isProperty(node) {
    return node.type === utils_1.AST_NODE_TYPES.Property;
}
function getPropertyName(node) {
    if (node.computed)
        return null;
    if (node.key.type === utils_1.AST_NODE_TYPES.Identifier)
        return node.key.name;
    if (node.key.type === utils_1.AST_NODE_TYPES.Literal &&
        typeof node.key.value === 'string')
        return node.key.value;
    return null;
}
function isNamedFunction(fn, name) {
    if (fn.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
        return (!!fn.id && fn.id.type === utils_1.AST_NODE_TYPES.Identifier && fn.id.name === name);
    }
    // For function expressions, parent determines name association
    return false;
}
function isBoundToName(fn, name) {
    if (fn.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
        return isNamedFunction(fn, name);
    }
    const parent = fn.parent;
    if (!parent)
        return false;
    if (parent.type === utils_1.AST_NODE_TYPES.Property ||
        parent.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
        parent.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
        const narrowedParent = parent;
        const key = narrowedParent.key;
        if (narrowedParent.computed) {
            return key.type === utils_1.AST_NODE_TYPES.Literal && key.value === name;
        }
        if (key.type === utils_1.AST_NODE_TYPES.Identifier)
            return key.name === name;
        if (key.type === utils_1.AST_NODE_TYPES.Literal)
            return key.value === name;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
        return (parent.id.type === utils_1.AST_NODE_TYPES.Identifier && parent.id.name === name);
    }
    if (parent.type === utils_1.AST_NODE_TYPES.AssignmentExpression) {
        const left = parent.left;
        if (left.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            const prop = left.property;
            if (prop.type === utils_1.AST_NODE_TYPES.Identifier)
                return prop.name === name;
            if (prop.type === utils_1.AST_NODE_TYPES.Literal)
                return prop.value === name;
        }
        else if (left.type === utils_1.AST_NODE_TYPES.Identifier) {
            return left.name === name;
        }
    }
    return false;
}
function isTransformEachFunction(fn) {
    return isBoundToName(fn, 'transformEach');
}
function isTransformEachVaripotent(fn) {
    return isBoundToName(fn, 'transformEachVaripotent');
}
// Determine whether any path two or more levels below a container is created using object literals
function hasDeeperThanOneLevelUnderContainer(containerObj) {
    for (const prop of containerObj.properties) {
        if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement) {
            if (isObjectExpression(prop.argument)) {
                return true;
            }
            continue;
        }
        if (!isProperty(prop))
            continue;
        const value = prop.value;
        if (isObjectExpression(value)) {
            // Any nested object literal implies depth >= 2 (even if it only spreads)
            return true;
        }
    }
    return false;
}
function analyzeReturnedObject(obj, context, containerNameMatches) {
    for (const top of obj.properties) {
        if (top.type === utils_1.AST_NODE_TYPES.SpreadElement)
            continue;
        if (!isProperty(top))
            continue;
        // Skip computed top-level keys and already-flattened keys containing dots
        if (top.computed)
            continue;
        const keyName = getPropertyName(top);
        if (!keyName)
            continue;
        if (keyName.includes('.'))
            continue;
        if (!containerNameMatches(keyName))
            continue;
        const containerValue = top.value;
        if (!isObjectExpression(containerValue))
            continue; // only care if returning an object under the container
        if (hasDeeperThanOneLevelUnderContainer(containerValue)) {
            const nestedPath = describeNestedPath(containerValue) ?? 'nestedField';
            context.report({
                node: top,
                messageId: 'preferFieldPathsInTransforms',
                data: {
                    container: keyName,
                    nestedPath,
                    flattenedPath: `${keyName}.${nestedPath}`,
                },
                fix: () => null,
            });
        }
    }
}
exports.preferFieldPathsInTransforms = (0, createRule_1.createRule)({
    name: 'prefer-field-paths-in-transforms',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Flatten aggregation updates inside transformEach so diff-based deletes remove only the intended fields instead of wiping sibling data.',
            recommended: 'warn',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    containers: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    allowNestedIn: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            preferFieldPathsInTransforms: 'Transform returns nested object under "{{container}}" (e.g., "{{nestedPath}}"). Nested writes in shared aggregation containers cause diff reconciliation to delete the whole subtree, wiping sibling fields. Flatten the update into field-path keys such as "{{flattenedPath}}" so only the intended leaf changes and other aggregation data stays intact.',
        },
    },
    defaultOptions: [
        {
            containers: DEFAULT_CONTAINERS,
            allowNestedIn: [],
        },
    ],
    create(context, [options]) {
        const filename = context.getFilename();
        const resolvedOptions = options ?? {
            containers: DEFAULT_CONTAINERS,
            allowNestedIn: [],
        };
        const containers = resolvedOptions.containers ?? DEFAULT_CONTAINERS;
        const allowNestedIn = resolvedOptions.allowNestedIn ?? [];
        // Skip files explicitly allowed
        if (allowNestedIn.length > 0 &&
            allowNestedIn.some((glob) => (0, minimatch_1.minimatch)(filename, glob))) {
            return {};
        }
        function containerNameMatches(name) {
            return containers.some((pattern) => (0, minimatch_1.minimatch)(name, pattern));
        }
        function isInTargetTransform(returnNode) {
            // Find nearest function ancestor
            let current = returnNode.parent ?? null;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                    const fn = current;
                    if (isTransformEachVaripotent(fn))
                        return false;
                    if (isTransformEachFunction(fn))
                        return true;
                }
                current = current.parent ?? null;
            }
            return false;
        }
        return {
            ReturnStatement(node) {
                if (!node.argument || !isObjectExpression(node.argument))
                    return;
                if (!isInTargetTransform(node))
                    return;
                analyzeReturnedObject(node.argument, context, containerNameMatches);
            },
            ArrowFunctionExpression(node) {
                // Handle implicit returns: transformEach: doc => ({ ... })
                if (!isTransformEachFunction(node) || isTransformEachVaripotent(node))
                    return;
                if (isObjectExpression(node.body)) {
                    analyzeReturnedObject(node.body, context, containerNameMatches);
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-field-paths-in-transforms.js.map