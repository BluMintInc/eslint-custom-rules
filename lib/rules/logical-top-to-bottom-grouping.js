"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logicalTopToBottomGrouping = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
const TYPE_EXPRESSION_WRAPPERS = new Set([
    utils_1.AST_NODE_TYPES.TSAsExpression,
    utils_1.AST_NODE_TYPES.TSTypeAssertion,
    utils_1.AST_NODE_TYPES.TSNonNullExpression,
    utils_1.AST_NODE_TYPES.TSSatisfiesExpression,
    utils_1.AST_NODE_TYPES.TSInstantiationExpression,
]);
function isHookLikeName(name) {
    return /^use[A-Z0-9]/.test(name);
}
function isHookCallee(callee) {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return isHookLikeName(callee.name);
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return isHookLikeName(callee.property.name);
    }
    return false;
}
function isTypeNode(node) {
    if (!node) {
        return false;
    }
    if (TYPE_EXPRESSION_WRAPPERS.has(node.type)) {
        return false;
    }
    return node.type.startsWith('TS');
}
function unwrapTypeExpression(expression) {
    switch (expression.type) {
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
        case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
        case utils_1.AST_NODE_TYPES.TSInstantiationExpression:
            return expression.expression;
        default:
            return expression;
    }
}
function isDeclarationIdentifier(node, parent) {
    if (!parent) {
        return false;
    }
    if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator && parent.id === node) {
        return true;
    }
    if ((parent.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        parent.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
        parent.id === node) {
        return true;
    }
    if ((parent.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        parent.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
        parent.params.includes(node)) {
        return true;
    }
    if ((parent.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
        parent.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration ||
        parent.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) &&
        parent.id === node) {
        return true;
    }
    return false;
}
function collectPatternDependencies(pattern, names) {
    switch (pattern.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            return;
        case utils_1.AST_NODE_TYPES.RestElement:
            collectPatternDependencies(pattern.argument, names);
            return;
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            collectUsedIdentifiers(pattern.right, names, {
                skipFunctions: true,
                includeFunctionCaptures: true,
            });
            collectPatternDependencies(pattern.left, names);
            return;
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            pattern.elements.forEach((element) => {
                if (element) {
                    collectPatternDependencies(element, names);
                }
            });
            return;
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            pattern.properties.forEach((prop) => {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    if (prop.computed && ASTHelpers_1.ASTHelpers.isNode(prop.key)) {
                        collectUsedIdentifiers(prop.key, names, {
                            skipFunctions: true,
                            includeFunctionCaptures: true,
                        });
                    }
                    collectPatternDependencies(prop.value, names);
                }
                else if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    collectPatternDependencies(prop.argument, names);
                }
            });
            return;
        default:
            return;
    }
}
function processIdentifier(identifier, names) {
    const parent = identifier.parent;
    if (shouldSkipIdentifier(identifier, parent)) {
        return;
    }
    names.add(identifier.name);
}
function shouldSkipIdentifier(identifier, parent) {
    if (isTypeNode(parent) || isDeclarationIdentifier(identifier, parent)) {
        return true;
    }
    if (parent &&
        parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        parent.property === identifier &&
        !parent.computed) {
        return true;
    }
    if (parent &&
        parent.type === utils_1.AST_NODE_TYPES.Property &&
        parent.key === identifier &&
        !parent.computed &&
        !parent.shorthand) {
        return true;
    }
    return false;
}
function shouldSkipFunction(node, skipFunctions) {
    return (skipFunctions &&
        (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression));
}
function addChildNodesToStack(node, stack) {
    for (const key of Object.keys(node)) {
        if (key === 'parent') {
            continue;
        }
        const value = node[key];
        if (Array.isArray(value)) {
            for (const element of value) {
                if (ASTHelpers_1.ASTHelpers.isNode(element)) {
                    stack.push(element);
                }
            }
        }
        else if (ASTHelpers_1.ASTHelpers.isNode(value)) {
            stack.push(value);
        }
    }
}
function traverseAst(node, { skipFunctions, visit, onSkipFunction, }) {
    const stack = [node];
    while (stack.length > 0) {
        const current = stack.pop();
        if (shouldSkipFunction(current, skipFunctions)) {
            if (onSkipFunction) {
                onSkipFunction(current);
            }
            continue;
        }
        const result = visit(current) ?? {};
        if (result.push) {
            result.push.forEach((child) => {
                if (ASTHelpers_1.ASTHelpers.isNode(child)) {
                    stack.push(child);
                }
            });
        }
        if (result.skipChildren) {
            continue;
        }
        addChildNodesToStack(current, stack);
    }
}
function unwrapIifeCallee(callee) {
    const node = callee;
    if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        return node;
    }
    if (TYPE_EXPRESSION_WRAPPERS.has(node.type) && 'expression' in node) {
        return unwrapIifeCallee(node
            .expression);
    }
    if (node.type === utils_1.AST_NODE_TYPES.ChainExpression && 'expression' in node) {
        return unwrapIifeCallee(node
            .expression);
    }
    return null;
}
function collectIifeDependencies(fn, names) {
    collectFunctionCaptures(fn, names, {
        skipFunctions: true,
        includeFunctionCaptures: true,
    });
}
function collectFunctionScopedDeclarations(node, declared) {
    traverseAst(node, {
        skipFunctions: false,
        visit(current) {
            if (current !== node &&
                (current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                return { skipChildren: true };
            }
            if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && current.id) {
                declared.add(current.id.name);
                return { skipChildren: true };
            }
            if (current.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                current.declarations.forEach((declarator) => collectDeclaredNamesFromPattern(declarator.id, declared));
            }
            if (current.type === utils_1.AST_NODE_TYPES.ClassDeclaration && current.id) {
                declared.add(current.id.name);
                return { skipChildren: true };
            }
            if (current.type === utils_1.AST_NODE_TYPES.CatchClause && current.param) {
                collectDeclaredNamesFromPattern(current.param, declared);
            }
            return undefined;
        },
    });
}
function collectFunctionCaptures(fn, names, options) {
    const declared = new Set();
    if (fn.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression && fn.id) {
        declared.add(fn.id.name);
    }
    fn.params.forEach((param) => collectDeclaredNamesFromPattern(param, declared));
    if (fn.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        collectFunctionScopedDeclarations(fn.body, declared);
    }
    const used = new Set();
    fn.params.forEach((param) => {
        collectUsedIdentifiers(param, used, {
            skipFunctions: options.skipFunctions,
            includeFunctionCaptures: options.includeFunctionCaptures,
        });
    });
    collectUsedIdentifiers(fn.body, used, {
        skipFunctions: options.skipFunctions,
        includeFunctionCaptures: options.includeFunctionCaptures,
    });
    used.forEach((name) => {
        if (!declared.has(name)) {
            names.add(name);
        }
    });
}
function collectUsedIdentifiers(node, names, { skipFunctions, includeFunctionCaptures = false }) {
    traverseAst(node, {
        skipFunctions,
        onSkipFunction: includeFunctionCaptures
            ? createFunctionCaptureHandler(names, {
                skipFunctions,
                includeFunctionCaptures,
            })
            : undefined,
        visit(current) {
            if (current.type === utils_1.AST_NODE_TYPES.Identifier) {
                processIdentifier(current, names);
                return { skipChildren: true };
            }
            if (skipFunctions && current.type === utils_1.AST_NODE_TYPES.CallExpression) {
                processCallExpression(current, names);
            }
            return undefined;
        },
    });
}
function createFunctionCaptureHandler(names, options) {
    return (fnNode) => {
        if (fnNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            fnNode.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            fnNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
            collectFunctionCaptures(fnNode, names, {
                skipFunctions: true,
                includeFunctionCaptures: options.includeFunctionCaptures,
            });
        }
    };
}
function processCallExpression(node, names) {
    const iife = unwrapIifeCallee(node.callee);
    if (iife) {
        collectIifeDependencies(iife, names);
    }
}
function collectDeclaredNamesFromPattern(pattern, names) {
    switch (pattern.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            names.add(pattern.name);
            return;
        case utils_1.AST_NODE_TYPES.RestElement:
            collectDeclaredNamesFromPattern(pattern.argument, names);
            return;
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            collectDeclaredNamesFromPattern(pattern.left, names);
            return;
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            pattern.elements.forEach((element) => {
                if (element) {
                    collectDeclaredNamesFromPattern(element, names);
                }
            });
            return;
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            pattern.properties.forEach((prop) => {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                        names.add(prop.value.name);
                    }
                    else {
                        collectDeclaredNamesFromPattern(prop.value, names);
                    }
                }
                else if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    collectDeclaredNamesFromPattern(prop.argument, names);
                }
            });
            return;
        default:
            return;
    }
}
function getDeclaredNames(statement) {
    const names = new Set();
    if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
        statement.declarations.forEach((declarator) => {
            collectDeclaredNamesFromPattern(declarator.id, names);
        });
    }
    if (statement.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && statement.id) {
        names.add(statement.id.name);
    }
    if (statement.type === utils_1.AST_NODE_TYPES.ClassDeclaration &&
        statement.id &&
        statement.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        names.add(statement.id.name);
    }
    return names;
}
function statementReferencesAny(statement, names) {
    if (names.size === 0) {
        return false;
    }
    const found = new Set();
    collectUsedIdentifiers(statement, found, { skipFunctions: false });
    for (const name of names) {
        if (found.has(name)) {
            return true;
        }
    }
    return false;
}
function collectAssignedNamesFromPattern(target, names) {
    if (TYPE_EXPRESSION_WRAPPERS.has(target.type) &&
        'expression' in target) {
        collectAssignedNamesFromPattern(target.expression, names);
        return;
    }
    switch (target.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            names.add(target.name);
            return;
        case utils_1.AST_NODE_TYPES.MemberExpression: {
            let cursor = target
                .object;
            while (true) {
                if (TYPE_EXPRESSION_WRAPPERS.has(cursor.type) &&
                    'expression' in cursor) {
                    cursor = cursor
                        .expression;
                    continue;
                }
                if (cursor.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    cursor = cursor
                        .object;
                    continue;
                }
                break;
            }
            if (cursor.type === utils_1.AST_NODE_TYPES.Identifier) {
                names.add(cursor.name);
            }
            return;
        }
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            collectAssignedNamesFromPattern(target.left, names);
            return;
        case utils_1.AST_NODE_TYPES.RestElement:
            collectAssignedNamesFromPattern(target.argument, names);
            return;
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            target.elements.forEach((element) => {
                if (element) {
                    collectAssignedNamesFromPattern(element, names);
                }
            });
            return;
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            target.properties.forEach((prop) => {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    collectAssignedNamesFromPattern(prop.value, names);
                }
                else if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    collectAssignedNamesFromPattern(prop.argument, names);
                }
            });
            return;
        default:
            return;
    }
}
function collectMutatedIdentifiers(node, names, { skipFunctions }) {
    traverseAst(node, {
        skipFunctions,
        visit(current) {
            if (current.type === utils_1.AST_NODE_TYPES.AssignmentExpression) {
                const push = ASTHelpers_1.ASTHelpers.isNode(current.right)
                    ? [current.right]
                    : undefined;
                collectAssignedNamesFromPattern(current.left, names);
                return { skipChildren: true, push };
            }
            if (current.type === utils_1.AST_NODE_TYPES.UpdateExpression) {
                collectAssignedNamesFromPattern(current.argument, names);
                return { skipChildren: true };
            }
            return undefined;
        },
    });
}
function statementMutatesAny(statement, names) {
    if (names.size === 0) {
        return false;
    }
    const mutated = new Set();
    collectMutatedIdentifiers(statement, mutated, { skipFunctions: true });
    for (const name of names) {
        if (mutated.has(name)) {
            return true;
        }
    }
    return false;
}
/**
 * Mutations create ordering barriers: once a name is reassigned, moving statements
 * across that mutation can change observable state. Guard moves stop before the
 * first mutation to keep evaluation order stable.
 */
