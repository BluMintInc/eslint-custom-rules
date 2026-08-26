import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as pluralize from 'pluralize';

const NON_PLURALIZABLE_SUFFIXES = [
  'Props',
  'Params',
  'Options',
  'Settings',
  'Data',
];

/**
 * Generic references whose instantiation is itself a container: `Array<T>` and
 * `ReadonlyArray<T>`. `Readonly<T>` is handled separately — it is an identity
 * wrapper that preserves T's shape, so we recurse into T rather than treating
 * the reference itself as a container.
 */
const ARRAY_GENERIC_NAMES = new Set(['Array', 'ReadonlyArray']);

/**
 * Word-final suffixes that are singular by shape. No English plural ends in
 * `-sis` or `-ss`, so both classes are exempt wholesale rather than enumerated:
 * every `-sis` noun (`Analysis`, `Basis`, `Thesis`, `Diagnosis`, `Synopsis`,
 * `Chassis`) and every `-ss` noun (`Address`, `Progress`, `Class`, `Success`)
 * is covered, including ones no list would anticipate.
 *
 * The neighbouring `-is`/`-us`/`-os` classes get no such blanket rule, because
 * genuine plurals do end that way — `Emojis`, `Minis`, `Menus`, `Plateaus`,
 * `Taxis`. Exempting those by shape would silence the rule on real collection
 * names, so they are enumerated in SINGULAR_NOUNS_ENDING_IN_S instead.
 */
const SINGULAR_WORD_SUFFIXES = ['sis', 'ss'];

/**
 * Singular nouns that end in `s` and that `pluralize` mistakes for plurals.
 * Stripping the trailing `s` yields a non-word — `Axis` → `Axi`, `Lens` →
 * `Len`, `Chaos` → `Chao` — which is the tell that the identifier was singular
 * all along. Enumeration is the only safe discriminator here: `Axis` and
 * `Minis` share a shape, so nothing but the noun itself separates a Latin/Greek
 * singular from an ordinary plural.
 *
 * Entries `pluralize` already classifies correctly (`Status`, `Corpus`) are
 * listed too, so a change in that library's heuristics cannot quietly
 * reintroduce the false positive.
 */
const SINGULAR_NOUNS_ENDING_IN_S = new Set([
  // Latin/Greek `-is` singulars outside the `-sis` family above.
  'axis',
  'praxis',
  'prophylaxis',
  'aegis',
  'cannabis',
  'chrysalis',
  'clematis',
  'dais',
  'dermis',
  'epidermis',
  'epiglottis',
  'glottis',
  'hubris',
  'ibis',
  'iris',
  'mantis',
  'marquis',
  'megalopolis',
  'metropolis',
  'pelvis',
  'portcullis',
  'proboscis',
  'tennis',
  'trellis',
  // `-us` singulars.
  'alumnus',
  'apparatus',
  'bonus',
  'bus',
  'cactus',
  'campus',
  'census',
  'chorus',
  'consensus',
  'corpus',
  'exodus',
  'focus',
  'fungus',
  'genus',
  'hiatus',
  'impetus',
  'locus',
  'minus',
  'modulus',
  'nexus',
  'nucleus',
  'octopus',
  'opus',
  'plus',
  'prospectus',
  'radius',
  'sinus',
  'status',
  'stimulus',
  'surplus',
  'syllabus',
  'terminus',
  'thesaurus',
  'versus',
  'virus',
  // Remaining singular nouns ending in `s`.
  'alias',
  'apropos',
  'asbestos',
  'atlas',
  'bias',
  'canvas',
  'chaos',
  'cosmos',
  'ethos',
  'fracas',
  'gas',
  'kudos',
  'lens',
  'news',
  'pancreas',
  'pathos',
  'rhinoceros',
  'series',
  'species',
  'thermos',
]);

/**
 * Splits a PascalCase/camelCase identifier into its words, keeping an
 * all-caps run together: `DeferAxis` → `Defer`/`Axis`, `HTTPStatus` →
 * `HTTP`/`Status`.
 */
