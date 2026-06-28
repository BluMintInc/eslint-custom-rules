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
export declare function describeTypeKind(t: ts.Type, tsModule: TypeScriptModule, options: ClassifierOptions): string;
/**
 * Classifies a TypeScript type as primitive, non-primitive, or unknown.
 */
export declare function classifyType(t: ts.Type, tsModule: TypeScriptModule, options: ClassifierOptions): 'primitive' | 'non-primitive' | 'unknown';
/**
 * Classifies the type of an expression using TypeScript's type checker.
 */
export declare function classifyExpressionType(expr: TSESTree.Expression, { checker, tsModule, parserServices, options, }: {
    checker: ts.TypeChecker;
    tsModule: TypeScriptModule;
    parserServices: ParserServices;
    options: ClassifierOptions;
}): ClassificationResult;
