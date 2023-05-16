/**
 * @fileoverview Enforces pinned dependencies
 * @author Brodie McGuire
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforces pinned dependencies',
      recommended: true,
      url: null, // URL to the documentation page for this rule
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    return {
      JSONLiteral(node) {
        const property = node?.parent;
        const configSection = node?.parent?.parent?.parent;
        if (!property || !configSection) {
          return;
        }
        // Check if we're in the "dependencies" or "devDependencies" section of package.json
        if (
          (node.type === 'JSONLiteral' && property?.type === 'JSONProperty') ||
          (property?.type === 'JSONLiteral' &&
            (configSection?.key?.name === 'devDependencies' ||
              configSection?.key?.name === 'dependencies'))
        ) {
          // Get the version string
          const version = node.value;
          const propertyName = property.key.name || property.key.value;
          // Check if the version string starts with a caret (^) or tilde (~), indicating a non-pinned version
          if (
            typeof version === 'string' &&
            (version.includes('^') || version.includes('~'))
          ) {
            context.report({
              node: node.parent,
              message: `Dependency "${propertyName}" should be pinned to a specific version, but "${version}" was found.`,
              fix: function (fixer) {
                const fixed = version.replace('^', '').replace('~', '');
                return fixer.replaceText(node, `"${fixed}"`);
              },
            });
          }
        }
      },
    };
  },
};
