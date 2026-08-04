import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'enforceMicrodiff' | 'enforceMicrodiffImport';

const DIFF_NAME = 'diff';

/**
 * The package the fix imports from. BluMint's fork is the dependency this
 * codebase declares, and every call site resolves against it.
 */
const MICRODIFF_MODULE = '@blumintinc/microdiff';

/**
 * The specifiers that already satisfy this rule. The fix emits the fork, but a
 * file importing upstream `microdiff` is diffing structurally all the same, so
 * both are recognised on the way in: an unrecognised one would earn a second
 * import of the same binding (TS2300).
 */
const MICRODIFF_MODULES = new Set([MICRODIFF_MODULE, 'microdiff']);

/**
 * The import the fix emits. Both packages export their diff function as the
 * module *default* — `Difference`, `MicrodiffOptions` and the `default*`
 * predicates are the only named exports — so a `{ diff }` specifier binds
 * nothing (TS2305) however the module resolves.
 */
const MICRODIFF_IMPORT = `import ${DIFF_NAME} from '${MICRODIFF_MODULE}';`;

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
      MICRODIFF_MODULES.has(String(statement.source.value)) &&
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
    if (MICRODIFF_MODULES.has(source)) {
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
 * Whether a call carries operands `diff(obj, newObj, options?)` accepts.
 * microdiff needs both sides of the comparison, so a call supplying fewer is
 * reported but left alone: rewriting it would trade an unresolved name for a
 * call that does not type-check (TS2554).
 */
function hasRewritableArity(call: TSESTree.CallExpression): boolean {
  return call.arguments.length >= 2;
}

/**
 * Whether a reference sits where the call fix rewrites it — as the callee of a
 * convertible call. A reference in any other position (passed as a value,
 * assigned to a variable, re-exported) has no rewrite of its own, so retiring
 * the import that binds it would leave it unresolved (TS2304).
 */
function isRewrittenCallee(identifier: TSESTree.Node): boolean {
  const parent = identifier.parent;
  return (
    !!parent &&
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee === identifier &&
    hasRewritableArity(parent)
  );
}

/**
 * The node types that open a scope of their own. The body walk stops at them
 * because the emitted `diff` is only checked against the reported function's
 * scope: a comparison inside a callback whose parameter is named `diff` would
 * be rewritten into a call on that parameter, with no diagnostic to show for
 * it.
 */
const FUNCTION_NODE_TYPES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

/**
 * Whether an expression is a call of `JSON.stringify`. The callee's shape
 * decides rather than the source text, so a `stringify` read off anything but
 * `JSON` — a local serializer bound under the same property name — keeps its
 * call site.
 */
function isJsonStringify(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'JSON' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'stringify'
  );
}

/**
 * A `JSON.stringify(x) === JSON.stringify(y)` comparison broken into the parts
 * a `diff` call is built from: the two operands, and whether an empty change
 * list is the truthy answer.
 */
type StringifyComparison = {
  node: TSESTree.BinaryExpression;
  left: TSESTree.Node;
  right: TSESTree.Node;
  isEqual: boolean;
};

/**
 * The stringify comparison an expression makes, or null for every other
 * expression.
 *
 * A zero-argument `JSON.stringify()` yields null. The indexed argument read is
 * typed non-optional, so nothing else forces the check, and there is no operand
 * to hand `diff`.
 */
function toStringifyComparison(
  node: TSESTree.Node,
): StringifyComparison | null {
  if (
    node.type !== AST_NODE_TYPES.BinaryExpression ||
    (node.operator !== '===' && node.operator !== '!==')
  ) {
    return null;
  }
  if (!isJsonStringify(node.left) || !isJsonStringify(node.right)) {
    return null;
  }
  const left = node.left.arguments[0];
  const right = node.right.arguments[0];
  if (!left || !right) {
    return null;
  }
  return { node, left, right, isEqual: node.operator === '===' };
}

/**
 * Every stringify comparison `body` makes in its own scope, nested functions
 * excluded.
 *
 * A rewrite driven by the enclosing function's parameter list answers a
 * question the source never asked: `JSON.stringify(a.settings) !==
 * JSON.stringify(b.settings)` compares two properties, and the signature's
 * operands widen that to the whole objects. Reading the comparison itself is
 * also what makes a destructuring parameter a non-issue, since the operands
 * name what to diff whatever the signature binds.
 */
