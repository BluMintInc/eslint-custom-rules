"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceGlobalConstants = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ASTHelpers_1 = require("../utils/ASTHelpers");
exports.enforceGlobalConstants = (0, createRule_1.createRule)({
    name: 'enforce-global-constants',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce global static constants for React components/hooks',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useGlobalConstant: 'Object literal returned from useMemo with empty dependencies creates a new reference every render without providing memoization benefits → this wastes memory and misleads readers into thinking the value is computed → move the object to a module-level constant (e.g., const OPTIONS = { ... } as const;).',
            extractDefaultToGlobalConstant: 'Inline default value in destructuring creates a new reference on every render → this causes unnecessary re-renders in child components due to unstable identity → extract the default to a module-level constant (e.g., const DEFAULT_OPTIONS = { ... } as const;).',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.sourceCode;
        function isHookName(name) {
            return /^use[A-Z]/.test(name);
        }
        function isComponentOrHookFunction(fn) {
            if (fn.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                const n = fn.id?.name ?? '';
                return /^[A-Z]/.test(n) || isHookName(n);
            }
            const parent = fn.parent;
            if (parent &&
                parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                const n = parent.id.name;
                return /^[A-Z]/.test(n) || isHookName(n);
            }
            return false;
        }
        function getEnclosingFunction(node) {
            let current = node;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    return current;
                }
                current = current.parent;
            }
            return null;
        }
        function toUpperSnakeCase(name) {
            return name
                .replace(/([A-Z])/g, '_$1')
                .toUpperCase()
                .replace(/^_/, '');
        }
        function collectAssignmentDefaultsFromPattern(pattern) {
            const results = [];
            const visitPattern = (p) => {
                if (p.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    for (const prop of p.properties) {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                            const value = prop.value;
                            if (value &&
                                value.type ===
                                    utils_1.AST_NODE_TYPES.AssignmentPattern) {
                                const assign = value;
                                const left = assign.left;
                                if (left.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    results.push({ assignment: assign, localName: left.name });
                                }
                                if (left.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                                    left.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
                                    // Nested pattern on the left of an assignment; uncommon, ignore naming
                                }
                            }
                            else if (value &&
                                value
                                    .type &&
                                (value
                                    .type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                                    value
                                        .type === utils_1.AST_NODE_TYPES.ArrayPattern)) {
                                visitPattern(value);
                            }
                        }
                    }
                }
                else if (p.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
                    for (const elem of p.elements) {
                        if (!elem)
                            continue;
                        if (elem.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
                            const left = elem.left;
                            if (left.type === utils_1.AST_NODE_TYPES.Identifier) {
                                results.push({ assignment: elem, localName: left.name });
                            }
                        }
                        else if (elem.type === utils_1.AST_NODE_TYPES.ArrayPattern ||
                            elem.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                            visitPattern(elem);
                        }
                    }
                }
                else if (p.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
                    const left = p.left;
                    if (left.type === utils_1.AST_NODE_TYPES.Identifier) {
                        results.push({ assignment: p, localName: left.name });
                    }
                }
            };
            visitPattern(pattern);
            return results;
        }
        function hasIdentifiers(node) {
            return !!node && ASTHelpers_1.ASTHelpers.declarationIncludesIdentifier(node);
        }
        function alreadyHasConst(program, constName) {
            for (const stmt of program.body) {
                if (stmt.type === utils_1.AST_NODE_TYPES.VariableDeclaration &&
                    stmt.kind === 'const') {
                    for (const d of stmt.declarations) {
                        if (d.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                            d.id.name === constName) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        function buildConstDeclarationLine(constName, initText) {
            const needsAsConst = /^(?:true|false|-?\d|\[|\{|[`'"])/.test(initText) &&
                !/\bas const\b/.test(initText);
            const initializer = needsAsConst ? `${initText} as const` : initText;
            return `const ${constName} = ${initializer};`;
        }
        function reportStaticDefaults(patterns, enclosingFn, nodeForReport) {
            if (!enclosingFn || !isComponentOrHookFunction(enclosingFn))
                return;
            const defaults = [];
            for (const pattern of patterns) {
                defaults.push(...collectAssignmentDefaultsFromPattern(pattern));
            }
            if (defaults.length === 0)
                return;
            const staticDefaults = defaults.filter((def) => {
                const right = def.assignment.right;
                return right && !hasIdentifiers(right);
            });
            if (staticDefaults.length === 0)
                return;
            context.report({
                node: nodeForReport,
                messageId: 'extractDefaultToGlobalConstant',
                fix(fixer) {
                    const fixes = [];
                    const programNode = sourceCode.ast;
                    const declLines = [];
                    for (const def of staticDefaults) {
                        const { assignment, localName } = def;
                        const right = assignment.right;
                        const rightText = sourceCode.getText(right);
                        const constName = `DEFAULT_${toUpperSnakeCase(localName)}`;
                        if (!alreadyHasConst(programNode, constName)) {
                            declLines.push(buildConstDeclarationLine(constName, rightText));
                        }
                        fixes.push(fixer.replaceText(right, constName));
                    }
                    if (declLines.length > 0) {
                        const program = sourceCode.ast;
                        const constSection = declLines.length === 1
                            ? declLines[0]
                            : `${declLines[0]}\n\n${declLines.slice(1).join('\n')}`;
                        const text = sourceCode.text;
                        const findNextNonWhitespace = (start) => {
                            let idx = start;
                            while (idx < text.length && /\s/.test(text[idx])) {
                                idx += 1;
                            }
                            return idx;
                        };
                        const buildBlock = (extraSpacing, insertPos, nextPos) => {
                            const whitespace = text.slice(insertPos, nextPos);
                            const lastNewline = whitespace.lastIndexOf('\n');
                            const nextIndentRaw = lastNewline === -1
                                ? ''
                                : whitespace.slice(lastNewline + 1).replace(/[^\t ]/g, '');
                            const separator = extraSpacing ? '\n\n\n' : '\n\n';
                            const nextIndent = extraSpacing ? nextIndentRaw : '';
                            return `\n${constSection}${separator}${nextIndent}`;
                        };
                        const imports = program.body.filter((s) => s.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                        if (imports.length > 0) {
                            const lastImport = imports[imports.length - 1];
                            const insertPos = lastImport.range[1];
                            const nextPos = findNextNonWhitespace(insertPos);
                            fixes.push(fixer.replaceTextRange([insertPos, nextPos], buildBlock(false, insertPos, nextPos)));
                        }
                        else {
                            const body = program.body;
                            let insertPos = 0;
                            let afterDirectiveIdx = -1;
                            for (let i = 0; i < body.length; i++) {
                                const stmt = body[i];
                                if (stmt.type === utils_1.AST_NODE_TYPES.ExpressionStatement &&
                                    stmt.expression.type === utils_1.AST_NODE_TYPES.Literal &&
                                    typeof stmt.expression.value === 'string') {
                                    afterDirectiveIdx = i;
                                }
                                else {
                                    break;
                                }
                            }
                            if (afterDirectiveIdx >= 0) {
                                insertPos = body[afterDirectiveIdx].range[1];
                            }
                            const nextPos = findNextNonWhitespace(insertPos);
                            fixes.push(fixer.replaceTextRange([insertPos, nextPos], buildBlock(afterDirectiveIdx < 0, insertPos, nextPos)));
                        }
                    }
                    return fixes;
                },
            });
        }
        return {
            CallExpression(node) {
                if (node.callee.type !== utils_1.AST_NODE_TYPES.Identifier ||
                    node.callee.name !== 'useMemo') {
                    return;
                }
                if (node.arguments.length !== 2) {
                    return;
                }
                const depsArray = node.arguments[1];
                if (depsArray.type !== utils_1.AST_NODE_TYPES.ArrayExpression ||
                    depsArray.elements.length !== 0) {
                    return;
                }
                const callback = node.arguments[0];
                if (callback.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    callback.type !== utils_1.AST_NODE_TYPES.FunctionExpression) {
                    return;
                }
                let returnValue = null;
                if (callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    const returnStatement = callback.body.body.find((stmt) => stmt.type === utils_1.AST_NODE_TYPES.ReturnStatement);
                    if (!returnStatement || !returnStatement.argument) {
                        return;
                    }
                    returnValue = returnStatement.argument;
                }
                else {
                    returnValue = callback.body;
                }
                let actualReturnValue = returnValue;
                if (returnValue.type === utils_1.AST_NODE_TYPES.TSAsExpression) {
                    actualReturnValue = returnValue.expression;
                }
                if (actualReturnValue.type === utils_1.AST_NODE_TYPES.ObjectExpression ||
                    (actualReturnValue.type === utils_1.AST_NODE_TYPES.ArrayExpression &&
                        actualReturnValue.elements.some((element) => element !== null &&
                            element.type === utils_1.AST_NODE_TYPES.ObjectExpression))) {
                    context.report({
                        node,
                        messageId: 'useGlobalConstant',
                    });
                }
            },
            VariableDeclaration(node) {
                const relevantDeclarators = node.declarations.filter((d) => d.id.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                    d.id.type === utils_1.AST_NODE_TYPES.ArrayPattern);
                if (relevantDeclarators.length === 0)
                    return;
                const enclosingFn = getEnclosingFunction(node);
                reportStaticDefaults(relevantDeclarators.map((d) => d.id), enclosingFn, node);
            },
            FunctionDeclaration(node) {
                const patterns = node.params.filter((p) => p.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                    p.type === utils_1.AST_NODE_TYPES.ArrayPattern);
                if (patterns.length === 0)
                    return;
                reportStaticDefaults(patterns, node, node);
            },
            FunctionExpression(node) {
                const patterns = node.params.filter((p) => p.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                    p.type === utils_1.AST_NODE_TYPES.ArrayPattern);
                if (patterns.length === 0)
                    return;
                reportStaticDefaults(patterns, node, node);
            },
            ArrowFunctionExpression(node) {
                const patterns = node.params.filter((p) => p.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                    p.type === utils_1.AST_NODE_TYPES.ArrayPattern);
                if (patterns.length === 0)
                    return;
                reportStaticDefaults(patterns, node, node);
            },
        };
    },
});
//# sourceMappingURL=enforce-global-constants.js.map