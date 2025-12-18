import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

/**
 * Extracts a stable, human-readable name from method/property/member nodes.
 * Use the options to align prefixing and computed-key handling with rule semantics.
 */
export type GetMethodNameOptions = {
  /**
   * Prefix applied to private identifiers:
   * - undefined (default): empty prefix
   * - null: return the raw name without any prefix
   * - string (e.g., '#'): prepend the given prefix
   */
  privateIdentifierPrefix?: string | null;
  /**
   * When true (default), computed keys fall back to source text; when false, returns empty string.
   */
  computedFallbackToText?: boolean;
};

const getKeyName = (
  key: TSESTree.Node,
  sourceCode: Readonly<{ getText: (node: TSESTree.Node) => string }>,
  { privateIdentifierPrefix = '', computedFallbackToText = true }: GetMethodNameOptions,
): string => {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    if (privateIdentifierPrefix === null) {
      return key.name;
    }

    return `${privateIdentifierPrefix}${key.name}`;
  }

  if (key.type === AST_NODE_TYPES.Literal) {
    if (key.value === null || key.value === undefined) {
      return '';
    }

    return String(key.value);
  }

  return computedFallbackToText ? sourceCode.getText(key) : '';
};

export const getMethodName = (
  method:
    | TSESTree.MethodDefinition
    | TSESTree.TSAbstractMethodDefinition
    | TSESTree.PropertyDefinition,
  sourceCode: Readonly<{ getText: (node: TSESTree.Node) => string }>,
  options: GetMethodNameOptions = {},
): string => {
  return getKeyName(method.key, sourceCode, options);
};

export const getPropertyName = (
  key: TSESTree.PropertyName | TSESTree.PrivateIdentifier,
  sourceCode: Readonly<{ getText: (node: TSESTree.Node) => string }>,
  options: GetMethodNameOptions = {},
): string => {
  return getKeyName(key, sourceCode, options);
};

export const getMemberExpressionName = (
  member: TSESTree.MemberExpression,
  sourceCode: Readonly<{ getText: (node: TSESTree.Node) => string }>,
  options: GetMethodNameOptions = {},
): string => {
  return getKeyName(member.property, sourceCode, options);
};

