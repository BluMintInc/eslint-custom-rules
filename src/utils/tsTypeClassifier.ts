import { TSESTree, ParserServices } from '@typescript-eslint/utils';
import * as ts from 'typescript';

/**
 * Re-exporting the typescript namespace type to avoid TS4078.
 */
export type TypeScriptModule = typeof ts;

export type ClassifierOptions = {
  ignoreSymbol?: boolean;
};

export type ClassificationResult = {
  status: 'primitive' | 'non-primitive' | 'unknown';
  kind: string;
};

/**
 * Describes the kind of a primitive type for error messages.
 */
export function describeTypeKind(
  t: ts.Type,
  tsModule: TypeScriptModule,
  options: ClassifierOptions,
): string {
  if (t.isUnion()) {
    const kinds = new Set(
      t.types
        .map((part) => describeTypeKind(part, tsModule, options))
        .filter((k) => k !== 'primitive value'),
    );
    if (kinds.size === 1) {
      return kinds.values().next().value ?? 'primitive value';
    }
    return 'primitive value';
  }

  const flags = t.flags;
  const tsInternal = tsModule;

  if (flags & tsInternal.TypeFlags.String) return 'string value';
  if (flags & tsInternal.TypeFlags.StringLiteral) return 'string value';
  if (flags & tsInternal.TypeFlags.TemplateLiteral) return 'string value';
  if (flags & tsInternal.TypeFlags.Number) return 'number value';
  if (flags & tsInternal.TypeFlags.NumberLiteral) return 'number value';
  if (flags & tsInternal.TypeFlags.Enum) return 'number value';
  if (flags & tsInternal.TypeFlags.EnumLiteral) return 'number value';
  if (flags & tsInternal.TypeFlags.Boolean) return 'boolean value';
  if (flags & tsInternal.TypeFlags.BooleanLiteral) return 'boolean value';
  if (flags & tsInternal.TypeFlags.BigInt) return 'bigint value';
  if (flags & tsInternal.TypeFlags.BigIntLiteral) return 'bigint value';
  if (flags & tsInternal.TypeFlags.Null) return 'null value';
  if (flags & tsInternal.TypeFlags.Undefined) return 'undefined value';
  if (
    !options.ignoreSymbol &&
    (flags & tsInternal.TypeFlags.ESSymbol || flags & tsInternal.TypeFlags.UniqueESSymbol)
  ) {
    return 'symbol value';
  }

  return 'primitive value';
}

/**
 * Classifies a TypeScript type as primitive, non-primitive, or unknown.
 */
export function classifyType(
  t: ts.Type,
  tsModule: TypeScriptModule,
  options: ClassifierOptions,
): 'primitive' | 'non-primitive' | 'unknown' {
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

  if (t.isIntersection()) return 'non-primitive';

  const flags = t.getFlags();
  const tsInternal = tsModule;

  if (
    flags &
    (tsInternal.TypeFlags.Any |
      tsInternal.TypeFlags.Unknown |
      tsInternal.TypeFlags.Never |
      tsInternal.TypeFlags.TypeParameter)
  ) {
    return 'unknown';
  }

  if (
    flags &
    (tsInternal.TypeFlags.Object |
      tsInternal.TypeFlags.NonPrimitive |
      tsInternal.TypeFlags.Index |
      tsInternal.TypeFlags.IndexedAccess |
      tsInternal.TypeFlags.Conditional |
      tsInternal.TypeFlags.Substitution)
  ) {
    return 'non-primitive';
  }

  if (flags & tsInternal.TypeFlags.Void) {
    return 'unknown';
  }

  if (
    options.ignoreSymbol &&
    (flags & tsInternal.TypeFlags.ESSymbol || flags & tsInternal.TypeFlags.UniqueESSymbol)
  ) {
    return 'non-primitive';
  }

  if (
    flags &
    (tsInternal.TypeFlags.String |
      tsInternal.TypeFlags.StringLiteral |
      tsInternal.TypeFlags.TemplateLiteral |
      tsInternal.TypeFlags.Number |
      tsInternal.TypeFlags.NumberLiteral |
      tsInternal.TypeFlags.Enum |
      tsInternal.TypeFlags.EnumLiteral |
      tsInternal.TypeFlags.Boolean |
      tsInternal.TypeFlags.BooleanLiteral |
      tsInternal.TypeFlags.BigInt |
      tsInternal.TypeFlags.BigIntLiteral |
      tsInternal.TypeFlags.Null |
      tsInternal.TypeFlags.Undefined)
  ) {
    return 'primitive';
  }

  if (
    !options.ignoreSymbol &&
    (flags & tsInternal.TypeFlags.ESSymbol || flags & tsInternal.TypeFlags.UniqueESSymbol)
  ) {
    return 'primitive';
  }

  return 'unknown';
}

/**
 * Classifies the type of an expression using TypeScript's type checker.
 */
export function classifyExpressionType(
  expr: TSESTree.Expression,
  {
    checker,
    tsModule,
    parserServices,
    options,
  }: {
    checker: ts.TypeChecker;
    tsModule: TypeScriptModule;
    parserServices: ParserServices;
    options: ClassifierOptions;
  },
): ClassificationResult {
  try {
    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expr);
    if (!tsNode) {
      /* istanbul ignore next -- rare when parser services mismatch */
      return { status: 'unknown', kind: 'primitive value' };
    }

    const type = checker.getTypeAtLocation(tsNode);
    const classification = classifyType(type, tsModule, options);
    if (classification === 'primitive') {
      return {
        status: 'primitive',
        kind: describeTypeKind(type, tsModule, options),
      };
    }

    return { status: classification, kind: 'primitive value' };
  } catch {
    /* istanbul ignore next -- defensive fallback when type evaluation fails */
    return { status: 'unknown', kind: 'primitive value' };
  }
}
