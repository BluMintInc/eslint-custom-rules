import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantBooleanProp';
type Options = [
  {
    booleanPrefixes?: string[];
    callbackPrefixes?: string[];
    booleanSuffixesToStrip?: string[];
    exemptQualifiers?: string[];
    minNounLengthForSuffixMatch?: number;
  }?,
];

/**
 * Default boolean prop prefixes that signal visibility/enablement control —
 * the patterns most likely to be redundant when a matching callback exists.
 * Prefixes like `is`/`has` represent state rather than control, so they are
 * excluded by default to avoid false positives on state props.
 */
const DEFAULT_BOOLEAN_PREFIXES = [
  'shouldShow',
  'shouldEnable',
  'shouldAllow',
  'enable',
  'allow',
  'show',
  'hide',
  'display',
];

/**
 * Default callback prefixes to match against the boolean's core noun.
 */
const DEFAULT_CALLBACK_PREFIXES = ['on', 'handle'];

/**
 * Trailing decorative suffixes that do not change the noun being controlled.
 * E.g. `shouldShowMinimizeIcon` — `Icon` is purely decorative; the feature
 * being toggled is still `Minimize`.
 *
 * When suffix stripping IS used to produce a noun match, the rule requires the
 * resulting noun to be at least `minNounLengthForSuffixMatch` characters long
 * to avoid false positives on short generic action words (e.g. `Close`) that
 * appear in many general-purpose callbacks.
 */
const DEFAULT_BOOLEAN_SUFFIXES_TO_STRIP = [
  'Icon',
  'Button',
  'Action',
  'Control',
  'Badge',
];

/**
 * Minimum noun length when suffix stripping is involved in the match. Short
 * nouns like `Close` (5) are often generic action names used in callbacks that
 * span more than one trigger (e.g. `onClose` handles backdrop, escape, and
 * icon clicks). Requiring at least 6 chars lets specific nouns like `Delete`,
 * `Submit`, `Dismiss` match while excluding single-word generic actions.
 */
const DEFAULT_MIN_NOUN_LENGTH_FOR_SUFFIX_MATCH = 6;

/**
 * Qualifying word-parts whose presence in the boolean name changes its
 * semantics enough that the boolean is NOT a simple feature-presence toggle.
 * E.g. `shouldExpandInitially` is an initial-state control, not feature-
 * presence control, so we do not flag it even if `onExpand` is present.
 */
const DEFAULT_EXEMPT_QUALIFIERS = [
  'Initially',
  'OnMount',
  'ByDefault',
  'WhenHovered',
  'WhenFocused',
  'WhenActive',
  'Always',
  'Never',
];

/**
 * Determine whether a boolean prop name (after stripping its visibility prefix)
 * "matches" a callback noun with enough confidence to flag a redundancy.
 *
 * Two tiers of match:
 * 1. **Exact match** (no suffix stripping): the boolean remainder equals the
 *    callback noun exactly — high confidence, no length restriction.
 * 2. **Suffix-strip match**: the boolean remainder starts with the callback
 *    noun and the leftover is a recognized decorative suffix. Requires the
 *    callback noun to be at least `minNounLength` characters to avoid matching
 *    short generic action words.
 */
function booleanCoreMatchesCallbackNoun(
  booleanRemainder: string,
  callbackNoun: string,
  suffixesToStrip: string[],
  minNounLengthForSuffixMatch: number,
): boolean {
  const lowerRemainder = booleanRemainder.toLowerCase();
  const lowerNoun = callbackNoun.toLowerCase();

  // Tier 1: exact match (case-insensitive) — highest confidence
  if (lowerRemainder === lowerNoun) return true;

  // Tier 2: remainder starts with noun + recognized decorative suffix
  if (!lowerRemainder.startsWith(lowerNoun)) return false;
  if (callbackNoun.length < minNounLengthForSuffixMatch) return false;

  const leftover = booleanRemainder.slice(callbackNoun.length);
  for (const suffix of suffixesToStrip) {
    if (leftover === suffix) return true;
  }
  return false;
}

/**
 * Check whether a boolean prop name contains an exempt qualifier word,
 * indicating that the boolean controls something beyond simple feature
 * presence (e.g. initial state, conditional display).
 */
function hasExemptQualifier(name: string, exemptQualifiers: string[]): boolean {
  for (const qualifier of exemptQualifiers) {
    if (name.includes(qualifier)) return true;
  }
  return false;
}

/**
 * Extract the remainder of a boolean prop name after stripping its leading
 * visibility/enablement prefix. Returns null if no matching prefix is found
 * or if the name is entirely the prefix.
 *
 * Longest prefix wins (so `shouldShow` beats `should`).
 */
