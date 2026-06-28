"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceStorageContext = void 0;
const path_1 = __importDefault(require("path"));
const minimatch_1 = require("minimatch");
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const STORAGE_NAMES = new Set(['localStorage', 'sessionStorage']);
const GLOBAL_NAMES = new Set(['window', 'global', 'globalThis']);
const CONTEXT_BASENAMES = new Set(['LocalStorage.tsx', 'SessionStorage.tsx']);
const TEST_FILE_REGEX = /\.(test|spec)\.[jt]sx?$/i;
const isParenthesizedExpression = (node) => node.type === 'ParenthesizedExpression';
const isChainExpression = (node) => node.type === 'ChainExpression';
const createAliasState = () => {
    const stack = [new Map()];
    const scopeKinds = ['function'];
    const currentScope = () => stack[stack.length - 1];
    const pushScope = (kind = 'block') => {
        stack.push(new Map());
        scopeKinds.push(kind);
    };
    const popScope = () => {
        if (stack.length > 1) {
            stack.pop();
            scopeKinds.pop();
        }
    };
    const findFunctionScope = () => {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            if (scopeKinds[i] === 'function') {
                return stack[i];
            }
        }
        return stack[0];
    };
    const setAlias = (name, value, options) => {
        const targetScope = options?.hoistToFunctionScope
            ? findFunctionScope()
            : currentScope();
        targetScope.set(name, value);
    };
    const setAliasInExistingBindingScope = (name, value) => {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            if (stack[i].has(name)) {
                stack[i].set(name, value);
                return;
            }
        }
        if (STORAGE_NAMES.has(name) || GLOBAL_NAMES.has(name)) {
            /**
             * Avoid synthesizing a new binding for global storage identifiers; treating
             * the assignment as a shadow creates false negatives for later accesses.
             */
            return;
        }
        setAlias(name, value);
    };
    const markShadowed = (name, options) => setAlias(name, 'shadowed', options);
    const reset = () => {
        stack.length = 1;
        scopeKinds.length = 1;
        scopeKinds[0] = 'function';
        stack[0].clear();
    };
    return {
        stack,
        currentScope,
        pushScope,
        popScope,
        reset,
        setAliasInExistingBindingScope,
        setAlias,
        markShadowed,
    };
};
/**
 * Unwraps TypeScript-only wrappers and parentheses to expose the runtime
 * expression. Storage checks need the underlying value even when the code uses
 * TS assertions, satisfies expressions, non-null assertions, optional chaining,
 * or parentheses that do not change runtime behavior (e.g., `(localStorage as Storage)?.getItem()`).
 */
const unwrapExpression = (expression) => {
    let current = expression;
    while (true) {
        if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
            current.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
            current = current.expression;
            continue;
        }
        if (isParenthesizedExpression(current)) {
            current = current.expression;
            continue;
        }
        if (isChainExpression(current)) {
            current = current.expression;
            continue;
        }
        break;
    }
    return current;
};
const getPropertyName = (node) => {
    const unwrapped = node.type === utils_1.AST_NODE_TYPES.PrivateIdentifier
        ? node
        : unwrapExpression(node);
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier)
        return unwrapped.name;
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Literal &&
        typeof unwrapped.value === 'string') {
        return unwrapped.value;
    }
    return null;
};
const getAliasFromStack = (aliases, name) => {
    for (let i = aliases.length - 1; i >= 0; i -= 1) {
        const value = aliases[i].get(name);
        if (value !== undefined)
            return value;
    }
    return null;
};
const checkIfNameShadowsStorage = (name, storageAliases, options = {}) => {
    const lookupStack = options.includeCurrentScope
        ? storageAliases
        : storageAliases.slice(0, -1);
    const outerAlias = getAliasFromStack(lookupStack, name);
    const shadowsGlobal = STORAGE_NAMES.has(name) || GLOBAL_NAMES.has(name);
    const shadowsOuterStorageAlias = outerAlias === 'localStorage' || outerAlias === 'sessionStorage';
    return shadowsGlobal || shadowsOuterStorageAlias;
};
const isGlobalLike = (node, aliases) => {
    const base = unwrapExpression(node);
    if (base.type !== utils_1.AST_NODE_TYPES.Identifier)
        return false;
    if (getAliasFromStack(aliases, base.name))
        return false;
    return GLOBAL_NAMES.has(base.name);
};
/**
 * Resolves an expression to a storage kind when it ultimately refers to
 * localStorage/sessionStorage. Follows aliases through member access,
 * conditionals, and logical expressions so indirect access like
 * `const s = window?.localStorage` is still caught. Ignores identifiers that are
 * explicitly shadowed within the current lexical scope.
 */
