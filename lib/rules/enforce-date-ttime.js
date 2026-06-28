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
exports.enforceDateTTime = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
const createRule_1 = require("../utils/createRule");
exports.enforceDateTTime = (0, createRule_1.createRule)({
    name: 'enforce-date-ttime',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce that any generic type parameter named TTime is explicitly set to Date in frontend code',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            enforceDateTTime: '{{typeName}} leaves TTime unspecified or not Date → Firestore Frontend Hooks convert Timestamp to Date on the client, so non-Date TTime misrepresents runtime values and forces defensive conversions → Set the TTime argument to Date explicitly (e.g., {{typeName}}<..., Date, ...>).',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const parserServices = sourceCode?.parserServices ?? context.parserServices;
        const checker = parserServices?.program?.getTypeChecker();
        if (!parserServices || !checker) {
            return {};
        }
        const tTimeIndexCache = new WeakMap();
        /**
         * Finds the index of the TTime parameter in the given symbol's declarations.
         */
        function findTTimeParameterIndex(symbol) {
            if (tTimeIndexCache.has(symbol)) {
                return tTimeIndexCache.get(symbol);
            }
            const declarations = symbol.getDeclarations();
            if (!declarations) {
                tTimeIndexCache.set(symbol, undefined);
                return undefined;
            }
            for (const declaration of declarations) {
                if (ts.isTypeAliasDeclaration(declaration) ||
                    ts.isInterfaceDeclaration(declaration) ||
                    ts.isClassDeclaration(declaration)) {
                    if (declaration.typeParameters) {
                        const index = declaration.typeParameters.findIndex((tp) => tp.name.text === 'TTime');
                        if (index !== -1) {
                            tTimeIndexCache.set(symbol, index);
                            return index;
                        }
                    }
                }
            }
            tTimeIndexCache.set(symbol, undefined);
            return undefined;
        }
        /**
         * Checks if a type node is exactly "Date".
         */
        function isExactDate(node) {
            if (node.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                node.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.typeName.name === 'Date' &&
                (!node.typeParameters || node.typeParameters.params.length === 0)) {
                return true;
            }
            return false;
        }
        return {
            TSTypeReference(node) {
                const typeNameNode = node.typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName
                    ? node.typeName.right
                    : node.typeName;
                if (typeNameNode.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                // Skip the "Date" type itself
                if (typeNameNode.name === 'Date')
                    return;
                const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
                const symbol = checker.getSymbolAtLocation(tsNode.typeName);
                if (!symbol)
                    return;
                const resolvedSymbol = symbol.flags & ts.SymbolFlags.Alias
                    ? checker.getAliasedSymbol(symbol)
                    : symbol;
                const tTimeIndex = findTTimeParameterIndex(resolvedSymbol);
                if (tTimeIndex === undefined)
                    return;
                const typeArgs = node.typeParameters?.params || [];
                const tTimeArg = typeArgs[tTimeIndex];
                const typeName = sourceCode.getText(node.typeName);
                if (!tTimeArg) {
                    // TTime is omitted
                    context.report({
                        node,
                        messageId: 'enforceDateTTime',
                        data: { typeName },
                        fix(fixer) {
                            if (node.typeParameters) {
                                // Already has type parameters, but not enough to cover TTime
                                const lastParam = node.typeParameters.params[node.typeParameters.params.length - 1];
                                // Check if we can just append ", Date"
                                // We can only do this safely if all parameters between existing ones and TTime have defaults.
                                // For simplicity and safety, we only fix if tTimeIndex is the next one or if it's already provided.
                                if (tTimeIndex === node.typeParameters.params.length) {
                                    return fixer.insertTextAfter(lastParam, ', Date');
                                }
                            }
                            else if (tTimeIndex === 0) {
                                // No type parameters and TTime is the first one
                                return fixer.insertTextAfter(node.typeName, '<Date>');
                            }
                            return null;
                        },
                    });
                }
                else if (!isExactDate(tTimeArg)) {
                    // TTime is provided but is not exactly Date
                    context.report({
                        node: tTimeArg,
                        messageId: 'enforceDateTTime',
                        data: { typeName },
                        fix(fixer) {
                            return fixer.replaceText(tTimeArg, 'Date');
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-date-ttime.js.map