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
exports.noObjectValuesOnStrings = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
exports.noObjectValuesOnStrings = (0, createRule_1.createRule)({
    create(context) {
        const sourceCode = context.getSourceCode();
        const parserServices = sourceCode.parserServices;
        // If TypeScript parser services are not available, return an empty object
        if (!parserServices ||
            !parserServices.program ||
            !parserServices.esTreeNodeToTSNodeMap) {
            return {};
        }
        const checker = parserServices.program.getTypeChecker();
        /**
         * Checks if a type is or contains a string type
         */
        function isOrContainsStringType(type) {
            // Check if it's a string type
            if (type.flags & ts.TypeFlags.String ||
                type.flags & ts.TypeFlags.StringLiteral) {
                return true;
            }
            // Check if it's a union type that contains string
            if (type.isUnion()) {
                return type.types.some((t) => isOrContainsStringType(t));
            }
            // Check if it's an intersection type that contains string
            if (type.isIntersection()) {
                return type.types.some((t) => isOrContainsStringType(t));
            }
            return false;
        }
        /**
         * Checks if a node is a call to Object.values()
         */
        function isObjectValuesCall(node) {
            return (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.object.name === 'Object' &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === 'values' &&
                node.arguments.length > 0);
        }
        /**
         * Checks if a node is a string literal or template literal
         */
        function isStringLiteral(node) {
            return ((node.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.value === 'string') ||
                node.type === utils_1.AST_NODE_TYPES.TemplateLiteral);
        }
        /**
         * Checks if a node is likely to produce a string value based on AST patterns
         */
        function isLikelyStringExpression(node) {
            // Check for string concatenation
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression &&
                node.operator === '+' &&
                (isStringLiteral(node.left) || isStringLiteral(node.right))) {
                return true;
            }
            // Check for method calls on strings like .toUpperCase(), .toLowerCase(), etc.
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                (isStringLiteral(node.callee.object) ||
                    (node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        [
                            'toString',
                            'toUpperCase',
                            'toLowerCase',
                            'trim',
                            'substring',
                            'slice',
                            'charAt',
                            'concat',
                            'replace',
                            'replaceAll',
                            'padStart',
                            'padEnd',
                        ].includes(node.callee.property.name)))) {
                return true;
            }
            // Check for common string-producing functions
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                ['join', 'toString'].includes(node.callee.property.name)) {
                return true;
            }
            // Check for JSON.stringify
            if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.object.name === 'JSON' &&
                node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.callee.property.name === 'stringify') {
                return true;
            }
            return false;
        }
        /**
         * Checks if a type could be a string by examining its properties and structure
         */
        function couldBeString(type) {
            // Check if it's a string type directly
            if (isOrContainsStringType(type)) {
                return true;
            }
            // Check if it's a type parameter that could be a string
            if (type.flags & ts.TypeFlags.TypeParameter) {
                // Type parameters without constraints could be anything, including strings
                const constraint = type.getConstraint?.();
                if (!constraint) {
                    return true;
                }
                // Check if the constraint allows string
                return couldBeString(constraint);
            }
            return false;
        }
        /**
         * Checks if a function declaration has a string parameter
         */
        function hasFunctionStringParameter(node) {
            for (const param of node.params) {
                // Handle simple identifier parameters
                if (param.type === utils_1.AST_NODE_TYPES.Identifier) {
                    try {
                        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(param);
                        const type = checker.getTypeAtLocation(tsNode);
                        if (couldBeString(type)) {
                            return true;
                        }
                    }
                    catch (error) {
                        // Ignore errors in type checking
                    }
                }
                // Handle object pattern parameters
                if (param.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    for (const property of param.properties) {
                        if (property.type === utils_1.AST_NODE_TYPES.Property &&
                            property.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                            try {
                                const tsNode = parserServices.esTreeNodeToTSNodeMap.get(property.value);
                                const type = checker.getTypeAtLocation(tsNode);
                                if (couldBeString(type)) {
                                    return true;
                                }
                            }
                            catch (error) {
                                // Ignore errors in type checking
                            }
                        }
                    }
                }
            }
            return false;
        }
        return {
            // Handle Object.values() calls
            CallExpression(node) {
                // Check if the call is Object.values()
                if (isObjectValuesCall(node)) {
                    const argument = node.arguments[0];
                    // Quick check for string literals and template literals
                    if (isStringLiteral(argument)) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                        });
                        return;
                    }
                    // Check for expressions that are likely to produce strings
                    if (isLikelyStringExpression(argument)) {
                        context.report({
                            node,
                            messageId: 'unexpected',
                        });
                        return;
                    }
                    try {
                        // Use TypeScript's type checker to determine if the argument could be a string
                        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(argument);
                        const type = checker.getTypeAtLocation(tsNode);
                        // Special handling for function calls
                        if (argument.type === utils_1.AST_NODE_TYPES.CallExpression) {
                            const signature = checker.getResolvedSignature(parserServices.esTreeNodeToTSNodeMap.get(argument));
                            if (signature) {
                                const returnType = checker.getReturnTypeOfSignature(signature);
                                if (couldBeString(returnType)) {
                                    context.report({
                                        node,
                                        messageId: 'unexpected',
                                    });
                                    return;
                                }
                            }
                        }
                        // Special handling for conditional expressions
                        if (argument.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                            const consequentType = checker.getTypeAtLocation(parserServices.esTreeNodeToTSNodeMap.get(argument.consequent));
                            const alternateType = checker.getTypeAtLocation(parserServices.esTreeNodeToTSNodeMap.get(argument.alternate));
                            if (couldBeString(consequentType) ||
                                couldBeString(alternateType)) {
                                context.report({
                                    node,
                                    messageId: 'unexpected',
                                });
                                return;
                            }
                        }
                        // Check if the type is or contains string
                        if (couldBeString(type)) {
                            context.report({
                                node,
                                messageId: 'unexpected',
                            });
                            return;
                        }
                    }
                    catch (error) {
                        // If there's an error in type checking, fall back to AST-based checks
                        // This is a safety measure to prevent the rule from crashing
                    }
                }
            },
            // Handle function declarations that use Object.values on parameters
            'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
                // Find all Object.values calls in the function body
                const objectValuesCalls = [];
                // For function declarations and expressions
                if (node.body && node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    sourceCode.ast.body.forEach(function findObjectValuesCalls(statement) {
                        if (statement.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
                            statement.expression.type === utils_1.AST_NODE_TYPES.CallExpression &&
                            isObjectValuesCall(statement.expression)) {
                            objectValuesCalls.push(statement.expression);
                        }
                    });
                }
                // For arrow functions with expression bodies
                else if (node.body &&
                    node.body.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    isObjectValuesCall(node.body)) {
                    objectValuesCalls.push(node.body);
                }
                // If we found Object.values calls and the function has string parameters, report errors
                if (objectValuesCalls.length > 0 && hasFunctionStringParameter(node)) {
                    for (const call of objectValuesCalls) {
                        // Check if the argument is a parameter
                        const argument = call.arguments[0];
                        if (argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                            // Check if this identifier is one of the function parameters
                            const paramNames = node.params
                                .filter((p) => p.type === utils_1.AST_NODE_TYPES.Identifier)
                                .map((p) => p.name);
                            if (paramNames.includes(argument.name)) {
                                context.report({
                                    node: call,
                                    messageId: 'unexpected',
                                });
                            }
                        }
                    }
                }
            },
        };
    },
    name: 'no-object-values-on-strings',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow Object.values() on strings as it treats strings as arrays of characters, which is likely unintended behavior.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Object.values() should not be used on strings. It treats strings as arrays of characters, which is likely unintended. Use Object.values() only on objects.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-object-values-on-strings.js.map