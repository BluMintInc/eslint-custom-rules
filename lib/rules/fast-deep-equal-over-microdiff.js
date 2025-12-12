"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastDeepEqualOverMicrodiff = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.fastDeepEqualOverMicrodiff = (0, createRule_1.createRule)({
    name: 'fast-deep-equal-over-microdiff',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using fast-deep-equal for equality checks instead of microdiff',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useFastDeepEqual: 'Use fast-deep-equal for equality checks instead of microdiff.length === 0',
            addFastDeepEqualImport: 'Import isEqual from fast-deep-equal for equality checks',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        let hasFastDeepEqualImport = false;
        let hasMicrodiffImport = false;
        let microdiffImportName = 'diff';
        let fastDeepEqualImportName = 'isEqual';
        const reportedNodes = new Set();
        let plannedFastDeepEqualImport = false;
        const isChainExpression = (node) => node.type === utils_1.AST_NODE_TYPES.ChainExpression;
        function isMicrodiffCallee(callee) {
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                callee.name === microdiffImportName) {
                return true;
            }
            if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !callee.computed &&
                callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                callee.object.name === microdiffImportName &&
                callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                (callee.property.name === 'diff' || callee.property.name === 'default')) {
                return true;
            }
            return false;
        }
        /**
         * Resolve an identifier to its variable and return the initializer CallExpression if it's a microdiff call.
         */
        function findVariableInScopeChain(identifier) {
            // Use scopeManager to resolve variable from the identifier's reference
            const scopeManager = sourceCode.scopeManager;
            if (!scopeManager)
                return undefined;
            // Find the scope for this identifier
            let scope = null;
            let currentNode = identifier;
            while (currentNode) {
                scope = scopeManager.acquire(currentNode, true) || null;
                if (scope)
                    break;
                currentNode = currentNode.parent;
            }
            if (!scope) {
                scope = scopeManager.globalScope;
            }
            if (!scope)
                return undefined;
            // Look up variable in the scope chain
            let currentScope = scope;
            while (currentScope) {
                const variable = currentScope.variables.find((v) => v.name === identifier.name);
                if (variable)
                    return variable;
                currentScope = currentScope.upper;
            }
            return undefined;
        }
        function resolveIdentifierToMicrodiffCall(identifier) {
            // Look for a reference in the current scope chain
            const variable = findVariableInScopeChain(identifier);
            if (!variable)
                return undefined;
            const defNode = variable.defs[0]?.node;
            if (!defNode)
                return undefined;
            // Variable declarator with initializer call
            if (defNode.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                const { init } = defNode;
                if (init &&
                    init.type === utils_1.AST_NODE_TYPES.CallExpression &&
                    init.callee &&
                    init.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    init.callee.name === microdiffImportName) {
                    return init;
                }
            }
            return undefined;
        }
        /**
         * Determine if the given variable is used only for `.length` property accesses.
         * If there is any non-length usage (e.g., indexing, iteration, method calls), return false.
         */
        function isVariableOnlyUsedForLength(identifier) {
            // Walk up scope chain to find a reference for this identifier
            const variable = findVariableInScopeChain(identifier);
            if (!variable)
                return false;
            // All references must be strictly of the form <id>.length, except the variable's own declaration
            return variable.references.every((reference) => {
                const idNode = reference.identifier;
                const parent = idNode.parent;
                if (!parent)
                    return false;
                // Allow the declaration id (not considered a read)
                if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    parent.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    parent.id === idNode) {
                    return true;
                }
                // Accept only the specific pattern: Identifier used as object in MemberExpression with property `length`
                if (parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    parent.object === idNode &&
                    !parent.computed &&
                    parent.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    parent.property.name === 'length') {
                    return true;
                }
                // Accept optional chaining: identifier?.length represented as ChainExpression
                if (parent.type === utils_1.AST_NODE_TYPES.ChainExpression &&
                    parent.expression.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    parent.expression.object === idNode &&
                    !parent.expression.computed &&
                    parent.expression.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    parent.expression.property.name === 'length') {
                    return true;
                }
                return false;
            });
        }
        /**
         * If a MemberExpression is `<something>.length`, returns the underlying microdiff call if applicable.
         * Supports direct `diff(a,b).length` and `changes.length` where `changes` is initialized to a microdiff call.
         */
        function getMicrodiffCallFromLengthAccess(member) {
            if (!hasMicrodiffImport)
                return { viaIdentifier: false };
            if (member.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
                member.property.name !== 'length') {
                return { viaIdentifier: false };
            }
            const obj = member.object;
            if (obj.type === utils_1.AST_NODE_TYPES.CallExpression &&
                isMicrodiffCallee(obj.callee)) {
                return { diffCall: obj, viaIdentifier: false };
            }
            if (obj.type === utils_1.AST_NODE_TYPES.Identifier) {
                const resolved = resolveIdentifierToMicrodiffCall(obj);
                if (!resolved)
                    return { viaIdentifier: true };
                // Ensure the identifier is only used for `.length` accesses (no content-based usage)
                if (!isVariableOnlyUsedForLength(obj)) {
                    return { viaIdentifier: true };
                }
                return { diffCall: resolved, viaIdentifier: true };
            }
            return { viaIdentifier: false };
        }
        /**
         * Check if a node is a microdiff equality check pattern
         * Looks for patterns like:
         * - diff(a, b).length === 0
         * - 0 === diff(a, b).length
         * - changes.length === 0 (where `changes = diff(a,b)` and changes is only used for length checks)
         * - changes.length !== 0
         * - !diff(a, b).length
         * - !changes.length
         */
        function isMicrodiffEqualityCheck(node) {
            // Check for binary expressions comparing length to 0 (both directions)
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                const operators = [
                    '===',
                    '==',
                    '!==',
                    '!=',
                ];
                if (operators.includes(node.operator)) {
                    // side A: MemberExpression .length, side B: 0
                    if (node.right.type === utils_1.AST_NODE_TYPES.Literal &&
                        node.right.value === 0 &&
                        node.left.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        const { diffCall } = getMicrodiffCallFromLengthAccess(node.left);
                        if (diffCall) {
                            return {
                                isEquality: node.operator === '===' || node.operator === '==',
                                diffCall,
                            };
                        }
                    }
                    // side A: 0, side B: MemberExpression .length
                    if (node.left.type === utils_1.AST_NODE_TYPES.Literal &&
                        node.left.value === 0 &&
                        node.right.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                        const { diffCall } = getMicrodiffCallFromLengthAccess(node.right);
                        if (diffCall) {
                            return {
                                isEquality: node.operator === '===' || node.operator === '==',
                                diffCall,
                            };
                        }
                    }
                }
            }
            // Check for unary expressions like !diff(a, b).length or !changes.length (including optional chaining)
            if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                node.operator === '!') {
                const argumentNode = node.argument;
                const target = isChainExpression(argumentNode)
                    ? argumentNode.expression
                    : argumentNode;
                if (target.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                    const { diffCall } = getMicrodiffCallFromLengthAccess(target);
                    if (diffCall) {
                        return {
                            isEquality: true,
                            diffCall,
                        };
                    }
                }
            }
            // Not a microdiff equality check
            return { isEquality: false };
        }
        /**
         * Try to find the identifier used as `<id>.length` for the given equality node
         */
        function getLengthIdentifierFromNode(node) {
            if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                const left = node.left;
                const right = node.right;
                const isLengthMember = (n) => n.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !n.computed &&
                    n.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    n.property.name === 'length';
                if (isLengthMember(left) &&
                    left.object.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return left.object;
                }
                if (isLengthMember(right) &&
                    right.object.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return right.object;
                }
            }
            if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression) {
                const arg = node.argument;
                if (arg.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    !arg.computed &&
                    arg.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    arg.property.name === 'length' &&
                    arg.object.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return arg.object;
                }
            }
            return undefined;
        }
        /**
         * Get the indentation at the start of the current line for a node
         */
        function getLineBaseIndent(node) {
            const text = sourceCode.text;
            const start = node.range?.[0] ?? sourceCode.getIndexFromLoc(node.loc.start);
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            let i = lineStart;
            let indent = '';
            while (i < text.length) {
                const ch = text[i];
                if (ch === ' ' || ch === '\t') {
                    indent += ch;
                    i++;
                }
                else {
                    break;
                }
            }
            return indent;
        }
        /**
         * Create a fix for replacing microdiff equality check with fast-deep-equal
         */
        function createFix(fixer, node, diffCall, isEquality) {
            const args = diffCall.arguments;
            if (args.length !== 2) {
                return null; // Can't fix if not exactly 2 arguments
            }
            const arg1 = sourceCode.getText(args[0]);
            const arg2 = sourceCode.getText(args[1]);
            const fixes = [];
            // Add import if needed (only once across all fixes in this file)
            if (!hasFastDeepEqualImport && !plannedFastDeepEqualImport) {
                const importDeclarations = sourceCode.ast.body.filter((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                const microdiffImport = importDeclarations.find((node) => node.source.value === 'microdiff');
                if (microdiffImport) {
                    fixes.push(fixer.insertTextAfter(microdiffImport, `\nimport ${fastDeepEqualImportName} from 'fast-deep-equal';`));
                    plannedFastDeepEqualImport = true;
                }
                else {
                    const lastImport = importDeclarations[importDeclarations.length - 1];
                    if (lastImport) {
                        fixes.push(fixer.insertTextAfter(lastImport, `\nimport ${fastDeepEqualImportName} from 'fast-deep-equal';`));
                    }
                    else {
                        fixes.push(fixer.insertTextBeforeRange([0, 0], `import ${fastDeepEqualImportName} from 'fast-deep-equal';\n`));
                    }
                    plannedFastDeepEqualImport = true;
                }
            }
            // If the equality was via an identifier like `changes.length`, and that identifier
            // is declared as `const changes = diff(...);` and used ONLY for `.length` checks,
            // remove the redundant variable declaration.
            const maybeIdentifier = getLengthIdentifierFromNode(node);
            if (maybeIdentifier && isVariableOnlyUsedForLength(maybeIdentifier)) {
                const variable = findVariableInScopeChain(maybeIdentifier);
                const defNode = variable?.defs?.[0]?.node;
                if (defNode &&
                    defNode.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    defNode.parent &&
                    defNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                    const declaration = defNode.parent;
                    // Only remove if it's the only declaration in the const/let statement
                    if (declaration.declarations.length === 1) {
                        const text = sourceCode.text;
                        const startOfLine = text.lastIndexOf('\n', declaration.range[0] - 1) + 1;
                        const nextNewline = text.indexOf('\n', declaration.range[1]);
                        const endOfLine = nextNewline === -1 ? declaration.range[1] : nextNewline + 1;
                        fixes.push(fixer.removeRange([startOfLine, endOfLine]));
                    }
                }
            }
            // Replace the equality expression with isEqual call
            const isMultilineCall = diffCall.loc &&
                args[0].loc &&
                (diffCall.loc.start.line !== args[0].loc.start.line ||
                    (args[1] && args[0].loc.start.line !== args[1].loc.start.line));
            let replacement;
            if (isMultilineCall) {
                const baseIndent = getLineBaseIndent(node);
                const innerIndentPlus = baseIndent + '  ';
                replacement =
                    `${fastDeepEqualImportName}(` +
                        `\n${innerIndentPlus}${arg1},` +
                        `\n${innerIndentPlus}${arg2},` +
                        `\n${baseIndent})`;
            }
            else {
                replacement = `${fastDeepEqualImportName}(${arg1}, ${arg2})`;
            }
            if (!isEquality) {
                replacement = `!${replacement}`;
            }
            fixes.push(fixer.replaceText(node, replacement));
            return fixes;
        }
        return {
            // Track imports of microdiff and fast-deep-equal
            ImportDeclaration(node) {
                const importSource = node.source.value;
                // Check for microdiff import
                if (importSource === 'microdiff') {
                    hasMicrodiffImport = true;
                    // Get the local name of the imported diff function
                    node.specifiers.forEach((specifier) => {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.name === 'diff') {
                            microdiffImportName = specifier.local.name;
                        }
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) {
                            microdiffImportName = specifier.local.name;
                        }
                    });
                }
                // Check for fast-deep-equal import
                if (importSource === 'fast-deep-equal' ||
                    importSource === 'fast-deep-equal/es6') {
                    hasFastDeepEqualImport = true;
                    // Get the local name of the imported isEqual function
                    node.specifiers.forEach((specifier) => {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) {
                            fastDeepEqualImportName = specifier.local.name;
                        }
                    });
                }
            },
            // Check expressions for microdiff equality patterns
            ['BinaryExpression, UnaryExpression'](node) {
                if (!hasMicrodiffImport)
                    return;
                // Skip if we've already reported this node
                if (reportedNodes.has(node)) {
                    return;
                }
                const result = isMicrodiffEqualityCheck(node);
                const { diffCall, isEquality } = result;
                if (!diffCall)
                    return;
                reportedNodes.add(node);
                context.report({
                    node,
                    messageId: 'useFastDeepEqual',
                    fix(fixer) {
                        return createFix(fixer, node, diffCall, isEquality);
                    },
                });
            },
            // Check if statements for microdiff equality patterns
            IfStatement(node) {
                if (!hasMicrodiffImport)
                    return;
                // Skip if we've already reported this node
                if (reportedNodes.has(node.test)) {
                    return;
                }
                const result = isMicrodiffEqualityCheck(node.test);
                const { diffCall, isEquality } = result;
                if (!diffCall)
                    return;
                reportedNodes.add(node.test);
                context.report({
                    node: node.test,
                    messageId: 'useFastDeepEqual',
                    fix(fixer) {
                        return createFix(fixer, node.test, diffCall, isEquality);
                    },
                });
            },
            // Check return statements for microdiff equality patterns
            ReturnStatement(node) {
                if (!hasMicrodiffImport)
                    return;
                // Skip if we've already reported this node or if there's no argument
                const argument = node.argument;
                if (!argument || reportedNodes.has(argument)) {
                    return;
                }
                const result = isMicrodiffEqualityCheck(argument);
                const { diffCall, isEquality } = result;
                if (!diffCall)
                    return;
                reportedNodes.add(argument);
                context.report({
                    node: argument,
                    messageId: 'useFastDeepEqual',
                    fix(fixer) {
                        return createFix(fixer, argument, diffCall, isEquality);
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=fast-deep-equal-over-microdiff.js.map