function stripBooleanPrefix(name: string, prefixes: string[]): string | null {
  const sortedPrefixes = [...prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      const remainder = name.slice(prefix.length);
      if (remainder.length === 0) return null;
      // Require a camelCase word boundary after the prefix
      if (remainder[0] >= 'A' && remainder[0] <= 'Z') return remainder;
    }
  }
  return null;
}

/**
 * Extract the core noun from a callback prop name after stripping its leading
 * callback prefix (e.g. `on` from `onMinimize` → `Minimize`). Returns null
 * if no matching prefix is found or if the name is entirely the prefix.
 */
function extractCallbackNoun(
  name: string,
  callbackPrefixes: string[],
): string | null {
  const sortedPrefixes = [...callbackPrefixes].sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of sortedPrefixes) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      const remainder = name.slice(prefix.length);
      if (remainder.length === 0) return null;
      if (remainder[0] >= 'A' && remainder[0] <= 'Z') return remainder;
    }
  }
  return null;
}

/**
 * Determine if a type annotation node represents a boolean (or a
 * boolean-containing union like `boolean | undefined`).
 */
function isBooleanTypeNode(typeAnnotation: TSESTree.TypeNode): boolean {
  if (typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword) return true;
  // Handle `boolean | undefined` / `boolean | null` explicit union forms
  if (typeAnnotation.type === AST_NODE_TYPES.TSUnionType) {
    return typeAnnotation.types.every(
      (t) =>
        t.type === AST_NODE_TYPES.TSBooleanKeyword ||
        t.type === AST_NODE_TYPES.TSUndefinedKeyword ||
        t.type === AST_NODE_TYPES.TSNullKeyword,
    );
  }
  return false;
}

/**
 * Determine if a type annotation node represents a callable (function type,
 * named callback type reference, or union involving a function type —
 * including the `callback | 'disabled'` pattern).
 */
function isCallableTypeNode(typeAnnotation: TSESTree.TypeNode): boolean {
  if (typeAnnotation.type === AST_NODE_TYPES.TSFunctionType) return true;
  if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) return true;
  if (typeAnnotation.type === AST_NODE_TYPES.TSUnionType) {
    return typeAnnotation.types.some(
      (t) =>
        t.type === AST_NODE_TYPES.TSFunctionType ||
        t.type === AST_NODE_TYPES.TSTypeReference,
    );
  }
  return false;
}

/**
 * Get the string name of a TSPropertySignature key, or null for computed keys.
 */
function getPropName(prop: TSESTree.TSPropertySignature): string | null {
  const key = prop.key;
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

/**
 * Collect all TSPropertySignature members from a type-level node, recursively
 * unwrapping `Readonly<{...}>` wrappers and flattening inline `&` intersection
 * constituent type literals. External type references in intersections are
 * intentionally skipped to avoid flagging inherited library props.
 */
function collectMembers(
  node: TSESTree.TypeNode | TSESTree.TSPropertySignature,
): TSESTree.TSPropertySignature[] {
  const results: TSESTree.TSPropertySignature[] = [];

  if (node.type === AST_NODE_TYPES.TSPropertySignature) {
    results.push(node);
    return results;
  }

  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    for (const member of node.members) {
      if (member.type === AST_NODE_TYPES.TSPropertySignature) {
        results.push(member);
      }
    }
    return results;
  }

  if (node.type === AST_NODE_TYPES.TSIntersectionType) {
    for (const constituent of node.types) {
      if (
        constituent.type === AST_NODE_TYPES.TSTypeLiteral ||
        constituent.type === AST_NODE_TYPES.TSIntersectionType
      ) {
        results.push(...collectMembers(constituent));
      } else if (constituent.type === AST_NODE_TYPES.TSTypeReference) {
        // Unwrap `Readonly<{...}>` — recognized safe wrapper
        const ref = constituent as TSESTree.TSTypeReference;
        if (
          ref.typeName.type === AST_NODE_TYPES.Identifier &&
          ref.typeName.name === 'Readonly' &&
          ref.typeParameters?.params?.length === 1 &&
          ref.typeParameters.params[0].type === AST_NODE_TYPES.TSTypeLiteral
        ) {
          results.push(
            ...collectMembers(
              ref.typeParameters.params[0] as TSESTree.TSTypeLiteral,
            ),
          );
        }
        // Other TSTypeReference in an intersection = external type, skip
      }
    }
    return results;
  }

  // Top-level `Readonly<{...}>` wrapper
  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    const ref = node as TSESTree.TSTypeReference;
    if (
      ref.typeName.type === AST_NODE_TYPES.Identifier &&
      ref.typeName.name === 'Readonly' &&
      ref.typeParameters?.params?.length === 1 &&
      ref.typeParameters.params[0].type === AST_NODE_TYPES.TSTypeLiteral
    ) {
      return collectMembers(
        ref.typeParameters.params[0] as TSESTree.TSTypeLiteral,
      );
    }
  }

  return results;
}

