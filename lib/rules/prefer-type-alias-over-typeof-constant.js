"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferTypeAliasOverTypeofConstant = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const PAREN_TYPE = utils_1.AST_NODE_TYPES.TSParenthesizedType ??
    'TSParenthesizedType';
const isParenthesizedType = (node) => {
    return node.type === PAREN_TYPE;
};
/** Utility to convert CONSTANT_CASE or snake/kebab to PascalCase */
function toPascalCase(name) {
    return name
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}
/** Determine if a value initializer represents a function or class (which we should ignore). */
function isFunctionOrClassInitializer(init) {
    if (!init)
        return false;
    return (init.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        init.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        init.type === utils_1.AST_NODE_TYPES.ClassExpression);
}
/** Determine if node is a simple constant literal or object/array literal possibly with `as const` */
function isConstantLikeInitializer(init) {
    if (!init)
        return false;
    if (isFunctionOrClassInitializer(init))
        return false;
    switch (init.type) {
        case utils_1.AST_NODE_TYPES.Literal:
            return true;
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return init.expressions.length === 0;
        case utils_1.AST_NODE_TYPES.ObjectExpression:
            return true;
        case utils_1.AST_NODE_TYPES.ArrayExpression:
            return true;
        case utils_1.AST_NODE_TYPES.TSAsExpression:
            return isConstantLikeInitializer(init.expression);
        case utils_1.AST_NODE_TYPES.UnaryExpression: {
            // treat unary constants (e.g., -1) as constant-like; exclude typeof
            if (init.operator === 'typeof')
                return false;
            return isConstantLikeInitializer(init.argument);
        }
        default:
            return false;
    }
}
/** Traverse a TSType and collect referenced identifier names (e.g., A, B in A | B). */
function collectReferencedTypeNames(node, acc = new Set()) {
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.TSTypeReference: {
            if (node.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                acc.add(node.typeName.name);
            }
            if (node.typeParameters) {
                for (const p of node.typeParameters.params)
                    collectReferencedTypeNames(p, acc);
            }
            break;
        }
        case utils_1.AST_NODE_TYPES.TSUnionType:
        case utils_1.AST_NODE_TYPES.TSIntersectionType: {
            for (const t of node.types)
                collectReferencedTypeNames(t, acc);
            break;
        }
        case utils_1.AST_NODE_TYPES.TSArrayType: {
            const arr = node;
            collectReferencedTypeNames(arr.elementType, acc);
            break;
        }
        case utils_1.AST_NODE_TYPES.TSTypeOperator: {
            const op = node;
            if (op.typeAnnotation)
                collectReferencedTypeNames(op.typeAnnotation, acc);
            break;
        }
        case utils_1.AST_NODE_TYPES.TSTupleType: {
            const tup = node;
            for (const e of tup.elementTypes)
                collectReferencedTypeNames(e, acc);
            break;
        }
        default: {
            if (isParenthesizedType(node)) {
                collectReferencedTypeNames(node.typeAnnotation, acc);
            }
            break;
        }
    }
    return acc;
}
/** Collects module-level consts and type aliases for quick lookup */
function collectTopLevelContext(program) {
    const topLevelConstInitByName = new Map();
    const topLevelConstNodeByName = new Map();
    const typeAliasByName = new Map();
    const importedValueNames = new Set();
    const importedTypeNames = new Set();
    for (const stmt of program.body) {
        if (stmt.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            const isTypeImport = stmt.importKind === 'type';
            for (const spec of stmt.specifiers) {
                // import type { Foo } from '...'
                // import { Foo } from '...' as value import
                if (spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
                    if (isTypeImport || spec.importKind === 'type') {
                        importedTypeNames.add(spec.local.name);
                    }
                    else {
                        importedValueNames.add(spec.local.name);
                    }
                }
                else if (spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier) {
                    if (isTypeImport) {
                        importedTypeNames.add(spec.local.name);
                    }
                    else {
                        importedValueNames.add(spec.local.name);
                    }
                }
                else if (spec.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                    // Namespace imports expose names via MemberExpression; not tracked individually
                }
            }
        }
        else if (stmt.type === utils_1.AST_NODE_TYPES.VariableDeclaration &&
            stmt.kind === 'const') {
            for (const decl of stmt.declarations) {
                if (decl.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    topLevelConstInitByName.set(decl.id.name, decl.init ?? null);
                    topLevelConstNodeByName.set(decl.id.name, decl);
                }
            }
        }
        else if (stmt.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
            typeAliasByName.set(stmt.id.name, stmt);
        }
        else if (stmt.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration &&
            stmt.declaration) {
            // Handle exported declarations: export const FOO = ...; export type Foo = ...
            const decl = stmt.declaration;
            if (decl.type === utils_1.AST_NODE_TYPES.VariableDeclaration &&
                decl.kind === 'const') {
                for (const d of decl.declarations) {
                    if (d.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                        topLevelConstInitByName.set(d.id.name, d.init ?? null);
                        topLevelConstNodeByName.set(d.id.name, d);
                    }
                }
            }
            else if (decl.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                typeAliasByName.set(decl.id.name, decl);
            }
        }
    }
    return {
        topLevelConstInitByName,
        topLevelConstNodeByName,
        typeAliasByName,
        importedValueNames,
        importedTypeNames,
    };
}
exports.preferTypeAliasOverTypeofConstant = (0, createRule_1.createRule)({
    name: 'prefer-type-alias-over-typeof-constant',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants.',
            recommended: 'error',
        },
        hasSuggestions: false,
        schema: [],
        messages: {
            preferTypeAlias: 'Type derived from same-file constant "{{constName}}" couples the type to its runtime value and scatters literal unions across the file. Create a named alias such as "{{suggested}}" and reference that alias instead of `typeof {{constName}}` so the type stays stable even if the value changes.',
            defineTypeBeforeConstant: 'Type alias "{{typeName}}" appears after constant "{{constName}}", which hides the shape from readers and risks using an undeclared alias. Declare "{{typeName}}" before "{{constName}}" so the type is visible where it is consumed and can be reused consistently.',
        },
    },
    defaultOptions: [],
    create(context) {
        let collected;
        return {
            Program(program) {
                collected = collectTopLevelContext(program);
            },
            // Enforce that type aliases referenced by const annotations appear before the const
            VariableDeclarator(node) {
                if (!collected)
                    return;
                if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                const constName = node.id.name;
                // Only for top-level consts
                const decl = collected.topLevelConstNodeByName.get(constName);
                if (!decl || decl !== node)
                    return;
                const parentDecl = node.parent;
                if (!parentDecl || parentDecl.kind !== 'const')
                    return;
                const typeAnn = node.id.typeAnnotation?.typeAnnotation;
                if (!typeAnn)
                    return;
                for (const typeName of collectReferencedTypeNames(typeAnn)) {
                    // If imported type, allow any order
                    if (collected.importedTypeNames.has(typeName))
                        continue;
                    const typeDecl = collected.typeAliasByName.get(typeName);
                    if (typeDecl && typeDecl.range[0] > parentDecl.range[0]) {
                        context.report({
                            node: node.id,
                            messageId: 'defineTypeBeforeConstant',
                            data: { typeName, constName },
                        });
                    }
                }
            },
            // Core rule: flag `typeof CONST` when CONST is a same-file top-level const and constant-like
            TSTypeQuery(node) {
                if (!collected)
                    return;
                // Skip `keyof typeof X`
                if (node.parent &&
                    node.parent.type === utils_1.AST_NODE_TYPES.TSTypeOperator &&
                    node.parent.operator === 'keyof') {
                    return;
                }
                if (node.exprName.type !== utils_1.AST_NODE_TYPES.Identifier) {
                    return;
                }
                const name = node.exprName.name;
                // Imported values: do not enforce (may suggest in future)
                if (collected.importedValueNames.has(name)) {
                    return;
                }
                const init = collected.topLevelConstInitByName.get(name);
                if (init === undefined) {
                    // Not a top-level const in this file
                    return;
                }
                if (!isConstantLikeInitializer(init)) {
                    return;
                }
                context.report({
                    node,
                    messageId: 'preferTypeAlias',
                    data: { constName: name, suggested: toPascalCase(name) },
                });
            },
        };
    },
});
//# sourceMappingURL=prefer-type-alias-over-typeof-constant.js.map