const resolveStorageObject = (expression, aliases) => {
    const target = unwrapExpression(expression);
    if (target.type === utils_1.AST_NODE_TYPES.Identifier) {
        const alias = getAliasFromStack(aliases, target.name);
        if (alias === 'shadowed')
            return null;
        if (alias)
            return alias;
        if (STORAGE_NAMES.has(target.name)) {
            return target.name;
        }
        return null;
    }
    if (target.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        const objectKind = resolveStorageObject(target.object, aliases);
        if (objectKind)
            return objectKind;
        const propertyName = getPropertyName(target.property);
        if (propertyName &&
            STORAGE_NAMES.has(propertyName) &&
            isGlobalLike(target.object, aliases)) {
            return propertyName;
        }
    }
    if (target.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
        const consequentKind = resolveStorageObject(target.consequent, aliases);
        if (consequentKind)
            return consequentKind;
        const alternateKind = resolveStorageObject(target.alternate, aliases);
        if (alternateKind)
            return alternateKind;
    }
    if (target.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        return (resolveStorageObject(target.left, aliases) ??
            resolveStorageObject(target.right, aliases));
    }
    return null;
};
const parentMatchesBinding = (parent, type, propertyName, value) => {
    if (parent.type !== type)
        return false;
    if (!propertyName)
        return true;
    const parentProperty = parent[propertyName];
    if (propertyName === 'params' && Array.isArray(parentProperty)) {
        return parentProperty.includes(value);
    }
    return parentProperty === value;
};
const identifierHasDeclarationParent = (node) => {
    const parent = node.parent;
    if (!parent)
        return false;
    if (parent.type === utils_1.AST_NODE_TYPES.Property &&
        parent.parent?.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        return true;
    }
    if (parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ObjectPattern) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ArrayPattern) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.RestElement, 'argument', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.VariableDeclarator, 'id', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.AssignmentExpression, 'left', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.AssignmentPattern, 'left', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.FunctionDeclaration, 'id', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.FunctionExpression, 'id', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ClassExpression, 'id', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.CatchClause, 'param', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ClassDeclaration, 'id', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ImportSpecifier) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ExportSpecifier) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.TSEnumMember, 'id', node)) {
        return true;
    }
    if (parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.FunctionDeclaration, 'params', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.FunctionExpression, 'params', node) ||
        parentMatchesBinding(parent, utils_1.AST_NODE_TYPES.ArrowFunctionExpression, 'params', node)) {
        return true;
    }
    return false;
};
const isObjectLiteralKeyDeclaration = (node, parent) => {
    if (parent.type !== utils_1.AST_NODE_TYPES.Property)
        return false;
    if (parent.shorthand)
        return false;
    return parent.key === node;
};
const isClassMemberKeyDeclaration = (node, parent) => (parent.type === utils_1.AST_NODE_TYPES.MethodDefinition ||
    parent.type === utils_1.AST_NODE_TYPES.PropertyDefinition) &&
    parent.key === node;
const isTypeScriptDeclarationIdentifier = (node, parent) => (parent.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration &&
    parent.id === node) ||
    (parent.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration &&
        parent.id === node) ||
    (parent.type === utils_1.AST_NODE_TYPES.TSEnumDeclaration && parent.id === node) ||
    (parent.type === utils_1.AST_NODE_TYPES.TSEnumMember && parent.id === node) ||
    (parent.type === utils_1.AST_NODE_TYPES.TSModuleDeclaration && parent.id === node);
const isLabelIdentifier = (node, parent) => (parent.type === utils_1.AST_NODE_TYPES.LabeledStatement && parent.label === node) ||
    ((parent.type === utils_1.AST_NODE_TYPES.BreakStatement ||
        parent.type === utils_1.AST_NODE_TYPES.ContinueStatement) &&
        parent.label === node);
/**
 * Distinguishes declaration sites (bindings) from usage sites. The rule reports
 * reads of storage, not the act of declaring a variable/property/parameter, so
 * declarations across destructuring, params, imports, class members, and
 * assignment targets must be ignored.
 */
