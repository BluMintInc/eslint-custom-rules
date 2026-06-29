"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noCircularReferences = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
exports.noCircularReferences = (0, createRule_1.createRule)({
    name: 'no-circular-references',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow circular references in objects',
            recommended: 'error',
        },
        schema: [],
        messages: {
            circularReference: 'Reference "{{referenceText}}" makes this object point back to itself (directly or through other objects). Circular object graphs throw in `JSON.stringify()` and keep members reachable longer, which causes memory leaks and unexpected mutations. Store a copy or a serialize-safe identifier instead of the original object when assigning.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const objectMap = new WeakMap();
        function reportCircularReference(node, reference) {
            context.report({
                node,
                messageId: 'circularReference',
                data: {
                    referenceText: sourceCode.getText(reference),
                },
            });
        }
        function getUnwrappedObjectOrArray(node) {
            const current = ASTHelpers_1.ASTHelpers.unwrapTSAssertions(node);
            return current.type === utils_1.AST_NODE_TYPES.ObjectExpression ||
                current.type === utils_1.AST_NODE_TYPES.ArrayExpression
                ? current
                : null;
        }
        function isIdentifier(node) {
            return node.type === utils_1.AST_NODE_TYPES.Identifier;
        }
        function isFunction(node) {
            return (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration);
        }
        function isPrimitive(node) {
            // Unwrap TS assertions (e.g. `undefined as unknown`) before checking primitiveness.
            const unwrapped = ASTHelpers_1.ASTHelpers.unwrapTSAssertions(node);
            if (unwrapped.type === utils_1.AST_NODE_TYPES.Literal)
                return true;
            if (isIdentifier(unwrapped) &&
                (unwrapped.name === 'undefined' || unwrapped.name === 'null'))
                return true;
            return false;
        }
        function getVariable(node) {
            let scope = ASTHelpers_1.ASTHelpers.getScope(context, node);
            while (scope) {
                const variable = scope.variables.find((v) => v.name === node.name);
                if (variable)
                    return variable;
                scope = scope.upper;
            }
            return null;
        }
        function getReferencedObject(node, visitedVariables = new Set(), visitedNodes = new Set()) {
            const current = ASTHelpers_1.ASTHelpers.unwrapTSAssertions(node);
            if (visitedNodes.has(current))
                return null;
            visitedNodes.add(current);
            if (current.type === utils_1.AST_NODE_TYPES.ArrayExpression ||
                current.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                return current;
            }
            if (isIdentifier(current)) {
                const variable = getVariable(current);
                if (variable &&
                    !visitedVariables.has(variable) &&
                    variable.defs.length > 0) {
                    visitedVariables.add(variable);
                    const def = variable.defs[0];
                    if (def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        def.node.init) {
                        const result = getReferencedObject(def.node.init, visitedVariables, visitedNodes);
                        if (result)
                            return result;
                    }
                }
            }
            else if (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const object = current.object;
                const property = current.property;
                const referencedObj = getReferencedObject(object, visitedVariables, visitedNodes);
                if (referencedObj) {
                    const info = objectMap.get(referencedObj);
                    let propValue;
                    const key = !current.computed && isIdentifier(property)
                        ? property.name
                        : current.computed && property.type === utils_1.AST_NODE_TYPES.Literal
                            ? property.value
                            : null;
                    if (key !== null &&
                        (typeof key === 'string' || typeof key === 'number')) {
                        // 1. Check assigned properties first (overrides literal properties)
                        if (info) {
                            propValue = info.assignedProperties.get(key);
                        }
                        // 2. Check object literal properties
                        if (!propValue &&
                            referencedObj.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                            const prop = referencedObj.properties.find((p) => p.type === utils_1.AST_NODE_TYPES.Property &&
                                !p.computed &&
                                ((isIdentifier(p.key) && p.key.name === key) ||
                                    (p.key.type === utils_1.AST_NODE_TYPES.Literal &&
                                        p.key.value === key)));
                            if (prop)
                                propValue = prop.value;
                        }
                        // 3. Check array literal elements
                        if (!propValue &&
                            referencedObj.type === utils_1.AST_NODE_TYPES.ArrayExpression &&
                            typeof key === 'number') {
                            const element = referencedObj.elements[key];
                            if (element && element.type !== utils_1.AST_NODE_TYPES.SpreadElement) {
                                propValue = element;
                            }
                        }
                    }
                    if (propValue) {
                        const unwrappedValue = getUnwrappedObjectOrArray(propValue);
                        if (unwrappedValue)
                            return unwrappedValue;
                        if (isIdentifier(propValue) ||
                            propValue.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                            return getReferencedObject(propValue, visitedVariables, visitedNodes);
                        }
                        if (isFunction(propValue) || isPrimitive(propValue)) {
                            return null;
                        }
                    }
                }
            }
            return null;
        }
        function detectCircularReference(currentNode, visited = new Set(), depth = 0) {
            if (depth > 50)
                return false;
            if (visited.has(currentNode))
                return true;
            const objectInfo = objectMap.get(currentNode);
            if (!objectInfo)
                return false;
            visited.add(currentNode);
            for (const ref of objectInfo.references) {
                const referencedObj = getReferencedObject(ref);
                if (referencedObj &&
                    detectCircularReference(referencedObj, new Set(visited), depth + 1)) {
                    return true;
                }
            }
            return false;
        }
        function checkAndReportCircularReference(targetObj, reference) {
            const unwrapped = getUnwrappedObjectOrArray(targetObj);
            if (!unwrapped)
                return;
            const targetInfo = objectMap.get(unwrapped);
            if (targetInfo) {
                targetInfo.references.add(reference);
                if (detectCircularReference(unwrapped)) {
                    reportCircularReference(reference, reference);
                }
            }
        }
        return {
            ObjectExpression(node) {
                objectMap.set(node, {
                    references: new Set(),
                    assignedProperties: new Map(),
                });
            },
            ArrayExpression(node) {
                objectMap.set(node, {
                    references: new Set(),
                    assignedProperties: new Map(),
                });
            },
            'ArrayExpression > *'(node) {
                if (!node || node.type === utils_1.AST_NODE_TYPES.SpreadElement)
                    return;
                // Primitive values can never form circular references.
                if (isPrimitive(node))
                    return;
                const parentArray = node.parent;
                const referencedObj = getReferencedObject(node);
                if (referencedObj) {
                    checkAndReportCircularReference(parentArray, node);
                }
            },
            'ObjectExpression > Property'(node) {
                const parentObject = node.parent;
                const value = node.value;
                // Primitive values (undefined, null, literals) can never form circular
                // references, so skip them before any deeper resolution.
                if (isPrimitive(value))
                    return;
                const referencedObj = getReferencedObject(value);
                if (referencedObj) {
                    checkAndReportCircularReference(parentObject, value);
                }
            },
            AssignmentExpression(node) {
                const right = node.right;
                const left = node.left;
                if (left.type !== utils_1.AST_NODE_TYPES.MemberExpression)
                    return;
                const targetObj = getReferencedObject(left.object);
                if (!targetObj)
                    return;
                // Reassignments should override literal properties during resolution.
                const targetInfo = objectMap.get(targetObj);
                if (targetInfo) {
                    if (!left.computed && isIdentifier(left.property)) {
                        targetInfo.assignedProperties.set(left.property.name, right);
                    }
                    else if (left.computed &&
                        left.property.type === utils_1.AST_NODE_TYPES.Literal) {
                        const key = left.property.value;
                        if (typeof key === 'string' || typeof key === 'number') {
                            targetInfo.assignedProperties.set(key, right);
                        }
                    }
                }
                // Primitive values on the right-hand side can never create circular references.
                if (!isPrimitive(right)) {
                    const referencedObj = getReferencedObject(right);
                    if (referencedObj) {
                        checkAndReportCircularReference(targetObj, right);
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-circular-references.js.map