function isIdentifierMutated(body, name, beforeIndex) {
    const target = new Set([name]);
    let seenDeclaration = false;
    for (let index = 0; index < beforeIndex; index += 1) {
        const statement = body[index];
        if (statementMutatesAny(statement, target)) {
            return true;
        }
        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                const declaredNames = new Set();
                collectDeclaredNamesFromPattern(declarator.id, declaredNames);
                if (!declaredNames.has(name)) {
                    continue;
                }
                if (seenDeclaration && declarator.init) {
                    return true;
                }
                seenDeclaration = true;
            }
        }
    }
    return false;
}
function initializerIsSafe(expression, { allowHooks }) {
    // Hook calls are treated as impure so we never reorder React hook execution unless a callsite explicitly opts in.
    const unwrapped = unwrapTypeExpression(expression);
    if (unwrapped !== expression) {
        return initializerIsSafe(unwrapped, { allowHooks });
    }
    switch (expression.type) {
        case utils_1.AST_NODE_TYPES.Literal:
        case utils_1.AST_NODE_TYPES.Identifier:
        case utils_1.AST_NODE_TYPES.Super:
        case utils_1.AST_NODE_TYPES.ThisExpression:
            return true;
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return expression.expressions.every((exp) => initializerIsSafe(exp, { allowHooks }));
        case utils_1.AST_NODE_TYPES.MemberExpression:
            if (expression.computed) {
                return (initializerIsSafe(expression.property, {
                    allowHooks,
                }) &&
                    initializerIsSafe(expression.object, {
                        allowHooks,
                    }));
            }
            return initializerIsSafe(expression.object, {
                allowHooks,
            });
        case utils_1.AST_NODE_TYPES.ArrayExpression:
            return expression.elements.every((element) => {
                if (!element) {
                    return true;
                }
                if (element.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    return false;
                }
                return initializerIsSafe(element, {
                    allowHooks,
                });
            });
        case utils_1.AST_NODE_TYPES.ObjectExpression:
            return expression.properties.every((prop) => {
                if (prop.type !== utils_1.AST_NODE_TYPES.Property) {
                    return false;
                }
                if (prop.computed) {
                    if (!initializerIsSafe(prop.key, { allowHooks })) {
                        return false;
                    }
                }
                return initializerIsSafe(prop.value, {
                    allowHooks,
                });
            });
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            if (expression.operator === 'delete') {
                return false;
            }
            return initializerIsSafe(expression.argument, {
                allowHooks,
            });
        case utils_1.AST_NODE_TYPES.BinaryExpression:
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return (initializerIsSafe(expression.left, {
                allowHooks,
            }) &&
                initializerIsSafe(expression.right, {
                    allowHooks,
                }));
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return (initializerIsSafe(expression.test, {
                allowHooks,
            }) &&
                initializerIsSafe(expression.consequent, {
                    allowHooks,
                }) &&
                initializerIsSafe(expression.alternate, {
                    allowHooks,
                }));
        case utils_1.AST_NODE_TYPES.CallExpression: {
            if (allowHooks && isHookCallee(expression.callee)) {
                return expression.arguments.every((arg) => {
                    if (!ASTHelpers_1.ASTHelpers.isNode(arg)) {
                        return true;
                    }
                    if (arg.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                        return false;
                    }
                    return initializerIsSafe(arg, { allowHooks });
                });
            }
            return false;
        }
        case utils_1.AST_NODE_TYPES.ChainExpression:
            return initializerIsSafe(expression.expression, {
                allowHooks,
            });
        default:
            return false;
    }
}
function patternIsSafe(pattern, { allowHooks }) {
    switch (pattern.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            return true;
        case utils_1.AST_NODE_TYPES.RestElement:
            return patternIsSafe(pattern.argument, {
                allowHooks,
            });
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            return (initializerIsSafe(pattern.right, {
                allowHooks,
            }) &&
                patternIsSafe(pattern.left, { allowHooks }));
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            return pattern.elements.every((element) => !element ||
                patternIsSafe(element, { allowHooks }));
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            return pattern.properties.every((prop) => {
                if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    return patternIsSafe(prop.argument, {
                        allowHooks,
                    });
                }
                if (prop.type !== utils_1.AST_NODE_TYPES.Property) {
                    return false;
                }
                if (prop.computed && ASTHelpers_1.ASTHelpers.isNode(prop.key)) {
                    if (!initializerIsSafe(prop.key, { allowHooks })) {
                        return false;
                    }
                }
                return patternIsSafe(prop.value, { allowHooks });
            });
        default:
            return false;
    }
}
function isPureDeclaration(statement, { allowHooks }) {
    if (statement.type !== utils_1.AST_NODE_TYPES.VariableDeclaration) {
        return false;
    }
    return statement.declarations.every((declarator) => {
        if (declarator.id &&
            ASTHelpers_1.ASTHelpers.isNode(declarator.id) &&
            !patternIsSafe(declarator.id, { allowHooks })) {
            return false;
        }
        if (!declarator.init) {
            return true;
        }
        return initializerIsSafe(declarator.init, {
            allowHooks,
        });
    });
}
function statementDeclaresAny(statement, names) {
    const declared = getDeclaredNames(statement);
    for (const name of names) {
        if (declared.has(name)) {
            return true;
        }
    }
    return false;
}
function findEarliestSafeIndex(body, startIndex, dependencies, { allowHooks }) {
    // Reuse the backward scan so guard/side-effect movers stop before impure work or any declaration/reference of tracked dependencies.
    let targetIndex = startIndex;
    for (let cursor = startIndex - 1; cursor >= 0; cursor -= 1) {
        const candidate = body[cursor];
        if (!isPureDeclaration(candidate, { allowHooks })) {
            break;
        }
        if (statementDeclaresAny(candidate, dependencies)) {
            break;
        }
        if (statementReferencesAny(candidate, dependencies)) {
            break;
        }
        targetIndex = cursor;
    }
    return targetIndex;
}
function getStartWithComments(statement, sourceCode) {
    const comments = sourceCode.getCommentsBefore(statement);
    if (comments.length === 0) {
        return statement.range[0];
    }
    return comments[0].range[0];
}
function getNextStart(body, index, parent, sourceCode) {
    const nextStatement = body[index + 1];
    if (nextStatement) {
        return getStartWithComments(nextStatement, sourceCode);
    }
    const closingBraceOffset = parent.type === utils_1.AST_NODE_TYPES.BlockStatement ? 1 : 0;
    return parent.range[1] - closingBraceOffset;
}
function buildMoveFix(body, fromIndex, toIndex, parent, sourceCode, fixer) {
    const text = sourceCode.getText();
    if (toIndex < fromIndex) {
        const segmentStart = getStartWithComments(body[toIndex], sourceCode);
        const movingStart = getStartWithComments(body[fromIndex], sourceCode);
        const segmentEnd = getNextStart(body, fromIndex, parent, sourceCode);
        const before = text.slice(segmentStart, movingStart);
        const moving = text.slice(movingStart, segmentEnd).replace(/[ \t]+$/u, '');
        const newText = moving + before;
        return fixer.replaceTextRange([segmentStart, segmentEnd], newText);
    }
    const segmentStart = getStartWithComments(body[fromIndex], sourceCode);
    const movingEnd = getNextStart(body, fromIndex, parent, sourceCode);
    const segmentEnd = getStartWithComments(body[toIndex], sourceCode);
    const moving = text.slice(segmentStart, movingEnd).replace(/[ \t]+$/u, '');
    const between = text.slice(movingEnd, segmentEnd);
    const newText = between + moving;
    return fixer.replaceTextRange([segmentStart, segmentEnd], newText);
}
function truncateWithEllipsis(text, max = 60) {
    return text.length <= max ? text : `${text.slice(0, max)}…`;
}
function reportOnce({ context, reportedStatements }, statement, messageId, data, fix) {
    if (reportedStatements.has(statement)) {
        return;
    }
    reportedStatements.add(statement);
    context.report({ node: statement, messageId, data, fix });
}
function isGuardIfStatement(statement) {
    if (statement.type !== utils_1.AST_NODE_TYPES.IfStatement || statement.alternate) {
        return false;
    }
    const { consequent } = statement;
    if (consequent.type === utils_1.AST_NODE_TYPES.ReturnStatement ||
        consequent.type === utils_1.AST_NODE_TYPES.ThrowStatement ||
        consequent.type === utils_1.AST_NODE_TYPES.BreakStatement ||
        consequent.type === utils_1.AST_NODE_TYPES.ContinueStatement) {
        return true;
    }
    if (consequent.type === utils_1.AST_NODE_TYPES.BlockStatement &&
        consequent.body.length === 1 &&
        (consequent.body[0].type === utils_1.AST_NODE_TYPES.ReturnStatement ||
            consequent.body[0].type === utils_1.AST_NODE_TYPES.ThrowStatement ||
            consequent.body[0].type === utils_1.AST_NODE_TYPES.BreakStatement ||
            consequent.body[0].type === utils_1.AST_NODE_TYPES.ContinueStatement)) {
        return true;
    }
    return false;
}
function handleGuardHoists(ruleContext, body, parent) {
    const { sourceCode } = ruleContext;
    body.forEach((statement, index) => {
        if (!isGuardIfStatement(statement)) {
            return;
        }
        const guardDependencies = new Set();
        collectUsedIdentifiers(statement.test, guardDependencies, {
            skipFunctions: true,
            includeFunctionCaptures: true,
        });
        collectUsedIdentifiers(statement.consequent, guardDependencies, {
            skipFunctions: true,
            includeFunctionCaptures: true,
        });
        const targetIndex = findEarliestSafeIndex(body, index, guardDependencies, {
            allowHooks: false,
        });
        if (targetIndex === index) {
            return;
        }
        reportOnce(ruleContext, statement, 'moveGuardUp', { guard: truncateWithEllipsis(sourceCode.getText(statement.test)) }, (fixer) => buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer));
    });
}
function handleDerivedGrouping(ruleContext, body, parent) {
    const declaredIndices = new Map();
    const { sourceCode } = ruleContext;
    body.forEach((statement, index) => {
        if (isVariableDeclaration(statement)) {
            processVariableDeclaration(ruleContext, statement, index, body, declaredIndices, parent, sourceCode);
        }
        trackDeclaredNames(statement, index, declaredIndices);
    });
}
function isVariableDeclaration(statement) {
    return statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration;
}
function processVariableDeclaration(ruleContext, statement, index, body, declaredIndices, parent, sourceCode) {
    const dependencies = collectDependencies(statement);
    const priorDependencies = findPriorDependencies(dependencies, declaredIndices);
    if (priorDependencies.length === 0 ||
        ruleContext.reportedStatements.has(statement)) {
        return;
    }
    const lastDependencyIndex = findLastDependencyIndex(priorDependencies, declaredIndices);
    if (lastDependencyIndex >= index - 1) {
        return;
    }
    const declaredNames = getDeclaredNames(statement);
    const priorDependencySet = new Set(priorDependencies);
    if (hasBlockers(body, lastDependencyIndex, index, priorDependencySet, declaredNames)) {
        return;
    }
    reportDerivedGroupingViolation(ruleContext, statement, priorDependencies, declaredNames, body, index, lastDependencyIndex, parent, sourceCode);
}
function collectDependencies(statement) {
    const dependencies = new Set();
    statement.declarations.forEach((declarator) => {
        collectPatternDependencies(declarator.id, dependencies);
        if (declarator.init) {
            collectUsedIdentifiers(declarator.init, dependencies, {
                skipFunctions: true,
                includeFunctionCaptures: true,
            });
        }
    });
    return dependencies;
}
function findPriorDependencies(dependencies, declaredIndices) {
    return Array.from(dependencies).filter((name) => declaredIndices.has(name));
}
function findLastDependencyIndex(priorDependencies, declaredIndices) {
    return Math.max(...priorDependencies.map((name) => declaredIndices.get(name) ?? -1));
}
function hasBlockers(body, lastDependencyIndex, currentIndex, priorDependencySet, declaredNames) {
    return body
        .slice(lastDependencyIndex + 1, currentIndex)
        .some((between) => !isPureDeclaration(between, { allowHooks: false }) ||
        statementDeclaresAny(between, priorDependencySet) ||
        statementReferencesAny(between, priorDependencySet) ||
        statementDeclaresAny(between, declaredNames) ||
        statementReferencesAny(between, declaredNames));
}
function reportDerivedGroupingViolation(ruleContext, statement, priorDependencies, declaredNames, body, currentIndex, lastDependencyIndex, parent, sourceCode) {
    const dependency = priorDependencies[0];
    const name = declaredNames.values().next().value ?? 'value';
    reportOnce(ruleContext, statement, 'groupDerived', {
        dependency,
        name,
    }, (fixer) => buildMoveFix(body, currentIndex, lastDependencyIndex + 1, parent, sourceCode, fixer));
}
function trackDeclaredNames(statement, index, declaredIndices) {
    const declared = getDeclaredNames(statement);
    declared.forEach((name) => declaredIndices.set(name, index));
}
function handleLateDeclarations(ruleContext, body, parent) {
    const { sourceCode } = ruleContext;
    body.forEach((statement, index) => {
        if (statement.type !== utils_1.AST_NODE_TYPES.VariableDeclaration ||
            statement.declarations.length !== 1) {
            return;
        }
        const [declarator] = statement.declarations;
        if (declarator.id.type !== utils_1.AST_NODE_TYPES.Identifier ||
            (declarator.init &&
                declarator.init.type !== utils_1.AST_NODE_TYPES.Identifier &&
                declarator.init.type !== utils_1.AST_NODE_TYPES.Literal)) {
            return;
        }
        const name = declarator.id.name;
        const dependencies = new Set();
        if (declarator.init && declarator.init.type === utils_1.AST_NODE_TYPES.Identifier) {
            dependencies.add(declarator.init.name);
        }
        const nameSet = new Set([name]);
        let usageIndex = -1;
        for (let cursor = index + 1; cursor < body.length; cursor += 1) {
            if (statementReferencesAny(body[cursor], nameSet)) {
                usageIndex = cursor;
                break;
            }
        }
        if (usageIndex === -1 || usageIndex <= index + 1) {
            return;
        }
        const intervening = body.slice(index + 1, usageIndex);
        // Only move across pure declarations that do not mention the placeholder or its initializer dependencies to avoid changing closure timing or TDZ behavior.
        const crossesImpureOrTracked = intervening.some((stmt) => {
            if (!isPureDeclaration(stmt, { allowHooks: false })) {
                return true;
            }
            if (statementDeclaresAny(stmt, nameSet) ||
                statementMutatesAny(stmt, nameSet)) {
                return true;
            }
            if (dependencies.size > 0 &&
                (statementDeclaresAny(stmt, dependencies) ||
                    statementReferencesAny(stmt, dependencies) ||
                    statementMutatesAny(stmt, dependencies))) {
                return true;
            }
            return false;
        });
        if (crossesImpureOrTracked) {
            return;
        }
        reportOnce(ruleContext, statement, 'moveDeclarationCloser', { name }, (fixer) => buildMoveFix(body, index, usageIndex, parent, sourceCode, fixer));
    });
}
function extractCallExpression(expression) {
    if (expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
        return expression;
    }
    if (expression.type === utils_1.AST_NODE_TYPES.ChainExpression &&
        expression.expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
        return expression.expression;
    }
    return null;
}
function collectFunctionBodyDependencies(fn, dependencies, context) {
    if (!fn.body) {
        return true;
    }
    collectFunctionCaptures(fn, dependencies, {
        skipFunctions: true,
        includeFunctionCaptures: true,
    });
    let resolved = true;
    traverseAst(fn.body, {
        skipFunctions: true,
        visit(current) {
            if (current.type !== utils_1.AST_NODE_TYPES.CallExpression &&
                current.type !== utils_1.AST_NODE_TYPES.ChainExpression) {
                return undefined;
            }
            const callExpression = current.type === utils_1.AST_NODE_TYPES.CallExpression
                ? current
                : extractCallExpression(current);
            if (!callExpression) {
                return undefined;
            }
            const nestedResolved = collectCalleeDependencies(context.body, callExpression.callee, dependencies, context.callIndex, context.visitedCallees);
            if (!nestedResolved) {
                resolved = false;
                return { skipChildren: true };
            }
            return undefined;
        },
    });
    return resolved;
}
function resolveValueForIdentifier(body, name, beforeIndex) {
    for (let index = Math.min(beforeIndex, body.length) - 1; index >= 0; index -= 1) {
        const statement = body[index];
        if (statement.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
            for (const declarator of statement.declarations) {
                if (declarator.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    declarator.id.name === name &&
                    declarator.init &&
                    ASTHelpers_1.ASTHelpers.isNode(declarator.init)) {
                    return declarator.init;
                }
            }
        }
        if (statement.type === utils_1.AST_NODE_TYPES.ClassDeclaration &&
            statement.id?.name === name) {
            return statement;
        }
        if (statement.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
            statement.expression.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
            statement.expression.left.type === utils_1.AST_NODE_TYPES.Identifier &&
            statement.expression.left.name === name &&
            ASTHelpers_1.ASTHelpers.isNode(statement.expression.right)) {
            return statement.expression.right;
        }
    }
    return null;
}
function resolveValueNode(body, node, visited, beforeIndex) {
    if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
        if (visited.has(node.name)) {
            return null;
        }
        visited.add(node.name);
        const resolved = resolveValueForIdentifier(body, node.name, beforeIndex);
        if (!resolved) {
            return null;
        }
        return resolveValueNode(body, resolved, visited, beforeIndex);
    }
    if (node.type === utils_1.AST_NODE_TYPES.NewExpression &&
        node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        const resolvedClass = resolveValueForIdentifier(body, node.callee.name, beforeIndex);
        if (resolvedClass &&
            (resolvedClass.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
                resolvedClass.type === utils_1.AST_NODE_TYPES.ClassExpression)) {
            return resolvedClass;
        }
    }
    return node;
}
function resolveMemberFunction(body, member, beforeIndex) {
    if (member.computed || member.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const path = [];
    let cursor = member;
    while (cursor &&
        cursor.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !cursor.computed &&
        cursor.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        path.unshift(cursor.property.name);
        cursor = cursor.object;
    }
    if (!cursor || cursor.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    path.unshift(cursor.name);
    const [root, ...segments] = path;
    const initialValue = resolveValueForIdentifier(body, root, beforeIndex);
    if (!initialValue) {
        return null;
    }
    const visited = new Set([root]);
    return descend(resolveValueNode(body, initialValue, visited, beforeIndex), segments, visited);
    function descend(value, remaining, visitedNames) {
        if (!value) {
            return null;
        }
        if (remaining.length === 0) {
            if (value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                return value;
            }
            return null;
        }
        const [segment, ...rest] = remaining;
        if (value.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
            const property = value.properties.find((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                !prop.computed &&
                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                prop.key.name === segment);
            if (!property) {
                return null;
            }
            const resolved = resolveValueNode(body, property.value, visitedNames, beforeIndex);
            return descend(resolved, rest, visitedNames);
        }
        if (value.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            value.type === utils_1.AST_NODE_TYPES.ClassExpression) {
            const method = value.body.body.find((memberDef) => memberDef.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                !memberDef.computed &&
                memberDef.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                memberDef.key.name === segment);
            if (!method) {
                return null;
            }
            const resolved = resolveValueNode(body, method.value, visitedNames, beforeIndex);
            return descend(resolved, rest, visitedNames);
        }
        return null;
    }
}
function getMemberCalleeKey(member) {
    if (member.computed || member.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const parts = [member.property.name];
    let cursor = member.object;
    while (cursor.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !cursor.computed &&
        cursor.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        parts.unshift(cursor.property.name);
        cursor = cursor.object;
    }
    if (cursor.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    parts.unshift(cursor.name);
    return parts.join('.');
}
function unwrapCalleeExpression(callee) {
    let current = callee;
    while (true) {
        if (TYPE_EXPRESSION_WRAPPERS.has(current.type) && 'expression' in current) {
            current = current.expression;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.ChainExpression &&
            'expression' in current) {
            current = current.expression;
            continue;
        }
        break;
    }
    return current;
}
function collectCalleeDependencies(body, callee, dependencies, callIndex, visitedCallees = new Set()) {
    const unwrappedCallee = unwrapCalleeExpression(callee);
    if (unwrappedCallee !== callee) {
        return collectCalleeDependencies(body, unwrappedCallee, dependencies, callIndex, visitedCallees);
    }
    if (callee.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        callee.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        return collectFunctionBodyDependencies(callee, dependencies, {
            body,
            callIndex,
            visitedCallees,
        });
    }
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        const name = callee.name;
        if (visitedCallees.has(name)) {
            return true;
        }
        visitedCallees.add(name);
        if (isIdentifierMutated(body, name, callIndex)) {
            return false;
        }
        // Function declarations are hoisted, and duplicate declarations bind the name to the last
        // declaration in source order. Scanning from the end also finds the implementation in
        // TypeScript overloads (where earlier signatures omit the body).
        let functionDeclaration = null;
        for (let index = body.length - 1; index >= 0; index -= 1) {
            const statement = body[index];
            const declaration = statement.type === utils_1.AST_NODE_TYPES.FunctionDeclaration
                ? statement
                : statement.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration &&
                    statement.declaration?.type === utils_1.AST_NODE_TYPES.FunctionDeclaration
                    ? statement.declaration
                    : null;
            if (declaration?.id?.name !== name) {
                continue;
            }
            functionDeclaration = declaration;
            if (functionDeclaration.body) {
                break;
            }
        }
        if (functionDeclaration?.body) {
            return collectFunctionBodyDependencies(functionDeclaration, dependencies, {
                body,
                callIndex,
                visitedCallees,
            });
        }
        for (let index = callIndex - 1; index >= 0; index -= 1) {
            const statement = body[index];
            if (statement.type !== utils_1.AST_NODE_TYPES.VariableDeclaration) {
                continue;
            }
            for (const declarator of statement.declarations) {
                if (declarator.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    declarator.id.name === name &&
                    declarator.init &&
                    (declarator.init.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        declarator.init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                    return collectFunctionBodyDependencies(declarator.init, dependencies, {
                        body,
                        callIndex,
                        visitedCallees,
                    });
                }
            }
        }
        return true;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        const memberKey = getMemberCalleeKey(callee);
        if (memberKey) {
            if (visitedCallees.has(memberKey)) {
                return true;
            }
            visitedCallees.add(memberKey);
        }
        const rootName = callee.object.type === utils_1.AST_NODE_TYPES.Identifier
            ? callee.object.name
            : null;
        if (rootName && isIdentifierMutated(body, rootName, callIndex)) {
            return false;
        }
        const memberFunction = resolveMemberFunction(body, callee, callIndex);
        if (memberFunction) {
            return collectFunctionBodyDependencies(memberFunction, dependencies, {
                body,
                callIndex,
                visitedCallees,
            });
        }
        if (rootName) {
            const declaredBeforeCall = body
                .slice(0, callIndex)
                .some((statement) => statementDeclaresAny(statement, new Set([rootName])));
            if (declaredBeforeCall) {
                return false;
            }
        }
        return true;
    }
    return false;
}
function isSideEffectExpression(statement) {
    if (statement.type !== utils_1.AST_NODE_TYPES.ExpressionStatement) {
        return false;
    }
    return Boolean(extractCallExpression(statement.expression));
}
function handleSideEffects(ruleContext, body, parent) {
    const { sourceCode } = ruleContext;
    body.forEach((statement, index) => {
        if (!isSideEffectExpression(statement)) {
            return;
        }
        const expression = statement.expression;
        const callExpression = extractCallExpression(expression);
        if (!callExpression) {
            return;
        }
        if (isHookCallee(callExpression.callee)) {
            return;
        }
        const dependencies = new Set();
        collectUsedIdentifiers(expression, dependencies, {
            skipFunctions: true,
            includeFunctionCaptures: true,
        });
        const calleeResolved = collectCalleeDependencies(body, callExpression.callee, dependencies, index);
        if (!calleeResolved) {
            return;
        }
        const targetIndex = findEarliestSafeIndex(body, index, dependencies, {
            allowHooks: false,
        });
        if (targetIndex === index) {
            return;
        }
        const effectText = truncateWithEllipsis(sourceCode.getText(statement).trim());
        reportOnce(ruleContext, statement, 'moveSideEffect', { effect: effectText }, (fixer) => buildMoveFix(body, index, targetIndex, parent, sourceCode, fixer));
    });
}
function handleBlock(ruleContext, node) {
    const statements = node.body;
    handleGuardHoists(ruleContext, statements, node);
    handleDerivedGrouping(ruleContext, statements, node);
    handleLateDeclarations(ruleContext, statements, node);
    handleSideEffects(ruleContext, statements, node);
}
exports.logicalTopToBottomGrouping = (0, createRule_1.createRule)({
    name: 'logical-top-to-bottom-grouping',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce logical top-to-bottom grouping of related statements',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            moveGuardUp: `What's wrong: the guard "{{guard}}" appears after setup it can skip. Why it matters: readers miss the early-exit path and unnecessary work may execute; unsafe reordering can also introduce TDZ errors when guards reference values declared below. How to fix: place the guard immediately before the setup it protects.`,
            groupDerived: `What's wrong: "{{name}}" depends on "{{dependency}}" but is separated by unrelated statements. Why it matters: scattered dependencies make the input→output flow harder to follow and increase cognitive load; grouping them clarifies the logical relationship. How to fix: move "{{name}}" next to "{{dependency}}" so they form a cohesive unit.`,
            moveDeclarationCloser: `What's wrong: "{{name}}" is declared far from its first use. Why it matters: distant declarations scatter the flow and make the execution order harder to follow; readers must mentally track when the variable becomes available. How to fix: move "{{name}}" next to its first usage.`,
            moveSideEffect: `What's wrong: the side effect "{{effect}}" is buried after unrelated setup. Why it matters: chronological flow becomes unclear and readers may assume the effect happens later than it actually does. How to fix: emit observable effects before unrelated initialization to keep the temporal order obvious.`,
        },
    },
    defaultOptions: [],
    create(context) {
        // Prefer context.sourceCode when present to avoid deprecated getSourceCode() while remaining
        // compatible with ESLint versions that omit the property.
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const ruleContext = {
            context,
            sourceCode,
            reportedStatements: new WeakSet(),
        };
        const visitBlock = (node) => handleBlock(ruleContext, node);
        return {
            Program: visitBlock,
            BlockStatement: visitBlock,
        };
    },
});
//# sourceMappingURL=logical-top-to-bottom-grouping.js.map