export const noRedundantBooleanCallbackProps = createRule<Options, MessageIds>({
  name: 'no-redundant-boolean-callback-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow redundant boolean props that duplicate the semantic meaning of optional callback props, violating the Interface Segregation Principle.',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          booleanPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          callbackPrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
          booleanSuffixesToStrip: {
            type: 'array',
            items: { type: 'string' },
          },
          exemptQualifiers: {
            type: 'array',
            items: { type: 'string' },
          },
          minNounLengthForSuffixMatch: {
            type: 'number',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      redundantBooleanProp:
        'Boolean prop "{{booleanProp}}" is redundant alongside callback prop "{{callbackProp}}" — the callback\'s presence already communicates whether the feature is enabled. Remove "{{booleanProp}}" and key off the callback\'s presence instead, or use the `callback | \'disabled\'` union pattern.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const booleanPrefixes =
      options?.booleanPrefixes ?? DEFAULT_BOOLEAN_PREFIXES;
    const callbackPrefixes =
      options?.callbackPrefixes ?? DEFAULT_CALLBACK_PREFIXES;
    const booleanSuffixesToStrip =
      options?.booleanSuffixesToStrip ?? DEFAULT_BOOLEAN_SUFFIXES_TO_STRIP;
    const exemptQualifiers =
      options?.exemptQualifiers ?? DEFAULT_EXEMPT_QUALIFIERS;
    const minNounLengthForSuffixMatch =
      options?.minNounLengthForSuffixMatch ??
      DEFAULT_MIN_NOUN_LENGTH_FOR_SUFFIX_MATCH;

    function checkMembers(members: TSESTree.TSPropertySignature[]) {
      // Collect boolean candidates: props whose type is boolean and whose name
      // matches a visibility/enablement prefix and has no exempt qualifier.
      const booleanCandidates: Array<{
        prop: TSESTree.TSPropertySignature;
        name: string;
        remainder: string; // name with boolean prefix stripped
      }> = [];

      // Map from callback noun (lower-case) → original prop name for reporting
      const callbackNouns = new Map<string, string>();

      for (const member of members) {
        const name = getPropName(member);
        if (!name || !member.typeAnnotation) continue;
        const typeNode = member.typeAnnotation.typeAnnotation;

        if (isBooleanTypeNode(typeNode)) {
          const remainder = stripBooleanPrefix(name, booleanPrefixes);
          if (remainder && !hasExemptQualifier(name, exemptQualifiers)) {
            booleanCandidates.push({ prop: member, name, remainder });
          }
        } else if (isCallableTypeNode(typeNode)) {
          const noun = extractCallbackNoun(name, callbackPrefixes);
          if (noun) {
            callbackNouns.set(noun.toLowerCase(), name);
          }
        }
      }

      // For each boolean candidate, look for a matching callback
      for (const { prop, name, remainder } of booleanCandidates) {
        for (const [callbackNounLower, callbackName] of callbackNouns) {
          // Reconstruct the callback noun with its original casing (first char
          // uppercase) to use for the suffix-match length check.
          const callbackNoun =
            callbackNounLower.charAt(0).toUpperCase() +
            callbackNounLower.slice(1);

          if (
            booleanCoreMatchesCallbackNoun(
              remainder,
              callbackNoun,
              booleanSuffixesToStrip,
              minNounLengthForSuffixMatch,
            )
          ) {
            context.report({
              node: prop,
              messageId: 'redundantBooleanProp',
              data: {
                booleanProp: name,
                callbackProp: callbackName,
              },
            });
            break; // report at most one error per boolean prop
          }
        }
      }
    }

    function analyzeTypeNode(typeNode: TSESTree.TypeNode) {
      const members = collectMembers(typeNode);
      if (members.length > 0) {
        checkMembers(members);
      }
    }

    return {
      TSTypeAliasDeclaration(node) {
        analyzeTypeNode(node.typeAnnotation);
      },
      TSInterfaceDeclaration(node) {
        // Analyze the interface body's own members; ignore `extends` clauses
        // (inherited external types are not analyzed to avoid false positives).
        const members = node.body.body.filter(
          (m): m is TSESTree.TSPropertySignature =>
            m.type === AST_NODE_TYPES.TSPropertySignature,
        );
        checkMembers(members);
      },
    };
  },
});