const IDENTIFIER_WORD_PATTERN = /[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g;

/**
 * The exemption keys on the identifier's FINAL word rather than the whole
 * identifier so it composes with any prefix: `Axis`, `DeferAxis` and
 * `ChartRenderAxis` all resolve to `axis`. Whole-identifier matching would
 * exempt only the bare noun and keep reporting every compound built on it.
 */
function trailingWordOf(name: string): string {
  const words = name.match(IDENTIFIER_WORD_PATTERN);
  return (words?.[words.length - 1] ?? name).toLowerCase();
}

/**
 * True when the identifier's final word is a singular noun that merely ends in
 * `s`. Checked before `pluralize`, whose naive trailing-`s` strip is what
 * misreads these nouns in the first place.
 */
function endsWithSingularNoun(name: string): boolean {
  const trailingWord = trailingWordOf(name);
  return (
    SINGULAR_NOUNS_ENDING_IN_S.has(trailingWord) ||
    SINGULAR_WORD_SUFFIXES.some((suffix) => trailingWord.endsWith(suffix))
  );
}

/**
 * Union members that only express absence. Stripping them keeps a nullable
 * container recognisable as a container: `T[]` and `T[] | null` describe the
 * same collection, so they must not disagree about whether a plural name fits.
 */
const NULLISH_TYPE_NODES = new Set<string>([
  AST_NODE_TYPES.TSNullKeyword,
  AST_NODE_TYPES.TSUndefinedKeyword,
]);

/**
 * Shared budget for wrapper peeling and union recursion. Wrapper nesting is
 * finite in real code; the cap only guards against a pathological cycle. Every
 * peel and every descent into a union member spends one unit, so the recursion
 * a union introduces stays bounded by the same constant.
 */
const MAX_TYPE_DEPTH = 10;

/**
 * Returns true when the type alias RHS resolves to a container shape — a
 * `TSArrayType` (`Foo[]`) or `TSTupleType` (`[A, B]`) — for which a plural name
 * is the correct, self-documenting choice. Sees through identity-ish wrappers
 * over the same shape: the `readonly` type operator, parenthesized types, and
 * the `Readonly<T>` utility type; `Array<T>`/`ReadonlyArray<T>` are containers
 * outright. A union whose non-nullish members are all containers counts too.
 *
 * @param depth Budget already spent by an enclosing wrapper or union member.
 */
function resolvesToContainerType(node: TSESTree.TypeNode, depth = 0): boolean {
  let current: TSESTree.TypeNode = node;
  // Fixpoint loop: peel identity wrappers until a concrete shape is reached.
  for (let i = depth; i < MAX_TYPE_DEPTH; i++) {
    switch (current.type) {
      case AST_NODE_TYPES.TSArrayType:
      case AST_NODE_TYPES.TSTupleType:
        return true;
      case AST_NODE_TYPES.TSTypeOperator: {
        const operator = current as TSESTree.TSTypeOperator;
        if (operator.operator !== 'readonly' || !operator.typeAnnotation) {
          return false;
        }
        current = operator.typeAnnotation;
        continue;
      }
      case AST_NODE_TYPES.TSUnionType: {
        const union = current as TSESTree.TSUnionType;
        const substantive = union.types.filter(
          (member) => !NULLISH_TYPE_NODES.has(member.type),
        );
        // `null | undefined` holds no collection at all.
        if (substantive.length === 0) return false;
        // Requiring EVERY remaining member to be a container keeps the
        // exemption conservative: a mixed union such as `Edge[] | Edge` can hold
        // a single value, so a plural name there still misleads. Members recurse
        // with the spent budget so nesting cannot escape the cap.
        return substantive.every((member) =>
          resolvesToContainerType(member, i + 1),
        );
      }
      case AST_NODE_TYPES.TSTypeReference: {
        const ref = current as TSESTree.TSTypeReference;
        if (ref.typeName.type !== AST_NODE_TYPES.Identifier) return false;
        if (ARRAY_GENERIC_NAMES.has(ref.typeName.name)) return true;
        if (
          ref.typeName.name === 'Readonly' &&
          ref.typeParameters &&
          ref.typeParameters.params.length > 0
        ) {
          current = ref.typeParameters.params[0];
          continue;
        }
        return false;
      }
      default: {
        // Parentheses (`(Foo[])`) — the parser may emit TSParenthesizedType.
        // Matched by string since the node type is not always in the enum.
        if (
          (current.type as string) === 'TSParenthesizedType' &&
          'typeAnnotation' in current
        ) {
          current = (
            current as unknown as { typeAnnotation: TSESTree.TypeNode }
          ).typeAnnotation;
          continue;
        }
        return false;
      }
    }
  }
  return false;
}

export const enforceSingularTypeNames: TSESLint.RuleModule<
  'typeShouldBeSingular',
  never[]
> = createRule({
  create(context) {
    /**
     * Check if a name is plural
     * @param name The name to check
     * @returns true if the name is plural, false otherwise
     */
    function isPlural(name: string): boolean {
      // Skip checking if name is too short (less than 3 characters)
      if (name.length < 3) return false;

      // Skip checking if name ends with 'Props', 'Params', 'Data', etc.
      if (
        NON_PLURALIZABLE_SUFFIXES.some((suffix) =>
          name.toLowerCase().endsWith(suffix.toLowerCase()),
        )
      )
        return false;

      // Singular nouns that end in `s` must be settled BEFORE pluralize sees
      // them: its trailing-`s` strip turns `DeferAxis` into the non-word
      // `DeferAxi` and reports a rename to it.
      if (endsWithSingularNoun(name)) return false;

      // Skip checking if name is already singular according to pluralize
      if (pluralize.isSingular(name)) return false;

      // Check if the singular form is different from the name
      const singular = pluralize.singular(name);
      return singular !== name;
    }

    /**
     * Get the singular form of a name
     * @param name The name to get the singular form of
     * @returns The singular form of the name
     */
    function getSingularForm(name: string): string {
      return pluralize.singular(name);
    }

    /**
     * Report a plural type name
     * @param node The node to report
     * @param name The plural name
     * @param suggestedName The suggested singular name
     */
    function reportPluralName(
      node: TSESTree.Node,
      name: string,
      suggestedName: string,
    ) {
      context.report({
        node,
        messageId: 'typeShouldBeSingular',
        data: {
          name,
          suggestedName,
        },
      });
    }

    return {
      // Check type aliases
      TSTypeAliasDeclaration(node) {
        const name = node.id.name;
        if (!isPlural(name)) return;
        // A plural name correctly models a container type (array/tuple),
        // including through identity-ish wrappers (Readonly<>, readonly, parens),
        // so exempt it — matching the rule message's "leaves plural names for
        // container types" promise.
        if (resolvesToContainerType(node.typeAnnotation)) return;
        reportPluralName(node.id, name, getSingularForm(name));
      },

      // Check interfaces
      TSInterfaceDeclaration(node) {
        const name = node.id.name;
        if (isPlural(name)) {
          reportPluralName(node.id, name, getSingularForm(name));
        }
      },

      // Check enums
      TSEnumDeclaration(node) {
        const name = node.id.name;
        if (isPlural(name)) {
          reportPluralName(node.id, name, getSingularForm(name));
        }
      },
    };
  },

  name: 'enforce-singular-type-names',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce TypeScript type names to be singular',
      recommended: 'error',
    },
    schema: [],
    messages: {
      typeShouldBeSingular:
        "Type name '{{name}}' is plural, which signals a collection and hides whether this alias, interface, or enum represents one value or many. Plural type identifiers push callers to misuse the symbol for arrays or maps. Rename it to a singular noun such as '{{suggestedName}}' so the declaration clearly models a single instance and leaves plural names for container types.",
    },
  },
  defaultOptions: [],
});
