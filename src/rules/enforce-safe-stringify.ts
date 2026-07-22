import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useStableStringify' | 'replaceWithStringify';
type Options = [];

export const enforceStableStringify = createRule<Options, MessageIds>({
  name: 'enforce-safe-stringify',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using safe-stable-stringify instead of JSON.stringify to handle circular references and ensure deterministic output. JSON.stringify can throw errors on circular references and produce inconsistent output for objects with the same properties in different orders. safe-stable-stringify handles these cases safely.',
      recommended: 'error',
    },
    // Offered as a suggestion, not an auto-fix: `stringify` returns
    // `string | undefined` (its undefined overload fires for `any`/`unknown`/
    // `... | undefined` arguments), whereas `JSON.stringify` returns `string`.
    // An unconditional `--fix` therefore silently widens the return type and
    // breaks `: string` contracts (TS2322/TS2345) at call sites — passing lint
    // while failing tsc. A suggestion forces a conscious, per-site opt-in that
    // handles the possible `undefined`.
    hasSuggestions: true,
    schema: [],
    messages: {
      useStableStringify:
        'Prefer safe-stable-stringify over JSON.stringify for circular-reference-safe, deterministic output. Left as a suggestion rather than an auto-fix because `stringify` returns `string | undefined` (not `string`), so a blind rewrite can silently break `: string` contracts — apply it per call site and handle the possible `undefined`.',
      replaceWithStringify:
        "Replace with safe-stable-stringify's `stringify` (import it as `import stringify from 'safe-stable-stringify'`, and handle its `string | undefined` return, e.g. `stringify(obj) ?? ''`).",
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
            suggest: [
              {
                messageId: 'replaceWithStringify',
                fix(fixer) {
                  const fixes: TSESLint.RuleFix[] = [];

                  // Add the import only when the file lacks it. Unlike the old
                  // batch auto-fix, suggestions are applied one at a time with a
                  // re-lint in between, so we must NOT flip a shared flag here:
                  // each suggestion is computed independently against the
                  // current file, and adding the import whenever it is absent
                  // keeps every single-suggestion application self-contained
                  // (the re-lint suppresses a duplicate for later call sites).
                  if (!hasStringifyImport) {
                    const program = context.sourceCode.ast;
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
                        fixer.insertTextBefore(
                          program.body[0],
                          importStatement,
                        ),
                      );
                    }
                  }

                  // Replace JSON.stringify with stringify
                  fixes.push(fixer.replaceText(node, 'stringify'));

                  return fixes;
                },
              },
            ],
          });
        }
      },
    };
  },
});
