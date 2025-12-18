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

  if (flags & tsModule.TypeFlags.String) return 'string value';
  if (flags & tsModule.TypeFlags.StringLiteral) return 'string value';
  if (flags & tsModule.TypeFlags.TemplateLiteral) return 'string value';
  if (flags & tsModule.TypeFlags.Number) return 'number value';
  if (flags & tsModule.TypeFlags.NumberLiteral) return 'number value';
  if (flags & tsModule.TypeFlags.Enum) return 'number value';
  if (flags & tsModule.TypeFlags.EnumLiteral) return 'number value';
  if (flags & tsModule.TypeFlags.Boolean) return 'boolean value';
  if (flags & tsModule.TypeFlags.BooleanLiteral) return 'boolean value';
  if (flags & tsModule.TypeFlags.BigInt) return 'bigint value';
  if (flags & tsModule.TypeFlags.BigIntLiteral) return 'bigint value';
  if (flags & tsModule.TypeFlags.Null) return 'null value';
  if (flags & tsModule.TypeFlags.Undefined) return 'undefined value';
  if (
    !options.ignoreSymbol &&
    (flags & tsModule.TypeFlags.ESSymbol || flags & tsModule.TypeFlags.UniqueESSymbol)
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

  if (
    flags &
    (tsModule.TypeFlags.Any |
      tsModule.TypeFlags.Unknown |
      tsModule.TypeFlags.Never |
      tsModule.TypeFlags.TypeParameter)
  ) {
    return 'unknown';
  }

  if (
    flags &
    (tsModule.TypeFlags.Object |
      tsModule.TypeFlags.NonPrimitive |
      tsModule.TypeFlags.Index |
      tsModule.TypeFlags.IndexedAccess |
      tsModule.TypeFlags.Conditional |
      tsModule.TypeFlags.Substitution)
  ) {
    return 'non-primitive';
  }

  if (flags & tsModule.TypeFlags.Void) {
    return 'unknown';
  }

  if (
    options.ignoreSymbol &&
    (flags & tsModule.TypeFlags.ESSymbol || flags & tsModule.TypeFlags.UniqueESSymbol)
  ) {
    return 'non-primitive';
  }

  if (
    flags &
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
      tsModule.TypeFlags.Undefined)
  ) {
    return 'primitive';
  }

  if (
    !options.ignoreSymbol &&
    (flags & tsModule.TypeFlags.ESSymbol || flags & tsModule.TypeFlags.UniqueESSymbol)
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
