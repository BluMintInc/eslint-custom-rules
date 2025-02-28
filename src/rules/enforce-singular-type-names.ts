import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as pluralize from 'pluralize';

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

      // Skip checking if name ends with 'Props' or 'Params'
      if (name.endsWith('Props') || name.endsWith('Params') || name.endsWith('Options') || name.endsWith('Settings')) return false;

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
      suggestedName: string
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
        if (isPlural(name)) {
          reportPluralName(node.id, name, getSingularForm(name));
        }
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
        "Type name '{{name}}' should be singular. Consider using '{{suggestedName}}' instead.",
    },
  },
  defaultOptions: [],
});
