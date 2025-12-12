"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceMemoizeGetters = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const MEMOIZE_PREFERRED_MODULE = '@blumintinc/typescript-memoize';
const MEMOIZE_MODULES = new Set([
    MEMOIZE_PREFERRED_MODULE,
    'typescript-memoize',
]);
function isMemoizeDecorator(decorator, alias) {
    const expression = decorator.expression;
    // @Alias()
    if (expression.type === utils_1.AST_NODE_TYPES.CallExpression) {
        const callee = expression.callee;
        return ((callee.type === utils_1.AST_NODE_TYPES.Identifier && callee.name === alias) ||
            (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !callee.computed &&
                callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                callee.property.name === alias));
    }
    // @Alias
    if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
        return expression.name === alias;
    }
    // @ns.Alias
    if (expression.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !expression.computed &&
        expression.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return expression.property.name === alias;
    }
    return false;
}
exports.enforceMemoizeGetters = (0, createRule_1.createRule)({
    name: 'enforce-memoize-getters',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce @Memoize() decorator on private class getters to avoid re-instantiation and preserve state across accesses.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            requireMemoizeGetter: 'Private getters should be decorated with @Memoize() to preserve instance state and avoid redundant instantiation. Import Memoize from "@blumintinc/typescript-memoize".',
        },
    },
    defaultOptions: [],
    create(context) {
        // Only apply in TS/TSX files to avoid JS environments without decorators
        const filename = context.getFilename();
        if (!/\.tsx?$/i.test(filename)) {
            return {};
        }
        let hasMemoizeImport = false;
        let memoizeAlias = 'Memoize';
        let scheduledImportFix = false;
        return {
            ImportDeclaration(node) {
                if (MEMOIZE_MODULES.has(String(node.source.value))) {
                    const spec = node.specifiers.find((s) => s.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        s.imported.name === 'Memoize');
                    if (spec) {
                        hasMemoizeImport = true;
                        memoizeAlias = spec.local?.name ?? 'Memoize';
                    }
                }
            },
            MethodDefinition(node) {
                // Target: instance private getters
                if (node.kind !== 'get')
                    return;
                // skip static getters
                if (node.static)
                    return;
                // enforce only "private" accessibility (undefined => public)
                if (node.accessibility !== 'private')
                    return;
                // Already memoized?
                const hasDecorator = node.decorators?.some((d) => isMemoizeDecorator(d, memoizeAlias));
                if (hasDecorator)
                    return;
                context.report({
                    node,
                    messageId: 'requireMemoizeGetter',
                    fix(fixer) {
                        const fixes = [];
                        const sourceCode = context.getSourceCode();
                        // Insert import if needed, at the top alongside other imports
                        if (!hasMemoizeImport && !scheduledImportFix) {
                            const programBody = sourceCode.ast.body;
                            const firstImport = programBody.find((n) => n.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                            const anchorNode = (firstImport ?? programBody[0]);
                            if (anchorNode) {
                                const text = sourceCode.text;
                                const anchorStart = anchorNode.range[0];
                                const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
                                const leadingWhitespace = text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ??
                                    '';
                                const importLine = `${leadingWhitespace}import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`;
                                fixes.push(fixer.insertTextBeforeRange([lineStart, lineStart], importLine));
                            }
                            else {
                                fixes.push(fixer.insertTextBeforeRange([0, 0], `import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`));
                            }
                            scheduledImportFix = true;
                        }
                        // Insert decorator above the getter (or before the first decorator), preserving indentation
                        const indent = ' '.repeat(node.loc.start.column);
                        const lineStart = node.range
                            ? sourceCode.text.lastIndexOf('\n', node.range[0] - 1) + 1
                            : 0;
                        const insertPosition = Math.max(0, lineStart);
                        fixes.push(fixer.insertTextBeforeRange([insertPosition, insertPosition], `${indent}@${memoizeAlias}()\n`));
                        return fixes;
                    },
                });
            },
        };
    },
});
exports.default = exports.enforceMemoizeGetters;
//# sourceMappingURL=enforce-memoize-getters.js.map