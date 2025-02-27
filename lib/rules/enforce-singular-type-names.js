"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceSingularTypeNames = void 0;
const createRule_1 = require("../utils/createRule");
const pluralize = __importStar(require("pluralize"));
exports.enforceSingularTypeNames = (0, createRule_1.createRule)({
    create(context) {
        /**
         * Check if a name is plural
         * @param name The name to check
         * @returns true if the name is plural, false otherwise
         */
        function isPlural(name) {
            // Skip checking if name is too short (less than 3 characters)
            if (name.length < 3)
                return false;
            // Skip checking if name ends with 'Props' or 'Params'
            if (name.endsWith('Props') || name.endsWith('Params'))
                return false;
            // Skip checking if name is already singular according to pluralize
            if (pluralize.isSingular(name))
                return false;
            // Check if the singular form is different from the name
            const singular = pluralize.singular(name);
            return singular !== name;
        }
        /**
         * Get the singular form of a name
         * @param name The name to get the singular form of
         * @returns The singular form of the name
         */
        function getSingularForm(name) {
            return pluralize.singular(name);
        }
        /**
         * Report a plural type name
         * @param node The node to report
         * @param name The plural name
         * @param suggestedName The suggested singular name
         */
        function reportPluralName(node, name, suggestedName) {
            context.report({
                node,
                messageId: 'typeShouldBeSingular',
                data: {
                    name,
                    suggestedName,
                },
            });
        }
        return {
            // Check type aliases
            TSTypeAliasDeclaration(node) {
                const name = node.id.name;
                if (isPlural(name)) {
                    reportPluralName(node.id, name, getSingularForm(name));
                }
            },
            // Check interfaces
            TSInterfaceDeclaration(node) {
                const name = node.id.name;
                if (isPlural(name)) {
                    reportPluralName(node.id, name, getSingularForm(name));
                }
            },
            // Check enums
            TSEnumDeclaration(node) {
                const name = node.id.name;
                if (isPlural(name)) {
                    reportPluralName(node.id, name, getSingularForm(name));
                }
            },
        };
    },
    name: 'enforce-singular-type-names',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce TypeScript type names to be singular',
            recommended: 'error',
        },
        schema: [],
        messages: {
            typeShouldBeSingular: "Type name '{{name}}' should be singular. Consider using '{{suggestedName}}' instead.",
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=enforce-singular-type-names.js.map