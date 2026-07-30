import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'enforceMicrodiff' | 'enforceMicrodiffImport';

const DIFF_NAME = 'diff';
const MICRODIFF_MODULE = 'microdiff';

/**
 * The names a competing library's diff export is conventionally bound to. They
 * are candidates for a report, never proof of one: what a call resolves to
 * decides.
 */
const DIFF_FUNCTION_NAMES = new Set([
  'deepDiff',
  'fastDiff',
  'diffArrays',
  'detailedDiff',
  // 'fastDeepEqual' and 'isEqual' stay out: they are allowed alternatives.
]);

/**
 * The exports of a competing library whose call sites this rule rewrites,
 * whatever local name the import binds them to.
 */
const COMPETING_DIFF_EXPORTS = new Set(['diff', 'diffArrays', 'detailedDiff']);

/** Diff libraries this rule permits, whose calls are tracked but never reported. */
const ALLOWED_DIFF_MODULES = new Set([
  'fast-deep-equal',
  'fast-deep-equal/es6',
]);

/**
 * The libraries this rule replaces. Every fix retires the whole import
 * declaration of one of these, which is what makes the names it binds available
 * to the microdiff import that takes its place.
 */
const COMPETING_DIFF_MODULES = new Set([
  'deep-diff',
  'fast-diff',
  'diff',
  'deep-object-diff',
  // 'fast-deep-equal' and 'fast-deep-equal/es6' stay out of this set: they are
  // allowed alternatives to microdiff, so their imports survive the fix.
]);

/**
 * A specifier that makes a bare `diff` resolve to microdiff's diff function:
 * its default export, or its named `diff` export, bound under the name the fix
 * emits.
 */
function bindsMicrodiffDiff(specifier: TSESTree.ImportClause): boolean {
  if (specifier.local.name !== DIFF_NAME) {
    return false;
  }
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return true;
  }
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === DIFF_NAME
  );
}

/**
 * microdiff's import read off `Program.body` rather than off a flag raised by
 * the ImportDeclaration visitor. A competing import that precedes the microdiff
 * one is fixed before the visitor reaches microdiff, so a flag still unset at
 * that point makes the fix emit a second `import { diff } from 'microdiff'` and
 * duplicate the binding (TS2300). Demanding a specifier that binds `diff` also
 * rejects the shapes a source-only test mistakes for a usable binding: a
 * namespace import, a type-only import, and an alias of some other export.
 */
function findMicrodiffImport(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration | undefined {
  return program.body.find(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.source.value === MICRODIFF_MODULE &&
      statement.importKind !== 'type' &&
      statement.specifiers.some(bindsMicrodiffDiff),
  );
}

/**
 * The declarations of `diff` that a fix may write over: microdiff's own
 * specifier, which an emitted `diff` is meant to resolve to, and the specifiers
 * of a competing library's import, which the fix replaces or removes outright.
 * Any other declaration of the name belongs to the file's own code.
 */
function collectClaimableSpecifiers(
  program: TSESTree.Program,
): Set<TSESTree.Node> {
  const claimable = new Set<TSESTree.Node>();
  program.body.forEach((statement) => {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
      return;
    }
    const source = statement.source.value;
    if (source === MICRODIFF_MODULE) {
      statement.specifiers
        .filter(bindsMicrodiffDiff)
        .forEach((specifier) => claimable.add(specifier));
      return;
    }
    if (COMPETING_DIFF_MODULES.has(source)) {
      statement.specifiers.forEach((specifier) => claimable.add(specifier));
    }
  });
  return claimable;
}

/**
 * The competing library's import declaration a name resolves to, or null for
 * every other binding.
 *
 * A callee matched by name alone proves nothing on its own: `detailedDiff` is
 * as likely to be the file's own function, a local variable, or a parameter as
 * it is to be `deep-object-diff`'s export. Reporting those renames a call to
 * `diff` that nothing binds while the local definition it was calling survives,
 * so only a name the import handler is about to retire earns a report. The
 * declaration is the one whose rewrite makes the emitted `diff` resolvable,
 * which is what pairs the call fix with the import fix in the same pass.
 *
 * Resolution keys on the *local* name a specifier binds, so an alias that
 * renames a competing export onto one of these names is covered, while an alias
 * that renames it away (`detailedDiff as dd`) is left to `toImportedDiffSource`,
 * which resolves to the specifier itself under whatever name it is bound.
 */
