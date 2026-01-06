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
exports.noInlineComponentProp = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
const createRule_1 = require("../utils/createRule");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const DEFAULT_PROP_PATTERNS = ['CatalogWrapper', '*Wrapper', '*Component'];
const DEFAULT_OPTIONS = {
    props: DEFAULT_PROP_PATTERNS,
    allowRenderProps: true,
    allowModuleScopeFactories: true,
};
const INLINE_COMPONENT_NAME = 'inline component';
function isPascalCase(name) {
    return /^[A-Z][A-Za-z0-9]*$/.test(name);
}
function matchesPattern(name, pattern) {
    if (pattern === '*')
        return true;
    if (pattern.includes('*')) {
        const wildcardCount = (pattern.match(/\*/g) || []).length;
        if (wildcardCount > 2) {
            return false;
        }
        const escaped = pattern
            .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
            .replace(/\*/g, '.*');
        return new RegExp(`^${escaped}$`).test(name);
    }
    return name === pattern;
}
function isRenderPropName(name) {
    if (name === 'children' || name === 'child' || name === 'render') {
        return true;
    }
    if (name.startsWith('render')) {
        return true;
    }
    return (name === 'rowRenderer' ||
        name === 'cellRenderer' ||
        name === 'itemRenderer' ||
        name === 'renderItem' ||
        name === 'renderRow');
}
function unwrapExpression(expr) {
    let current = expr;
    while (current) {
        if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression) {
            current = current.expression;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.ChainExpression) {
            current = current.expression;
            continue;
        }
        break;
    }
    return current ?? null;
}
function isReactCreateElementCall(expr) {
    if (expr.type !== utils_1.AST_NODE_TYPES.CallExpression)
        return false;
    const callee = expr.callee;
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        callee.name === 'createElement') {
        return true;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        callee.property.name === 'createElement') {
        if (callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
            callee.object.name === 'React') {
            return true;
        }
    }
    return false;
}
function returnsCreateElement(node) {
    if (node.type === utils_1.AST_NODE_TYPES.CallExpression &&
        isReactCreateElementCall(node)) {
        return true;
    }
    if (node.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        for (const statement of node.body) {
            if (statement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
                statement.argument &&
                statement.argument.type === utils_1.AST_NODE_TYPES.CallExpression &&
                isReactCreateElementCall(statement.argument)) {
                return true;
            }
        }
    }
    return false;
}
function isFunctionNode(node) {
    if (!node)
        return false;
    return (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration);
}
function getCalleeName(callee) {
    const unwrapped = unwrapExpression(callee);
    if (!unwrapped)
        return null;
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
        return unwrapped.name;
    }
    if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !unwrapped.computed &&
        unwrapped.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        const prop = unwrapped.property.name;
        if (unwrapped.object.type === utils_1.AST_NODE_TYPES.Identifier &&
            unwrapped.object.name) {
            return `${unwrapped.object.name}.${prop}`;
        }
        return prop;
    }
    return null;
}
function getFunctionFromCall(call) {
    const calleeName = getCalleeName(call.callee);
    const firstArg = unwrapExpression(call.arguments[0] ?? null);
    if (!firstArg || !isFunctionNode(firstArg)) {
        return undefined;
    }
    if (calleeName === 'useCallback' ||
        calleeName === 'React.useCallback' ||
        calleeName === 'useMemo' ||
        calleeName === 'React.useMemo' ||
        calleeName === 'memo' ||
        calleeName === 'React.memo' ||
        calleeName === 'forwardRef' ||
        calleeName === 'React.forwardRef') {
        return firstArg;
    }
    return undefined;
}
function getFunctionFromInit(init) {
    const unwrapped = unwrapExpression(init);
    if (!unwrapped)
        return undefined;
    if (isFunctionNode(unwrapped)) {
        return unwrapped;
    }
    if (unwrapped.type === utils_1.AST_NODE_TYPES.CallExpression) {
        return getFunctionFromCall(unwrapped);
    }
    return undefined;
}
function isInModuleScope(node) {
    let current = node.parent;
    while (current) {
        if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
            return false;
        }
        if (current.type === utils_1.AST_NODE_TYPES.Program) {
            return true;
        }
        current = current.parent;
    }
    return true;
}
function isComponentLikeFunction(fn, displayName) {
    const body = fn.body;
    const hasJSX = !!body && ASTHelpers_1.ASTHelpers.returnsJSX(body);
    const expressionBody = fn.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        fn.body.type !== utils_1.AST_NODE_TYPES.BlockStatement
        ? fn.body
        : null;
    const hasCreateElement = (expressionBody && isReactCreateElementCall(expressionBody)) ||
        (body ? returnsCreateElement(body) : false);
    const looksLikeComponent = displayName ? isPascalCase(displayName) : false;
    return hasJSX || hasCreateElement || looksLikeComponent;
}
function findVariableInScopes(context, identifier) {
    const sourceCode = context.sourceCode;
    let scope = sourceCode.getScope?.(identifier) ?? context.getScope();
    while (scope) {
        const variable = scope.variables.find((v) => v.name === identifier.name);
        if (variable)
            return variable;
        scope = scope.upper;
    }
    return undefined;
}
function findObjectPropertyFunction(objExpr, propertyName) {
    for (const prop of objExpr.properties) {
        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
            continue;
        if (prop.computed)
            continue;
        if (prop.key.type === utils_1.AST_NODE_TYPES.Identifier) {
            if (prop.key.name !== propertyName)
                continue;
        }
        else if (prop.key.type === utils_1.AST_NODE_TYPES.Literal &&
            prop.key.value === propertyName) {
            // match
        }
        else {
            continue;
        }
        const value = unwrapExpression(prop.value);
        if (value && isFunctionNode(value)) {
            return value;
        }
    }
    return undefined;
}
exports.noInlineComponentProp = (0, createRule_1.createRule)({
    name: 'no-inline-component-prop',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prevent inline function components defined in render from being passed to component-type props like CatalogWrapper to avoid remounts and UI flashes.',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [
            {
                type: 'object',
                properties: {
                    props: {
                        type: 'array',
                        items: { type: 'string' },
                        default: DEFAULT_PROP_PATTERNS,
                    },
                    allowRenderProps: {
                        type: 'boolean',
                        default: true,
                    },
                    allowModuleScopeFactories: {
                        type: 'boolean',
                        default: true,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            inlineComponentProp: 'Inline component "{{componentName}}" is created inside a render scope and passed to component-type prop "{{propName}}". React treats it as a new component whenever the scope re-runs, remounting its subtree and causing UI flashes. Move the wrapper to module scope (optionally memoize with React.memo) and pass changing data via props or context instead.',
        },
    },
    defaultOptions: [DEFAULT_OPTIONS],
    create(context, [options]) {
        const resolvedOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
        const propPatterns = resolvedOptions.props ?? DEFAULT_PROP_PATTERNS;
        const parserServices = context.parserServices;
        const checker = parserServices?.program?.getTypeChecker();
        const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;
        function isComponentTypeByTypeInfo(attribute) {
            if (!checker || !esTreeNodeToTSNodeMap)
                return false;
            const tsNode = esTreeNodeToTSNodeMap.get(attribute);
            if (!tsNode)
                return false;
            let type;
            if (ts.isExpression(tsNode)) {
                type =
                    checker.getContextualType(tsNode) ??
                        checker.getTypeAtLocation(tsNode);
            }
            else {
                type = checker.getTypeAtLocation(tsNode);
            }
            if (!type)
                return false;
            const typeText = checker.typeToString(type);
            return (typeText.includes('ComponentType') ||
                typeText.includes('FunctionComponent') ||
                typeText.includes('ReactElement') ||
                typeText.includes('FC'));
        }
        function isTargetProp(attribute, name) {
            if (resolvedOptions.allowRenderProps && isRenderPropName(name)) {
                return false;
            }
            const patternMatch = propPatterns.some((pattern) => matchesPattern(name, pattern));
            const looksComponent = isPascalCase(name) ||
                name.endsWith('Wrapper') ||
                name.endsWith('Component');
            if (patternMatch) {
                return true;
            }
            if (looksComponent) {
                return isComponentTypeByTypeInfo(attribute);
            }
            return false;
        }
        function shouldReportDefinition(definition, displayName) {
            if (definition.type === 'ImportBinding' ||
                definition.type === 'Parameter' ||
                definition.type === 'Type') {
                return false;
            }
            const defNode = definition.node;
            const moduleScoped = isInModuleScope(defNode);
            if (moduleScoped && resolvedOptions.allowModuleScopeFactories) {
                return false;
            }
            let fnNode;
            if (defNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                fnNode = defNode;
            }
            else if (defNode.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                fnNode = getFunctionFromInit(defNode.init);
            }
            else {
                return false;
            }
            if (!fnNode)
                return false;
            return isComponentLikeFunction(fnNode, displayName);
        }
        function report(node, propName, componentName) {
            context.report({
                node,
                messageId: 'inlineComponentProp',
                data: { propName, componentName },
            });
        }
        function handleIdentifierExpression(identifier, propName) {
            const variable = findVariableInScopes(context, identifier);
            if (!variable)
                return;
            const definition = variable.defs.find((def) => (def.node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator) &&
                def.type !== 'Parameter' &&
                def.type !== 'ImportBinding');
            if (!definition)
                return;
            if (shouldReportDefinition(definition, identifier.name)) {
                report(identifier, propName, identifier.name);
            }
        }
        function handleMemberExpression(member, propName) {
            if (member.computed)
                return;
            if (member.property.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const objectId = member.object;
            if (objectId.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            const variable = findVariableInScopes(context, objectId);
            if (!variable)
                return;
            const definition = variable.defs.find((def) => def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                def.node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                def.node.id.name === objectId.name &&
                def.type !== 'ImportBinding' &&
                def.type !== 'Parameter' &&
                def.type !== 'Type');
            if (!definition)
                return;
            const defNode = definition.node;
            if (!defNode ||
                defNode.type !== utils_1.AST_NODE_TYPES.VariableDeclarator ||
                !defNode.init ||
                defNode.init.type !== utils_1.AST_NODE_TYPES.ObjectExpression) {
                return;
            }
            if (isInModuleScope(defNode) &&
                resolvedOptions.allowModuleScopeFactories) {
                return;
            }
            const fnNode = findObjectPropertyFunction(defNode.init, member.property.name);
            if (fnNode && isComponentLikeFunction(fnNode, member.property.name)) {
                report(member, propName, member.property.name);
            }
        }
        function handleInlineFunctionExpression(fn, propName) {
            const explicitName = fn.type === utils_1.AST_NODE_TYPES.FunctionExpression ? fn.id?.name : undefined;
            if (!isComponentLikeFunction(fn, explicitName)) {
                return;
            }
            const displayName = (fn.type === utils_1.AST_NODE_TYPES.FunctionExpression && fn.id?.name) ||
                INLINE_COMPONENT_NAME;
            report(fn, propName, displayName);
        }
        function handleCallExpression(call, propName) {
            const fnNode = getFunctionFromCall(call);
            if (!fnNode)
                return;
            if (isComponentLikeFunction(fnNode)) {
                report(call, propName, INLINE_COMPONENT_NAME);
            }
        }
        return {
            JSXAttribute(node) {
                if (!node.name || node.name.type !== utils_1.AST_NODE_TYPES.JSXIdentifier) {
                    return;
                }
                const propName = node.name.name;
                if (!isTargetProp(node, propName))
                    return;
                if (!node.value ||
                    node.value.type !== utils_1.AST_NODE_TYPES.JSXExpressionContainer) {
                    return;
                }
                if (node.value.expression.type === utils_1.AST_NODE_TYPES.JSXEmptyExpression) {
                    return;
                }
                const expression = unwrapExpression(node.value.expression);
                if (!expression)
                    return;
                if (expression.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    expression.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    handleInlineFunctionExpression(expression, propName);
                    return;
                }
                if (expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    handleCallExpression(expression, propName);
                    return;
                }
                if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
                    handleIdentifierExpression(expression, propName);
                    return;
                }
                if (expression.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    handleMemberExpression(expression, propName);
                }
            },
        };
    },
});
//# sourceMappingURL=no-inline-component-prop.js.map