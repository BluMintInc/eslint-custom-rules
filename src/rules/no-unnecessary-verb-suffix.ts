import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const COMMON_PREPOSITION_SUFFIXES = new Set([
  // Basic prepositions
  'From',
  'For',
  'With',
  'To',
  'By',
  'In',
  'On',
  'At',
  'Of',

  // Temporal prepositions
  'During',
  'Until',
  'Till',
  'Since',
  'Within',

  // Logical/causal prepositions
  'Because',
  'Despite',
  'Instead',
  'Via',
  'Without',
  'Versus',
  'Vs',

  // Comparative prepositions
  'Than',
  'As',

  // Phrasal prepositions (common endings)
  'Against',
  'Among',
  'Amongst',
  'Beside',
  'Besides',
  'Between',
  'Beyond',
  'Concerning',
  'Considering',
  'Regarding',
  'Respecting',
  'Towards',
  'Toward',
  'Upon',

  // Preposition-like adverbs
  'Again',
  'Already',
  'Always',
  'Ever',
  'Never',
  'Now',
  'Soon',
  'Then',
  'There',
  'Where',
  'When',
  'While',
]);

/**
 * Phrasal-verb particles that fuse with a preceding past participle to form an
 * inseparable state adjective (e.g. "signed in", "logged in", "opted in",
 * "logged out", "zoomed in"). When such a particle is the trailing suffix AND
 * the token before it is a past participle, the ending is NOT a redundant
 * verb-preposition action suffix — it is a single adjective describing state.
 */
const PHRASAL_PARTICLES = new Set(['In', 'On', 'Out', 'Up', 'Off', 'Down']);

/**
 * Verb stems that fuse with a phrasal particle into an established phrasal verb
 * where the particle is inseparable (e.g. "signIn", "logOut", "optIn",
 * "checkIn"). Matched in base form ("signIn", "useGuardSignIn") and
 * past-participle form ("signedIn", "loggedOut", "droppedIn"). A particle
 * preceded by a NOUN object instead — "searchItemsIn", "processEventOn",
 * "loadEmbedIn", "isWidgetIn" — is a genuine redundant verb-preposition suffix
 * and stays flagged. Extend this set when a new phrasal verb appears.
 */
const PHRASAL_VERB_STEMS = new Set([
  'sign',
  'log',
  'opt',
  'check',
  'zoom',
  'drop',
  'shut',
  'turn',
  'switch',
  'scroll',
]);

/**
 * Resolves the lowercased phrasal-verb stem of a final camelCase word, or null
 * when it is not a known phrasal verb. Handles the base form ("sign"), the
 * regular past participle ("signed" → "sign"), and the doubled-consonant
 * participle ("dropped" → "drop"). A noun that merely ends in "ed" (e.g.
 * "embed" → "emb", "shed" → "sh") resolves to null, so it stays flagged — this
 * is what keeps a leaky "ends in ed" heuristic from exempting genuine targets.
 */
function phrasalVerbStem(lastWord: string): string | null {
  const word = lastWord.toLowerCase();
  if (PHRASAL_VERB_STEMS.has(word)) {
    return word;
  }
  if (word.endsWith('ed')) {
    let stem = word.slice(0, -2);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1);
    }
    if (PHRASAL_VERB_STEMS.has(stem)) {
      return stem;
    }
  }
  return null;
}

/**
 * Returns true when the trailing `suffix` of `name` is a phrasal-verb particle
 * fused to its verb — a past-participle adjective ("signedIn", "loggedOut") or a
 * base-form phrasal verb ("signIn", "logOut"). The word immediately before the
 * particle must be a KNOWN phrasal verb (via phrasalVerbStem), not merely any
 * word ending in "ed"; that keeps redundant suffixes where a noun object
 * precedes the particle ("loadEmbedIn", "isWidgetIn", "searchItemsIn") flagged.
 * This single check also covers boolean predicates: "isSignedIn" resolves the
 * pre-particle "signed" → "sign", while "isWidgetIn" resolves "widget" → null.
 */
