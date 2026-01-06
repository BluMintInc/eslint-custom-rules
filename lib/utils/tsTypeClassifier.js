"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyExpressionType = exports.classifyType = exports.describeTypeKind = void 0;
/**
 * Describes the kind of a primitive type for error messages.
 */
function describeTypeKind(t, tsModule, options) {
    if (t.isUnion()) {
        const kinds = new Set(t.types
            .map((part) => describeTypeKind(part, tsModule, options))
            .filter((k) => k !== 'primitive value'));
        if (kinds.size === 0) {
            return 'primitive value';
        }
        if (kinds.size === 1) {
            return kinds.values().next().value ?? 'primitive value';
        }
        // Multiple distinct primitive kinds
        const sortedKinds = Array.from(kinds).sort();
        return `${sortedKinds.join(' or ')}`;
    }
    const flags = t.flags;
    if (flags & tsModule.TypeFlags.String)
        return 'string value';
    if (flags & tsModule.TypeFlags.StringLiteral)
        return 'string value';
    if (flags & tsModule.TypeFlags.TemplateLiteral)
        return 'string value';
    if (flags & tsModule.TypeFlags.Number)
        return 'number value';
    if (flags & tsModule.TypeFlags.NumberLiteral)
        return 'number value';
    if (flags & tsModule.TypeFlags.Enum)
        return 'number value';
    if (flags & tsModule.TypeFlags.EnumLiteral)
        return 'number value';
    if (flags & tsModule.TypeFlags.Boolean)
        return 'boolean value';
    if (flags & tsModule.TypeFlags.BooleanLiteral)
        return 'boolean value';
    if (flags & tsModule.TypeFlags.BigInt)
        return 'bigint value';
    if (flags & tsModule.TypeFlags.BigIntLiteral)
        return 'bigint value';
    if (flags & tsModule.TypeFlags.Null)
        return 'null value';
    if (flags & tsModule.TypeFlags.Undefined)
        return 'undefined value';
    if (flags &
        (tsModule.TypeFlags.ESSymbol | tsModule.TypeFlags.UniqueESSymbol)) {
        return 'symbol value';
    }
    return 'primitive value';
}
exports.describeTypeKind = describeTypeKind;
/**
 * Classifies a TypeScript type as primitive, non-primitive, or unknown.
 */
function classifyType(t, tsModule, options) {
    if (t.isUnion()) {
        let sawUnknown = false;
        for (const part of t.types) {
            const result = classifyType(part, tsModule, options);
            if (result === 'non-primitive') {
                return 'non-primitive';
            }
            if (result === 'unknown') {
                sawUnknown = true;
            }
        }
        return sawUnknown ? 'unknown' : 'primitive';
    }
    if (t.isIntersection())
        return 'non-primitive';
    const flags = t.getFlags();
    if (flags &
        (tsModule.TypeFlags.Any |
            tsModule.TypeFlags.Unknown |
            tsModule.TypeFlags.Never |
            tsModule.TypeFlags.TypeParameter)) {
        return 'unknown';
    }
    if (flags &
        (tsModule.TypeFlags.Object |
            tsModule.TypeFlags.NonPrimitive |
            tsModule.TypeFlags.Index |
            tsModule.TypeFlags.IndexedAccess |
            tsModule.TypeFlags.Conditional |
            tsModule.TypeFlags.Substitution)) {
        return 'non-primitive';
    }
    if (flags & tsModule.TypeFlags.Void) {
        return 'unknown';
    }
    if (flags &
        (tsModule.TypeFlags.ESSymbol | tsModule.TypeFlags.UniqueESSymbol)) {
        return options.ignoreSymbol ? 'non-primitive' : 'primitive';
    }
    if (flags &
        (tsModule.TypeFlags.String |
            tsModule.TypeFlags.StringLiteral |
            tsModule.TypeFlags.TemplateLiteral |
            tsModule.TypeFlags.Number |
            tsModule.TypeFlags.NumberLiteral |
            tsModule.TypeFlags.Enum |
            tsModule.TypeFlags.EnumLiteral |
            tsModule.TypeFlags.Boolean |
            tsModule.TypeFlags.BooleanLiteral |
            tsModule.TypeFlags.BigInt |
            tsModule.TypeFlags.BigIntLiteral |
            tsModule.TypeFlags.Null |
            tsModule.TypeFlags.Undefined)) {
        return 'primitive';
    }
    return 'unknown';
}
exports.classifyType = classifyType;
/**
 * Classifies the type of an expression using TypeScript's type checker.
 */
function classifyExpressionType(expr, { checker, tsModule, parserServices, options, }) {
    try {
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expr);
        if (!tsNode) {
            /* istanbul ignore next -- rare when parser services mismatch */
            return { status: 'unknown', kind: 'unknown value' };
        }
        const type = checker.getTypeAtLocation(tsNode);
        const classification = classifyType(type, tsModule, options);
        if (classification === 'primitive') {
            return {
                status: 'primitive',
                kind: describeTypeKind(type, tsModule, options),
            };
        }
        return {
            status: classification,
            kind: classification === 'non-primitive'
                ? 'non-primitive value'
                : 'unknown value',
        };
    }
    catch {
        /* istanbul ignore next -- defensive fallback when type evaluation fails */
        return { status: 'unknown', kind: 'unknown value' };
    }
}
exports.classifyExpressionType = classifyExpressionType;
//# sourceMappingURL=tsTypeClassifier.js.map