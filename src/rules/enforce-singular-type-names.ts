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
 * Returns true when the type alias RHS resolves to a container shape — a
 * `TSArrayType` (`Foo[]`) or `TSTupleType` (`[A, B]`) — for which a plural name
 * is the correct, self-documenting choice. Sees through identity-ish wrappers
 * over the same shape: the `readonly` type operator, parenthesized types, and
 * the `Readonly<T>` utility type; `Array<T>`/`ReadonlyArray<T>` are containers
 * outright.
 */
function resolvesToContainerType(node: TSESTree.TypeNode): boolean {
  let current: TSESTree.TypeNode = node;
  // Fixpoint loop: peel identity wrappers until a concrete shape is reached.
  // Wrappers are finite; the cap only guards against a pathological cycle.
  for (let i = 0; i < 10; i++) {
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
