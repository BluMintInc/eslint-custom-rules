"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noEmptyDependencyUseCallbacks = void 0;
const utils_1 = require("@typescript-eslint/utils");
const minimatch_1 = require("minimatch");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
const DEFAULT_TEST_PATTERNS = ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'];
const PREFER_UTILITY_FUNCTION_MESSAGE = [
    'What\'s wrong: "{{name}}" uses useCallback([]) but never reads component/hook state',
    'Why it matters: empty-deps callbacks are already stable, so hook bookkeeping adds overhead without benefit',
    'How to fix: move "{{name}}" to a module-level utility (or add an eslint-disable with a short justification if you intentionally keep it for memoized children).',
].join(' -> ');
const PREFER_UTILITY_LATEST_MESSAGE = [
    'What\'s wrong: useLatestCallback wraps "{{name}}" even though it never reads component/hook state',
    'Why it matters: the hook wrapper adds indirection without preventing stale closures',
    'How to fix: extract "{{name}}" to a module-level utility (or disable with a brief note if you rely on HMR or a stale-closure pattern).',
].join(' -> ');
function isHookCallee(callee, hookName) {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === hookName;
    }
    return (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        callee.property.name === hookName);
}
function isUseCallbackCallee(callee) {
    return isHookCallee(callee, 'useCallback');
}
function isUseLatestCallbackCallee(callee) {
    return isHookCallee(callee, 'useLatestCallback');
}
function isFunctionExpression(node) {
    return (!!node &&
        (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            node.type === utils_1.AST_NODE_TYPES.FunctionExpression));
}
function isPropertyKey(parent, identifier) {
    if (!parent)
        return false;
    if (parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        parent.property === identifier &&
        !parent.computed) {
        return true;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.Property &&
        parent.key === identifier &&
        !parent.computed &&
        !parent.shorthand) {
        return true;
    }
    return false;
}
function collectNearestBlockTypeBindings(node) {
    const localTypes = new Set();
    let current = node.parent ?? undefined;
    const addTypeParameters = (maybeNode) => {
        if (!maybeNode)
            return;
        const typeParameters = maybeNode.typeParameters;
        if (typeParameters &&
            typeParameters.type === utils_1.AST_NODE_TYPES.TSTypeParameterDeclaration) {
            for (const param of typeParameters.params) {
                const name = typeof param.name === 'string' ? param.name : param.name.name;
                localTypes.add(name);
            }
        }
    };
    while (current) {
        addTypeParameters(current);
        if (current.type === utils_1.AST_NODE_TYPES.BlockStatement) {
            for (const statement of current.body) {
                if (statement.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration ||
                    statement.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration ||
                    statement.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
                    statement.type === utils_1.AST_NODE_TYPES.TSEnumDeclaration) {
                    localTypes.add(statement.id.name);
                    continue;
                }
                if (statement.type === utils_1.AST_NODE_TYPES.TSModuleDeclaration &&
                    (statement.id.type === utils_1.AST_NODE_TYPES.Identifier ||
                        statement.id.type === utils_1.AST_NODE_TYPES.Literal)) {
                    const name = statement.id.type === utils_1.AST_NODE_TYPES.Identifier
                        ? statement.id.name
                        : String(statement.id.value);
                    localTypes.add(name);
                }
            }
        }
        if (current.type === utils_1.AST_NODE_TYPES.Program) {
            break;
        }
        current = current.parent ?? undefined;
    }
    return localTypes;
}
function usesLocalTypeBindings(typeRoots, localTypes, sourceCode) {
    if (!typeRoots.length || localTypes.size === 0) {
        return false;
    }
    const visitorKeys = sourceCode.visitorKeys;
    const stack = [...typeRoots];
    while (stack.length) {
        const current = stack.pop();
        if (current.type === utils_1.AST_NODE_TYPES.Identifier &&
            localTypes.has(current.name)) {
            return true;
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
            let left = current.left;
            while (left.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
                left = left.left;
            }
            if (left.type === utils_1.AST_NODE_TYPES.Identifier &&
                localTypes.has(left.name)) {
                return true;
            }
            // Qualified names (e.g. External.LocalType) are scoped by their leftmost
            // namespace. Traversing into the right side can falsely match an
            // unrelated local type with the same name.
            continue;
        }
        const keys = visitorKeys[current.type];
        if (!keys)
            continue;
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const element of value) {
                    if (element && typeof element.type === 'string') {
                        stack.push(element);
                    }
                }
            }
            else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
    return false;
}
function collectBodyTypeAnnotations(node, sourceCode) {
    const typeNodes = [];
    const visitorKeys = sourceCode.visitorKeys;
    const stack = [node];
    while (stack.length) {
        const current = stack.pop();
        if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression) {
            typeNodes.push(current.typeAnnotation);
        }
        else if (current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion) {
            typeNodes.push(current.typeAnnotation);
        }
        const typeAnnotation = current
            .typeAnnotation;
        if (typeAnnotation) {
            if (typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
                typeNodes.push(typeAnnotation.typeAnnotation);
            }
            else {
                typeNodes.push(typeAnnotation);
            }
        }
        const typeParameters = current.typeParameters;
        if (typeParameters) {
            typeNodes.push(typeParameters);
        }
        const returnType = current.returnType;
        if (returnType) {
            typeNodes.push(returnType);
        }
        const keys = visitorKeys[current.type];
        if (!keys)
            continue;
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const element of value) {
                    if (element && typeof element.type === 'string') {
                        stack.push(element);
                    }
                }
            }
            else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
    return typeNodes;
}
function findHoistTarget(node) {
    let current = node;
    while (current?.parent) {
        if (current.parent.type === utils_1.AST_NODE_TYPES.Program) {
            return current;
        }
        if (current.parent.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration ||
            current.parent.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration) {
            return current.parent;
        }
        current = current.parent;
    }
    return null;
}
function getCallbackArg(node) {
    const [maybeFn] = node.arguments;
    if (isFunctionExpression(maybeFn)) {
        return maybeFn;
    }
    return null;
}
function hasEmptyDependencyArray(node) {
    if (node.arguments.length < 2)
        return false;
    const deps = node.arguments[1];
    return (deps.type === utils_1.AST_NODE_TYPES.ArrayExpression && deps.elements.length === 0);
}
function filenameMatchesPatterns(filename, patterns) {
    const normalized = filename.replace(/\\/g, '/');
    const basename = normalized.split('/').pop() ?? normalized;
    return patterns.some((pattern) => (0, minimatch_1.minimatch)(normalized, pattern) || (0, minimatch_1.minimatch)(basename, pattern));
}
function usesThisOrSuper(node, sourceCode) {
    const visitorKeys = sourceCode.visitorKeys;
    const stack = [node];
    while (stack.length) {
        const current = stack.pop();
        if (current.type === utils_1.AST_NODE_TYPES.ThisExpression ||
            current.type === utils_1.AST_NODE_TYPES.Super) {
            return true;
        }
        const keys = visitorKeys[current.type];
        if (!keys)
            continue;
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const element of value) {
                    if (element && typeof element.type === 'string') {
                        stack.push(element);
                    }
                }
            }
            else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
    return false;
}
function analyzeExternalReferences(context, fn, extraTypeRoots = []) {
    const sourceCode = context.getSourceCode();
    if (usesThisOrSuper(fn.body, sourceCode)) {
        return { hasComponentScopeRef: true };
    }
    let hasComponentScopeRef = false;
    const scopeManager = sourceCode.scopeManager;
    if (!scopeManager) {
        return { hasComponentScopeRef: true };
    }
    const scope = scopeManager.acquire(fn, true) ?? scopeManager.acquire(fn);
    if (!scope) {
        return { hasComponentScopeRef: true };
    }
    if (!hasComponentScopeRef) {
        for (const ref of scope.through) {
            const identifier = ref.identifier;
            if (isPropertyKey(identifier.parent, identifier)) {
                continue;
            }
            const resolved = ref.resolved;
            if (!resolved) {
                continue;
            }
            const def = resolved.defs[0];
            const scopeType = resolved.scope.type;
            const isImport = def?.type === 'ImportBinding';
            const isModuleOrGlobal = scopeType === 'module' || scopeType === 'global';
            if (!isImport && !isModuleOrGlobal) {
                hasComponentScopeRef = true;
                break;
            }
        }
    }
    if (!hasComponentScopeRef) {
        const typeRoots = [];
        if (fn.returnType) {
            typeRoots.push(fn.returnType.typeAnnotation);
        }
        if (fn.typeParameters) {
            typeRoots.push(fn.typeParameters);
        }
        for (const param of fn.params) {
            if ('typeAnnotation' in param && param.typeAnnotation) {
                typeRoots.push(param.typeAnnotation.typeAnnotation);
            }
            else if (param.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                'typeAnnotation' in param.left &&
                param.left.typeAnnotation) {
                typeRoots.push(param.left.typeAnnotation.typeAnnotation);
            }
        }
        typeRoots.push(...collectBodyTypeAnnotations(fn.body, sourceCode));
        typeRoots.push(...extraTypeRoots);
        if (typeRoots.some((typeRoot) => usesThisOrSuper(typeRoot, sourceCode))) {
            hasComponentScopeRef = true;
        }
        if (!hasComponentScopeRef) {
            const localTypes = collectNearestBlockTypeBindings(fn);
            if (localTypes.size > 0 &&
                usesLocalTypeBindings(typeRoots, localTypes, sourceCode)) {
                hasComponentScopeRef = true;
            }
        }
    }
    return { hasComponentScopeRef };
}
function getProgramNode(node) {
    let current = node;
    while (current && current.type !== utils_1.AST_NODE_TYPES.Program) {
        current = current.parent ?? undefined;
    }
    return current?.type === utils_1.AST_NODE_TYPES.Program ? current : null;
}
function addPatternIdentifiersToSet(pattern, names) {
    switch (pattern.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            names.add(pattern.name);
            return;
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            for (const property of pattern.properties) {
                if (property.type === utils_1.AST_NODE_TYPES.Property) {
                    addPatternIdentifiersToSet(property.value, names);
                }
                else if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
                    addPatternIdentifiersToSet(property.argument, names);
                }
            }
            return;
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            for (const element of pattern.elements) {
                if (!element)
                    continue;
                if (element.type === utils_1.AST_NODE_TYPES.RestElement) {
                    addPatternIdentifiersToSet(element.argument, names);
                }
                else {
                    addPatternIdentifiersToSet(element, names);
                }
            }
            return;
        case utils_1.AST_NODE_TYPES.RestElement:
            addPatternIdentifiersToSet(pattern.argument, names);
            return;
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            addPatternIdentifiersToSet(pattern.left, names);
            return;
    }
}
function getModuleScopeValueBindings(program) {
    const names = new Set();
    for (const statement of program.body) {
        const target = statement.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration ||
            statement.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration
            ? statement.declaration
            : statement;
        if (!target)
            continue;
        if (target.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            for (const specifier of target.specifiers) {
                names.add(specifier.local.name);
            }
            continue;
        }
        if (target.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declaration of target.declarations) {
                addPatternIdentifiersToSet(declaration.id, names);
            }
            continue;
        }
        if (target.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            target.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            target.type === utils_1.AST_NODE_TYPES.TSEnumDeclaration) {
            if (target.id) {
                names.add(target.id.name);
            }
        }
    }
    return names;
}
function buildHoistFixes(context, callExpression, callback, hoistedIdentifierCache) {
    if (!callExpression.parent ||
        callExpression.parent.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
        return null;
    }
    const declarator = callExpression.parent;
    if (declarator.id.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const varDecl = declarator.parent;
    if (!varDecl ||
        varDecl.type !== utils_1.AST_NODE_TYPES.VariableDeclaration ||
        varDecl.declarations.length !== 1) {
        return null;
    }
    if (varDecl.kind !== 'const') {
        return null;
    }
    if (!varDecl.parent ||
        varDecl.parent.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
        return null;
    }
    const hoistTarget = findHoistTarget(varDecl.parent);
    if (!hoistTarget) {
        return null;
    }
    const programNode = getProgramNode(hoistTarget);
    let moduleBindings = null;
    if (programNode) {
        const cachedBindings = hoistedIdentifierCache.get(programNode);
        moduleBindings = cachedBindings ?? getModuleScopeValueBindings(programNode);
        if (!cachedBindings) {
            hoistedIdentifierCache.set(programNode, moduleBindings);
        }
        if (moduleBindings.has(declarator.id.name)) {
            return null;
        }
        // Reserve the identifier so later callbacks in the same file with the same
        // name do not attempt to hoist and produce duplicate declarations.
        moduleBindings.add(declarator.id.name);
    }
    const sourceCode = context.getSourceCode();
    // We use the full range of the id to ensure we capture any type annotations.
    // In @typescript-eslint/parser, the Identifier range already includes the
    // type annotation, but we explicitly calculate the end range for robustness.
    const idRangeEnd = declarator.id.typeAnnotation &&
        declarator.id.typeAnnotation.range[1] > declarator.id.range[1]
        ? declarator.id.typeAnnotation.range[1]
        : declarator.id.range[1];
    const identifierText = sourceCode
        .getText()
        .slice(declarator.id.range[0], idRangeEnd);
    const functionText = sourceCode.getText(callback);
    const hoisted = `const ${identifierText} = ${functionText};\n`;
    const fileText = sourceCode.getText();
    let removeStart = varDecl.range[0];
    const lineStart = fileText.lastIndexOf('\n', removeStart - 1) + 1;
    const leadingSegment = fileText.slice(lineStart, removeStart);
    const hasOnlyIndentBefore = /^[ \t]*$/.test(leadingSegment);
    if (hasOnlyIndentBefore) {
        removeStart = lineStart;
    }
    let removeEnd = varDecl.range[1];
    const lineEnd = fileText.indexOf('\n', removeEnd);
    const segmentEnd = lineEnd === -1 ? fileText.length : lineEnd;
    const trailingSegment = fileText.slice(removeEnd, segmentEnd);
    const hasOnlyWhitespaceAfter = /^[ \t]*$/.test(trailingSegment);
    if (hasOnlyWhitespaceAfter) {
        removeEnd = segmentEnd;
    }
    if (hasOnlyIndentBefore && hasOnlyWhitespaceAfter && lineEnd !== -1) {
        removeEnd = lineEnd + 1;
    }
    return (fixer) => [
        fixer.insertTextBefore(hoistTarget, hoisted),
        fixer.removeRange([removeStart, removeEnd]),
    ];
}
exports.noEmptyDependencyUseCallbacks = (0, createRule_1.createRule)({
    name: 'no-empty-dependency-use-callbacks',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Discourage useCallback([]) or useLatestCallback around static functions. Static callbacks do not need hook machinery—extract them to module-level utilities for clarity and to avoid unnecessary hook overhead.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    ignoreTestFiles: { type: 'boolean', default: true },
                    testFilePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        default: DEFAULT_TEST_PATTERNS,
                    },
                    ignoreUseLatestCallback: { type: 'boolean', default: false },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            preferUtilityFunction: PREFER_UTILITY_FUNCTION_MESSAGE,
            preferUtilityLatest: PREFER_UTILITY_LATEST_MESSAGE,
        },
    },
    defaultOptions: [{}],
    create(context) {
        const [options] = context.options;
        const ignoreTestFiles = options?.ignoreTestFiles !== false;
        const testPatterns = options?.testFilePatterns ?? DEFAULT_TEST_PATTERNS;
        const ignoreUseLatestCallback = options?.ignoreUseLatestCallback === true;
        const hoistedIdentifierCache = new WeakMap();
        const filename = context.getFilename();
        const isTest = ignoreTestFiles && filenameMatchesPatterns(filename, testPatterns);
        function reportIfStaticCallback(callExpression, messageId) {
            const callee = callExpression.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.Identifier &&
                callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                return;
            }
            const callback = getCallbackArg(callExpression);
            if (!callback)
                return;
            if (ASTHelpers_1.ASTHelpers.returnsJSX(callback.body))
                return;
            const extraTypeRoots = [];
            if (callExpression.parent &&
                callExpression.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                'typeAnnotation' in callExpression.parent.id &&
                callExpression.parent.id.typeAnnotation) {
                const typeAnnotation = callExpression.parent.id.typeAnnotation;
                if (typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
                    extraTypeRoots.push(typeAnnotation.typeAnnotation);
                }
                else {
                    extraTypeRoots.push(typeAnnotation);
                }
            }
            const { hasComponentScopeRef } = analyzeExternalReferences(context, callback, extraTypeRoots);
            if (hasComponentScopeRef) {
                return;
            }
            const callbackName = callExpression.parent &&
                callExpression.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                callExpression.parent.id.type === utils_1.AST_NODE_TYPES.Identifier
                ? callExpression.parent.id.name
                : 'this callback';
            const fix = buildHoistFixes(context, callExpression, callback, hoistedIdentifierCache);
            context.report({
                node: callExpression,
                messageId,
                data: { name: callbackName },
                fix,
            });
        }
        return {
            CallExpression(node) {
                if (isTest)
                    return;
                const { callee } = node;
                if (callee.type !== utils_1.AST_NODE_TYPES.Identifier &&
                    callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                    return;
                }
                if (isUseCallbackCallee(callee)) {
                    if (!hasEmptyDependencyArray(node)) {
                        return;
                    }
                    reportIfStaticCallback(node, 'preferUtilityFunction');
                    return;
                }
                if (ignoreUseLatestCallback)
                    return;
                if (isUseLatestCallbackCallee(callee)) {
                    reportIfStaticCallback(node, 'preferUtilityLatest');
                }
            },
        };
    },
});
exports.default = exports.noEmptyDependencyUseCallbacks;
//# sourceMappingURL=no-empty-dependency-use-callbacks.js.map