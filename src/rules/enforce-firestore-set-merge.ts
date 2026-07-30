import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';

type MessageIds = 'preferSetMerge';

const FIRESTORE_MODULES = new Set(['firebase/firestore', 'firebase-admin']);
const UPDATE_DOC = 'updateDoc';
const SET_DOC = 'setDoc';
const MERGE_ARGUMENT = ', { merge: true }';

/**
 * Where a firestore export enters the file: the entry inside `import { … }`, or
 * the object-pattern property of `await import('firebase/firestore')`. That
 * entry is what a fix edits when it swaps `updateDoc` for `setDoc`.
 */
type FirestoreBinding = {
  /** The name firestore exports under this binding, e.g. `updateDoc`. */
  imported: string;
  node: TSESTree.ImportSpecifier | TSESTree.Property;
  /** The whole list `node` belongs to, so a removal can keep it well formed. */
  entries: readonly TSESTree.Node[];
};

function isFirestoreDynamicImport(
  node: TSESTree.Node | null | undefined,
): boolean {
  if (node?.type !== AST_NODE_TYPES.AwaitExpression) {
    return false;
  }
  const imported = node.argument;
  return (
    imported.type === AST_NODE_TYPES.ImportExpression &&
    imported.source.type === AST_NODE_TYPES.Literal &&
    typeof imported.source.value === 'string' &&
    FIRESTORE_MODULES.has(imported.source.value)
  );
}

/**
 * Reads a binding's origin off the AST rather than off a traversal flag, so the
 * verdict is re-derived on every pass of a multi-pass `--fix` — including the
 * passes that run after a previous pass inserted the `setDoc` binding.
 */
function firestoreBindingOf(
  def: TSESLint.Scope.Definition,
): FirestoreBinding | null {
  const { node } = def;
  if (node.type === AST_NODE_TYPES.ImportSpecifier) {
    const declaration = node.parent;
    if (
      declaration?.type !== AST_NODE_TYPES.ImportDeclaration ||
      !FIRESTORE_MODULES.has(declaration.source.value) ||
      declaration.importKind === 'type' ||
      node.importKind === 'type'
    ) {
      return null;
    }
    return {
      imported: node.imported.name,
      node,
      entries: declaration.specifiers,
    };
  }
  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.ObjectPattern &&
    isFirestoreDynamicImport(node.init)
  ) {
    const property = def.name.parent;
    if (
      property?.type !== AST_NODE_TYPES.Property ||
      property.parent !== node.id ||
      property.value !== def.name ||
      property.computed ||
      property.key.type !== AST_NODE_TYPES.Identifier
    ) {
      return null;
    }
    return {
      imported: property.key.name,
      node: property,
      entries: node.id.properties,
    };
  }
  return null;
}

function isComma(
  token: TSESTree.Token | TSESTree.Comment | null,
): token is TSESTree.PunctuatorToken {
  return token?.type === AST_TOKEN_TYPES.Punctuator && token.value === ',';
}

/** Whether every declaration of a visible binding is the given firestore export. */
function bindsFirestoreExport(
  variable: TSESLint.Scope.Variable,
  imported: string,
): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => firestoreBindingOf(def)?.imported === imported)
  );
}

