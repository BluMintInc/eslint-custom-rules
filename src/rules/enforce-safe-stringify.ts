import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'useStableStringify' | 'replaceWithStringify';
type Options = [];

const STRINGIFY_MODULE = 'safe-stable-stringify';
const STRINGIFY_NAME = 'stringify';

/**
 * A default or named specifier whose local name is `stringify` — the two shapes
 * that make a bare `stringify` call resolve to the module's function.
 */
function isStringifySpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportDefaultSpecifier | TSESTree.ImportSpecifier {
  return (
    (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
      specifier.type === AST_NODE_TYPES.ImportSpecifier) &&
    specifier.local.name === STRINGIFY_NAME
  );
}

/**
 * Read the import off the AST instead of a traversal flag: suggestions are
 * computed per call site, and a `JSON.stringify` that precedes the import
 * declaration in source order would otherwise be judged against a flag that the
 * `ImportDeclaration` visitor has not set yet, duplicating the import.
 */
function importsStringify(program: TSESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.source.value === STRINGIFY_MODULE &&
      statement.specifiers.some(isStringifySpecifier),
  );
}

/**
 * Whether every declaration of a visible `stringify` binding is the
 * safe-stable-stringify import itself. A namespace import, an import from any
 * other module, a parameter, or a local declaration all mean the replacement
 * text would resolve somewhere other than the intended function.
 */
function bindsSafeStringify(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isStringifySpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.source.value === STRINGIFY_MODULE
      );
    })
  );
}

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
    return {
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
                  // Resolve `stringify` through the scope chain at the call
                  // site. A binding that is not the safe-stable-stringify
                  // import makes both halves of the edit wrong: the inserted
                  // import collides with it (TS2440/TS2300), and — for a
                  // shadowing parameter or local — the bare `stringify`
                  // replacement silently calls the shadow with no compile
                  // error at all. Declining leaves the report in place so the
                  // author migrates the call deliberately.
                  const existing = ASTHelpers.findVariableInScope(
                    ASTHelpers.getScope(context, node),
                    STRINGIFY_NAME,
                  );
                  if (existing && !bindsSafeStringify(existing)) {
                    return null;
                  }

                  const fixes: TSESLint.RuleFix[] = [];
                  const sourceCode = context.getSourceCode();
                  const program = sourceCode.ast;

                  // Add the import only when the file lacks it. Suggestions are
                  // applied one at a time with a re-lint in between, so each is
                  // computed independently against the current file; adding the
                  // import whenever it is absent keeps every single-suggestion
                  // application self-contained (the re-lint suppresses a
                  // duplicate for later call sites).
                  if (!importsStringify(program)) {
                    // Anchor through the shared helper so the import lands
                    // below the file's prologue: splicing it above a
                    // `'use client'` directive demotes the directive to a plain
                    // expression, and above a `#!` shebang leaves the file
                    // unparseable.
                    fixes.push(
                      insertAtImportAnchor(
                        sourceCode,
                        fixer,
                        importInsertionAnchor(sourceCode),
                        "import stringify from 'safe-stable-stringify';\n",
                      ),
                    );
                  }

                  fixes.push(fixer.replaceText(node, STRINGIFY_NAME));

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
