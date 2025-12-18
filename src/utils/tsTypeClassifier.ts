import { TSESTree, ParserServices } from '@typescript-eslint/utils';
import type * as ts from 'typescript';

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
  tsModule: typeof ts,
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
  const ts = tsModule;

  if (flags & ts.TypeFlags.String) return 'string value';
  if (flags & ts.TypeFlags.StringLiteral) return 'string value';
  if (flags & ts.TypeFlags.TemplateLiteral) return 'string value';
  if (flags & ts.TypeFlags.Number) return 'number value';
  if (flags & ts.TypeFlags.NumberLiteral) return 'number value';
  if (flags & ts.TypeFlags.Enum) return 'number value';
  if (flags & ts.TypeFlags.EnumLiteral) return 'number value';
  if (flags & ts.TypeFlags.Boolean) return 'boolean value';
  if (flags & ts.TypeFlags.BooleanLiteral) return 'boolean value';
  if (flags & ts.TypeFlags.BigInt) return 'bigint value';
  if (flags & ts.TypeFlags.BigIntLiteral) return 'bigint value';
  if (flags & ts.TypeFlags.Null) return 'null value';
  if (flags & ts.TypeFlags.Undefined) return 'undefined value';
  if (
    !options.ignoreSymbol &&
    (flags & ts.TypeFlags.ESSymbol || flags & ts.TypeFlags.UniqueESSymbol)
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
  tsModule: typeof ts,
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
  const ts = tsModule;

  if (
    flags &
    (ts.TypeFlags.Any |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.Never |
      ts.TypeFlags.TypeParameter)
  ) {
    return 'unknown';
  }

  if (
    flags &
    (ts.TypeFlags.Object |
      ts.TypeFlags.NonPrimitive |
      ts.TypeFlags.Index |
      ts.TypeFlags.IndexedAccess |
      ts.TypeFlags.Conditional |
      ts.TypeFlags.Substitution)
  ) {
    return 'non-primitive';
  }

  if (flags & ts.TypeFlags.Void) {
    return 'unknown';
  }

  if (
    options.ignoreSymbol &&
    (flags & ts.TypeFlags.ESSymbol || flags & ts.TypeFlags.UniqueESSymbol)
  ) {
    return 'non-primitive';
  }

  if (
    flags &
    (ts.TypeFlags.String |
      ts.TypeFlags.StringLiteral |
      ts.TypeFlags.TemplateLiteral |
      ts.TypeFlags.Number |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.Enum |
      ts.TypeFlags.EnumLiteral |
      ts.TypeFlags.Boolean |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.BigInt |
      ts.TypeFlags.BigIntLiteral |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined)
  ) {
    return 'primitive';
  }

  if (
    !options.ignoreSymbol &&
    (flags & ts.TypeFlags.ESSymbol || flags & ts.TypeFlags.UniqueESSymbol)
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
    tsModule: typeof ts;
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
