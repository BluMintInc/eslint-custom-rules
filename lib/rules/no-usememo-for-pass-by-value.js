"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUsememoForPassByValue = void 0;
const utils_1 = require("@typescript-eslint/utils");
const typescript_1 = __importDefault(require("typescript"));
const createRule_1 = require("../utils/createRule");
const DEFAULT_EXPENSIVE_PATTERNS = [
    'compute',
    'calculate',
    'derive',
    'generate',
    'expensive',
    'heavy',
    'hash',
];
const PASS_BY_VALUE_FLAGS = typescript_1.default.TypeFlags.StringLike |
    typescript_1.default.TypeFlags.NumberLike |
    typescript_1.default.TypeFlags.BigIntLike |
    typescript_1.default.TypeFlags.BooleanLike |
    typescript_1.default.TypeFlags.Undefined |
    typescript_1.default.TypeFlags.Null;
function isCustomHookName(name) {
    if (!name)
        return false;
    return /^use[A-Z]/.test(name);
}
function getFunctionName(node) {
    if (node.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
        node.id?.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.id.name;
    }
    if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.parent.id.name;
    }
    return undefined;
}
function collectUseMemoImports(program) {
    const useMemoNames = new Set();
    const useMemoSpecifiers = new Map();
    const reactNamespaceNames = new Set();
    for (const statement of program.body) {
        if (statement.type !== utils_1.AST_NODE_TYPES.ImportDeclaration ||
            statement.source.value !== 'react') {
            continue;
        }
        for (const specifier of statement.specifiers) {
            if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                specifier.imported.name === 'useMemo') {
                useMemoNames.add(specifier.local.name);
                useMemoSpecifiers.set(specifier.local.name, specifier);
            }
            if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                reactNamespaceNames.add(specifier.local.name);
            }
        }
    }
    return { useMemoNames, useMemoSpecifiers, reactNamespaceNames };
}
function getReturnedExpression(callback) {
    if (callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
        if (callback.body.body.length !== 1) {
            return null;
        }
        const [onlyStatement] = callback.body.body;
        if (onlyStatement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            onlyStatement.argument) {
            return onlyStatement.argument;
        }
        return null;
    }
    return callback.body;
}
function isPassByValueType(type, checker) {
    const description = checker.typeToString(type);
    if (type.flags & (typescript_1.default.TypeFlags.Any | typescript_1.default.TypeFlags.Unknown)) {
        return { passByValue: false, indeterminate: true, description };
    }
    if (type.flags & typescript_1.default.TypeFlags.Never) {
        return { passByValue: false, indeterminate: false, description };
    }
    if (type.flags & typescript_1.default.TypeFlags.Union) {
        const unionType = type;
        let sawIndeterminate = false;
        for (const part of unionType.types) {
            const result = isPassByValueType(part, checker);
            if (result.indeterminate) {
                sawIndeterminate = true;
                break;
            }
            if (!result.passByValue) {
                return { passByValue: false, indeterminate: false, description };
            }
        }
        if (sawIndeterminate) {
            return { passByValue: false, indeterminate: true, description };
        }
        return { passByValue: true, indeterminate: false, description };
    }
    if (checker.isTupleType(type)) {
        const typeArguments = checker.getTypeArguments(type);
        let allPrimitive = true;
        let sawIndeterminate = false;
        for (const elementType of typeArguments) {
            const result = isPassByValueType(elementType, checker);
            if (result.indeterminate) {
                sawIndeterminate = true;
                break;
            }
            if (!result.passByValue) {
                allPrimitive = false;
                break;
            }
        }
        if (sawIndeterminate) {
            return { passByValue: false, indeterminate: true, description };
        }
        return { passByValue: allPrimitive, indeterminate: false, description };
    }
    if (checker.isArrayType(type) || checker.isArrayLikeType(type)) {
        const typeArguments = checker.getTypeArguments(type);
        const elementType = typeArguments[0];
        if (elementType) {
            if (elementType.flags & typescript_1.default.TypeFlags.Never) {
                // TypeScript infers [] as never[]. The array still has reference identity, but this rule
                // treats it as a primitive-only array by definition (vacuously) to avoid special-casing.
                return { passByValue: true, indeterminate: false, description };
            }
            const result = isPassByValueType(elementType, checker);
            return { ...result, description };
        }
        // Conservative: arrays with unresolvable element types are indeterminate.
        return { passByValue: false, indeterminate: true, description };
    }
    if (type.flags & PASS_BY_VALUE_FLAGS) {
        return { passByValue: true, indeterminate: false, description };
    }
    return { passByValue: false, indeterminate: false, description };
}
function getCalleeName(node) {
    if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return node.callee.name;
    }
    if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        const object = node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier
            ? node.callee.object.name
            : null;
        if (!object) {
            return node.callee.property.name;
        }
        return `${object}.${node.callee.property.name}`;
    }
    return null;
}
function matchesExpensiveCalleePattern(callback, expensiveMatchers) {
    const returnedExpression = getReturnedExpression(callback);
    if (!returnedExpression ||
        returnedExpression.type !== utils_1.AST_NODE_TYPES.CallExpression) {
        return false;
    }
    const calleeName = getCalleeName(returnedExpression);
    if (!calleeName) {
        return false;
    }
    return expensiveMatchers.some((matcher) => matcher.test(calleeName));
}
function isImportedIdentifier(identifier, resolveVariable) {
    // Treat identifiers as React bindings only when they resolve to an import.
    // This avoids unsafe auto-fixes when names like "React" or "useMemo" are shadowed
    // by parameters/locals or represent non-React values.
    const variable = resolveVariable(identifier);
    return variable?.defs.some((def) => def.type === 'ImportBinding') ?? false;
}
function isUseMemoCall(node, imports, resolveVariable) {
    if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
        imports.useMemoNames.has(node.callee.name)) {
        return isImportedIdentifier(node.callee, resolveVariable);
    }
    if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !node.callee.computed &&
        node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'useMemo' &&
        node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
        imports.reactNamespaceNames.has(node.callee.object.name) &&
        isImportedIdentifier(node.callee.object, resolveVariable)) {
        return true;
    }
    return false;
}
function scanBackwardOverWhitespace(text, position) {
    let pos = position;
    while (pos > 0 && (text[pos - 1] === ' ' || text[pos - 1] === '\t')) {
        pos -= 1;
    }
    return pos;
}
function scanForwardOverWhitespace(text, position) {
    let pos = position;
    while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) {
        pos += 1;
    }
    return pos;
}
function consumeLineBreak(text, position) {
    if (position < text.length &&
        text[position] === '\r' &&
        text[position + 1] === '\n') {
        return { consumed: true, newPosition: position + 2 };
    }
    if (position < text.length &&
        (text[position] === '\n' || text[position] === '\r')) {
        return { consumed: true, newPosition: position + 1 };
    }
    return { consumed: false, newPosition: position };
}
function hasDeclaredVariables(source) {
    return (typeof source === 'object' &&
        source !== null &&
        'getDeclaredVariables' in source &&
        typeof source
            .getDeclaredVariables === 'function');
}
function removeCompleteImport(importDeclaration, sourceCode, fixer) {
    const text = sourceCode.getText();
    let [start, end] = importDeclaration.range;
    const beforeImport = scanBackwardOverWhitespace(text, start);
    const lineBreakIndex = beforeImport - 1;
    if (lineBreakIndex >= 0 &&
        (text[lineBreakIndex] === '\n' || text[lineBreakIndex] === '\r')) {
        const lineBreakStart = text[lineBreakIndex] === '\n' &&
            lineBreakIndex > 0 &&
            text[lineBreakIndex - 1] === '\r'
            ? lineBreakIndex - 1
            : lineBreakIndex;
        const whitespaceBeforeLineBreak = scanBackwardOverWhitespace(text, lineBreakStart);
        const precedingCharIndex = whitespaceBeforeLineBreak - 1;
        const lineIsWhitespaceOnly = whitespaceBeforeLineBreak === 0 ||
            (precedingCharIndex >= 0 &&
                (text[precedingCharIndex] === '\n' ||
                    text[precedingCharIndex] === '\r'));
        start = lineIsWhitespaceOnly ? whitespaceBeforeLineBreak : beforeImport;
    }
    else {
        start = beforeImport;
    }
    const afterImportWhitespace = scanForwardOverWhitespace(text, end);
    const firstLineBreak = consumeLineBreak(text, afterImportWhitespace);
    let removalEnd = afterImportWhitespace;
    if (firstLineBreak.consumed) {
        const afterFirstBreak = firstLineBreak.newPosition;
        const spacesAfterFirst = scanForwardOverWhitespace(text, afterFirstBreak);
        const secondLineBreak = consumeLineBreak(text, spacesAfterFirst);
        if (secondLineBreak.consumed) {
            // Remove a trailing blank line but stop before consuming indentation of the next statement.
            removalEnd = secondLineBreak.newPosition;
        }
        else {
            // Keep indentation that belongs to the following statement.
            removalEnd = afterFirstBreak;
        }
    }
    return fixer.removeRange([start, removalEnd]);
}
function removePartialImport(importDeclaration, remainingSpecifiers, sourceCode, fixer) {
    const defaultSpecifier = remainingSpecifiers.find((candidate) => candidate.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
    const namespaceSpecifier = remainingSpecifiers.find((candidate) => candidate.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier);
    const namedSpecifiers = remainingSpecifiers.filter((candidate) => candidate.type === utils_1.AST_NODE_TYPES.ImportSpecifier);
    const pieces = [];
    if (defaultSpecifier) {
        pieces.push(sourceCode.getText(defaultSpecifier));
    }
    if (namespaceSpecifier) {
        pieces.push(sourceCode.getText(namespaceSpecifier));
    }
    if (namedSpecifiers.length > 0) {
        pieces.push(`{ ${namedSpecifiers
            .map((candidate) => sourceCode.getText(candidate))
            .join(', ')} }`);
    }
    const importPrefix = importDeclaration.importKind === 'type' ? 'import type ' : 'import ';
    const newImport = `${importPrefix}${pieces.join(', ')} from ${sourceCode.getText(importDeclaration.source)};`;
    return fixer.replaceText(importDeclaration, newImport);
}
function getImportRemovalFix(specifier, sourceCode, fixer) {
    const importDeclaration = specifier.parent;
    if (!importDeclaration ||
        importDeclaration.type !== utils_1.AST_NODE_TYPES.ImportDeclaration) {
        return null;
    }
    const remainingSpecifiers = importDeclaration.specifiers.filter((candidate) => candidate !== specifier);
    if (remainingSpecifiers.length === 0) {
        return removeCompleteImport(importDeclaration, sourceCode, fixer);
    }
    return removePartialImport(importDeclaration, remainingSpecifiers, sourceCode, fixer);
}
function getReplacementText(callback, sourceCode) {
    const returnedExpression = getReturnedExpression(callback);
    if (!returnedExpression) {
        return null;
    }
    if (callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement &&
        callback.body.body.length !== 1) {
        return null;
    }
    return sourceCode.getText(returnedExpression);
}
function isSafeAtomicExpression(expression) {
    switch (expression.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
        case utils_1.AST_NODE_TYPES.Literal:
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
        case utils_1.AST_NODE_TYPES.ThisExpression:
        case utils_1.AST_NODE_TYPES.Super:
        case utils_1.AST_NODE_TYPES.MemberExpression:
        case utils_1.AST_NODE_TYPES.CallExpression:
        case utils_1.AST_NODE_TYPES.NewExpression:
        case utils_1.AST_NODE_TYPES.ArrayExpression:
        case utils_1.AST_NODE_TYPES.ObjectExpression:
        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
        case utils_1.AST_NODE_TYPES.FunctionExpression:
        case utils_1.AST_NODE_TYPES.ClassExpression:
        case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
        case utils_1.AST_NODE_TYPES.UnaryExpression:
        case utils_1.AST_NODE_TYPES.UpdateExpression:
        case utils_1.AST_NODE_TYPES.AwaitExpression:
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
            return true;
        default:
            return false;
    }
}
function shouldParenthesizeReplacement(node, replacementExpression, sourceCode) {
    const alreadyParenthesized = utils_1.ASTUtils.isParenthesized(replacementExpression, sourceCode);
    const parent = node.parent;
    if (!parent) {
        return false;
    }
    if (replacementExpression.type ===
        utils_1.AST_NODE_TYPES.SequenceExpression) {
        return true;
    }
    switch (parent.type) {
        case utils_1.AST_NODE_TYPES.LogicalExpression:
        case utils_1.AST_NODE_TYPES.BinaryExpression:
            return (alreadyParenthesized || !isSafeAtomicExpression(replacementExpression));
        case utils_1.AST_NODE_TYPES.UnaryExpression:
        case utils_1.AST_NODE_TYPES.AwaitExpression:
        case utils_1.AST_NODE_TYPES.MemberExpression:
        case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
        case utils_1.AST_NODE_TYPES.ChainExpression:
            return true;
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
        case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
            return (alreadyParenthesized || !isSafeAtomicExpression(replacementExpression));
        case utils_1.AST_NODE_TYPES.CallExpression:
        case utils_1.AST_NODE_TYPES.NewExpression:
            return (alreadyParenthesized ||
                parent.callee === node ||
                replacementExpression.type === utils_1.AST_NODE_TYPES.SequenceExpression);
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            if (parent.test !== node) {
                return false;
            }
            return (alreadyParenthesized || !isSafeAtomicExpression(replacementExpression));
        case utils_1.AST_NODE_TYPES.AssignmentExpression:
            return false;
        default:
            return false;
    }
}
function getRemovableImportSpecifier(callExpression, imports, sourceCode) {
    if (callExpression.callee.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const specifier = imports.useMemoSpecifiers.get(callExpression.callee.name);
    if (!specifier) {
        return null;
    }
    const declaredVariables = hasDeclaredVariables(sourceCode)
        ? sourceCode.getDeclaredVariables(specifier)
        : sourceCode.getDeclaredVariables?.(specifier) ?? [];
    const [variable] = declaredVariables;
    if (!variable) {
        // Defer removal when scope analysis cannot resolve the import.
        return null;
    }
    const otherReferences = variable.references.filter((reference) => reference.identifier !== callExpression.callee);
    if (otherReferences.length > 0) {
        return null;
    }
    return specifier;
}
exports.noUsememoForPassByValue = (0, createRule_1.createRule)({
    name: 'no-usememo-for-pass-by-value',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow returning useMemo results from custom hooks when the memoized value is pass-by-value: primitives with value equality (string, number, boolean, null, undefined, bigint) or arrays/tuples composed exclusively of these primitives. Requires type information.',
            recommended: 'error',
            requiresTypeChecking: true,
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    allowExpensiveCalleePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        default: DEFAULT_EXPENSIVE_PATTERNS,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            primitiveMemo: 'What’s wrong: custom hook "{{hookName}}" returns useMemo wrapping a pass-by-value value ({{valueType}}) → Why it matters: memoizing pass-by-value results cannot change identity and implies stability that is not real, which misleads callers and adds noise → How to fix: inline the returned expression and remove the useMemo import if it becomes unused.',
            invalidRegex: 'What’s wrong: invalid regex pattern "{{pattern}}" in allowExpensiveCalleePatterns → Why it matters: invalid patterns prevent the rule from correctly identifying expensive computations, potentially causing false positives → How to fix: correct the regex pattern in your ESLint configuration.',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const sourceCode = context.getSourceCode();
        const parserServices = sourceCode.parserServices ?? context.parserServices;
        if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
            return {};
        }
        const { program, esTreeNodeToTSNodeMap } = parserServices;
        const checker = program.getTypeChecker();
        const imports = collectUseMemoImports(sourceCode.ast);
        const expensiveMatchers = [];
        const invalidPatterns = [];
        (context.options[0]?.allowExpensiveCalleePatterns ??
            DEFAULT_EXPENSIVE_PATTERNS).forEach((pattern) => {
            try {
                expensiveMatchers.push(new RegExp(pattern));
            }
            catch {
                invalidPatterns.push(pattern);
            }
        });
        const functionStack = [];
        const reported = new WeakSet();
        const resolveVariable = (identifier) => utils_1.ASTUtils.findVariable(context.getScope(), identifier) ?? null;
        function visitPatternNode(pattern, visitIdentifier) {
            if (pattern.type === utils_1.AST_NODE_TYPES.Identifier) {
                visitIdentifier(pattern);
                return;
            }
            if (pattern.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
                for (const element of pattern.elements) {
                    if (!element) {
                        continue;
                    }
                    visitPatternNode(element.type === utils_1.AST_NODE_TYPES.RestElement
                        ? element.argument
                        : element, visitIdentifier);
                }
                return;
            }
            if (pattern.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                for (const property of pattern.properties) {
                    if (property.type === utils_1.AST_NODE_TYPES.Property) {
                        visitPatternNode(property.value, visitIdentifier);
                        continue;
                    }
                    if (property.type === utils_1.AST_NODE_TYPES.RestElement) {
                        visitPatternNode(property.argument, visitIdentifier);
                    }
                }
                return;
            }
            if (pattern.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
                visitPatternNode(pattern.left, visitIdentifier);
            }
        }
        function traversePattern(pattern, resolveVariable, visitVariable) {
            visitPatternNode(pattern, (identifier) => {
                const variable = resolveVariable(identifier);
                if (variable) {
                    visitVariable(variable);
                }
            });
        }
        function trackPatternVariables(pattern, memoCall, currentContext, resolveVariable) {
            traversePattern(pattern, resolveVariable, (variable) => {
                currentContext.memoVariables.set(variable, memoCall);
            });
        }
        function untrackPatternVariables(pattern, currentContext, resolveVariable) {
            traversePattern(pattern, resolveVariable, (variable) => {
                currentContext.memoVariables.delete(variable);
            });
        }
        function validateUseMemoArgument(node) {
            const callback = node.arguments[0];
            if (!callback ||
                (callback.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    callback.type !== utils_1.AST_NODE_TYPES.FunctionExpression)) {
                return null;
            }
            const returnedExpression = getReturnedExpression(callback);
            if (!returnedExpression) {
                return null;
            }
            return { callback, returnedExpression };
        }
        function classifyUseMemoReturnType(node, returnedExpression) {
            const tsNode = esTreeNodeToTSNodeMap.get(node);
            if (!tsNode) {
                return null;
            }
            const type = checker.getTypeAtLocation(tsNode);
            let classification = isPassByValueType(type, checker);
            if (classification.indeterminate) {
                // When useMemo's type is indeterminate (any/unknown), the callback can still return a
                // concrete pass-by-value type. Inspect the returned expression to reduce false negatives.
                const returnedTsNode = esTreeNodeToTSNodeMap.get(returnedExpression);
                if (returnedTsNode) {
                    const returnedType = checker.getTypeAtLocation(returnedTsNode);
                    const fallbackClassification = isPassByValueType(returnedType, checker);
                    if (!fallbackClassification.indeterminate) {
                        classification = fallbackClassification;
                    }
                }
            }
            return classification;
        }
        function getUseMemoFix(node, callback, returnedExpression, fixer) {
            const replacementText = getReplacementText(callback, sourceCode);
            if (!replacementText) {
                return null;
            }
            const needsParentheses = shouldParenthesizeReplacement(node, returnedExpression, sourceCode);
            const replacement = needsParentheses
                ? `(${replacementText})`
                : replacementText;
            const specifier = getRemovableImportSpecifier(node, imports, sourceCode);
            const fixes = [fixer.replaceText(node, replacement)];
            if (specifier) {
                const removal = getImportRemovalFix(specifier, sourceCode, fixer);
                if (removal) {
                    fixes.push(removal);
                }
            }
            return fixes;
        }
        function checkUseMemoForPassByValue(node, currentContext) {
            if (!currentContext?.isHook || reported.has(node)) {
                return;
            }
            const validated = validateUseMemoArgument(node);
            if (!validated) {
                return;
            }
            const { callback, returnedExpression } = validated;
            if (matchesExpensiveCalleePattern(callback, expensiveMatchers)) {
                return;
            }
            const classification = classifyUseMemoReturnType(node, returnedExpression);
            if (!classification ||
                classification.indeterminate ||
                !classification.passByValue) {
                return;
            }
            reported.add(node);
            context.report({
                node,
                messageId: 'primitiveMemo',
                data: {
                    hookName: currentContext.hookName ?? 'this hook',
                    valueType: classification.description,
                },
                fix: (fixer) => getUseMemoFix(node, callback, returnedExpression, fixer),
            });
        }
        function analyzeExpressionList(expressions, currentContext) {
            for (const expr of expressions) {
                if (!expr) {
                    continue;
                }
                if (expr.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    analyzeReturnedValue(expr.argument, currentContext);
                    continue;
                }
                analyzeReturnedValue(expr, currentContext);
            }
        }
        function analyzeReturnedValue(expression, currentContext) {
            if (!expression || !currentContext?.isHook) {
                return;
            }
            switch (expression.type) {
                case utils_1.AST_NODE_TYPES.CallExpression:
                    if (isUseMemoCall(expression, imports, resolveVariable)) {
                        checkUseMemoForPassByValue(expression, currentContext);
                        return;
                    }
                    analyzeExpressionList(expression.arguments, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.NewExpression:
                    analyzeExpressionList(expression.arguments ?? [], currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.Identifier: {
                    const variable = resolveVariable(expression);
                    const memoCall = variable
                        ? currentContext.memoVariables.get(variable)
                        : undefined;
                    if (memoCall) {
                        checkUseMemoForPassByValue(memoCall, currentContext);
                    }
                    return;
                }
                case utils_1.AST_NODE_TYPES.ConditionalExpression:
                    analyzeReturnedValue(expression.test, currentContext);
                    analyzeReturnedValue(expression.consequent, currentContext);
                    analyzeReturnedValue(expression.alternate, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.LogicalExpression:
                    analyzeReturnedValue(expression.left, currentContext);
                    analyzeReturnedValue(expression.right, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.BinaryExpression:
                    if (expression.left.type !== utils_1.AST_NODE_TYPES.PrivateIdentifier) {
                        analyzeReturnedValue(expression.left, currentContext);
                    }
                    analyzeReturnedValue(expression.right, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.UnaryExpression:
                    analyzeReturnedValue(expression.argument, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.SequenceExpression: {
                    const lastExpression = expression.expressions[expression.expressions.length - 1];
                    analyzeReturnedValue(lastExpression, currentContext);
                    return;
                }
                case utils_1.AST_NODE_TYPES.ArrayExpression:
                    analyzeExpressionList(expression.elements, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.ObjectExpression: {
                    const propertyExpressions = expression.properties.map((property) => {
                        if (property.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                            return property.argument;
                        }
                        if (property.type === utils_1.AST_NODE_TYPES.Property && property.value) {
                            return property.value;
                        }
                        return null;
                    });
                    analyzeExpressionList(propertyExpressions, currentContext);
                    return;
                }
                case utils_1.AST_NODE_TYPES.TSAsExpression:
                case utils_1.AST_NODE_TYPES.TSTypeAssertion:
                case utils_1.AST_NODE_TYPES.TSNonNullExpression:
                case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
                case utils_1.AST_NODE_TYPES.ChainExpression:
                    analyzeReturnedValue(expression.expression, currentContext);
                    return;
                case utils_1.AST_NODE_TYPES.AwaitExpression:
                    analyzeReturnedValue(expression.argument, currentContext);
                    return;
            }
        }
        return {
            Program() {
                invalidPatterns.forEach((pattern) => {
                    context.report({
                        node: sourceCode.ast,
                        messageId: 'invalidRegex',
                        data: { pattern },
                    });
                });
            },
            FunctionDeclaration(node) {
                const name = getFunctionName(node);
                functionStack.push({
                    isHook: isCustomHookName(name),
                    hookName: name,
                    memoVariables: new WeakMap(),
                });
            },
            'FunctionDeclaration:exit'() {
                functionStack.pop();
            },
            FunctionExpression(node) {
                const name = getFunctionName(node);
                functionStack.push({
                    isHook: isCustomHookName(name),
                    hookName: name,
                    memoVariables: new WeakMap(),
                });
            },
            'FunctionExpression:exit'() {
                functionStack.pop();
            },
            ArrowFunctionExpression(node) {
                const name = getFunctionName(node);
                functionStack.push({
                    isHook: isCustomHookName(name),
                    hookName: name,
                    memoVariables: new WeakMap(),
                });
            },
            'ArrowFunctionExpression:exit'(node) {
                const currentContext = functionStack[functionStack.length - 1];
                if (currentContext?.isHook && node.expression) {
                    analyzeReturnedValue(node.body, currentContext);
                }
                functionStack.pop();
            },
            VariableDeclarator(node) {
                const currentContext = functionStack[functionStack.length - 1];
                if (!currentContext?.isHook ||
                    !node.init ||
                    node.init.type !== utils_1.AST_NODE_TYPES.CallExpression ||
                    !isUseMemoCall(node.init, imports, resolveVariable)) {
                    return;
                }
                trackPatternVariables(node.id, node.init, currentContext, resolveVariable);
            },
            AssignmentExpression(node) {
                const currentContext = functionStack[functionStack.length - 1];
                if (!currentContext?.isHook) {
                    return;
                }
                if (node.right.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    isUseMemoCall(node.right, imports, resolveVariable)) {
                    trackPatternVariables(node.left, node.right, currentContext, resolveVariable);
                    return;
                }
                if (node.operator === '=') {
                    untrackPatternVariables(node.left, currentContext, resolveVariable);
                }
            },
            ReturnStatement(node) {
                const currentContext = functionStack[functionStack.length - 1];
                if (!currentContext?.isHook) {
                    return;
                }
                analyzeReturnedValue(node.argument, currentContext);
            },
        };
    },
});
exports.default = exports.noUsememoForPassByValue;
//# sourceMappingURL=no-usememo-for-pass-by-value.js.map