function toCompetingDiffImport(
  variable: TSESLint.Scope.Variable | null,
): TSESTree.ImportDeclaration | null {
  if (!variable) {
    return null;
  }
  for (const def of variable.defs) {
    if (def.type !== 'ImportBinding') {
      continue;
    }
    const declaration = def.parent;
    if (
      !declaration ||
      declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
      declaration.importKind === 'type'
    ) {
      continue;
    }
    const specifier = def.node;
    if (
      specifier.type === AST_NODE_TYPES.ImportSpecifier &&
      specifier.importKind === 'type'
    ) {
      continue;
    }
    if (!COMPETING_DIFF_MODULES.has(String(declaration.source.value))) {
      continue;
    }
    return declaration;
  }
  return null;
}

/**
 * The module a name is imported from, when the name resolves to one of the
 * specifiers the import handler tracked, and null for every other binding.
 *
 * Tracking keys on the specifier node rather than on the local name because
 * names collide and bindings do not: a parameter, a nested `const`, or a
 * function declaration that shadows the imported name answers its own calls.
 * Rewriting one of those to `diff` swaps in microdiff's structural change list
 * for whatever the shadow computed — a substitution that compiles cleanly and
 * leaves the shadow unused, so nothing downstream flags it.
 */
function toImportedDiffSource(
  variable: TSESLint.Scope.Variable | null,
  importedSpecifiers: ReadonlyMap<TSESTree.Node, string>,
): string | null {
  if (!variable) {
    return null;
  }
  for (const def of variable.defs) {
    if (def.type !== 'ImportBinding') {
      continue;
    }
    const source = importedSpecifiers.get(def.node);
    if (source !== undefined) {
      return source;
    }
  }
  return null;
}

/**
 * Whether a bare `diff` written at `scope` reaches microdiff's function.
 * Resolving through the scope chain catches both failure modes: a module-scope
 * binding that the inserted import redeclares (TS2440, or TS2300 against
 * another import), and a narrower shadow that captures the emitted reference
 * with no diagnostic at all. A binding with no declaration — a global supplied
 * by the environment — is left alone rather than written over.
 */
function canEmitDiff(
  scope: TSESLint.Scope.Scope,
  claimable: Set<TSESTree.Node>,
): boolean {
  const existing = ASTHelpers.findVariableInScope(scope, DIFF_NAME);
  if (!existing) {
    return true;
  }
  return (
    existing.defs.length > 0 &&
    existing.defs.every((def) => claimable.has(def.node as TSESTree.Node))
  );
}

