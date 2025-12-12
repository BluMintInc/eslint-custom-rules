"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noSeparateLoadingState = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const LOADING_PATTERNS = [
    /^is.*Loading$/i,
    /^isLoading.+/i, // isLoadingX pattern
];
exports.noSeparateLoadingState = (0, createRule_1.createRule)({
    name: 'no-separate-loading-state',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow separate loading state variables that track the loading status of other state',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [
            {
                type: 'object',
                properties: {
                    patterns: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            separateLoadingState: 'Avoid separate loading state. Encode loading status directly in the primary state using a sentinel value like "loading".',
        },
    },
    defaultOptions: [{}],
    create(context, [options]) {
        const effectivePatterns = options?.patterns?.map((p) => new RegExp(p, 'i')) ?? LOADING_PATTERNS;
        const setterTrackers = [];
        function isLoadingPattern(name) {
            return effectivePatterns.some((pattern) => pattern.test(name));
        }
        function isUseStateCall(node) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.name === 'useState') {
                return true;
            }
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === 'useState') {
                return true;
            }
            return false;
        }
        function isTruthyValue(node) {
            if (node.type === utils_1.AST_NODE_TYPES.Literal) {
                return Boolean(node.value);
            }
            return false;
        }
        function isFalsyValue(node) {
            if (node.type === utils_1.AST_NODE_TYPES.Literal) {
                return !node.value;
            }
            return false;
        }
        function getSetterName(declarator) {
            if (declarator.id.type === utils_1.AST_NODE_TYPES.ArrayPattern &&
                declarator.id.elements.length >= 2) {
                const setterElement = declarator.id.elements[1];
                if (setterElement?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return setterElement.name;
                }
            }
            return null;
        }
        return {
            VariableDeclarator(node) {
                // Check for useState destructuring patterns
                if (node.id.type === utils_1.AST_NODE_TYPES.ArrayPattern &&
                    node.init?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    isUseStateCall(node.init)) {
                    const arrayPattern = node.id;
                    // Check if we have at least 2 elements (state and setter)
                    if (arrayPattern.elements.length >= 2) {
                        const stateElement = arrayPattern.elements[0];
                        const setterElement = arrayPattern.elements[1];
                        if (stateElement?.type === utils_1.AST_NODE_TYPES.Identifier &&
                            setterElement?.type === utils_1.AST_NODE_TYPES.Identifier &&
                            isLoadingPattern(stateElement.name)) {
                            const declared = context.getDeclaredVariables(node);
                            const setterVar = declared.find((v) => v.name === setterElement.name) ?? null;
                            if (!setterVar)
                                return;
                            setterTrackers.push({
                                declarator: node,
                                setterVar,
                                usage: { truthy: false, falsy: false },
                            });
                        }
                    }
                }
            },
            CallExpression(_node) {
                // Setter usage is resolved via scope references in Program:exit
                return;
            },
            'Program:exit'() {
                // Analyze collected data to determine violations
                for (const tracker of setterTrackers) {
                    // Walk references of the exact setter variable to classify usages
                    for (const ref of tracker.setterVar.references) {
                        const parent = ref.identifier.parent;
                        if (parent &&
                            parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
                            parent.callee === ref.identifier &&
                            parent.arguments.length > 0) {
                            const argument = parent.arguments[0];
                            if (isTruthyValue(argument)) {
                                tracker.usage.truthy = true;
                            }
                            else if (isFalsyValue(argument)) {
                                tracker.usage.falsy = true;
                            }
                        }
                    }
                    const { declarator, usage } = tracker;
                    const setterName = getSetterName(declarator);
                    if (!setterName)
                        continue;
                    // If we have both truthy and falsy setter calls, it's likely a loading state pattern
                    if (usage.truthy && usage.falsy) {
                        context.report({
                            node: declarator,
                            messageId: 'separateLoadingState',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-separate-loading-state.js.map