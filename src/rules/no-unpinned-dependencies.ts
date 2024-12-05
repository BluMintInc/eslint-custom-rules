import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { AST } from 'jsonc-eslint-parser';
import {
  JSONIdentifier,
  JSONLiteral,
  JSONProperty,
  JSONStringLiteral,
} from 'jsonc-eslint-parser/lib/parser/ast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const noUnpinnedDependencies: TSESLint.RuleModule<'unexpected', any[]> =
  createRule({
    meta: {
      type: 'problem',
      docs: {
        description: 'Enforces pinned dependencies',
        recommended: 'error',
      },
      fixable: 'code',
      schema: [],
      messages: {
        unexpected:
          "Dependency '{{ propertyName }}' should be pinned to a specific version, but '{{ version }}' was found.",
      },
    },
    defaultOptions: [],
    name: 'no-unpinned-dependencies',

    create(context) {
      return {
        JSONLiteral(node: AST.JSONLiteral) {
          const property = node?.parent;
          // const property = node.parent;
          const configSection = node?.parent?.parent?.parent as JSONProperty;
          if (!property || !configSection) {
            return;
          }
          const configKey = configSection?.key;
          if (!configKey) {
            return;
          }
          // Check if we're in the "dependencies" or "devDependencies" section of package.json
          if (
            node.type === 'JSONLiteral' &&
            property?.type === 'JSONProperty' &&
            ((configKey as JSONIdentifier).name === 'devDependencies' ||
              (configKey as JSONLiteral).value === 'devDependencies' ||
              (configKey as JSONIdentifier).name === 'dependencies' ||
              (configKey as JSONLiteral).value === 'dependencies')
          ) {
            // Get the version string
            const version = node.value;
            const propertyName =
              (property.key as JSONIdentifier).name ||
              (property.key as JSONStringLiteral).value;
            // Check if the version string starts with a caret (^) or tilde (~), indicating a non-pinned version
            if (
              typeof version === 'string' &&
              (version.includes('^') || version.includes('~'))
            ) {
              context.report({
                node: node as unknown as TSESTree.Node,
                messageId: 'unexpected',
                data: {
                  propertyName,
                  version,
                },
                fix: function (fixer) {
                  const fixed = version.replace('^', '').replace('~', '');
                  return fixer.replaceTextRange(node.range, `"${fixed}"`);
                },
              });
            }
          }
        },
      };
    },
  });