const identifierRepresentsDeclaration = (node) => {
    const parent = node.parent;
    if (!parent)
        return false;
    if (identifierHasDeclarationParent(node)) {
        return true;
    }
    if (isObjectLiteralKeyDeclaration(node, parent))
        return true;
    if (isClassMemberKeyDeclaration(node, parent))
        return true;
    if (isTypeScriptDeclarationIdentifier(node, parent))
        return true;
    return isLabelIdentifier(node, parent);
};
const isVarBinding = (node) => {
    let child = node;
    let parent = node.parent ?? null;
    while (parent) {
        if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
            if (parent.init === child)
                return false;
            const declaration = parent.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclaration
                ? parent.parent
                : null;
            return declaration?.kind === 'var';
        }
        child = parent;
        parent = parent.parent ?? null;
    }
    return false;
};
const isMemberExpressionObject = (node) => {
    const parent = node.parent;
    return (!!parent &&
        parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        parent.object === node);
};
const isStorageContainerSource = (init, aliases) => {
    const source = unwrapExpression(init);
    if (isGlobalLike(source, aliases))
        return true;
    if (source.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        if (resolveStorageObject(source, aliases))
            return true;
        return isGlobalLike(source.object, aliases);
    }
    return false;
};
/**
 * Registers aliases introduced via object destructuring of storage containers
 * (e.g., `const { localStorage: store } = window`). The callback fires at the
 * destructuring site so violations point to the extraction point. Aliases are
 * stored on the current lexical scope to avoid leaking across nested scopes.
 */
