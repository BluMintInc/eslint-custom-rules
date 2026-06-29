"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoCompareDeeplyComplexProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
function isUtilMemoModulePath(path) {
    return /(?:^|\/|\\)util\/memo$/.test(path);
}
/**
 * Reserved React slots that never reach a component's props object at runtime.
 * React extracts `ref` and `key` before invoking the memo equality function, so
 * a deep comparator can never observe them. Some prop-type sources (notably the
 * `forwardRef<T, P>` exotic-component signature, whose params include the
 * synthetic `RefAttributes<T> = { ref?: Ref<T> }` member) surface them as
 * structural members anyway; flagging them would emit dead `compareDeeply('ref')`
 * advice. Excluded the same way `children` is.
 */
const RESERVED_REACT_PROP_NAMES = new Set(['ref', 'key', 'children']);
function isReservedReactPropName(name) {
    return RESERVED_REACT_PROP_NAMES.has(name);
}
/**
 * Checks if a property name is handled by the default deep equality logic
 * in our custom memo implementation (blumintAreEqual).
 */
function isDefaultDeepCompareProp(name) {
    return (name === 'sx' ||
        name.endsWith('Sx') ||
        name === 'style' ||
        name.endsWith('Style'));
}
function unwrapExpression(expression) {
    let node = expression;
    // Unwrap harmless wrappers so detection treats casted/parenthesized expressions the same.
    while (node.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
        node.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
        node.type === utils_1.AST_NODE_TYPES.TSNonNullExpression ||
        node.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression) {
        node = node.expression;
    }
    return node;
}
function escapeStringForCodeGeneration(value) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return `'${escaped}'`;
}
function isComponentExpression(expr) {
    return (expr.type === utils_1.AST_NODE_TYPES.Identifier ||
        expr.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        expr.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        expr.type === utils_1.AST_NODE_TYPES.CallExpression ||
        expr.type === utils_1.AST_NODE_TYPES.MemberExpression);
}
function componentDisplayName(expr) {
    if (expr.type === utils_1.AST_NODE_TYPES.Identifier)
        return expr.name;
    if (expr.type === utils_1.AST_NODE_TYPES.FunctionExpression && expr.id) {
        return expr.id.name;
    }
    if (expr.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !expr.computed &&
        expr.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return expr.property.name;
    }
    return null;
}
function isUndefinedShadowed(scope) {
    let currentScope = scope;
    while (currentScope) {
        if (currentScope.variables.some((variable) => variable.name === 'undefined' && variable.defs.length > 0)) {
            return true;
        }
        currentScope = currentScope.upper ?? null;
    }
    return false;
}
function isNullishComparatorArgument(arg, scope) {
    if (arg.type === utils_1.AST_NODE_TYPES.SpreadElement)
        return false;
    const node = unwrapExpression(arg);
    if (node.type === utils_1.AST_NODE_TYPES.Identifier && node.name === 'undefined') {
        if (scope && isUndefinedShadowed(scope))
            return false;
        return true;
    }
    if (node.type === utils_1.AST_NODE_TYPES.Literal && node.value === null) {
        return true;
    }
    if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
        node.operator === 'void') {
        return true;
    }
    return false;
}
function isComparatorProvided(arg, scope) {
    if (!arg)
        return false;
    if (arg.type === utils_1.AST_NODE_TYPES.SpreadElement)
        return true;
    return !isNullishComparatorArgument(arg, scope);
}
function rangeWithParentheses(sourceCode, node) {
    const previous = sourceCode.getTokenBefore(node);
    const next = sourceCode.getTokenAfter(node);
    if (previous?.value === '(' && next?.value === ')') {
        return [previous.range[0], next.range[1]];
    }
    return node.range;
}
function addBindingNames(pattern, target) {
    switch (pattern.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            target.add(pattern.name);
            return;
        case utils_1.AST_NODE_TYPES.AssignmentPattern:
            addBindingNames(pattern.left, target);
            return;
        case utils_1.AST_NODE_TYPES.ObjectPattern:
            for (const prop of pattern.properties) {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    addBindingNames(prop.value, target);
                }
                else if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    addBindingNames(prop.argument, target);
                }
            }
            return;
        case utils_1.AST_NODE_TYPES.ArrayPattern:
            for (const element of pattern.elements) {
                if (element) {
                    addBindingNames(element, target);
                }
            }
            return;
        case utils_1.AST_NODE_TYPES.RestElement:
            addBindingNames(pattern.argument, target);
            return;
        default:
            return;
    }
}
function isTopLevelDeclaration(node) {
    if (!node)
        return false;
    return (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.TSEnumDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.VariableDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.TSModuleDeclaration);
}
function addNamesFromDeclaration(declaration, target) {
    if (declaration.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        declaration.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
        declaration.type === utils_1.AST_NODE_TYPES.TSEnumDeclaration ||
        declaration.type === utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration ||
        declaration.type === utils_1.AST_NODE_TYPES.TSInterfaceDeclaration) {
        if (declaration.id) {
            target.add(declaration.id.name);
        }
        return;
    }
    if (declaration.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
        for (const decl of declaration.declarations) {
            addBindingNames(decl.id, target);
        }
        return;
    }
    if (declaration.type === utils_1.AST_NODE_TYPES.TSModuleDeclaration &&
        declaration.id.type === utils_1.AST_NODE_TYPES.Identifier) {
        target.add(declaration.id.name);
    }
}
function pickAvailableCompareDeeplyLocalName(used) {
    if (!used.has('compareDeeply'))
        return 'compareDeeply';
    for (let i = 2;; i += 1) {
        const candidate = `compareDeeply${i}`;
        if (!used.has(candidate))
            return candidate;
    }
}
function collectUsedNames(sourceCode) {
    const used = new Set();
    for (const stmt of sourceCode.ast.body) {
        if (stmt.type === utils_1.AST_NODE_TYPES.ImportDeclaration) {
            for (const spec of stmt.specifiers) {
                used.add(spec.local.name);
            }
            continue;
        }
        if (stmt.type === utils_1.AST_NODE_TYPES.ExportNamedDeclaration) {
            if (isTopLevelDeclaration(stmt.declaration)) {
                addNamesFromDeclaration(stmt.declaration, used);
            }
            continue;
        }
        if (stmt.type === utils_1.AST_NODE_TYPES.ExportDefaultDeclaration) {
            const decl = stmt.declaration;
            if (decl &&
                (decl.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    decl.type === utils_1.AST_NODE_TYPES.ClassDeclaration)) {
                if (decl.id)
                    used.add(decl.id.name);
            }
            else if (decl && decl.type === utils_1.AST_NODE_TYPES.Identifier) {
                used.add(decl.name);
            }
            continue;
        }
        if (isTopLevelDeclaration(stmt)) {
            addNamesFromDeclaration(stmt, used);
            continue;
        }
    }
    for (const scope of sourceCode.scopeManager?.scopes ?? []) {
        for (const variable of scope.variables) {
            used.add(variable.name);
        }
    }
    return used;
}
function ensureCompareDeeplyImportFixes(sourceCode, fixer, usedNames, preferredSource) {
    const program = sourceCode.ast;
    const preferredLocalName = pickAvailableCompareDeeplyLocalName(usedNames);
    const memoImports = program.body.filter((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
        node.importKind !== 'type' &&
        typeof node.source.value === 'string' &&
        isUtilMemoModulePath(node.source.value));
    const typeOnlyMemoImports = program.body.filter((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
        node.importKind === 'type' &&
        typeof node.source.value === 'string' &&
        isUtilMemoModulePath(node.source.value));
    for (const memoImport of memoImports) {
        const compareDeeplySpecifier = memoImport.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
            spec.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
            spec.imported.name === 'compareDeeply');
        if (compareDeeplySpecifier) {
            return {
                fixes: [],
                localName: compareDeeplySpecifier.local.name,
            };
        }
    }
    const importSource = preferredSource && isUtilMemoModulePath(preferredSource)
        ? preferredSource
        : memoImports[0]?.source.value ??
            typeOnlyMemoImports[0]?.source.value ??
            'src/util/memo';
    const compareDeeplySpecifierText = preferredLocalName === 'compareDeeply'
        ? 'compareDeeply'
        : `compareDeeply as ${preferredLocalName}`;
    const importWithNamed = memoImports.find((memoImport) => memoImport.source.value === importSource &&
        memoImport.specifiers.some((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier));
    const fallbackImportWithNamed = memoImports.find((memoImport) => memoImport.specifiers.some((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier));
    const namedImportTarget = importWithNamed ?? fallbackImportWithNamed;
    if (namedImportTarget) {
        const namedSpecifiers = namedImportTarget.specifiers.filter((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier);
        const lastNamedSpecifier = namedSpecifiers[namedSpecifiers.length - 1] ?? namedSpecifiers[0];
        return {
            fixes: [
                fixer.insertTextAfter(lastNamedSpecifier, `, ${compareDeeplySpecifierText}`),
            ],
            localName: preferredLocalName,
        };
    }
    const importWithDefault = memoImports.find((memoImport) => memoImport.source.value === importSource &&
        memoImport.specifiers.some((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier));
    const fallbackImportWithDefault = memoImports.find((memoImport) => memoImport.specifiers.some((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier));
    const defaultImportTarget = importWithDefault ?? fallbackImportWithDefault;
    if (defaultImportTarget) {
        const defaultSpecifier = defaultImportTarget.specifiers.find((spec) => spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
        if (defaultSpecifier) {
            return {
                fixes: [
                    fixer.insertTextAfter(defaultSpecifier, `, { ${compareDeeplySpecifierText} }`),
                ],
                localName: preferredLocalName,
            };
        }
    }
    const importForInsertion = memoImports.find((memoImport) => memoImport.source.value === importSource) ?? memoImports[0];
    if (importForInsertion) {
        return {
            fixes: [
                fixer.insertTextAfter(importForInsertion, `\nimport { ${compareDeeplySpecifierText} } from '${importSource}';`),
            ],
            localName: preferredLocalName,
        };
    }
    const firstImport = program.body.find((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
    const importText = `import { ${compareDeeplySpecifierText} } from '${importSource}';\n`;
    if (firstImport) {
        return {
            fixes: [fixer.insertTextBefore(firstImport, importText)],
            localName: preferredLocalName,
        };
    }
    return {
        fixes: [fixer.insertTextBeforeRange([0, 0], importText)],
        localName: preferredLocalName,
    };
}
/**
 * Names of React types that represent renderable UI or component references.
 * Props typed as any of these are stable references (JSX elements, component
 * constructors, render-prop functions) and do NOT benefit from deep value
 * comparison — flagging them would produce false positives.
 */
const REACT_RENDER_TYPE_NAMES = new Set([
    'ReactNode',
    'ReactChild',
    'ReactElement',
    'ReactPortal',
    'ReactFragment',
    // JSX.Element resolves to a global symbol named 'Element' in the JSX namespace
    'Element',
    'Component',
    'PureComponent',
    'ComponentClass',
    'FunctionComponent',
    'FC',
    'ComponentType',
    'ExoticComponent',
    'NamedExoticComponent',
    'MemoExoticComponent',
    'ForwardRefExoticComponent',
    'LazyExoticComponent',
    'JSXElementConstructor',
    'RefObject',
    'RefCallback',
    'Ref',
]);
/**
 * Returns true when `sym` is declared inside a `.d.ts` file whose path
 * contains "react" — indicating it originates from @types/react rather than
 * from user code that happens to use the same name.
 *
 * Also returns true when the symbol has NO declarations at all: this happens
 * when TypeScript resolves the type as `any` because the source module (e.g.
 * @types/react) is not included in the tsconfig `types` array.  A symbol with
 * no declarations cannot be a user-defined type, so treating it as "from
 * React" is safe — it avoids flagging props that would otherwise be excluded
 * once the types are properly wired.
 */
function isSymbolFromReactDeclarationFile(sym) {
    const declarations = sym.declarations;
    // No declarations ⟹ the type was resolved from an unresolvable external
    // module (common when @types/react is absent from the tsconfig types list).
    // User-defined types always have at least one declaration.
    if (!declarations || declarations.length === 0)
        return true;
    return declarations.some((decl) => {
        const fileName = decl.getSourceFile?.()?.fileName ?? '';
        return fileName.endsWith('.d.ts') && /react/i.test(fileName);
    });
}
/**
 * Returns true when `type` is a React render-related type that should be
 * excluded from the "complex prop" check.  Detects by matching the type's
 * alias symbol or own symbol name against a known React-type allowlist AND
 * verifying the matched symbol's declaration originates from a React `.d.ts`
 * file to avoid false negatives for user types that coincidentally share the
 * same name.
 */
function isReactRenderType(type) {
    // Check the aliasSymbol first (covers type aliases like ReactNode, FC, etc.)
    const aliasSymbol = type
        .aliasSymbol;
    if (aliasSymbol) {
        const name = aliasSymbol.escapedName;
        if (REACT_RENDER_TYPE_NAMES.has(name) &&
            isSymbolFromReactDeclarationFile(aliasSymbol)) {
            return true;
        }
    }
    // Check the type's own symbol (covers interfaces / classes like ReactElement,
    // ComponentClass, ForwardRefExoticComponent, etc.)
    const sym = type.symbol;
    if (sym) {
        const name = sym.escapedName;
        if (REACT_RENDER_TYPE_NAMES.has(name) &&
            isSymbolFromReactDeclarationFile(sym)) {
            return true;
        }
    }
    return false;
}
function isComplexType(ts, type, checker) {
    return isComplexTypeInternal(ts, type, checker, new Set());
}
function isComplexTypeInternal(ts, type, checker, visited) {
    if (visited.has(type))
        return false;
    visited.add(type);
    // Exclude React render-related types before any structural checks.
    // This must come early so that ReactElement (an object type) and ReactNode
    // (a union containing ReactElement) are both short-circuited here rather
    // than being caught by the isObjectType / checkUnionType branches below.
    if (isReactRenderType(type)) {
        return false;
    }
    const flags = type.flags ?? 0;
    if (isUnionType(ts, flags)) {
        return checkUnionType(ts, type, checker, visited);
    }
    if (isIntersectionType(ts, flags)) {
        return checkIntersectionType(ts, type, checker, visited);
    }
    if (isPrimitiveType(ts, flags)) {
        return false;
    }
    if (isTypeParameter(ts, flags)) {
        return checkTypeParameter(ts, type, checker, visited);
    }
    if (hasCallSignatures(type)) {
        return false;
    }
    if (isArrayOrTupleType(checker, type)) {
        return true;
    }
    if (isObjectType(ts, flags)) {
        return true;
    }
    return false;
}
function isUnionType(ts, flags) {
    return (flags & ts.TypeFlags.Union) !== 0;
}
function checkUnionType(ts, unionType, checker, visited) {
    return unionType.types.some((t) => isComplexTypeInternal(ts, t, checker, visited));
}
function isIntersectionType(ts, flags) {
    return (flags & ts.TypeFlags.Intersection) !== 0;
}
function checkIntersectionType(ts, intersectionType, checker, visited) {
    return intersectionType.types.some((t) => isComplexTypeInternal(ts, t, checker, visited));
}
function isPrimitiveType(ts, flags) {
    return ((flags &
        (ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.BigIntLike |
            ts.TypeFlags.ESSymbolLike |
            ts.TypeFlags.Null |
            ts.TypeFlags.Undefined |
            ts.TypeFlags.Void |
            ts.TypeFlags.Never |
            ts.TypeFlags.EnumLike)) !==
        0);
}
function isTypeParameter(ts, flags) {
    return (flags & ts.TypeFlags.TypeParameter) !== 0;
}
function checkTypeParameter(ts, type, checker, visited) {
    const constraint = type.getConstraint?.();
    return constraint
        ? isComplexTypeInternal(ts, constraint, checker, visited)
        : false;
}
function hasCallSignatures(type) {
    const callSignatures = type.getCallSignatures?.() ?? [];
    return callSignatures.length > 0;
}
function isArrayOrTupleType(checker, type) {
    return Boolean(checker.isArrayType?.(type) || checker.isTupleType?.(type));
}
function isObjectType(ts, flags) {
    return (flags & ts.TypeFlags.Object) !== 0;
}
function getTypeFromSymbol(symbol, checker, tsNode) {
    const decl = symbol.valueDeclaration ??
        symbol.declarations?.[0];
    return checker.getTypeOfSymbolAtLocation(symbol, decl ?? tsNode);
}
function extractPropertyDeclaration(prop) {
    return (prop.valueDeclaration ??
        prop.declarations?.[0]);
}
function extractAnnotationType(propDeclaration) {
    if (!propDeclaration)
        return undefined;
    if ('type' in propDeclaration) {
        return propDeclaration.type;
    }
    return undefined;
}
/**
 * Returns true when an annotation TypeNode (the explicit type written in
 * source, e.g. `React.ComponentType` or `React.ReactNode | null`) resolves to
 * a React render type that must be excluded from the complex-prop check.
 *
 * This path is taken when the prop type resolves to `any` (common when
 * @types/react is not listed in the tsconfig `types` array) but the
 * annotation still carries the original alias name via the TypeScript
 * type-checker.
 *
 * For union annotation nodes (e.g. `ReactNode | null`), all non-null /
 * non-undefined members must themselves be React render types for the whole
 * union to be considered a React render type.
 */
function isAnnotationReactRenderType(annotationType, checker, ts) {
    try {
        const tsModule = ts;
        // Handle union annotation nodes like `React.ReactNode | null`.
        if (tsModule.isUnionTypeNode?.(annotationType)) {
            const nonNullishMembers = annotationType.types.filter((member) => {
                // Nullish keywords appearing directly (older TypeScript AST forms)
                if (member.kind === tsModule.SyntaxKind.NullKeyword ||
                    member.kind === tsModule.SyntaxKind.UndefinedKeyword ||
                    member.kind === tsModule.SyntaxKind.VoidKeyword) {
                    return false;
                }
                // `null` and `undefined` appear as LiteralTypeNode wrapping the
                // corresponding keyword in modern TypeScript AST.
                if (tsModule.isLiteralTypeNode?.(member)) {
                    const lit = member.literal;
                    if (lit.kind === tsModule.SyntaxKind.NullKeyword ||
                        lit.kind === tsModule.SyntaxKind.UndefinedKeyword) {
                        return false;
                    }
                }
                return true;
            });
            // If every non-nullish member is a React render type, the union is too.
            return (nonNullishMembers.length > 0 &&
                nonNullishMembers.every((member) => isAnnotationReactRenderType(member, checker, ts)));
        }
        // For plain TypeReference nodes (the common case), resolve via the checker.
        const resolvedType = checker.getTypeFromTypeNode?.(annotationType);
        if (!resolvedType)
            return false;
        return isReactRenderType(resolvedType);
    }
    catch {
        return false;
    }
}
function shouldTreatAnyAsComplex(prop, propType, ts, treatAnyAsComplex, parentTypeFlags, checker) {
    if (!(propType.flags & ts.TypeFlags.Any))
        return false;
    if (treatAnyAsComplex)
        return true;
    const propDeclaration = extractPropertyDeclaration(prop);
    const annotationType = extractAnnotationType(propDeclaration);
    // When the annotation resolves to a React render type, the prop is a
    // stable component/render-prop reference that does not benefit from deep
    // value comparison — exclude it regardless of the any-as-complex heuristic.
    if (annotationType &&
        checker &&
        isAnnotationReactRenderType(annotationType, checker, ts)) {
        return false;
    }
    return ((annotationType && annotationType.kind !== ts.SyntaxKind.AnyKeyword) ||
        (!annotationType && Boolean(parentTypeFlags & ts.TypeFlags.Object)));
}
function isPropertyComplex(prop, checker, tsNode, ts, treatAnyAsComplex, parentTypeFlags) {
    const propType = getTypeFromSymbol(prop, checker, tsNode);
    if (isComplexType(ts, propType, checker)) {
        return true;
    }
    return shouldTreatAnyAsComplex(prop, propType, ts, treatAnyAsComplex, parentTypeFlags, checker);
}
function getComplexPropertiesFromType(type, checker, tsNode, ts, treatAnyAsComplex = false, parentTypeFlags = 0) {
    const properties = checker.getPropertiesOfType(type);
    const complexProps = [];
    for (const prop of properties) {
        if (isReservedReactPropName(prop.name))
            continue;
        if (isPropertyComplex(prop, checker, tsNode, ts, treatAnyAsComplex, parentTypeFlags)) {
            complexProps.push(prop.name);
        }
    }
    return complexProps;
}
function normalizePropsOrder(props) {
    return Array.from(new Set(props)).sort((a, b) => a.localeCompare(b));
}
function extractComplexPropsFromSignature(signature, checker, tsNode, ts) {
    const params = signature.getParameters?.() ?? [];
    if (params.length === 0)
        return [];
    const propsSymbol = params[0];
    const propsType = getTypeFromSymbol(propsSymbol, checker, tsNode);
    return getComplexPropertiesFromType(propsType, checker, tsNode, ts, false, propsType.flags ?? 0);
}
function extractPropsFromTypeArguments(paramTsNode, checker, ts) {
    let cursor = paramTsNode;
    while (cursor && !ts.isCallExpression(cursor)) {
        cursor = cursor.parent;
    }
    const parentCall = cursor && ts.isCallExpression(cursor) ? cursor : undefined;
    const propsTypeArg = parentCall?.typeArguments?.[1];
    if (propsTypeArg) {
        const typeFromArg = checker.getTypeFromTypeNode(propsTypeArg);
        return getComplexPropertiesFromType(typeFromArg, checker, propsTypeArg, ts, true, typeFromArg.flags ?? 0);
    }
    return [];
}
function extractPropsFromFunctionParam(param, services, ts) {
    const checker = services.program.getTypeChecker();
    const paramTsNode = services.esTreeNodeToTSNodeMap.get(param);
    if (!paramTsNode)
        return [];
    const paramType = checker.getTypeAtLocation(paramTsNode);
    if (paramType.flags & ts.TypeFlags.Any) {
        const propsFromTypeArgs = extractPropsFromTypeArguments(paramTsNode, checker, ts);
        if (propsFromTypeArgs.length > 0) {
            return normalizePropsOrder(propsFromTypeArgs);
        }
    }
    const treatAnyAsComplex = Boolean(paramType.flags & ts.TypeFlags.Any);
    return normalizePropsOrder(getComplexPropertiesFromType(paramType, checker, paramTsNode, ts, treatAnyAsComplex, paramType.flags ?? 0));
}
function extractPropsFromComponentSignatures(tsNode, checker, ts) {
    const componentType = checker.getTypeAtLocation(tsNode);
    const signatures = componentType.getCallSignatures?.() ?? [];
    const complexProps = new Set();
    for (const signature of signatures) {
        const propsFromSignature = extractComplexPropsFromSignature(signature, checker, tsNode, ts);
        propsFromSignature.forEach((prop) => complexProps.add(prop));
    }
    return normalizePropsOrder(Array.from(complexProps));
}
function loadTypeScriptModule() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('typescript');
}
function toComponentTsNode(componentExpr, services) {
    return services.esTreeNodeToTSNodeMap.get(componentExpr) ?? null;
}
function isFunctionComponentWithProps(componentExpr) {
    return ((componentExpr.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        componentExpr.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
        Boolean(componentExpr.params[0]));
}
function analyzeComponentTypes(componentExpr, services) {
    const tsNode = toComponentTsNode(componentExpr, services);
    if (!tsNode)
        return null;
    const ts = loadTypeScriptModule();
    const checker = services.program.getTypeChecker();
    return { ts, tsNode, checker };
}
function getComplexPropsFromComponent(componentExpr, services) {
    const analysis = analyzeComponentTypes(componentExpr, services);
    if (!analysis)
        return [];
    const { ts, tsNode, checker } = analysis;
    if (isFunctionComponentWithProps(componentExpr)) {
        return extractPropsFromFunctionParam(componentExpr.params[0], services, ts);
    }
    return extractPropsFromComponentSignatures(tsNode, checker, ts);
}
function collectComplexProps(componentExpr, sourceCode, complexPropsCache) {
    const cached = complexPropsCache.get(componentExpr);
    if (cached)
        return cached;
    const services = sourceCode.parserServices;
    if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
        return [];
    }
    try {
        const result = getComplexPropsFromComponent(componentExpr, services);
        complexPropsCache.set(componentExpr, result);
        return result;
    }
    catch (error) {
        if (process.env.ESLINT_CUSTOM_RULES_DEBUG === '1') {
            const componentText = sourceCode.getText(componentExpr);
            // Log to aid debugging when type analysis unexpectedly fails.
            // eslint-disable-next-line no-console
            console.warn('[memo-compare-deeply-complex-props] Type analysis failed for component expression:', componentText, error instanceof Error ? error.stack ?? error.message : String(error));
        }
        return [];
    }
}
function findComponentAnalysisTargets(componentArg, getInitializer) {
    const unwrappedComponent = unwrapExpression(componentArg);
    const initializerExpression = unwrappedComponent.type === utils_1.AST_NODE_TYPES.Identifier
        ? getInitializer(unwrappedComponent.name)
        : null;
    const unwrappedInitializer = initializerExpression
        ? unwrapExpression(initializerExpression)
        : null;
    const initializerWrappedCandidate = unwrappedInitializer &&
        unwrappedInitializer.type === utils_1.AST_NODE_TYPES.CallExpression &&
        unwrappedInitializer.arguments.length > 0 &&
        unwrappedInitializer.arguments[0]?.type !== utils_1.AST_NODE_TYPES.SpreadElement
        ? unwrapExpression(unwrappedInitializer.arguments[0])
        : null;
    const wrappedInnerCandidate = unwrappedComponent.type === utils_1.AST_NODE_TYPES.CallExpression &&
        unwrappedComponent.arguments.length > 0 &&
        unwrappedComponent.arguments[0]?.type !== utils_1.AST_NODE_TYPES.SpreadElement
        ? unwrapExpression(unwrappedComponent.arguments[0])
        : null;
    const analysisTarget = (initializerWrappedCandidate &&
        isComponentExpression(initializerWrappedCandidate)
        ? initializerWrappedCandidate
        : null) ??
        (unwrappedInitializer && isComponentExpression(unwrappedInitializer)
            ? unwrappedInitializer
            : null) ??
        (isComponentExpression(unwrappedComponent) ? unwrappedComponent : null) ??
        (wrappedInnerCandidate && isComponentExpression(wrappedInnerCandidate)
            ? wrappedInnerCandidate
            : null);
    if (!analysisTarget)
        return null;
    const preferredAnalysisTarget = initializerWrappedCandidate ?? wrappedInnerCandidate ?? analysisTarget;
    return {
        unwrappedComponent,
        unwrappedInitializer,
        initializerWrappedCandidate,
        wrappedInnerCandidate,
        analysisTarget,
        preferredAnalysisTarget,
    };
}
function collectComplexPropsForTargets(targets, getComplexProps) {
    let complexProps = getComplexProps(targets.preferredAnalysisTarget);
    if (complexProps.length === 0 &&
        targets.preferredAnalysisTarget !== targets.analysisTarget) {
        complexProps = getComplexProps(targets.analysisTarget);
    }
    if (complexProps.length === 0 &&
        targets.wrappedInnerCandidate &&
        targets.wrappedInnerCandidate !== targets.preferredAnalysisTarget) {
        complexProps = getComplexProps(targets.wrappedInnerCandidate);
    }
    return complexProps;
}
function resolveComponentName(targets, componentArg) {
    return ((targets.initializerWrappedCandidate
        ? componentDisplayName(targets.initializerWrappedCandidate)
        : null) ??
        (targets.unwrappedInitializer
            ? componentDisplayName(targets.unwrappedInitializer)
            : null) ??
        componentDisplayName(targets.unwrappedComponent) ??
        (targets.wrappedInnerCandidate
            ? componentDisplayName(targets.wrappedInnerCandidate)
            : null) ??
        componentDisplayName(componentArg) ??
        'component');
}
function buildMemoFixes(sourceCode, fixer, callExpression, comparatorArg, propsCall, memoSource, scope, resolveCompareDeeplyImport) {
    const fixes = [];
    const importResult = resolveCompareDeeplyImport(fixer, memoSource);
    if (comparatorArg &&
        comparatorArg.type !== utils_1.AST_NODE_TYPES.SpreadElement &&
        isNullishComparatorArgument(comparatorArg, scope)) {
        fixes.push(fixer.replaceTextRange(rangeWithParentheses(sourceCode, comparatorArg), `${importResult.localName}(${propsCall})`));
    }
    else {
        const closingParen = sourceCode.getLastToken(callExpression);
        if (closingParen) {
            const tokenBeforeParen = sourceCode.getTokenBefore(closingParen);
            const comparatorText = `${importResult.localName}(${propsCall})`;
            if (tokenBeforeParen?.value === ',') {
                fixes.push(fixer.replaceText(tokenBeforeParen, `, ${comparatorText}`));
            }
            else {
                fixes.push(fixer.insertTextBefore(closingParen, `, ${comparatorText}`));
            }
        }
    }
    fixes.push(...importResult.fixes);
    return fixes;
}
function createMemoImportTracking() {
    const memoIdentifiers = new Map();
    const memoNamespaces = new Map();
    function recordImport(node) {
        if (node.importKind === 'type')
            return;
        if (typeof node.source.value !== 'string')
            return;
        const importPath = node.source.value;
        for (const specifier of node.specifiers) {
            if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                specifier.imported.name === 'memo' &&
                (importPath === 'react' || isUtilMemoModulePath(importPath))) {
                memoIdentifiers.set(specifier.local.name, importPath);
            }
            if (specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
                specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                if (importPath === 'react') {
                    memoNamespaces.set(specifier.local.name, importPath);
                }
                else if (isUtilMemoModulePath(importPath)) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
                        memoNamespaces.set(specifier.local.name, importPath);
                    }
                    else {
                        memoIdentifiers.set(specifier.local.name, importPath);
                    }
                }
            }
        }
    }
    function isMemoCall(node) {
        if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
            memoIdentifiers.has(node.callee.name)) {
            return {
                source: memoIdentifiers.get(node.callee.name),
                callee: node.callee,
            };
        }
        if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            !node.callee.computed &&
            node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            node.callee.property.name === 'memo' &&
            node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
            memoNamespaces.has(node.callee.object.name)) {
            return {
                source: memoNamespaces.get(node.callee.object.name),
                callee: node.callee,
            };
        }
        return null;
    }
    return {
        memoIdentifiers,
        memoNamespaces,
        recordImport,
        isMemoCall,
    };
}
function createComponentInitializerTracker() {
    const componentInitializers = new WeakMap();
    function recordComponentInitializer(node, scope) {
        if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier || !node.init)
            return;
        const currentScopeInitializers = componentInitializers.get(scope) ??
            new Map();
        currentScopeInitializers.set(node.id.name, node.init);
        componentInitializers.set(scope, currentScopeInitializers);
    }
    function getInitializer(name, scope) {
        let currentScope = scope;
        while (currentScope) {
            const initializerMap = componentInitializers.get(currentScope);
            if (initializerMap?.has(name)) {
                return initializerMap.get(name) ?? null;
            }
            currentScope =
                currentScope.upper ?? null;
        }
        return null;
    }
    return {
        recordComponentInitializer,
        getInitializer,
    };
}
exports.memoCompareDeeplyComplexProps = (0, createRule_1.createRule)({
    name: 'memo-compare-deeply-complex-props',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Suggest compareDeeply for memoized components that receive object/array props to avoid shallow comparison re-renders.',
            recommended: 'error',
            requiresTypeChecking: true,
        },
        fixable: 'code',
        schema: [],
        messages: {
            useCompareDeeply: 'What\'s wrong: Memoized component "{{componentName}}" receives complex prop(s) {{propsList}} but memo still uses shallow reference comparison → Why it matters: Objects/arrays are often recreated on each render, so shallow comparison treats them as "changed" and triggers avoidable re-renders → How to fix: Pass compareDeeply({{propsCall}}) as memo\'s second argument to compare those props by value.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const usedNames = collectUsedNames(sourceCode);
        const complexPropsCache = new WeakMap();
        const memoImportTracking = createMemoImportTracking();
        const initializerTracking = createComponentInitializerTracker();
        let cachedCompareDeeplyImportLocalName = null;
        function resolveCompareDeeplyImport(fixer, memoSource) {
            if (cachedCompareDeeplyImportLocalName) {
                return { fixes: [], localName: cachedCompareDeeplyImportLocalName };
            }
            const result = ensureCompareDeeplyImportFixes(sourceCode, fixer, usedNames, memoSource);
            cachedCompareDeeplyImportLocalName = result.localName;
            return result;
        }
        function validateMemoCall(node) {
            const memoCall = memoImportTracking.isMemoCall(node);
            if (!memoCall)
                return null;
            if (node.arguments.length === 0 || node.arguments.length > 2)
                return null;
            const componentArg = node.arguments[0];
            if (!componentArg || componentArg.type === utils_1.AST_NODE_TYPES.SpreadElement)
                return null;
            const comparatorArg = node.arguments[1];
            return { memoCall, componentArg, comparatorArg };
        }
        function analyzeComponentAndProps(componentArg, comparatorArg, currentScope, memoSource) {
            const componentTargets = findComponentAnalysisTargets(componentArg, (name) => initializerTracking.getInitializer(name, currentScope));
            if (!componentTargets)
                return null;
            if (isComparatorProvided(comparatorArg, currentScope))
                return null;
            let complexProps = collectComplexPropsForTargets(componentTargets, (expr) => collectComplexProps(expr, sourceCode, complexPropsCache));
            if (isUtilMemoModulePath(memoSource)) {
                complexProps = complexProps.filter((prop) => !isDefaultDeepCompareProp(prop));
            }
            if (complexProps.length === 0)
                return null;
            const componentName = resolveComponentName(componentTargets, componentArg);
            return { complexProps, componentName };
        }
        function generateReportData(complexProps, componentName) {
            const propsList = `[${complexProps.join(', ')}]`;
            const propsCall = complexProps
                .map((prop) => escapeStringForCodeGeneration(prop))
                .join(', ');
            return { componentName, propsList, propsCall };
        }
        return {
            ImportDeclaration: memoImportTracking.recordImport,
            VariableDeclarator(node) {
                initializerTracking.recordComponentInitializer(node, context.getScope());
            },
            CallExpression(node) {
                const validationResult = validateMemoCall(node);
                if (!validationResult)
                    return;
                const { memoCall, componentArg, comparatorArg } = validationResult;
                const currentScope = context.getScope();
                const analysisResult = analyzeComponentAndProps(componentArg, comparatorArg, currentScope, memoCall.source);
                if (!analysisResult)
                    return;
                const { complexProps, componentName } = analysisResult;
                const { propsList, propsCall } = generateReportData(complexProps, componentName);
                context.report({
                    node,
                    messageId: 'useCompareDeeply',
                    data: {
                        componentName,
                        propsList,
                        propsCall,
                    },
                    fix(fixer) {
                        return buildMemoFixes(sourceCode, fixer, node, comparatorArg, propsCall, memoCall.source, currentScope, resolveCompareDeeplyImport);
                    },
                });
            },
        };
    },
});
exports.default = exports.memoCompareDeeplyComplexProps;
//# sourceMappingURL=memo-compare-deeply-complex-props.js.map