import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useStableStringify';
type Options = [];

export const enforceStableStringify = createRule<Options, MessageIds>({
  name: 'enforce-safe-stringify',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using safe-stable-stringify instead of JSON.stringify',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useStableStringify:
        'Use safe-stable-stringify instead of JSON.stringify for safer serialization. Replace `JSON.stringify(obj)` with `stringify(obj)`. First import it: `import stringify from "safe-stable-stringify"`. This handles circular references and provides deterministic output.',
    },
  },
  defaultOptions: [],
  create(context) {
    let hasStringifyImport = false;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.value === 'safe-stable-stringify' &&
          node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier &&
              specifier.local.name === 'stringify',
          )
        ) {
          hasStringifyImport = true;
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        if (
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.object.name === 'JSON' &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'stringify'
        ) {
          context.report({
            node,
            messageId: 'useStableStringify',
            fix(fixer) {
              const fixes: TSESLint.RuleFix[] = [];

              // Add import if not present
              if (!hasStringifyImport) {
                const program = context.getSourceCode().ast;
                const firstImport = program.body.find(
                  (node) => node.type === AST_NODE_TYPES.ImportDeclaration,
                );
                const importStatement =
                  "import stringify from 'safe-stable-stringify';\n";

                if (firstImport) {
                  fixes.push(
                    fixer.insertTextBefore(firstImport, importStatement),
                  );
                } else {
                  fixes.push(
                    fixer.insertTextBefore(program.body[0], importStatement),
                  );
                }
                hasStringifyImport = true;
              }

              // Replace JSON.stringify with stringify
              fixes.push(fixer.replaceText(node, 'stringify'));

              return fixes;
            },
          });
        }
      },
    };
  },
});