export const enforceFirestoreSetMerge = createRule<[], MessageIds>({
  name: 'enforce-firestore-set-merge',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using set() with { merge: true } instead of update() for Firestore operations to ensure consistent behavior. The update() method fails if the document does not exist, while set() with { merge: true } creates the document if needed and safely merges fields, making it more reliable and predictable.',
      recommended: 'error',
      requiresTypeChecking: false,
      extendsBaseRule: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSetMerge:
        'Use set() with { merge: true } instead of update() for more predictable Firestore operations. Instead of `docRef.update({ field: value })`, use `docRef.set({ field: value }, { merge: true })`. This ensures consistent behavior when the document does not exist.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    const updateAliases = new Set<string>();

    /**
     * The `setDoc` binding rides on one violation's fix, which makes that
     * violation the file's import carrier. ESLint calls `fix()` before it
     * applies inline disable directives, so a suppressed carrier takes the
     * binding down with it while the surviving violations still emit
     * `setDoc(…)`. Resolving suppression up front passes the carrier slot to the
     * first violation that actually survives.
     */
    const isReportSuppressed = createSuppressionChecker(context);
    let plannedSetDocBinding = false;

    function isFirestoreUpdateCall(node: TSESTree.CallExpression): boolean {
      // Check if it's a set() call with merge: true
      if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
        const property = node.callee.property;
        if (property.type === AST_NODE_TYPES.Identifier) {
          // If it's a set() call, check if it has merge: true
          if (property.name === 'set') {
            const lastArg = node.arguments[node.arguments.length - 1];
            if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
              const hasMergeTrue = lastArg.properties.some(
                (prop) =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'merge' &&
                  prop.value.type === AST_NODE_TYPES.Literal &&
                  prop.value.value === true,
              );
              if (hasMergeTrue) {
                return false; // Already using set with merge: true
              }
            }
          }

          // Only flag update() calls that are Firestore operations
          if (property.name === 'update') {
            const object = node.callee.object;

            // Check for BatchManager update calls
            if (
              object.type === AST_NODE_TYPES.MemberExpression &&
              object.property.type === AST_NODE_TYPES.Identifier &&
              object.property.name === 'batchManager'
            ) {
              return true;
            }

            if (object.type === AST_NODE_TYPES.CallExpression) {
              // Check if it's a createHash().update() call
              if (
                object.callee.type === AST_NODE_TYPES.Identifier &&
                object.callee.name === 'createHash'
              ) {
                return false;
              }
            }

            // Check if it's a Firestore document reference or transaction
            let current: TSESTree.Node | undefined = node;
            while (current?.parent) {
              current = current.parent;
              if (current.type === AST_NODE_TYPES.MemberExpression) {
                const obj = current.object;
                if (obj.type === AST_NODE_TYPES.Identifier) {
                  // Check for common Firestore variable names
                  if (
                    obj.name === 'db' ||
                    obj.name === 'firestore' ||
                    obj.name === 'transaction' ||
                    obj.name === 'docRef' ||
                    obj.name === 'userRef' ||
                    obj.name.endsWith('Ref')
                  ) {
                    return true;
                  }
                }
              }
            }

            // Check if it's a Firestore document reference method chain
            let currentObj = object;
            while (currentObj.type === AST_NODE_TYPES.MemberExpression) {
              if (currentObj.property.type === AST_NODE_TYPES.Identifier) {
                const methodName = currentObj.property.name;
                if (methodName === 'collection' || methodName === 'doc') {
                  return true;
                }
              }
              currentObj = currentObj.object;
            }

            // Check if it's a transaction.update() call
            if (
              object.type === AST_NODE_TYPES.Identifier &&
              object.name === 'transaction'
            ) {
              return true;
            }

            // Check if it's a Firestore document reference by looking at imports
            const program = ASTHelpers.getAncestors(context, node).find(
              (node): node is TSESTree.Program =>
                node.type === AST_NODE_TYPES.Program,
            );
            if (program) {
              for (const node of program.body) {
                if (node.type === AST_NODE_TYPES.VariableDeclaration) {
                  for (const decl of node.declarations) {
                    if (
                      decl.init?.type === AST_NODE_TYPES.CallExpression &&
                      decl.init.callee.type ===
                        AST_NODE_TYPES.MemberExpression &&
                      decl.init.callee.property.type ===
                        AST_NODE_TYPES.Identifier &&
                      decl.init.callee.property.name === 'firestore'
                    ) {
                      return true;
                    }
                  }
                }
              }
            }

            return false;
          }
          return false;
        }
      }
      if (node.callee.type === AST_NODE_TYPES.Identifier) {
        // Check if it's a setDoc() call with merge: true
        if (node.callee.name === SET_DOC) {
          const lastArg = node.arguments[node.arguments.length - 1];
          if (lastArg?.type === AST_NODE_TYPES.ObjectExpression) {
            const hasMergeTrue = lastArg.properties.some(
              (prop) =>
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'merge' &&
                prop.value.type === AST_NODE_TYPES.Literal &&
                prop.value.value === true,
            );
            if (hasMergeTrue) {
              return false; // Already using setDoc with merge: true
            }
          }
        }
        return updateAliases.has(node.callee.name);
      }
      return false;
    }

    /**
     * A spread hides how many arguments the call really passes, so the options
     * object cannot be positioned.
     */
    function hasSpreadArgument(node: TSESTree.CallExpression): boolean {
      return node.arguments.some(
        (argument) => argument.type === AST_NODE_TYPES.SpreadElement,
      );
    }

    /**
     * `ref.update(…)` becomes `ref.set(…, { merge: true })` by editing only the
     * method name and the tail of the argument list. Re-emitting the call from
     * the text of each argument dropped everything between them — comments
     * included, and a dropped `eslint-disable` silently re-enables the rule it
     * was suppressing — and dropped every argument past the second outright.
     */
    function fixUpdateMethod(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      callee: TSESTree.MemberExpression,
    ): TSESLint.RuleFix[] | null {
      if (
        callee.computed ||
        callee.property.type !== AST_NODE_TYPES.Identifier
      ) {
        return null;
      }
      const args = node.arguments;
      const lastArgument = args[args.length - 1];
      if (!lastArgument || hasSpreadArgument(node)) {
        return null;
      }

      const objectText = sourceCode.getText(callee.object);
      // BatchManager takes a single descriptor object, so its arguments are
      // genuinely restructured rather than extended.
      if (objectText.includes('batchManager')) {
        if (args.length < 2) {
          return null;
        }
        return [
          fixer.replaceText(
            node,
            `${objectText}.set({
          ref: ${sourceCode.getText(args[0])},
          data: ${sourceCode.getText(args[1])},
          merge: true,
        })`,
          ),
        ];
      }

      return [
        fixer.replaceText(callee.property, 'set'),
        fixer.insertTextAfter(lastArgument, MERGE_ARGUMENT),
      ];
    }

    /**
     * Drops a binding whose last reference this fix rewrites, so `--fix` does not
     * leave an unused import behind. Only the entry and the comma separating it
     * from a sibling go, and only when nothing else lives in that span: a comment
     * between the entry and its comma belongs to a neighbour as often as to the
     * entry, and an unused specifier is inert where a deleted comment is not.
     * A list that would end up empty is left alone too, since emptying it means
     * rewriting the whole declaration.
     */
    function removeBinding(
      fixer: TSESLint.RuleFixer,
      binding: FirestoreBinding,
    ): TSESLint.RuleFix[] {
      if (binding.entries.length < 2) {
        return [];
      }
      const before = sourceCode.getTokenBefore(binding.node, {
        includeComments: true,
      });
      if (isComma(before)) {
        return [fixer.removeRange([before.range[0], binding.node.range[1]])];
      }
      const after = sourceCode.getTokenAfter(binding.node, {
        includeComments: true,
      });
      if (!isComma(after)) {
        return [];
      }
      // Stopping at whatever follows the comma — comment or token — keeps a
      // directive that documents the next entry attached to it.
      const next = sourceCode.getTokenAfter(after, { includeComments: true });
      return [
        fixer.removeRange([
          binding.node.range[0],
          next ? next.range[0] : after.range[1],
        ]),
      ];
    }

    /**
     * `updateDoc(ref, data)` becomes `setDoc(ref, data, { merge: true })`, which
     * only works if `setDoc` is bound. The import edit and the call rewrite ship
     * as one fix array: they sit in disjoint ranges, and a multi-rule `--fix`
     * that applied one without the other would leave the file with an unbound
     * name.
     */
    function fixUpdateDocCall(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.CallExpression,
      callee: TSESTree.Identifier,
    ): TSESLint.RuleFix[] | null {
      if (isReportSuppressed(node)) {
        return null;
      }

      const lastArgument = node.arguments[node.arguments.length - 1];
      if (!lastArgument || hasSpreadArgument(node)) {
        return null;
      }

      const scope = ASTHelpers.getScope(context, node);
      const updateVariable = ASTHelpers.findVariableInScope(scope, callee.name);
      if (!updateVariable || updateVariable.defs.length !== 1) {
        return null;
      }
      const updateBinding = firestoreBindingOf(updateVariable.defs[0]);
      if (!updateBinding || updateBinding.imported !== UPDATE_DOC) {
        return null;
      }

      // A `setDoc` that means something else makes both halves of the edit
      // wrong: an added import collides with the declaration (TS2440/TS2300),
      // and a narrower-scope shadow rebinds the emitted call to the local value
      // with no diagnostic at all. Resolving from the call's own scope chain
      // catches both, and declining before the binding is scheduled leaves the
      // carrier slot to a violation whose scope is safe.
      const setDocVariable = ASTHelpers.findVariableInScope(scope, SET_DOC);
      if (setDocVariable && !bindsFirestoreExport(setDocVariable, SET_DOC)) {
        return null;
      }

      // Rewriting the last reference to `updateDoc` frees its binding site, so
      // the entry is renamed in place — and an alias disappears together with
      // the reference that used it. Any other reference keeps the old name
      // alive: adding `setDoc` alongside it is then the only safe edit, because
      // a multi-rule `--fix` can drop a sibling violation's fix and strand that
      // reference on a binding this one just removed.
      const reads = updateVariable.references.filter((reference) =>
        reference.isRead(),
      );
      const isSoleReference =
        reads.length === 1 && reads[0].identifier === callee;

      const fixes: TSESLint.RuleFix[] = [];
      if (!setDocVariable) {
        if (!plannedSetDocBinding) {
          fixes.push(
            isSoleReference
              ? fixer.replaceText(updateBinding.node, SET_DOC)
              : fixer.insertTextAfter(updateBinding.node, `, ${SET_DOC}`),
          );
          plannedSetDocBinding = true;
        }
      } else if (isSoleReference) {
        fixes.push(...removeBinding(fixer, updateBinding));
      }

      fixes.push(fixer.replaceText(callee, SET_DOC));
      // `setDoc` takes the document data between the reference and the options,
      // so a call that passed no data gets an empty object to merge.
      fixes.push(
        fixer.insertTextAfter(
          lastArgument,
          node.arguments.length > 1 ? MERGE_ARGUMENT : `, {}${MERGE_ARGUMENT}`,
        ),
      );
      return fixes;
    }

    return {
      ImportDeclaration(node): void {
        if (FIRESTORE_MODULES.has(node.source.value)) {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              if (specifier.imported.name === UPDATE_DOC) {
                updateAliases.add(specifier.local.name);
              }
            }
          });
        }
      },

      VariableDeclarator(node): void {
        if (!isFirestoreDynamicImport(node.init)) {
          return;
        }
        // Handle destructured imports
        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          node.id.properties.forEach((prop) => {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === UPDATE_DOC &&
              prop.value.type === AST_NODE_TYPES.Identifier
            ) {
              updateAliases.add(prop.value.name);
            }
          });
        }
      },

      CallExpression(node): void {
        if (!isFirestoreUpdateCall(node)) {
          return;
        }
        context.report({
          node,
          messageId: 'preferSetMerge',
          fix(fixer) {
            if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
              return fixUpdateMethod(fixer, node, node.callee);
            }
            if (node.callee.type === AST_NODE_TYPES.Identifier) {
              return fixUpdateDocCall(fixer, node, node.callee);
            }
            return null;
          },
        });
      },
    };
  },
});
