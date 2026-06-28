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
exports.noPassthroughGetters = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
const getMethodName_1 = require("../utils/getMethodName");
const ts = __importStar(require("typescript"));
const COMPLEX_EXPRESSION_TYPES = new Set([
    utils_1.AST_NODE_TYPES.CallExpression,
    utils_1.AST_NODE_TYPES.TemplateLiteral,
    utils_1.AST_NODE_TYPES.NewExpression,
    utils_1.AST_NODE_TYPES.BinaryExpression,
    utils_1.AST_NODE_TYPES.ArrayExpression,
    utils_1.AST_NODE_TYPES.ObjectExpression,
]);
exports.noPassthroughGetters = (0, createRule_1.createRule)({
    create(context) {
        const sourceCode = context.sourceCode;
        return {
            // Target getter methods in classes
            MethodDefinition(node) {
                // Only check getter methods
                if (node.kind !== 'get') {
                    return;
                }
                // Skip if the getter has decorators (like @Memoize)
                if (node.decorators && node.decorators.length > 0) {
                    return;
                }
                // Check if this getter satisfies an interface or overrides a base class member
                if (isRequiredByInterfaceOrBaseClass(node, sourceCode)) {
                    return;
                }
                const methodBody = node.value.body;
                if (!methodBody) {
                    return;
                }
                // Check if the getter body is a simple return statement
                if (methodBody.body.length === 1 &&
                    methodBody.body[0].type === 'ReturnStatement') {
                    const returnStatement = methodBody
                        .body[0];
                    // Skip if there's no return argument
                    if (!returnStatement.argument) {
                        return;
                    }
                    // Skip if the return statement uses super
                    if (containsSuper(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes type assertions or casting
                    if (hasTypeAssertion(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes null/undefined handling
                    if (hasNullUndefinedHandling(returnStatement.argument)) {
                        return;
                    }
                    // Skip if the return statement includes computed property access or function calls
                    if (hasComputedPropertyOrFunctionCall(returnStatement.argument)) {
                        return;
                    }
                    // Check if the return statement is accessing a property from a constructor parameter
                    if (isConstructorParameterPropertyAccess(returnStatement.argument)) {
                        const getterName = (0, getMethodName_1.getMethodName)(node, sourceCode, {
                            computedFallbackToText: false,
                        }) || 'getter';
                        const propertyPath = getMemberPath(returnStatement.argument) ??
                            'nested property on a constructor-injected object';
                        context.report({
                            node,
                            messageId: 'noPassthroughGetter',
                            data: {
                                getterName,
                                propertyPath,
                            },
                        });
                    }
                }
            },
        };
        /**
         * Check if the getter is required by an implemented interface or overrides a base class member
         */
        function isRequiredByInterfaceOrBaseClass(node, sourceCode) {
            const parserServices = sourceCode.parserServices;
            if (!parserServices ||
                !parserServices.program ||
                !parserServices.esTreeNodeToTSNodeMap) {
                return false;
            }
            const checker = parserServices.program.getTypeChecker();
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
            if (!tsNode) {
                return false;
            }
            const symbol = checker.getSymbolAtLocation(tsNode.name);
            if (!symbol ||
                !tsNode.parent ||
                !(ts.isClassDeclaration(tsNode.parent) ||
                    ts.isClassExpression(tsNode.parent))) {
                return false;
            }
            const classNode = tsNode.parent;
            const classType = checker.getTypeAtLocation(classNode);
            const classSymbol = classType.getSymbol();
            if (!classSymbol) {
                return false;
            }
            const instanceType = checker.getDeclaredTypeOfSymbol(classSymbol);
            const name = symbol.getName();
            // Check base classes
            const baseTypes = instanceType.getBaseTypes() || [];
            for (const baseType of baseTypes) {
                if (baseType.getProperty(name)) {
                    return true;
                }
            }
            // Check interfaces
            if (classNode.heritageClauses) {
                for (const clause of classNode.heritageClauses) {
                    // Only check implemented interfaces as base classes are already checked via getBaseTypes()
                    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) {
                        continue;
                    }
                    for (const typeNode of clause.types) {
                        const type = checker.getTypeAtLocation(typeNode);
                        if (type.getProperty(name)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        /**
         * Check if the node is a simple property access from a constructor parameter
         * like this.settings.property or this.settings['property'] or this.settings.nested.deep.property
         */
        function isConstructorParameterPropertyAccess(node) {
            // Check for member expressions like this.settings.property
            if (node.type === 'MemberExpression') {
                return isConstructorParameterAccess(node);
            }
            return false;
        }
        /**
         * Check if the node is accessing a property from a constructor parameter
         * Patterns to match: this.constructorParam.property, this.constructorParam['property'], this.constructorParam.nested.deep.property
         * Patterns to NOT match: this.property, SomeClass.property, this.methodCall()
         */
        function isConstructorParameterAccess(node) {
            let current = node.object;
            let depth = 0;
            // Walk up member expressions until we reach a base
            while (current && current.type === 'MemberExpression') {
                depth += 1;
                current = current.object;
            }
            // Require at least one nesting and a base of `this`
            return depth >= 1 && current?.type === 'ThisExpression';
        }
        /**
         * Check if the node contains a reference to super
         */
        function containsSuper(node) {
            let current = node;
            while (current && current.type === 'MemberExpression') {
                if (current.object.type === 'Super') {
                    return true;
                }
                current = current.object;
            }
            return false;
        }
        function getMemberPath(node) {
            if (node.type === 'ThisExpression') {
                return 'this';
            }
            if (node.type === 'Identifier') {
                return node.name;
            }
            if (node.type !== 'MemberExpression') {
                return null;
            }
            const objectPath = getMemberPath(node.object);
            if (!objectPath) {
                return null;
            }
            if (node.computed && node.property.type === 'Literal') {
                const literalValue = typeof node.property.value === 'string'
                    ? JSON.stringify(node.property.value)
                    : String(node.property.value);
                return `${objectPath}[${literalValue}]`;
            }
            if (node.property.type === 'Identifier') {
                return `${objectPath}.${node.property.name}`;
            }
            return null;
        }
        /**
         * Check if the node has a type assertion or casting
         */
        function hasTypeAssertion(node) {
            if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
                return true;
            }
            if (node.type === 'MemberExpression') {
                return hasTypeAssertion(node.object);
            }
            return false;
        }
        /**
         * Check if the node handles null/undefined values
         */
        function hasNullUndefinedHandling(node) {
            // Check for logical expressions like this.settings.property || []
            if (node.type === 'LogicalExpression') {
                return true;
            }
            // Check for conditional expressions like this.settings.property ? this.settings.property : []
            if (node.type === 'ConditionalExpression') {
                return true;
            }
            // Check for optional chaining like this.settings?.property
            if (node.type === 'MemberExpression' && node.optional) {
                return true;
            }
            // The nullish coalescing check is already covered by the LogicalExpression check above
            return false;
        }
        /**
         * Check if the node includes computed property access or function calls
         */
        function hasComputedPropertyOrFunctionCall(node) {
            if (COMPLEX_EXPRESSION_TYPES.has(node.type)) {
                return true;
            }
            // Check for member expressions with computed properties like this.settings[key]
            if (node.type === 'MemberExpression') {
                // If the property is computed with a dynamic expression (not a literal), it's not a simple property access
                if (node.computed && node.property.type !== 'Literal') {
                    return true;
                }
                // Recursively check the object part
                return hasComputedPropertyOrFunctionCall(node.object);
            }
            return false;
        }
    },
    name: 'no-passthrough-getters',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Avoid getter methods that only re-expose nested properties on constructor-injected objects without adding behavior',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noPassthroughGetter: 'Getter "{{getterName}}" only forwards nested property "{{propertyPath}}" from an object provided via the constructor. This indirection hides the real source of state and expands the class API without adding behavior. Read the constructor-injected object directly or add logic that justifies a getter (validation, memoization, fallback).',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-passthrough-getters.js.map