const recordAliasFromPattern = (pattern, init, aliases, setAlias, reportStorageProperty) => {
    if (!init)
        return;
    if (!isStorageContainerSource(init, aliases))
        return;
    for (const prop of pattern.properties) {
        if (prop.type !== utils_1.AST_NODE_TYPES.Property)
            continue;
        if (prop.computed)
            continue;
        const keyName = getPropertyName(prop.key);
        if (!keyName || !STORAGE_NAMES.has(keyName))
            continue;
        reportStorageProperty?.(prop.key, keyName, `property "${keyName}"`);
        if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
            setAlias(prop.value.name, keyName);
        }
        else if (prop.value.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
            prop.value.left.type === utils_1.AST_NODE_TYPES.Identifier) {
            setAlias(prop.value.left.name, keyName);
        }
    }
};
const shouldIgnoreFile = (filename, options) => {
    const normalizedFilename = filename.replace(/\\/g, '/');
    const base = path_1.default.basename(normalizedFilename);
    if (CONTEXT_BASENAMES.has(base))
        return true;
    const allowInTests = options?.allowInTests ?? true;
    const isTestFile = TEST_FILE_REGEX.test(normalizedFilename) ||
        /(^|\/)__mocks__(\/|$)/.test(normalizedFilename);
    if (allowInTests && isTestFile)
        return true;
    const allowPatterns = options?.allow ?? [];
    const normalizedAllowPatterns = allowPatterns.map((pattern) => pattern.replace(/\\/g, '/'));
    return normalizedAllowPatterns.some((pattern) => (0, minimatch_1.minimatch)(normalizedFilename, pattern, { windowsPathsNoEscape: true }));
};
const createUsageReporter = (context) => {
    const reportedNodes = new WeakSet();
    const reportedLocations = new Set();
    return (node, storage, accessType) => {
        const locationKey = node.range ? `${node.range[0]}:${node.range[1]}` : null;
        if (locationKey && reportedLocations.has(locationKey))
            return;
        if (locationKey)
            reportedLocations.add(locationKey);
        if (reportedNodes.has(node))
            return;
        reportedNodes.add(node);
        const hook = storage === 'localStorage' ? 'useLocalStorage' : 'useSessionStorage';
        context.report({
            node,
            messageId: 'useStorageContext',
            data: {
                storage,
                accessType,
                hook,
            },
        });
    };
};
const createIdentifierHandler = (aliases, storageAliases, reportUsage) => {
    return (node) => {
        const parent = node.parent;
        if (identifierRepresentsDeclaration(node)) {
            const hoistToFunctionScope = isVarBinding(node);
            const existingAlias = getAliasFromStack(storageAliases, node.name);
            const isAssignmentTarget = parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
                parent.left === node;
            if (isAssignmentTarget &&
                !existingAlias &&
                (STORAGE_NAMES.has(node.name) ||
                    GLOBAL_NAMES.has(node.name))) {
                /**
                 * Ignore assignments to global storage identifiers without an existing
                 * local binding. Treating them as declarations would shadow the global
                 * object and mask subsequent violations.
                 */
                return;
            }
            if (existingAlias === 'localStorage' ||
                existingAlias === 'sessionStorage') {
                /**
                 * Preserve existing aliases introduced earlier in the traversal
                 * (e.g., destructuring) so later declaration-node visits do not
                 * override them as shadowed bindings.
                 */
                return;
            }
            if (parent?.type === utils_1.AST_NODE_TYPES.ClassExpression &&
                parent.id === node) {
                /**
                 * Class expression names are only bound to the class body and should not
                 * be treated as shadowing outer scope storage references.
                 */
                return;
            }
            if (identifierHasDeclarationParent(node) &&
                !aliases.currentScope().has(node.name)) {
                const shadowsStorage = checkIfNameShadowsStorage(node.name, storageAliases);
                if (shadowsStorage) {
                    aliases.markShadowed(node.name, { hoistToFunctionScope });
                }
            }
            return;
        }
        const storageKind = resolveStorageObject(node, storageAliases);
        if (!storageKind)
            return;
        if (isMemberExpressionObject(node))
            return;
        if (node.parent &&
            node.parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            node.parent.property === node)
            return;
        reportUsage(node, storageKind, 'reference');
    };
};
const createMemberExpressionHandler = (storageAliases, reportUsage) => {
    return (node) => {
        const object = node.object;
        const isAssignmentTarget = node.parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
            node.parent.left === node;
        if (isAssignmentTarget) {
            return;
        }
        const storageKind = resolveStorageObject(object, storageAliases);
        if (storageKind) {
            if (node.parent &&
                node.parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.parent.callee === node) {
                return;
            }
            if (node.parent &&
                node.parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.parent.object === node) {
                return;
            }
            const propName = getPropertyName(node.property);
            reportUsage(node, storageKind, propName ? `property "${propName}"` : 'property access');
            return;
        }
        const propertyName = getPropertyName(node.property);
        if (propertyName &&
            STORAGE_NAMES.has(propertyName) &&
            isGlobalLike(object, storageAliases)) {
            if (node.parent &&
                node.parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.parent.object === node) {
                return;
            }
            reportUsage(node.property, propertyName, 'reference');
        }
    };
};
const createCallExpressionHandler = (storageAliases, reportUsage) => {
    return (node) => {
        const callee = unwrapExpression(node.callee);
        if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
            return;
        const storageKind = resolveStorageObject(callee.object, storageAliases);
        if (!storageKind)
            return;
        const propName = getPropertyName(callee.property);
        reportUsage(callee.property, storageKind, propName ? `method "${propName}"` : 'storage method');
    };
};
const createVariableDeclaratorHandler = (aliases, storageAliases, reportUsage) => {
    return (node) => {
        const declaration = node.parent && node.parent.type === utils_1.AST_NODE_TYPES.VariableDeclaration
            ? node.parent
            : null;
        const hoistToFunctionScope = declaration?.kind === 'var';
        if (node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
            const storageKind = node.init
                ? resolveStorageObject(node.init, storageAliases)
                : null;
            if (storageKind) {
                aliases.setAlias(node.id.name, storageKind, { hoistToFunctionScope });
            }
            else {
                const shadowsStorage = checkIfNameShadowsStorage(node.id.name, storageAliases, {
                    includeCurrentScope: true,
                });
                if (shadowsStorage) {
                    aliases.markShadowed(node.id.name, { hoistToFunctionScope });
                }
            }
        }
        else if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            const initExpr = node.init ?? null;
            recordAliasFromPattern(node.id, initExpr, storageAliases, (name, storageKind) => aliases.setAlias(name, storageKind, { hoistToFunctionScope }), (propertyNode, storageKind, accessType) => {
                reportUsage(propertyNode, storageKind, accessType);
            });
        }
    };
};
const createAssignmentExpressionHandler = (aliases, storageAliases, reportUsage) => {
    return (node) => {
        if (node.left.type === utils_1.AST_NODE_TYPES.Identifier) {
            const right = node.right;
            const storageKind = resolveStorageObject(right, storageAliases);
            if (storageKind) {
                aliases.setAliasInExistingBindingScope(node.left.name, storageKind);
            }
            else {
                const shadowsStorage = checkIfNameShadowsStorage(node.left.name, storageAliases, {
                    includeCurrentScope: true,
                });
                if (shadowsStorage) {
                    aliases.setAliasInExistingBindingScope(node.left.name, 'shadowed');
                }
            }
        }
        else if (node.left.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            recordAliasFromPattern(node.left, node.right, storageAliases, (name, storageKind) => aliases.setAliasInExistingBindingScope(name, storageKind), (propertyNode, storageKind, accessType) => {
                reportUsage(propertyNode, storageKind, accessType);
            });
        }
    };
};
const createScopeListeners = (aliases, storageAliases) => ({
    Program: aliases.reset,
    BlockStatement: () => aliases.pushScope(),
    'BlockStatement:exit': aliases.popScope,
    TSModuleBlock: () => aliases.pushScope(),
    'TSModuleBlock:exit': aliases.popScope,
    ClassBody: (node) => {
        const parent = node.parent;
        if (parent?.type === utils_1.AST_NODE_TYPES.ClassDeclaration &&
            parent.id &&
            checkIfNameShadowsStorage(parent.id.name, storageAliases, {
                includeCurrentScope: true,
            })) {
            aliases.setAlias(parent.id.name, 'shadowed');
        }
        aliases.pushScope();
        if (parent?.type === utils_1.AST_NODE_TYPES.ClassExpression &&
            parent.id &&
            checkIfNameShadowsStorage(parent.id.name, storageAliases, {
                includeCurrentScope: true,
            })) {
            aliases.setAlias(parent.id.name, 'shadowed');
        }
    },
    'ClassBody:exit': aliases.popScope,
    StaticBlock: () => aliases.pushScope(),
    'StaticBlock:exit': aliases.popScope,
    SwitchStatement: () => aliases.pushScope(),
    'SwitchStatement:exit': aliases.popScope,
    ForStatement: () => aliases.pushScope(),
    'ForStatement:exit': aliases.popScope,
    ForInStatement: () => aliases.pushScope(),
    'ForInStatement:exit': aliases.popScope,
    ForOfStatement: () => aliases.pushScope(),
    'ForOfStatement:exit': aliases.popScope,
    CatchClause: () => aliases.pushScope(),
    'CatchClause:exit': aliases.popScope,
    FunctionDeclaration: (node) => {
        if (node.id) {
            const name = node.id.name;
            if (checkIfNameShadowsStorage(name, storageAliases, {
                includeCurrentScope: true,
            })) {
                aliases.setAlias(name, 'shadowed');
            }
        }
        aliases.pushScope('function');
    },
    'FunctionDeclaration:exit': aliases.popScope,
    FunctionExpression: () => aliases.pushScope('function'),
    'FunctionExpression:exit': aliases.popScope,
    ArrowFunctionExpression: () => aliases.pushScope('function'),
    'ArrowFunctionExpression:exit': aliases.popScope,
});
const createStorageVisitors = (aliases, reportUsage) => {
    const storageAliases = aliases.stack;
    return {
        ...createScopeListeners(aliases, storageAliases),
        Identifier: createIdentifierHandler(aliases, storageAliases, reportUsage),
        MemberExpression: createMemberExpressionHandler(storageAliases, reportUsage),
        CallExpression: createCallExpressionHandler(storageAliases, reportUsage),
        VariableDeclarator: createVariableDeclaratorHandler(aliases, storageAliases, reportUsage),
        AssignmentExpression: createAssignmentExpressionHandler(aliases, storageAliases, reportUsage),
    };
};
exports.enforceStorageContext = (0, createRule_1.createRule)({
    name: 'enforce-storage-context',
    meta: {
        type: 'problem',
        docs: {
            description: 'Require storage access to go through the LocalStorage and SessionStorage context providers instead of direct browser APIs',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [
            {
                type: 'object',
                properties: {
                    allowInTests: {
                        type: 'boolean',
                        default: true,
                    },
                    allow: {
                        type: 'array',
                        items: { type: 'string' },
                        default: [],
                        description: 'Glob patterns that permit direct storage access (normalized to forward slashes) so polyfills and approved shims can bypass the context providers.',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            useStorageContext: "What's wrong: Direct {{storage}} {{accessType}} bypasses the LocalStorage/SessionStorage context providers.\n\nWhy it matters: (1) UI will not re-render when storage changes because React state is never updated, (2) code can crash during server-side rendering when `window` is undefined, and (3) storage errors go unhandled and break user flows.\n\nHow to fix: Call {{hook}}() at the component top level and use its returned methods (getItem, setItem, removeItem, clear) instead of accessing {{storage}} directly.",
        },
    },
    defaultOptions: [{}],
    create(context) {
        const filename = context.filename ??
            context.getFilename?.() ??
            '';
        const [options] = context.options;
        if (shouldIgnoreFile(filename, options)) {
            return {};
        }
        const aliases = createAliasState();
        const reportUsage = createUsageReporter(context);
        return createStorageVisitors(aliases, reportUsage);
    },
});
//# sourceMappingURL=enforce-storage-context.js.map