function collectStringifyComparisons(
  body: TSESTree.Node,
): StringifyComparison[] {
  const comparisons: StringifyComparison[] = [];
  const pending: TSESTree.Node[] = [body];
  while (pending.length > 0) {
    const current = pending.pop() as TSESTree.Node;
    if (current !== body && FUNCTION_NODE_TYPES.has(current.type)) {
      continue;
    }
    const comparison = toStringifyComparison(current);
    if (comparison) {
      comparisons.push(comparison);
    }
    for (const key in current) {
      // The parent link closes a cycle over every node in the file.
      if (key === 'parent') {
        continue;
      }
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (ASTHelpers.isNode(child)) {
            pending.push(child);
          }
        });
      } else if (ASTHelpers.isNode(value)) {
        pending.push(value);
      }
    }
  }
  return comparisons;
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
     * Whether the call handler rewrites the calls a specifier's references
     * make. It fires on a specifier the import handler tracked, or on a local
     * name a competing library conventionally binds; a specifier matching
     * neither — `applyChange` from `deep-diff`, say — keeps its call sites, so
     * its references survive only if the import that binds them does.
     */
    function isRewrittenSpecifier(specifier: TSESTree.ImportClause): boolean {
      return (
        importedDiffSpecifiers.has(specifier) ||
        DIFF_FUNCTION_NAMES.has(specifier.local.name)
      );
    }

    /**
     * Whether retiring `declaration` leaves every name it binds accounted for.
     * The fix removes the whole declaration, so each reference it serves has to
     * be one the call fixes rewrite to `diff` in the same pass — an import swap
     * that strands a reference behind is the defect this guards.
     *
     * Two things have to hold at every reference. `diff` must reach microdiff
     * there: the import rewrite lands at module scope while the references it
     * serves sit in nested scopes, and one standing where `diff` is shadowed
     * would resolve to the shadow. And the reference has to sit where a rewrite
     * exists at all, which is the callee position of a convertible call.
     *
     * A specifier nothing references is vacuously safe: retiring it removes an
     * import no code reads.
     */
    function canRetireImport(declaration: TSESTree.ImportDeclaration): boolean {
      const claimable = collectClaimableSpecifiers(sourceCode.ast);
      const declarationScope = ASTHelpers.getScope(context, declaration);
      return declaration.specifiers.every((specifier) => {
        const variable = ASTHelpers.findVariableInScope(
          declarationScope,
          specifier.local.name,
        );
        if (!variable) {
          return true;
        }
        const rewritten = isRewrittenSpecifier(specifier);
        return variable.references.every(
          (reference) =>
            canEmitDiff(reference.from, claimable) &&
            rewritten &&
            isRewrittenCallee(reference.identifier),
        );
      });
    }

    /**
     * Whether the import fix retires `declaration` in this same pass.
     */
    function willRetireImport(
      declaration: TSESTree.ImportDeclaration,
    ): boolean {
      return canEmitDiffAt(declaration) && canRetireImport(declaration);
    }

    /**
     * Whether the call at `node`, whose callee `declaration` binds, may be
     * rewritten to `diff(...)`. Separate from the decision to report: a call
     * this rule cannot convert is still a use of a competing library, so it is
     * reported and left for the author.
     *
     * The rename needs something to bind the `diff` it writes — an import the
     * file already has, or the one that replaces `declaration` in this same
     * pass. Renaming a callee whose import survives strands the rewritten call
     * exactly as retiring an import whose callee survives strands that one.
     */
    function canRewriteCall(
      node: TSESTree.CallExpression,
      declaration: TSESTree.ImportDeclaration | null,
    ): boolean {
      if (!canEmitDiffAt(node) || !hasRewritableArity(node)) {
        return false;
      }
      if (findMicrodiffImport(sourceCode.ast)) {
        return true;
      }
      return !!declaration && willRetireImport(declaration);
    }

    /**
     * The fix element that puts microdiff's import at the top of the file, or
     * null when the file already has one.
     *
     * It is its own element rather than text spliced into the replacement for
     * the reported node, because the reported node is rarely at module scope: a
     * comparison inside a function body, or a function behind an `export`,
     * would otherwise take the import somewhere the grammar forbids it.
     *
     * The shared anchor decides where the prologue ends. Splicing at character
     * 0 put the import above a `'use client'` directive, which demotes it to an
     * ordinary expression statement, and above a `#!` shebang, which has to sit
     * at character 0 for the file to parse at all.
     */
    function buildMicrodiffImportFix(
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix | null {
      if (findMicrodiffImport(sourceCode.ast)) {
        return null;
      }
      const anchor = importInsertionAnchor(sourceCode);
      // A blank line separates the import from the code below it, but not from
      // another import: an import block split in two reads as two groups.
      const separator =
        anchor.kind === 'before' &&
        anchor.target.type === AST_NODE_TYPES.ImportDeclaration
          ? '\n'
          : '\n\n';
      return insertAtImportAnchor(
        sourceCode,
        fixer,
        anchor,
        `${MICRODIFF_IMPORT}${separator}`,
      );
    }

    /**
     * The microdiff form of a stringify comparison: a change list whose
     * emptiness carries the sense of the operator it replaces, so `===` becomes
     * `.length === 0` and `!==` becomes `.length > 0`.
     */
    function buildDiffComparison(comparison: StringifyComparison): string {
      const left = sourceCode.getText(comparison.left);
      const right = sourceCode.getText(comparison.right);
      const emptiness = comparison.isEqual ? '.length === 0' : '.length > 0';
      return `${DIFF_NAME}(${left}, ${right})${emptiness}`;
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
        if (MICRODIFF_MODULES.has(importSource)) {
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
              // already binds to something else, and rather than retire an
              // import whose references no call fix rewrites. The report stands
              // either way, so the author resolves it deliberately.
              if (!canEmitDiffAt(node) || !canRetireImport(node)) {
                return null;
              }

              // If we already have a microdiff import, just remove this import
              if (findMicrodiffImport(sourceCode.ast)) {
                return fixer.remove(node);
              }

              // Otherwise, replace with microdiff import
              return fixer.replaceText(node, MICRODIFF_IMPORT);
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

            // The declaration the rename depends on: retiring it is what frees
            // the name `diff` and imports something under it.
            const competingImport = toCompetingDiffImport(calleeVariable);

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
                  if (!canRewriteCall(node, competingImport)) {
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
              if (!competingImport) {
                return;
              }

              // Track this import name as used
              usedImportNames.add(name);

              // What the callee resolves to already settles this: the argument
              // shapes say nothing a competing library's own import has not.
              // Gating the report on them left the call behind while the import
              // handler retired the declaration binding it, so `deepDiff(a, b)`
              // came out of a fix unresolved.
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  if (!canRewriteCall(node, competingImport)) {
                    return null;
                  }
                  // When handling fast-diff and similar libraries, need to ensure the function name is replaced
                  return fixer.replaceText(callee, DIFF_NAME);
                },
              });
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
        const comparison = toStringifyComparison(node);
        if (
          !comparison ||
          !isObjectOrArrayType(comparison.left) ||
          !isObjectOrArrayType(comparison.right)
        ) {
          return;
        }

        reportedNodes.add(node);
        context.report({
          node,
          messageId: 'enforceMicrodiff',
          fix(fixer) {
            if (!canEmitDiffAt(node)) {
              return null;
            }

            const compareFix = fixer.replaceText(
              node,
              buildDiffComparison(comparison),
            );

            // The comparison this rewrites almost always sits inside a
            // function, and the `diff` it emits needs an import whatever
            // encloses it. Deciding on the enclosing node left every nested
            // comparison calling a `diff` nothing bound.
            const importFix = buildMicrodiffImportFix(fixer);
            return importFix ? [importFix, compareFix] : compareFix;
          },
        });
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
              // Exactly one comparison is the condition for a fix. With none
              // there is no expression to rewrite, and with several the rule
              // cannot tell which one the function's answer turns on, so the
              // report stands on its own.
              const comparisons = collectStringifyComparisons(body);
              const comparison =
                comparisons.length === 1 ? comparisons[0] : null;

              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  if (!comparison || !canEmitDiffAt(node)) {
                    return null;
                  }

                  // Only the comparison's own range is rewritten. The signature
                  // keeps its type annotations, its modifiers and any `export`
                  // in front of it, and the body keeps everything the
                  // comparison shares it with: side effects, guard clauses,
                  // locals, and the comments around them. Re-emitting the body
                  // as a single return drops all of that silently — the fix
                  // compiles, so nothing downstream flags the loss.
                  const bodyFix = fixer.replaceText(
                    comparison.node,
                    buildDiffComparison(comparison),
                  );

                  const importFix = buildMicrodiffImportFix(fixer);
                  return importFix ? [importFix, bodyFix] : bodyFix;
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
