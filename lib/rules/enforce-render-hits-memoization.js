"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceRenderHitsMemoization = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceRenderHitsMemoization = (0, createRule_1.createRule)({
    name: 'enforce-render-hits-memoization',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce proper memoization and usage of useRenderHits and renderHits',
            recommended: 'error',
        },
        schema: [],
        messages: {
            requireMemoizedTransformBefore: 'transformBefore prop must be memoized using useCallback',
            requireMemoizedRender: 'render prop must be memoized using useCallback',
            requireMemoizedRenderHits: 'renderHits must be used inside useMemo or useCallback',
            noDirectComponentInRender: 'Do not pass React components directly to render prop, use a memoized arrow function instead',
        },
    },
    defaultOptions: [],
    create(context) {
        const isReactComponent = (node) => {
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            return /^[A-Z]/.test(node.name);
        };
        const isMemoizedCall = (node) => {
            if (node.type !== utils_1.AST_NODE_TYPES.CallExpression)
                return false;
            if (!node.callee || node.callee.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            return (node.callee.name === 'useCallback' || node.callee.name === 'useMemo');
        };
        const isMemoizedVariable = (node) => {
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            // Get the variable declaration for this identifier
            const variable = context
                .getScope()
                .variables.find((v) => v.name === node.name);
            if (!variable)
                return false;
            // Check if the variable is initialized with a memoized call
            for (const def of variable.defs) {
                if (!def || !def.node)
                    continue;
                if (def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    def.node.init) {
                    if (isMemoizedCall(def.node.init)) {
                        return true;
                    }
                }
            }
            return false;
        };
        const isInsideMemoizedCall = (node) => {
            // Handle the case when node is already a memoized call
            if (isMemoizedCall(node))
                return true;
            // Check if the node is a reference to a memoized variable
            if (isMemoizedVariable(node))
                return true;
            // Check if the node is inside a memoization hook call
            let current = node;
            while (current?.parent) {
                if (current.parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const callee = current.parent.callee;
                    if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                        return true;
                    }
                }
                current = current.parent;
            }
            // Check if the node is a reference to a memoized value
            const scope = context.getScope();
            // Make sure node is an Identifier before accessing name property
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return false;
            }
            const variable = scope.variables.find((v) => v.name === node.name);
            if (!variable) {
                return false;
            }
            // Check if any definition is a memoized value
            for (const def of variable.defs) {
                const parent = def.node.parent;
                if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    parent.init?.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    const callee = parent.init.callee;
                    if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                        return true;
                    }
                }
            }
            // Check if any reference is inside a memoized call
            for (const ref of variable.references) {
                let current = ref.identifier;
                while (current?.parent) {
                    if (current.parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        const callee = current.parent.callee;
                        if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                            (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                            return true;
                        }
                    }
                    current = current.parent;
                }
            }
            // Check if the node is a property of an object that is memoized
            const parent = node.parent;
            if (parent?.type === utils_1.AST_NODE_TYPES.Property &&
                parent.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                const objectExpression = parent.parent;
                let current = objectExpression;
                while (current?.parent) {
                    if (current.parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        const callee = current.parent.callee;
                        if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                            (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                            return true;
                        }
                    }
                    current = current.parent;
                }
            }
            return false;
        };
        const useRenderHitsSources = new Set([
            'useRenderHits',
            '@/hooks/algolia/useRenderHits',
        ]);
        const renderHitsSources = new Set([
            'renderHits',
            '@/hooks/algolia/renderHits',
        ]);
        let useRenderHitsName = 'useRenderHits';
        let renderHitsName = 'renderHits';
        return {
            ImportDeclaration(node) {
                const sourceValue = String(node.source.value);
                if (useRenderHitsSources.has(sourceValue)) {
                    for (const specifier of node.specifiers) {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.name === 'useRenderHits') {
                            useRenderHitsName = specifier.local.name;
                            break;
                        }
                    }
                }
                else if (renderHitsSources.has(sourceValue)) {
                    for (const specifier of node.specifiers) {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.name === 'renderHits') {
                            renderHitsName = specifier.local.name;
                            break;
                        }
                    }
                }
            },
            CallExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === useRenderHitsName) {
                    if (node.arguments.length === 0)
                        return;
                    const options = node.arguments[0];
                    if (options.type !== utils_1.AST_NODE_TYPES.ObjectExpression)
                        return;
                    // Variable to track if we need to check properties (check both by default)
                    const checkProps = {
                        transformBefore: true,
                        render: true,
                    };
                    // First pass: Check if transformBefore or render properties exist as shorthand
                    for (const prop of options.properties) {
                        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
                            continue;
                        if (prop.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                            continue;
                        // If it's shorthand property syntax like { transformBefore } and already a memoized variable
                        if (prop.key.name === 'transformBefore' &&
                            prop.shorthand &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                            checkProps.transformBefore = !isMemoizedVariable(prop.key);
                        }
                        else if (prop.key.name === 'render' &&
                            prop.shorthand &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                            checkProps.render = !isMemoizedVariable(prop.key);
                        }
                    }
                    // Second pass: Check non-shorthand properties
                    for (const prop of options.properties) {
                        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
                            continue;
                        if (prop.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                            continue;
                        // Skip shorthand properties that we already checked
                        if (prop.shorthand)
                            continue;
                        if (prop.key.name === 'transformBefore' &&
                            checkProps.transformBefore) {
                            // Skip if the value is already a memoized call
                            if (isMemoizedCall(prop.value))
                                continue;
                            if (!isInsideMemoizedCall(prop.value)) {
                                context.report({
                                    node: prop.value,
                                    messageId: 'requireMemoizedTransformBefore',
                                });
                            }
                        }
                        else if (prop.key.name === 'render' && checkProps.render) {
                            if (isReactComponent(prop.value)) {
                                context.report({
                                    node: prop.value,
                                    messageId: 'noDirectComponentInRender',
                                });
                            }
                            else if (!isInsideMemoizedCall(prop.value)) {
                                context.report({
                                    node: prop.value,
                                    messageId: 'requireMemoizedRender',
                                });
                            }
                        }
                    }
                }
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === renderHitsName) {
                    let current = node;
                    while (current?.parent) {
                        if (current.parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
                            const callee = current.parent.callee;
                            if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                (callee.name === 'useCallback' || callee.name === 'useMemo')) {
                                return;
                            }
                        }
                        current = current.parent;
                    }
                    context.report({
                        node,
                        messageId: 'requireMemoizedRenderHits',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-render-hits-memoization.js.map