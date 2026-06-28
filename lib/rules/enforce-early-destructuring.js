"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceEarlyDestructuring = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const HOOK_NAMES = new Set([
    'useEffect',
    'useMemo',
    'useCallback',
    'useLayoutEffect',
]);
function isParenthesizedExpression(expression) {
    return expression.type === 'ParenthesizedExpression';
}
function unwrapTsExpression(expression) {
    let current = expression;
    // Loop to peel off TS/paren wrappers that do not change the underlying value.
    // The explicit loop keeps TypeScript aware that `current` always has an
    // `.expression` property inside the branch.
    // eslint-disable-next-line no-constant-condition -- Loop intentionally runs until wrapper nodes are fully unwrapped.
    while (true) {
        if (current.type === utils_1.AST_NODE_TYPES.TSNonNullExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
            isParenthesizedExpression(current)) {
            const nodeWithExpression = current;
            current = nodeWithExpression.expression;
            continue;
        }
        break;
    }
    return current;
}
function isFunctionNode(node) {
    return (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression);
}
function isHookCall(node) {
    const callee = node.callee;
    if (callee.type !== utils_1.AST_NODE_TYPES.Identifier)
        return null;
    return HOOK_NAMES.has(callee.name) ? callee.name : null;
}
function isAllowedInit(init) {
    const unwrapped = unwrapTsExpression(init);
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier)
        return true;
    if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression)
        return true;
    if (unwrapped.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        const inner = unwrapTsExpression(unwrapped.expression);
        return inner.type === utils_1.AST_NODE_TYPES.MemberExpression;
    }
    return false;
}
function getBaseIdentifier(init) {
    const unwrapped = unwrapTsExpression(init);
    if (unwrapped.type === utils_1.AST_NODE_TYPES.Identifier) {
        return unwrapped.name;
    }
    if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        let current = unwrapTsExpression(unwrapped.object);
        while (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            current = unwrapTsExpression(current.object);
        }
        if (current.type === utils_1.AST_NODE_TYPES.Identifier) {
            return current.name;
        }
        if (current.type === utils_1.AST_NODE_TYPES.ChainExpression) {
            return getBaseIdentifier(current.expression);
        }
    }
    if (unwrapped.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return getBaseIdentifier(unwrapped.expression);
    }
    return null;
}
function addNameIfAbsent(name, names, orderedNames) {
    if (names.has(name))
        return;
    names.add(name);
    orderedNames.push(name);
}
function handleAssignmentPatternNames(node, names, orderedNames) {
    const left = node.left;
    if (left.type === utils_1.AST_NODE_TYPES.Identifier) {
        addNameIfAbsent(left.name, names, orderedNames);
        return;
    }
    if (left.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(left, names, orderedNames);
        return;
    }
    if (left.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        collectNamesFromArrayPattern(left, names, orderedNames);
    }
}
function handlePropertyNodeNames(property, names, orderedNames) {
    const value = property.value;
    if (value.type === utils_1.AST_NODE_TYPES.Identifier) {
        addNameIfAbsent(value.name, names, orderedNames);
        return;
    }
    if (value.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        handleAssignmentPatternNames(value, names, orderedNames);
        return;
    }
    if (value.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(value, names, orderedNames);
        return;
    }
    if (value.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        collectNamesFromArrayPattern(value, names, orderedNames);
    }
}
function handleRestElementNodeNames(rest, names, orderedNames) {
    const argument = rest.argument;
    if (argument.type === utils_1.AST_NODE_TYPES.Identifier) {
        addNameIfAbsent(argument.name, names, orderedNames);
        return;
    }
    if (argument.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(argument, names, orderedNames);
        return;
    }
    if (argument.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        collectNamesFromArrayPattern(argument, names, orderedNames);
    }
}
function collectNamesFromPattern(pattern, names, orderedNames) {
    for (const property of pattern.properties) {
        if (property.type === utils_1.AST_NODE_TYPES.Property) {
            handlePropertyNodeNames(property, names, orderedNames);
        }
        else if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
            handleRestElementNodeNames(property, names, orderedNames);
        }
    }
}
function collectNamesFromArrayPattern(pattern, names, orderedNames) {
    for (const element of pattern.elements) {
        if (!element)
            continue;
        if (element.type === utils_1.AST_NODE_TYPES.Identifier) {
            addNameIfAbsent(element.name, names, orderedNames);
        }
        else if (element.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
            handleAssignmentPatternNames(element, names, orderedNames);
        }
        else if (element.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            collectNamesFromPattern(element, names, orderedNames);
        }
        else if (element.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
            collectNamesFromArrayPattern(element, names, orderedNames);
        }
        else if (element.type === utils_1.AST_NODE_TYPES.RestElement) {
            handleRestElementNodeNames(element, names, orderedNames);
        }
    }
}
function collectBindingNamesFromBindingName(binding, names) {
    if (binding.type === utils_1.AST_NODE_TYPES.Identifier) {
        names.add(binding.name);
        return;
    }
    if (binding.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        collectNamesFromPattern(binding, names, []);
        return;
    }
    collectNamesFromArrayPattern(binding, names, []);
}
function collectBindingNamesFromParamLike(node, names) {
    if (node.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        collectBindingNamesFromParamLike(node.left, names);
        return;
    }
    if (node.type === utils_1.AST_NODE_TYPES.RestElement) {
        collectBindingNamesFromParamLike(node.argument, names);
        return;
    }
    collectBindingNamesFromBindingName(node, names);
}
function collectExistingBindings(callback, declarationsToRemove) {
    const names = new Set();
    for (const param of callback.params) {
        if (param) {
            collectBindingNamesFromParamLike(param, names);
        }
    }
    if (callback.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
        return names;
    }
    for (const statement of callback.body.body) {
        if (statement.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && statement.id) {
            names.add(statement.id.name);
        }
        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration &&
            !declarationsToRemove.has(statement)) {
            for (const declarator of statement.declarations) {
                collectBindingNamesFromParamLike(declarator.id, names);
            }
        }
    }
    return names;
}
function collectCallbackLocalBindings(callback, declarationsToRemove, visitorKeys) {
    const names = new Set();
    const stack = [callback.body];
    while (stack.length) {
        const current = stack.pop();
        if (!current)
            continue;
        if (declarationsToRemove.has(current)) {
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
            if (current.id) {
                names.add(current.id.name);
            }
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.ClassDeclaration) {
            if (current.id) {
                names.add(current.id.name);
            }
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
            collectBindingNamesFromBindingName(current.id, names);
        }
        if (current.type === utils_1.AST_NODE_TYPES.CatchClause && current.param) {
            collectBindingNamesFromBindingName(current.param, names);
        }
        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') {
                        stack.push(child);
                    }
                }
            }
            else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
    return names;
}
function collectBindingsInScope(scope) {
    const names = new Set();
    let current = scope;
    while (current) {
        for (const variable of current.variables) {
            if (variable.identifiers.length === 0) {
                continue;
            }
            names.add(variable.name);
        }
        current = current.upper ?? null;
    }
    return names;
}
function findInsertionStatement(node) {
    let current = node;
    while (current) {
        const parent = current.parent;
        if (!parent)
            return null;
        if (parent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
            parent.body.includes(current)) {
            return current;
        }
        current = parent;
    }
    return null;
}
function bindingNamesOfDestructuringProperty(property) {
    const names = new Set();
    if (property.type === utils_1.AST_NODE_TYPES.Property) {
        collectBindingNamesFromParamLike(property.value, names);
        return names;
    }
    collectBindingNamesFromParamLike(property, names);
    return names;
}
function collectRuntimeIdentifierReferences(root, visitorKeys, names) {
    const stack = [root];
    while (stack.length) {
        const current = stack.pop();
        if (!current)
            continue;
        if (current.type === utils_1.AST_NODE_TYPES.Identifier &&
            isIdentifierReference(current)) {
            names.add(current.name);
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSNonNullExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression ||
            isParenthesizedExpression(current)) {
            const nodeWithExpression = current;
            stack.push(nodeWithExpression.expression);
            continue;
        }
        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') {
                        stack.push(child);
                    }
                }
            }
            else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
}
function collectPatternReferenceNames(node, visitorKeys, names) {
    if (node.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        collectRuntimeIdentifierReferences(node.right, visitorKeys, names);
        collectPatternReferenceNames(node.left, visitorKeys, names);
        return;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        for (const property of node.properties) {
            if (property.type === utils_1.AST_NODE_TYPES.Property) {
                if (property.computed) {
                    collectRuntimeIdentifierReferences(property.key, visitorKeys, names);
                }
                collectPatternReferenceNames(property.value, visitorKeys, names);
            }
            else if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
                collectPatternReferenceNames(property.argument, visitorKeys, names);
            }
        }
        return;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        for (const element of node.elements) {
            if (!element)
                continue;
            collectPatternReferenceNames(element, visitorKeys, names);
        }
        return;
    }
    if (node.type === utils_1.AST_NODE_TYPES.RestElement) {
        collectPatternReferenceNames(node.argument, visitorKeys, names);
    }
}
function referenceNamesOfDestructuringProperty(property, visitorKeys) {
    const names = new Set();
    if (property.type === utils_1.AST_NODE_TYPES.Property) {
        if (property.computed) {
            collectRuntimeIdentifierReferences(property.key, visitorKeys, names);
        }
        collectPatternReferenceNames(property.value, visitorKeys, names);
        return names;
    }
    collectPatternReferenceNames(property, visitorKeys, names);
    return names;
}
function collectProperties(pattern, sourceCode, visitorKeys, acc) {
    for (const property of pattern.properties) {
        const text = getSafePropertyText(property, sourceCode);
        if (acc.has(text))
            continue;
        const keyText = property.type === utils_1.AST_NODE_TYPES.Property
            ? property.key.type === utils_1.AST_NODE_TYPES.Literal
                ? String(property.key.value)
                : property.key.type === utils_1.AST_NODE_TYPES.Identifier
                    ? property.key.name
                    : sourceCode.getText(property.key)
            : `...${sourceCode.getText(property.argument)}`;
        acc.set(text, {
            key: keyText,
            text,
            order: property.range ? property.range[0] : acc.size,
            bindingNames: bindingNamesOfDestructuringProperty(property),
            referenceNames: referenceNamesOfDestructuringProperty(property, visitorKeys),
        });
    }
}
function renderArrayPatternWithDefaults(pattern, sourceCode) {
    const elements = pattern.elements.map((element) => {
        if (!element)
            return '';
        if (element.type === utils_1.AST_NODE_TYPES.Identifier) {
            return sourceCode.getText(element);
        }
        if (element.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
            const left = element.left;
            const leftText = left.type === utils_1.AST_NODE_TYPES.ObjectPattern
                ? renderObjectPatternWithDefaults(left, sourceCode)
                : left.type === utils_1.AST_NODE_TYPES.ArrayPattern
                    ? renderArrayPatternWithDefaults(left, sourceCode)
                    : sourceCode.getText(left);
            return `${leftText} = ${sourceCode.getText(element.right)}`;
        }
        if (element.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            const nested = renderObjectPatternWithDefaults(element, sourceCode);
            return `${nested} = {}`;
        }
        if (element.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
            const nested = renderArrayPatternWithDefaults(element, sourceCode);
            return `${nested} = []`;
        }
        if (element.type === utils_1.AST_NODE_TYPES.RestElement) {
            const argument = element.argument;
            if (argument.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                return `...${renderObjectPatternWithDefaults(argument, sourceCode)}`;
            }
            if (argument.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
                return `...${renderArrayPatternWithDefaults(argument, sourceCode)}`;
            }
            return `...${sourceCode.getText(argument)}`;
        }
        return sourceCode.getText(element);
    });
    return `[${elements.join(', ')}]`;
}
function formatPropertyText(property, sourceCode) {
    if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
        return renderRestElementProperty(property, sourceCode);
    }
    if (property.shorthand) {
        return sourceCode.getText(property);
    }
    const keyText = renderPropertyKey(property, sourceCode);
    const value = property.value;
    if (value.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        return renderPropertyWithAssignment(property, value, keyText, sourceCode);
    }
    if (value.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        const nested = renderObjectPatternWithDefaults(value, sourceCode);
        return `${keyText}: ${nested} = {}`;
    }
    if (value.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        const nested = renderArrayPatternWithDefaults(value, sourceCode);
        return `${keyText}: ${nested} = []`;
    }
    return `${keyText}: ${sourceCode.getText(value)}`;
}
function renderObjectProperty(property, sourceCode) {
    return formatPropertyText(property, sourceCode);
}
function renderPropertyKey(property, sourceCode) {
    return property.computed
        ? `[${sourceCode.getText(property.key)}]`
        : sourceCode.getText(property.key);
}
function renderPropertyWithAssignment(property, value, keyText, sourceCode) {
    const left = value.left;
    if (!property.computed &&
        property.key.type === utils_1.AST_NODE_TYPES.Identifier &&
        left.type === utils_1.AST_NODE_TYPES.Identifier &&
        property.key.name === left.name) {
        return `${sourceCode.getText(property.key)} = ${sourceCode.getText(value.right)}`;
    }
    const leftText = renderPatternLeft(left, sourceCode);
    return `${keyText}: ${leftText} = ${sourceCode.getText(value.right)}`;
}
function renderPatternLeft(node, sourceCode) {
    if (node.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        return renderObjectPatternWithDefaults(node, sourceCode);
    }
    if (node.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        return renderArrayPatternWithDefaults(node, sourceCode);
    }
    return sourceCode.getText(node);
}
function renderRestElementProperty(property, sourceCode) {
    const argument = property.argument;
    if (argument.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        return `...${renderObjectPatternWithDefaults(argument, sourceCode)}`;
    }
    if (argument.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
        return `...${renderArrayPatternWithDefaults(argument, sourceCode)}`;
    }
    return `...${sourceCode.getText(argument)}`;
}
function renderObjectPatternWithDefaults(pattern, sourceCode) {
    const properties = pattern.properties.map((property) => {
        if (property.type === utils_1.AST_NODE_TYPES.Property) {
            return renderObjectProperty(property, sourceCode);
        }
        if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
            return renderRestElementProperty(property, sourceCode);
        }
        return sourceCode.getText(property);
    });
    return `{ ${properties.join(', ')} }`;
}
function getSafePropertyText(property, sourceCode) {
    return formatPropertyText(property, sourceCode);
}
function dependencyElements(depsArray, sourceCode) {
    return depsArray.elements
        .filter((element) => Boolean(element))
        .map((element) => sourceCode.getText(element));
}
function callbackUsesBaseIdentifier(callback, baseName, excludedDeclarations, excludedInits, visitorKeys) {
    const stack = [callback.body];
    while (stack.length) {
        const current = stack.pop();
        if (!current)
            continue;
        if (excludedDeclarations.has(current)) {
            continue;
        }
        if (excludedInits.has(current)) {
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.Identifier &&
            current.name === baseName &&
            isIdentifierReference(current)) {
            return true;
        }
        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') {
                        stack.push(child);
                    }
                }
            }
            else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
    return false;
}
function testContainsObjectMember(testNode, objectName, visitorKeys) {
    let found = false;
    const stack = [testNode];
    while (stack.length && !found) {
        const current = stack.pop();
        if (!current)
            continue;
        if (current.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            current.object &&
            (() => {
                let base = current.object;
                while (base.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    base = base.object;
                }
                return (base.type === utils_1.AST_NODE_TYPES.Identifier && base.name === objectName);
            })()) {
            found = true;
            break;
        }
        if (current.type === utils_1.AST_NODE_TYPES.Identifier &&
            current.name === objectName &&
            isIdentifierReference(current)) {
            found = true;
            break;
        }
        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') {
                        stack.push(child);
                    }
                }
            }
            else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
    return found;
}
function isTypeNarrowingContext(node, baseName, visitorKeys) {
    if (!baseName)
        return false;
    let current = node.parent;
    while (current && current.type !== utils_1.AST_NODE_TYPES.Program) {
        if (current.type === utils_1.AST_NODE_TYPES.IfStatement && current.test) {
            if (testContainsObjectMember(current.test, baseName, visitorKeys)) {
                return true;
            }
        }
        current = current.parent;
    }
    return false;
}
function getIndentation(node, sourceCode) {
    const text = sourceCode.getText();
    const lineStart = text.lastIndexOf('\n', node.range[0]) + 1;
    const prefix = text.slice(lineStart, node.range[0]);
    const match = prefix.match(/^[\t ]*/);
    return match ? match[0] : '';
}
function removalRange(node, sourceCode) {
    const text = sourceCode.getText();
    const range = node.range;
    const lineStart = text.lastIndexOf('\n', range[0] - 1) + 1;
    const lineEnd = text.indexOf('\n', range[1]);
    const endOfLine = lineEnd === -1 ? text.length : lineEnd;
    const leading = text.slice(lineStart, range[0]);
    const trailing = text.slice(range[1], endOfLine);
    if (/^[\t ]*$/.test(leading) && /^[\t ;]*$/.test(trailing)) {
        return [lineStart, lineEnd === -1 ? text.length : lineEnd + 1];
    }
    if (/^[\t ;]*$/.test(trailing)) {
        return [range[0], lineEnd === -1 ? text.length : lineEnd + 1];
    }
    if (text[range[1]] === ' ') {
        return [range[0], range[1] + 1];
    }
    return [range[0], range[1]];
}
function isAnyFunctionLikeNode(node) {
    return (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.TSDeclareFunction);
}
function shouldSkipNestedFunction(candidateNode, callback) {
    return isAnyFunctionLikeNode(candidateNode) && candidateNode !== callback;
}
function hasCrossGroupNameCollision(groups) {
    const nameToObjects = new Map();
    for (const group of groups.values()) {
        for (const name of group.names) {
            const seen = nameToObjects.get(name) ?? new Set();
            seen.add(group.objectText);
            nameToObjects.set(name, seen);
            if (seen.size > 1) {
                return true;
            }
        }
    }
    return false;
}
function hasPriorConditionalGuard(node, baseName, visitorKeys) {
    if (!baseName)
        return false;
    const parent = node.parent;
    if (!parent || parent.type !== utils_1.AST_NODE_TYPES.BlockStatement)
        return false;
    const index = parent.body.indexOf(node);
    if (index <= 0)
        return false;
    return parent.body
        .slice(0, index)
        .some((statement) => statement.type === utils_1.AST_NODE_TYPES.IfStatement &&
        Boolean(statement.test) &&
        testContainsObjectMember(statement.test, baseName, visitorKeys));
}
function isIdentifierReference(node) {
    const parent = node.parent;
    if (!parent)
        return true;
    if (parent.type === utils_1.AST_NODE_TYPES.Property &&
        parent.key === node &&
        !parent.computed &&
        !parent.shorthand) {
        return false;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        parent.property === node &&
        !parent.computed) {
        return false;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
        parent.key === node &&
        !parent.computed) {
        return false;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
        parent.key === node &&
        !parent.computed) {
        return false;
    }
    return true;
}
function buildDestructuringGroups(callback, depTextSet, visitorKeys, sourceCode) {
    const groups = new Map();
    const stack = [...callback.body.body].reverse();
    while (stack.length) {
        const current = stack.pop();
        if (!current)
            continue;
        if (shouldSkipNestedFunction(current, callback)) {
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of current.declarations) {
                if (declarator.id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                    declarator.init &&
                    isAllowedInit(declarator.init) &&
                    current.declarations.length === 1 &&
                    !declarator.id.properties.some((prop) => prop.type === utils_1.AST_NODE_TYPES.RestElement)) {
                    const initText = sourceCode.getText(declarator.init);
                    const normalizedInit = unwrapTsExpression(declarator.init);
                    const normalizedText = sourceCode.getText(normalizedInit);
                    const depKey = depTextSet.has(initText)
                        ? initText
                        : depTextSet.has(normalizedText)
                            ? normalizedText
                            : null;
                    if (!depKey)
                        continue;
                    const baseName = getBaseIdentifier(declarator.init);
                    if (hasPriorConditionalGuard(current, baseName, visitorKeys) ||
                        isTypeNarrowingContext(current, baseName, visitorKeys)) {
                        continue;
                    }
                    const existingGroup = groups.get(depKey);
                    const properties = existingGroup?.properties ?? new Map();
                    collectProperties(declarator.id, sourceCode, visitorKeys, properties);
                    const names = existingGroup?.names ?? new Set();
                    const orderedNames = existingGroup?.orderedNames ?? [];
                    collectNamesFromPattern(declarator.id, names, orderedNames);
                    const declarations = existingGroup?.declarations ?? [];
                    declarations.push(current);
                    const inits = existingGroup?.inits ?? [];
                    inits.push(declarator.init);
                    groups.set(depKey, {
                        objectText: initText,
                        properties,
                        names,
                        orderedNames,
                        declarations,
                        inits,
                        baseName: existingGroup?.baseName ?? baseName ?? null,
                    });
                }
            }
        }
        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
            const value = current[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') {
                        stack.push(child);
                    }
                }
            }
            else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
    return groups;
}
function validateGroupsForHoisting(groups, callback, scope, visitorKeys, reservedNamesByScope) {
    if (hasCrossGroupNameCollision(groups)) {
        return null;
    }
    const declarationsToRemove = new Set();
    const initsToIgnore = new Set();
    for (const group of groups.values()) {
        group.declarations.forEach((decl) => declarationsToRemove.add(decl));
        group.inits.forEach((init) => initsToIgnore.add(init));
    }
    const existingBindings = collectExistingBindings(callback, declarationsToRemove);
    const scopeDeclaredNames = collectBindingsInScope(scope);
    const reservedNames = reservedNamesByScope.get(scope) ?? new Set();
    const scopeNameCollisions = new Set([
        ...scopeDeclaredNames,
        ...reservedNames,
    ]);
    const callbackLocalBindings = collectCallbackLocalBindings(callback, declarationsToRemove, visitorKeys);
    for (const group of groups.values()) {
        for (const property of group.properties.values()) {
            for (const name of property.referenceNames) {
                if (callbackLocalBindings.has(name)) {
                    return null;
                }
            }
        }
    }
    for (const group of groups.values()) {
        for (const name of group.names) {
            if (existingBindings.has(name)) {
                return null;
            }
            if (scopeNameCollisions.has(name)) {
                return null;
            }
        }
    }
    for (const group of groups.values()) {
        const sortedProps = Array.from(group.properties.values()).sort((a, b) => a.order - b.order);
        const bindingNamesInHoistedPattern = new Set();
        for (const property of sortedProps) {
            for (const name of property.bindingNames) {
                if (bindingNamesInHoistedPattern.has(name)) {
                    return null;
                }
                bindingNamesInHoistedPattern.add(name);
            }
        }
        for (const name of group.names) {
            if (!bindingNamesInHoistedPattern.has(name)) {
                return null;
            }
        }
    }
    return {
        declarationsToRemove,
        initsToIgnore,
        existingBindings,
        scopeNameCollisions,
        callbackLocalBindings,
        reservedNames,
    };
}
function generateHoistingFixes(groups, callback, depsArray, depTexts, insertionStatement, sourceCode, fixer, visitorKeys, validation, orderedDependencies, reservedNamesByScope, scope) {
    const { declarationsToRemove, initsToIgnore, reservedNames } = validation;
    const indent = getIndentation(insertionStatement, sourceCode);
    const hoistedLines = [];
    const baseUsageByObject = new Map();
    for (const [depKey, group] of groups.entries()) {
        if (!group.baseName) {
            baseUsageByObject.set(depKey, true);
            continue;
        }
        const usesBase = callbackUsesBaseIdentifier(callback, group.baseName, declarationsToRemove, initsToIgnore, visitorKeys);
        baseUsageByObject.set(depKey, usesBase);
    }
    const newDepTexts = depTexts.filter((text) => {
        const group = groups.get(text);
        if (!group)
            return true;
        return baseUsageByObject.get(text) ?? true;
    });
    const updatedReservedNames = new Set(reservedNames);
    for (const group of groups.values()) {
        for (const name of group.names) {
            updatedReservedNames.add(name);
        }
    }
    for (const group of groups.values()) {
        const sortedProps = Array.from(group.properties.values()).sort((a, b) => a.order - b.order);
        const pattern = `{ ${sortedProps.map((p) => p.text).join(', ')} }`;
        hoistedLines.push(`${indent}const ${pattern} = (${group.objectText}) ?? {};`);
    }
    reservedNamesByScope.set(scope, updatedReservedNames);
    const newDepSet = new Set(newDepTexts);
    for (const name of orderedDependencies) {
        if (!newDepSet.has(name)) {
            newDepTexts.push(name);
            newDepSet.add(name);
        }
    }
    const insertAt = sourceCode.getText().lastIndexOf('\n', insertionStatement.range[0]) + 1;
    const fixes = [
        fixer.insertTextBeforeRange([insertAt, insertAt], `${hoistedLines.join('\n')}\n`),
        fixer.replaceText(depsArray, `[${newDepTexts.join(', ')}]`),
    ];
    for (const decl of declarationsToRemove) {
        fixes.push(fixer.removeRange(removalRange(decl, sourceCode)));
    }
    return fixes;
}
function validateHookForTransform(node, context) {
    const hookName = isHookCall(node);
    if (!hookName)
        return null;
    const callback = node.arguments[0];
    if (!callback ||
        !isFunctionNode(callback) ||
        callback.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
        return null;
    }
    if (callback.async)
        return null;
    const depsArray = node.arguments.length > 1 &&
        node.arguments[1] &&
        node.arguments[1].type === utils_1.AST_NODE_TYPES.ArrayExpression
        ? node.arguments[1]
        : null;
    if (!depsArray)
        return null;
    const sourceCode = context.sourceCode ??
        context.getSourceCode();
    const depTexts = dependencyElements(depsArray, sourceCode);
    const depTextSet = new Set(depTexts);
    const scope = context.getScope();
    return {
        hookName,
        callback: callback,
        depsArray,
        depTextSet,
        depTexts,
        scope,
    };
}
exports.enforceEarlyDestructuring = (0, createRule_1.createRule)({
    name: 'enforce-early-destructuring',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Hoist object destructuring out of React hooks so dependency arrays track the fields in use instead of the entire object.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            hoistDestructuring: 'What\'s wrong: "{{objectName}}" is destructured inside the {{hookName}} callback -> ' +
                'Why it matters: the deps array then tracks the whole object, so the hook can re-run for unrelated field changes and can hide stale closures -> ' +
                'How to fix: hoist the destructuring before {{hookName}} (or memoize/guard the object) and depend on the specific fields: {{dependencies}}.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.sourceCode ??
            context.getSourceCode();
        const visitorKeys = sourceCode
            .visitorKeys ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            context.visitorKeys ??
            {};
        const reservedNamesByScope = new WeakMap();
        return {
            CallExpression(node) {
                const validation = validateHookForTransform(node, context);
                if (!validation)
                    return;
                const { hookName, callback, depsArray, depTextSet, depTexts, scope } = validation;
                const groups = buildDestructuringGroups(callback, depTextSet, visitorKeys, sourceCode);
                if (!groups.size)
                    return;
                const allNames = new Set();
                const orderedDependencies = [];
                for (const group of groups.values()) {
                    for (const name of group.orderedNames) {
                        if (!allNames.has(name)) {
                            allNames.add(name);
                            orderedDependencies.push(name);
                        }
                    }
                }
                const dependencyList = orderedDependencies.length > 0
                    ? orderedDependencies.join(', ')
                    : 'the fields you use';
                const firstGroup = Array.from(groups.values())[0];
                context.report({
                    node: firstGroup.declarations[0],
                    messageId: 'hoistDestructuring',
                    data: {
                        objectName: firstGroup.objectText,
                        hookName,
                        dependencies: dependencyList,
                    },
                    fix(fixer) {
                        const insertionStatement = findInsertionStatement(node);
                        if (!insertionStatement) {
                            return null;
                        }
                        const validationResult = validateGroupsForHoisting(groups, callback, scope, visitorKeys, reservedNamesByScope);
                        if (!validationResult) {
                            return null;
                        }
                        return generateHoistingFixes(groups, callback, depsArray, depTexts, insertionStatement, sourceCode, fixer, visitorKeys, validationResult, orderedDependencies, reservedNamesByScope, scope);
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-early-destructuring.js.map