function isPhrasalVerbEnding(name: string, suffix: string): boolean {
  if (!PHRASAL_PARTICLES.has(suffix)) {
    return false;
  }
  const beforeSuffix = name.substring(0, name.length - suffix.length);
  const lastWord = beforeSuffix.match(/[A-Z]?[a-z]+$/)?.[0] ?? '';
  return phrasalVerbStem(lastWord) !== null;
}

type MessageIds = 'unnecessaryVerbSuffix';

export const noUnnecessaryVerbSuffix = createRule<[], MessageIds>({
  name: 'no-unnecessary-verb-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent unnecessary verb suffixes in function and method names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryVerbSuffix:
        'Function name "{{name}}" ends with verb suffix "{{suffix}}" that does not add meaning beyond its parameters. Redundant verb-preposition endings make call sites harder to scan and hide the primary action. Rename to "{{suggestion}}" so the name stays action-oriented while arguments express the relationship.',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      name: string | null,
    ): void {
      if (!name) return;

      for (const suffix of COMMON_PREPOSITION_SUFFIXES) {
        // Check if the name ends with the suffix
        if (name.endsWith(suffix)) {
          // Make sure there's a verb before the suffix (camelCase format)
          // This regex checks for a verb pattern before the suffix
          // It looks for a word character followed by lowercase letters before the suffix
          const verbBeforeSuffixPattern = new RegExp(`\\w[a-z]+${suffix}$`);

          if (verbBeforeSuffixPattern.test(name)) {
            const suggestion = name.substring(0, name.length - suffix.length);

            // Skip if the suggestion would be empty or just a single character
            if (suggestion.length <= 1) continue;

            // Skip phrasal-verb endings (e.g. past-participle adjectives
            // "signedIn"/"loggedOut" or compound phrasal verbs "signIn"/
            // "logOut"): the trailing particle fuses with its verb, so stripping
            // it ("signed", "sign") destroys the meaning. The pre-particle word
            // must be a known phrasal verb, so noun-object endings like
            // "loadEmbedIn"/"isWidgetIn" remain flagged.
            if (isPhrasalVerbEnding(name, suffix)) continue;

            context.report({
              node,
              messageId: 'unnecessaryVerbSuffix',
              data: {
                name,
                suffix,
                suggestion,
              },
              fix(fixer) {
                if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
                  return fixer.replaceText(node.id!, suggestion);
                } else if (
                  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  node.type === AST_NODE_TYPES.FunctionExpression
                ) {
                  const parent = node.parent;
                  if (
                    parent &&
                    (parent.type === AST_NODE_TYPES.VariableDeclarator ||
                      parent.type === AST_NODE_TYPES.Property ||
                      parent.type === AST_NODE_TYPES.MethodDefinition)
                  ) {
                    if ('key' in parent) {
                      return fixer.replaceText(parent.key, suggestion);
                    } else if ('id' in parent && parent.id) {
                      return fixer.replaceText(parent.id, suggestion);
                    }
                  }
                }
                return null;
              },
            });
          }
        }
      }
    }

    return {
      FunctionDeclaration(node): void {
        if (node.id) {
          checkFunctionName(node, node.id.name);
        }
      },
      VariableDeclarator(node): void {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init?.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(node.init, node.id.name);
        }
      },
      MethodDefinition(node): void {
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node.value as TSESTree.FunctionExpression,
            node.key.name,
          );
        }
      },
      TSMethodSignature(node): void {
        // Handle interface method signatures
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node as unknown as TSESTree.FunctionExpression,
            node.key.name,
          );
        }
      },
      Property(node): void {
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          (node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.value.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(node.value, node.key.name);
        }
      },
      FunctionExpression(node): void {
        // Handle named function expressions
        if (node.id) {
          checkFunctionName(node, node.id.name);
        }
      },
    };
  },
});
