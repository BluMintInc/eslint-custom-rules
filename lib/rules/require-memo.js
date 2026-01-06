"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireMemo = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
const utils_1 = require("@typescript-eslint/utils");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const isComponentExplicitlyUnmemoized = (componentName) => componentName.toLowerCase().includes('unmemoized');
function isFunction(node) {
    return (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.FunctionExpression);
}
function isHigherOrderFunctionReturningJSX(node) {
    if (isFunction(node)) {
        // Check if function takes another function as an argument
        const hasFunctionParam = 'params' in node && node.params.some(isFunction);
        if (node.body && node.body.type === 'BlockStatement') {
            for (const statement of node.body.body) {
                if (statement.type === 'ReturnStatement' && statement.argument) {
                    const returnsJSX = ASTHelpers_1.ASTHelpers.returnsJSX(statement.argument);
                    const returnsFunction = isFunction(statement.argument);
                    return (hasFunctionParam || returnsFunction) && returnsJSX;
                }
            }
        }
    }
    return false;
}
const isUnmemoizedArrowFunction = (parentNode) => {
    return (parentNode.type === 'VariableDeclarator' &&
        parentNode.id.type === 'Identifier' &&
        !isComponentExplicitlyUnmemoized(parentNode.id.name));
};
const isUnmemoizedFunctionComponent = (parentNode, node) => {
    return (node.type === 'FunctionDeclaration' &&
        parentNode.type === 'Program' &&
        node.id &&
        !isComponentExplicitlyUnmemoized(node.id.name));
};
const isUnmemoizedExportedFunctionComponent = (parentNode, node) => {
    return (node.type === 'FunctionDeclaration' &&
        parentNode.type === 'ExportNamedDeclaration' &&
        node.id &&
        !isComponentExplicitlyUnmemoized(node.id.name));
};
function isMemoImport(importPath) {
    // Match both absolute and relative paths ending with util/memo
    return /(?:^|\/|\\)util\/memo$/.test(importPath);
}
function checkFunction(context, node) {
    const fileName = context.getFilename();
    if (!fileName.endsWith('.tsx')) {
        return;
    }
    if (isHigherOrderFunctionReturningJSX(node)) {
        return;
    }
    const parentNode = node.parent;
    if (node.parent.type === 'CallExpression') {
        return;
    }
    if (ASTHelpers_1.ASTHelpers.returnsJSX(node.body) && ASTHelpers_1.ASTHelpers.hasParameters(node)) {
        const results = [
            isUnmemoizedArrowFunction,
            isUnmemoizedFunctionComponent,
            isUnmemoizedExportedFunctionComponent,
        ].map((fn) => fn(parentNode, node));
        if (results.some((result) => !!result)) {
            const componentName = (node.type === 'FunctionDeclaration' && node.id?.name) ||
                (parentNode.type === 'VariableDeclarator' &&
                    parentNode.id.type === 'Identifier' &&
                    parentNode.id.name) ||
                'component';
            context.report({
                node,
                messageId: 'requireMemo',
                data: {
                    name: componentName,
                },
                fix: results[2] || results[1]
                    ? function fix(fixer) {
                        const sourceCode = context.sourceCode;
                        let importFix = null;
                        // Search for memo import statement
                        const importDeclarations = sourceCode.ast.body.filter((node) => node.type === 'ImportDeclaration');
                        const memoImport = importDeclarations.find((importDeclaration) => isMemoImport(importDeclaration.source.value));
                        if (memoImport) {
                            // Check if memo is already imported
                            if (!memoImport.specifiers.some((specifier) => specifier.local.name === 'memo')) {
                                // Add memo to existing import statement
                                const lastSpecifier = memoImport.specifiers[memoImport.specifiers.length - 1];
                                importFix = fixer.insertTextAfter(lastSpecifier, ', memo');
                            }
                        }
                        else {
                            // Calculate relative path based on current file location
                            const currentFilePath = context.getFilename();
                            const importPath = calculateImportPath(currentFilePath);
                            // Find the first import statement to insert after
                            const firstImport = importDeclarations[0];
                            // Add new import statement for memo
                            const importStatement = `import { memo } from '${importPath}';\n`;
                            if (firstImport) {
                                // Insert after the first import with a single newline
                                importFix = fixer.insertTextAfter(firstImport, '\n' + importStatement.trim());
                            }
                            else {
                                // Insert at the start of the file
                                importFix = fixer.insertTextBeforeRange([sourceCode.ast.range[0], sourceCode.ast.range[0]], importStatement.trim() + '\n');
                            }
                        }
                        const functionKeywordRange = [
                            node.range[0],
                            node.range[0] + 'function'.length,
                        ];
                        const functionKeywordReplacement = `const ${node.id.name} = memo(`;
                        // Step 3: Rename function
                        const functionNameReplacement = `function ${node.id.name}Unmemoized`;
                        const fixes = [
                            fixer.replaceTextRange(functionKeywordRange, functionKeywordReplacement),
                            fixer.insertTextAfterRange([node.range[1], node.range[1]], ')'),
                            fixer.replaceTextRange([node.id.range[0] - 1, node.id.range[1]], functionNameReplacement),
                        ];
                        if (importFix) {
                            fixes.push(importFix);
                        }
                        return fixes;
                    }
                    : undefined,
            });
        }
    }
}
function calculateImportPath(currentFilePath) {
    // Default to absolute path if we can't calculate relative path
    if (!currentFilePath)
        return 'src/util/memo';
    // Split the current file path into parts and normalize
    const parts = currentFilePath.split(/[\\/]/); // Handle both Unix and Windows paths
    const srcIndex = parts.indexOf('src');
    if (srcIndex === -1) {
        // If we're not in a src directory, use absolute path
        return 'src/util/memo';
    }
    // Calculate relative path based on current file depth from src
    // Subtract 1 from depth to exclude the filename itself
    const depth = parts.length - (srcIndex + 1) - 1;
    return depth > 0 ? '../'.repeat(depth) + 'util/memo' : './util/memo';
}
exports.requireMemo = {
    create: (context) => ({
        ArrowFunctionExpression(node) {
            checkFunction(context, node);
        },
        FunctionDeclaration(node) {
            checkFunction(context, node);
        },
        FunctionExpression(node) {
            checkFunction(context, node);
        },
    }),
    meta: {
        type: 'problem',
        docs: {
            description: 'React components must be memoized',
            recommended: 'error',
        },
        messages: {
            requireMemo: 'Component "{{name}}" renders JSX with props but is not wrapped in memo(). ' +
                'Without memo the component function is recreated on every parent render, breaking referential equality and causing avoidable child re-renders. ' +
                'Wrap the component with memo from util/memo so callers receive a stable reference; rename to "{{name}}Unmemoized" if it must stay un-memoized.',
        },
        schema: [],
        fixable: 'code',
    },
    defaultOptions: [],
};
//# sourceMappingURL=require-memo.js.map