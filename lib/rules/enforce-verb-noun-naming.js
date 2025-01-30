"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceVerbNounNaming = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const compromise_1 = __importDefault(require("compromise"));
const PREPOSITIONS = ['to', 'from', 'with', 'by', 'at', 'of'];
// Common short verbs that should be allowed
const COMMON_VERBS = new Set([
    'sync',
    'fix',
    'set',
    'log',
    'get',
    'put',
    'add',
    'map',
    'run',
    'use',
    'has',
    'is',
    'do',
]);
exports.enforceVerbNounNaming = (0, createRule_1.createRule)({
    name: 'enforce-verb-noun-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce verb phrases for functions and methods',
            recommended: 'error',
            requiresTypeChecking: false,
            extendsBaseRule: false,
        },
        schema: [],
        messages: {
            functionVerbPhrase: 'Function names should start with a verb phrase (e.g., fetchData, processRequest)',
        },
    },
    defaultOptions: [],
    create(context) {
        function extractFirstWord(name) {
            const firstChar = name.charAt(0);
            const rest = name.slice(1);
            const words = rest.split(/(?=[A-Z])/);
            return firstChar + words[0];
        }
        function toSentence(name) {
            // Add "I" prefix to create a proper sentence for better verb detection
            return 'I ' + name.split(/(?=[A-Z])/).join(' ');
        }
        function getPossibleTags(sentence) {
            const doc = (0, compromise_1.default)(sentence);
            const terms = doc.terms().json();
            if (terms.length === 0 || !terms[0].terms || !terms[0].terms[0].tags)
                return [];
            const tags = terms[0].terms[0].tags;
            return tags;
        }
        function isVerbPhrase(name) {
            const firstWord = extractFirstWord(name);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const firstWordLower = firstWord.toLowerCase();
            // Check for prepositions and common verbs first
            if (PREPOSITIONS.includes(firstWordLower) || COMMON_VERBS.has(firstWordLower)) {
                return true;
            }
            // Try both with and without "I" prefix to catch more verb forms
            const withPrefixTags = getPossibleTags(toSentence(name));
            const withoutPrefixTags = getPossibleTags(firstWord);
            // Check if either form is recognized as a verb
            const isVerb = withPrefixTags.includes('Verb') || withoutPrefixTags.includes('Verb');
            const isPreposition = withPrefixTags.includes('Preposition');
            const isConjunction = withPrefixTags.includes('Conjunction');
            // For non-prepositions/conjunctions, require verb form
            if (isPreposition || isConjunction) {
                return true;
            }
            return isVerb;
        }
        function isJsxReturnFunction(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                node.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                node.type !== utils_1.AST_NODE_TYPES.FunctionExpression) {
                return false;
            }
            // Check if function returns JSX
            const sourceCode = context.getSourceCode();
            const text = sourceCode.getText(node);
            return text.includes('return <') || text.includes('=> <');
        }
        return {
            FunctionDeclaration(node) {
                if (!node.id)
                    return;
                if (isJsxReturnFunction(node)) {
                    return;
                }
                if (!isVerbPhrase(node.id.name)) {
                    context.report({
                        node: node.id,
                        messageId: 'functionVerbPhrase',
                    });
                }
            },
            VariableDeclarator(node) {
                if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                // Only check if it's a function
                if (node.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    node.init?.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    if (isJsxReturnFunction(node.init)) {
                        return;
                    }
                    if (!isVerbPhrase(node.id.name)) {
                        context.report({
                            node: node.id,
                            messageId: 'functionVerbPhrase',
                        });
                    }
                }
            },
            MethodDefinition(node) {
                if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                // Skip getters since they represent properties and should use noun phrases
                if (node.kind === 'get')
                    return;
                // Skip constructors since they are special class methods
                if (node.kind === 'constructor')
                    return;
                if (!isVerbPhrase(node.key.name)) {
                    context.report({
                        node: node.key,
                        messageId: 'functionVerbPhrase',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-verb-noun-naming.js.map