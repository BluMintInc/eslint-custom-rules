"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceMuiRoundedIcons = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
exports.enforceMuiRoundedIcons = (0, createRule_1.createRule)({
    name: 'enforce-mui-rounded-icons',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce the use of -Rounded variant for MUI icons',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            enforceRoundedVariant: 'Use the -Rounded variant for MUI icons (e.g., LogoutRounded instead of Logout)',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ImportDeclaration(node) {
                // Only check imports from @mui/icons-material
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.source.value === 'string' &&
                    node.source.value.startsWith('@mui/icons-material/')) {
                    const iconPath = node.source.value;
                    // Skip if already using -Rounded variant
                    if (iconPath.endsWith('Rounded')) {
                        return;
                    }
                    // Extract the icon name from the path
                    const iconName = iconPath.split('/').pop();
                    // Skip if the icon name is not a string (shouldn't happen)
                    if (!iconName) {
                        return;
                    }
                    // Create the rounded variant name
                    const roundedVariant = `${iconName}Rounded`;
                    context.report({
                        node,
                        messageId: 'enforceRoundedVariant',
                        fix: (fixer) => {
                            // Replace the import path with the rounded variant
                            return fixer.replaceText(node.source, `'@mui/icons-material/${roundedVariant}'`);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-mui-rounded-icons.js.map