export const enforceMicrodiff = createRule<[], MessageIds>({
  name: 'enforce-microdiff',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using microdiff for object and array comparison operations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceMicrodiff:
        'Use the microdiff library for object and array comparison operations',
      enforceMicrodiffImport:
        'Import diff from microdiff instead of {{importSource}}',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    const importedDiffLibraries = new Map<string, TSESTree.ImportDeclaration>();
    // The diff specifiers this file imports, keyed by node so a call site can
    // ask whether the binding it resolves to is one of them.
    const importedDiffSpecifiers = new Map<TSESTree.Node, string>();
    // The local names those specifiers bind: a cheap gate that keeps calls with
    // no relation to a diff library off the scope chain.
    const importedDiffNames = new Set<string>();
    const reportedNodes = new Set<TSESTree.Node>();

    function trackImportedDiff(
      specifier: TSESTree.ImportClause,
      importSource: string,
    ) {
      importedDiffSpecifiers.set(specifier, importSource);
      importedDiffNames.add(specifier.local.name);
    }

    /**
     * Whether the fix may emit a bare `diff` at `node`. The AST is read at fix
     * time so the answer stays correct under multi-pass `--fix`, where an
     * earlier pass may already have added the microdiff import.
     */
    function canEmitDiffAt(node: TSESTree.Node): boolean {
      return canEmitDiff(
        ASTHelpers.getScope(context, node),
        collectClaimableSpecifiers(sourceCode.ast),
      );
    }

    /**
     * Whether retiring `declaration` leaves every reference it binds able to
     * take the name `diff`. The import rewrite lands at module scope while the
     * references it serves sit in nested scopes: one standing where `diff` is
     * shadowed keeps the old name, because its own fix declines, so rewriting
     * the import would strand it without a binding (TS2304).
     */
    function canRenameReferencesOf(
      declaration: TSESTree.ImportDeclaration,
    ): boolean {
      const claimable = collectClaimableSpecifiers(sourceCode.ast);
      const declarationScope = ASTHelpers.getScope(context, declaration);
      return declaration.specifiers.every((specifier) => {
        const variable = ASTHelpers.findVariableInScope(
          declarationScope,
          specifier.local.name,
        );
        return (
          !variable ||
          variable.references.every((reference) =>
            canEmitDiff(reference.from, claimable),
          )
        );
      });
    }

    // Add a specific set to track which import names are used
    const usedImportNames = new Set<string>();

    // Check if a node is an object or array type
    function isObjectOrArrayType(node: TSESTree.Node): boolean {
      if (
        node.type === AST_NODE_TYPES.ArrayExpression ||
        node.type === AST_NODE_TYPES.ObjectExpression
      ) {
        return true;
      }

      // For identifiers, we'll make a simple assumption based on naming conventions
      if (node.type === AST_NODE_TYPES.Identifier) {
        const name = node.name.toLowerCase();
        // Names that likely represent objects or arrays
        if (
          name.includes('obj') ||
          name.includes('config') ||
          name.includes('options') ||
          name.includes('data') ||
          name.includes('state') ||
          name.includes('props') ||
          name.includes('items') ||
          name.includes('array') ||
          name.includes('list') ||
          name.endsWith('s')
        ) {
          return true;
        }
      }

      // For member expressions, assume they could be objects/arrays
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return true;
      }

      return false;
    }

    return {
      // Track imports of diffing libraries
      ImportDeclaration(node) {
        const importSource = node.source.value;

        // Check for microdiff import
        if (importSource === MICRODIFF_MODULE) {
          return;
        }

        // Track other diffing libraries
        if (COMPETING_DIFF_MODULES.has(importSource)) {
          // Track imported function names and their sources
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              COMPETING_DIFF_EXPORTS.has(specifier.imported.name)
            ) {
              // Track the specifier itself, so renaming the export and
              // shadowing the local name both stay accounted for
              trackImportedDiff(specifier, importSource);
            }
            // Removed the fast-deep-equal handling since it's now allowed
          });

          // Report all competing diffing libraries right away
          context.report({
            node,
            messageId: 'enforceMicrodiffImport',
            data: {
              importSource,
            },
            fix(fixer) {
              // Decline rather than duplicate or shadow a `diff` this file
              // already binds to something else. The report stands so the
              // author resolves the name clash deliberately.
              if (!canEmitDiffAt(node) || !canRenameReferencesOf(node)) {
                return null;
              }

              // If we already have a microdiff import, just remove this import
              if (findMicrodiffImport(sourceCode.ast)) {
                return fixer.remove(node);
              }

              // Otherwise, replace with microdiff import
              return fixer.replaceText(
                node,
                `import { ${DIFF_NAME} } from '${MICRODIFF_MODULE}';`,
              );
            },
          });

          // Check if importing a diff function or a known equality library
          const hasDiffImport = node.specifiers.some(
            (specifier) =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              COMPETING_DIFF_EXPORTS.has(specifier.imported.name),
          );

          if (hasDiffImport) {
            importedDiffLibraries.set(importSource, node);
          }
        }

        // Special handling for fast-deep-equal: track it but don't report it
        if (ALLOWED_DIFF_MODULES.has(importSource)) {
          // Track imported function names for later reference
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              trackImportedDiff(specifier, importSource);
            }
          });

          // Add to importedDiffLibraries for tracking but don't report
          importedDiffLibraries.set(importSource, node);
        }
      },

      // Check for usage of other diffing libraries
      CallExpression(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        const { callee } = node;

        // Check for direct calls to imported diff functions
        if (callee.type === AST_NODE_TYPES.Identifier) {
          const name = callee.name;
          const isDiffFunctionName = DIFF_FUNCTION_NAMES.has(name);

          if (importedDiffNames.has(name) || isDiffFunctionName) {
            // Both paths below ask what the callee binds, so the scope chain is
            // walked once for the name they share.
            const calleeVariable = ASTHelpers.findVariableInScope(
              ASTHelpers.getScope(context, node),
              name,
            );

            // Check if this call resolves to a function we specifically
            // imported from a diff library
            const importSource = toImportedDiffSource(
              calleeVariable,
              importedDiffSpecifiers,
            );

            if (importSource) {
              usedImportNames.add(name);

              // Skip reporting if it's from fast-deep-equal
              if (ALLOWED_DIFF_MODULES.has(importSource)) {
                return;
              }

              // Report it if it's from any other tracked library
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  if (!canEmitDiffAt(node)) {
                    return null;
                  }
                  return fixer.replaceText(callee, DIFF_NAME);
                },
              });
              return;
            }

            if (isDiffFunctionName) {
              // The name is only a candidate until the scope chain says what it
              // binds: a local function, variable, parameter, or an import from
              // anywhere but a competing diff library keeps its call untouched.
              const competingImport = toCompetingDiffImport(calleeVariable);
              if (!competingImport) {
                return;
              }

              // Track this import name as used
              usedImportNames.add(name);

              // Check if we have at least 2 arguments that are objects or arrays
              if (
                node.arguments.length >= 2 &&
                isObjectOrArrayType(node.arguments[0]) &&
                isObjectOrArrayType(node.arguments[1])
              ) {
                reportedNodes.add(node);
                context.report({
                  node,
                  messageId: 'enforceMicrodiff',
                  fix(fixer) {
                    if (!canEmitDiffAt(node)) {
                      return null;
                    }
                    // When handling fast-diff and similar libraries, need to ensure the function name is replaced
                    return fixer.replaceText(callee, DIFF_NAME);
                  },
                });
              }
            }
          }
        }

        // Check for lodash difference functions
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === '_'
        ) {
          const property = callee.property;
          if (
            property.type === AST_NODE_TYPES.Identifier &&
            ['difference', 'differenceBy', 'differenceWith'].includes(
              property.name,
            )
          ) {
            // Report only. lodash's difference family returns the elements of
            // its first array that have no match in the second — a subset of
            // the input — while microdiff's `diff` returns a structural change
            // list of `{type, path, value}` records. No mechanical rewrite
            // preserves the meaning of the call, and the extra iteratee or
            // comparator argument has no counterpart in `diff(a, b)`, whose
            // third parameter is an options object. Replacing the call would
            // silently change what the surrounding code receives, so the author
            // converts it.
            reportedNodes.add(node);
            context.report({
              node,
              messageId: 'enforceMicrodiff',
            });
          }
        }
      },

      // Check for manual object comparison patterns
      BinaryExpression(node) {
        // Skip if we've already reported this node or its parent function
        if (reportedNodes.has(node)) {
          return;
        }

        // Find the parent function or method
        let current: TSESTree.Node | undefined = node;
        while (
          current &&
          current.type !== AST_NODE_TYPES.FunctionDeclaration &&
          current.type !== AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          current = current.parent as TSESTree.Node;
        }

        // If we already reported the parent function, skip this node
        if (current && reportedNodes.has(current)) {
          return;
        }

        // Check for JSON.stringify comparison pattern
        if (
          (node.operator === '===' || node.operator === '!==') &&
          node.left.type === AST_NODE_TYPES.CallExpression &&
          node.right.type === AST_NODE_TYPES.CallExpression
        ) {
          const isJsonStringify = (expr: TSESTree.CallExpression) => {
            return (
              expr.callee.type === AST_NODE_TYPES.MemberExpression &&
              expr.callee.object.type === AST_NODE_TYPES.Identifier &&
              expr.callee.object.name === 'JSON' &&
              expr.callee.property.type === AST_NODE_TYPES.Identifier &&
              expr.callee.property.name === 'stringify'
            );
          };

          if (isJsonStringify(node.left) && isJsonStringify(node.right)) {
            const leftArg = node.left.arguments[0];
            const rightArg = node.right.arguments[0];

            if (isObjectOrArrayType(leftArg) && isObjectOrArrayType(rightArg)) {
              reportedNodes.add(node);
              const isEqual = node.operator === '===';

              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  if (!canEmitDiffAt(node)) {
                    return null;
                  }

                  // Find the containing function to add the import
                  let functionNode: TSESTree.Node | null = node;
                  while (
                    functionNode &&
                    functionNode.type !== AST_NODE_TYPES.FunctionDeclaration &&
                    functionNode.type !==
                      AST_NODE_TYPES.ArrowFunctionExpression &&
                    functionNode.type !== AST_NODE_TYPES.Program
                  ) {
                    functionNode = functionNode.parent as TSESTree.Node;
                  }

                  // If we found a program node and microdiff isn't imported,
                  // we'll need to add the import manually
                  if (
                    functionNode &&
                    functionNode.type === AST_NODE_TYPES.Program &&
                    !findMicrodiffImport(sourceCode.ast)
                  ) {
                    // Need to add an import
                    const importFix = fixer.insertTextBeforeRange(
                      [0, 0],
                      `import { ${DIFF_NAME} } from '${MICRODIFF_MODULE}';\n\n`,
                    );

                    // Replace JSON.stringify comparison
                    const compareFix = fixer.replaceText(
                      node,
                      `${DIFF_NAME}(${sourceCode.getText(
                        leftArg,
                      )}, ${sourceCode.getText(rightArg)})${
                        isEqual ? '.length === 0' : '.length > 0'
                      }`,
                    );

                    return [importFix, compareFix];
                  }

                  // Otherwise just replace the comparison
                  return fixer.replaceText(
                    node,
                    `${DIFF_NAME}(${sourceCode.getText(
                      leftArg,
                    )}, ${sourceCode.getText(rightArg)})${
                      isEqual ? '.length === 0' : '.length > 0'
                    }`,
                  );
                },
              });
            }
          }
        }
      },

      // Check for custom deep comparison functions
      FunctionDeclaration(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        // Look for functions that might be implementing diff logic
        if (
          node.id &&
          [
            'detectChanges',
            'hasConfigChanged',
            'compareObjects',
            'compareArrays',
            'findChanges',
            'detectDifferences',
            'hasStateChanged',
            'stateHasUpdated',
            'arrayHasChanged',
            'settingsChanged',
          ].includes(node.id.name)
        ) {
          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;
            const bodyText = sourceCode.getText(body);

            // Check if the function body contains a JSON.stringify comparison
            if (
              node.id.name === 'hasConfigChanged' &&
              bodyText.includes('JSON.stringify') &&
              bodyText.includes('!==')
            ) {
              reportedNodes.add(node);
              const param1 = sourceCode.getText(node.params[0]);
              const param2 = sourceCode.getText(node.params[1]);

              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  if (!canEmitDiffAt(node)) {
                    return null;
                  }

                  // Create a new version of the function with microdiff
                  const newFunctionBody = `{
  return ${DIFF_NAME}(${param1}, ${param2}).length > 0;
}`;

                  if (!findMicrodiffImport(sourceCode.ast)) {
                    // Create a new import statement
                    return fixer.replaceText(
                      node,
                      `import { ${DIFF_NAME} } from '${MICRODIFF_MODULE}';\n\nfunction ${node.id?.name}(${param1}, ${param2}) ${newFunctionBody}`,
                    );
                  } else {
                    // Just replace the function body
                    return fixer.replaceText(body, newFunctionBody);
                  }
                },
              });
              return;
            }

            // Look for patterns that suggest object/array comparison
            const hasComparisonLogic =
              bodyText.includes('JSON.stringify') ||
              bodyText.includes('Object.keys') ||
              bodyText.includes('for (') ||
              bodyText.includes('.some(') ||
              bodyText.includes('.every(');

            if (hasComparisonLogic) {
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
              });
            }
          }
        }
      },

      // Check for custom deep comparison in arrow functions
      ArrowFunctionExpression(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        // Only check arrow functions assigned to variables with comparison-like names
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          [
            'detectChanges',
            'hasConfigChanged',
            'compareObjects',
            'compareArrays',
            'findChanges',
            'detectDifferences',
            'hasStateChanged',
            'stateHasUpdated',
            'arrayHasChanged',
            'settingsChanged',
          ].includes(parent.id.name)
        ) {
          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;

            // Look for patterns that suggest object/array comparison
            const bodyText = sourceCode.getText(body);
            const hasComparisonLogic =
              bodyText.includes('JSON.stringify') ||
              bodyText.includes('Object.keys') ||
              bodyText.includes('for (') ||
              bodyText.includes('.some(') ||
              bodyText.includes('.every(');

            if (hasComparisonLogic) {
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
              });
            }
          }
        }
      },
    };
  },
});
