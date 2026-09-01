import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  ImportInsertionAnchor,
  ImportInsertionSource,
  importAnchorIndent,
  importAnchorLineStartIfOwned,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';
import {
  OrphanUnbinder,
  TextRange,
  planOrphanedBindingRemoval,
} from '../utils/importRemoval';

type MessageIds = 'useCentralizedMockFirestore';

/**
 * The centralized module's identity: the path segments that name it, without
 * the relative prefix a specifier needs to reach it. Keeping the identity
 * separate from the specifier is what makes the self-file guard below correct
 * no matter what prefix the fixer emits — the emitted depth is a hardcoded
 * guess (Issue #1387) and a guard keyed on it would exempt the wrong files.
 */
const MOCK_FIRESTORE_MODULE = '__test-utils__/mockFirestore';

const MOCK_FIRESTORE_PATH = `../../../../../${MOCK_FIRESTORE_MODULE}`;

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx)$/;

/**
 * The module every other file is told to import from is the one module that
 * must define `mockFirestore` locally: rewriting it produces an import of
 * itself, so the canonical implementation is deleted and the module imports a
 * name it no longer defines.
 *
 * The linted path is matched by suffix because it reaches the rule in whatever
 * form the caller used — absolute (`/repo/src/__test-utils__/mockFirestore.ts`)
 * or project-relative (`__test-utils__/mockFirestore.ts`). The suffix has to
 * land on a path-segment boundary, otherwise `not__test-utils__/mockFirestore`
 * — an unrelated module — would be exempted too.
 */
const isCentralizedMockModule = (filename: string): boolean => {
  const normalized = filename.replace(/\\/g, '/').replace(SOURCE_EXTENSION, '');
  if (!normalized.endsWith(MOCK_FIRESTORE_MODULE)) {
    return false;
  }
  const suffixStart = normalized.length - MOCK_FIRESTORE_MODULE.length;
  return suffixStart === 0 || normalized[suffixStart - 1] === '/';
};

/**
 * Reports whether a flagged declaration sits on the module's export surface,
 * either as `export const mockFirestore = …` or as one binding of an exported
 * multi-declarator `const`.
 *
 * An exported name is a cross-file contract whose importers a single-file fixer
 * cannot reach: retiring the declaration drops the name from the surface and
 * every importer fails to resolve it. The hazard lives entirely in those other
 * files, so it does not depend on whether the declaring file also uses the name
 * — a mock module with no local use sites is the most exposed shape, not the
 * safest. `global-const-style` and `renameFixes` withhold their fixes on the
 * same grounds.
 *
 * Only `ExportNamedDeclaration` can front a flagged node: `export default`
 * takes an expression, never a `const`, and a class property — the other shape
 * this rule flags — belongs to its class rather than to the module, so
 * `export default class { mockFirestore = … }` exports nothing by that name.
 */
function isExportedDeclaration(node: TSESTree.Node): boolean {
  const statement =
    node.parent?.type === AST_NODE_TYPES.VariableDeclaration
      ? node.parent
      : node;
  return statement.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
}

/**
 * A character-range rewrite of the source. Ranges are always original-text
 * offsets; the applier walks them back-to-front so earlier offsets stay valid.
 */
type SourceEdit = {
  start: number;
  end: number;
  text: string;
};

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

/**
 * The span a retired declaration occupies, widened to its whole line only when
 * the declaration is the sole occupant of that line. Anything else sharing the
 * line — a live statement, a trailing comment, an `eslint-disable-line`
 * directive — is outside the declaration's range and must survive the
 * retirement: unrelated statements would become unbound references, and a
 * deleted comment is the one damage class a formatter can never restore.
 */
function retirementEdit(text: string, start: number, end: number): SourceEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newlineIndex = text.indexOf('\n', end);
  const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);

  if (/^\s*$/.test(before) && /^\s*$/.test(after)) {
    return {
      start: lineStart,
      end: Math.min(lineEnd + 1, text.length),
      text: '',
    };
  }

  if (/^\s*$/.test(before)) {
    // Code follows on this line, so the retired declaration hands over the
    // indentation it was occupying rather than leaving the successor adrift.
    let cursor = end;
    while (isHorizontalWhitespace(text[cursor])) {
      cursor++;
    }
    return { start, end: cursor, text: '' };
  }

  // Code precedes on this line; absorb the gap so no trailing space is left.
  let cursor = start;
  while (cursor > lineStart && isHorizontalWhitespace(text[cursor - 1])) {
    cursor--;
  }
  return { start: cursor, end, text: '' };
}

/**
 * The span to retire for a flagged node. `whole` marks a span that is a
 * statement in its own right, which is what makes it eligible to give up the
 * line it sits on; a declarator sharing a `const` with live siblings must
 * surrender exactly its own characters plus the comma binding it to them,
 * since dropping the declarator alone leaves `const a = 1, ;`.
 */
type RetiredSpan = {
  start: number;
  end: number;
  whole: boolean;
};

/**
 * Node types whose children are free-standing statements. A declaration
 * anywhere else — a `for (const mockFirestore of …)` head, say — cannot be
 * excised without leaving the enclosing construct malformed.
 */
const STATEMENT_CONTAINERS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.TSModuleBlock,
]);

/**
 * The declaration when it stands as a statement of its own, and nothing
 * otherwise.
 *
 * An `export const` is deliberately not widened to the `export` that fronts it:
 * swallowing the keyword retires the name from the module's export surface, so
 * such a declaration has no retirable statement at all and its enclosing
 * `ExportNamedDeclaration` is absent from `STATEMENT_CONTAINERS` for that
 * reason. `isExportedDeclaration` refuses the same shape ahead of this call and
 * covers the multi-declarator form this branch never sees.
 */
function retirableStatement(
  declaration: TSESTree.VariableDeclaration,
): TSESTree.Node | undefined {
  return declaration.parent &&
    STATEMENT_CONTAINERS.has(declaration.parent.type as string)
    ? declaration
    : undefined;
}

function retiredSpan(node: TSESTree.Node): RetiredSpan | undefined {
  const parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.VariableDeclaration) {
    const { declarations } = parent;
    if (declarations.length === 1) {
      const statement = retirableStatement(parent);
      if (!statement) {
        return undefined;
      }
      return {
        start: statement.range[0],
        end: statement.range[1],
        whole: true,
      };
    }
    const index = declarations.indexOf(node as TSESTree.VariableDeclarator);
    if (index > 0) {
      return {
        start: declarations[index - 1].range[1],
        end: node.range[1],
        whole: false,
      };
    }
    if (index === 0) {
      // Reach forward to the next declarator instead of backward past the
      // `const`, whose trailing space still belongs to the survivors.
      return {
        start: node.range[0],
        end: declarations[1].range[0],
        whole: false,
      };
    }
    return undefined;
  }
  if (node.type === AST_NODE_TYPES.PropertyDefinition) {
    return { start: node.range[0], end: node.range[1], whole: true };
  }
  return undefined;
}

function isWithinAny(range: TextRange, ranges: readonly TextRange[]): boolean {
  return ranges.some(([start, end]) => range[0] >= start && range[1] <= end);
}

/**
 * The orphans the retirement carries away with it, as opposed to the ones it
 * strands.
 *
 * A binding whose own declaration sits inside a retired span disappears with
 * that span — retiring the local mock is the whole point of the fix, so the
 * binding losing its last reference is not a defect. Every other orphan has a
 * declaration that SURVIVES: `const myMockFirestore = jest.fn();` under
 * `const mockFirestore = myMockFirestore;` is left bound to nothing the moment
 * the alias goes, turning a file that lints clean into one that fails
 * `no-unused-vars` and `noUnusedLocals` (#1900).
 *
 * Deleting the survivor instead is not on offer: its initializer is an
 * arbitrary expression — `jest.fn()`, a factory call, a `require` — whose effect
 * this fixer cannot prove absent, and dropping it would delete working code to
 * settle a lint warning. The fix is therefore withheld and the report stands, so
 * the local mock is still surfaced for a human to retire. An orphaned IMPORT
 * never reaches here; the shared planner retires it in the same fix.
 */
const retirementCarriesOrphan: OrphanUnbinder = (variables, removed) =>
  variables.every(
    (variable) =>
      variable.identifiers.length > 0 &&
      variable.identifiers.every((identifier) =>
        isWithinAny(identifier.range, removed),
      ),
  )
    ? []
    : null;

/**
 * Collapses edits that touch, so an overlap can never rewrite a range twice.
 */
function mergeEdits(edits: SourceEdit[]): SourceEdit[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SourceEdit[] = [];
  for (const edit of sorted) {
    const last = merged[merged.length - 1];
    if (last && edit.start < last.end) {
      last.end = Math.max(last.end, edit.end);
      last.text += edit.text;
      continue;
    }
    merged.push({ ...edit });
  }
  return merged;
}

function editOffset(anchor: ImportInsertionAnchor): number {
  return anchor.kind === 'before' ? anchor.target.range[0] : anchor.index;
}

/**
 * Where the import may be spliced in given the edits retiring the local mock.
 *
 * Widening to the anchor's line start is what lets the emitted
 * `${indent}import …\n` leave the displaced statement on the indentation it
 * already had; `importAnchorLineStartIfOwned` restricts that to the anchors it
 * is sound for. When the resulting position still falls inside a retirement —
 * the anchor statement is itself the declaration being retired, and the
 * retirement claims the indentation ahead of it — the insertion moves to that
 * edit's start, since ESLint rejects a fix nested inside another.
 */
function importPlacement(
  sourceCode: ImportInsertionSource,
  anchor: ImportInsertionAnchor,
  edits: SourceEdit[],
): ImportInsertionAnchor {
  const placement = importAnchorLineStartIfOwned(sourceCode, anchor);
  const offset = editOffset(placement);
  const enclosing = edits.find(
    (edit) => edit.start < offset && offset < edit.end,
  );
  return enclosing ? { kind: 'index', index: enclosing.start } : placement;
}

export const enforceCentralizedMockFirestore = createRule<[], MessageIds>({
  name: 'enforce-centralized-mock-firestore',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce usage of centralized mockFirestore from predefined location',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCentralizedMockFirestore:
        'This file defines or re-exports a local mockFirestore instead of importing the shared one from "{{requiredPath}}". Local mocks drift from the canonical behavior and hide API changes across suites. To fix this, import mockFirestore from the centralized test util so fixes happen in one place.',
    },
  },
  defaultOptions: [],
  create(context) {
    // A processor hands the rule a virtual filename for an extracted code block;
    // the physical path is the one that identifies the module on disk.
    const filename = context.getPhysicalFilename
      ? context.getPhysicalFilename()
      : context.getFilename();

    // The centralized module is exempt outright rather than reported without a
    // fix: its local definition IS the canonical one this rule directs every
    // other file to, so there is nothing for its author to do — the message's
    // remedy, "import mockFirestore from the centralized test util", names the
    // file it is reported in. `use-custom-memo`, `use-custom-router` and
    // `use-custom-link` exempt their wrapper implementations the same way.
    if (isCentralizedMockModule(filename)) {
      return {};
    }

    let hasCentralizedImport = false;
    const mockFirestoreNodes: Set<TSESTree.Node> = new Set();
    const customMockFirestoreNames: Set<string> = new Set();
    const customMockFirestoreCallExpressions: Set<TSESTree.CallExpression> =
      new Set();
    const thisExpressions: TSESTree.MemberExpression[] = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value.endsWith(MOCK_FIRESTORE_PATH)) {
          hasCentralizedImport = true;
          // Check for renamed imports
          for (const specifier of node.specifiers) {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'mockFirestore' &&
              specifier.local.name !== 'mockFirestore'
            ) {
              customMockFirestoreNames.add(specifier.local.name);
            }
          }
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.id.name === 'mockFirestore'
        ) {
          mockFirestoreNodes.add(node);
        } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of node.id.properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'mockFirestore'
            ) {
              mockFirestoreNodes.add(node);
              // Track renamed destructured imports
              if (
                prop.value.type === AST_NODE_TYPES.Identifier &&
                prop.value.name !== 'mockFirestore'
              ) {
                customMockFirestoreNames.add(prop.value.name);
              }
              break;
            }
          }
        }
      },

      PropertyDefinition(node) {
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          node.key.name === 'mockFirestore'
        ) {
          mockFirestoreNodes.add(node);
        }
      },

      CallExpression(node) {
        // Track calls to custom mockFirestore names
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          customMockFirestoreNames.has(node.callee.name)
        ) {
          customMockFirestoreCallExpressions.add(node);
        }

        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.Literal &&
          typeof node.arguments[0].value === 'string' &&
          !node.arguments[0].value.endsWith(MOCK_FIRESTORE_PATH)
        ) {
          const parent = node.parent;
          if (
            parent?.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.ObjectPattern
          ) {
            for (const prop of parent.id.properties) {
              if (
                prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'mockFirestore'
              ) {
                mockFirestoreNodes.add(parent);
                // Track renamed destructured imports
                if (
                  prop.value.type === AST_NODE_TYPES.Identifier &&
                  prop.value.name !== 'mockFirestore'
                ) {
                  customMockFirestoreNames.add(prop.value.name);
                }
                break;
              }
            }
          }
        }
      },

      // Handle complex object destructuring
      'ObjectPattern > Property > ObjectPattern > Property > ObjectPattern > Property[key.name="mockFirestore"]'(
        node: TSESTree.Property,
      ) {
        let current: TSESTree.Node = node;
        while (current.parent) {
          if (current.parent.type === AST_NODE_TYPES.VariableDeclarator) {
            mockFirestoreNodes.add(current.parent);
            break;
          }
          current = current.parent;
        }
      },

      // Capture this.mockFirestore expressions
      MemberExpression(node) {
        if (
          node.object.type === AST_NODE_TYPES.ThisExpression &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name === 'mockFirestore'
        ) {
          thisExpressions.push(node);
        }
      },

      'Program:exit'() {
        if (mockFirestoreNodes.size > 0) {
          const sourceCode = context.getSourceCode();

          // Report only once for the entire file
          context.report({
            node: Array.from(mockFirestoreNodes)[0],
            messageId: 'useCentralizedMockFirestore',
            data: {
              requiredPath: MOCK_FIRESTORE_PATH,
            },
            fix(fixer) {
              const originalText = sourceCode.getText();

              // Retire each declaration by its own character range. Line
              // indices would take every other occupant of those lines with
              // them.
              const removals: SourceEdit[] = [];
              for (const node of mockFirestoreNodes) {
                if (isExportedDeclaration(node)) {
                  // Retiring an exported declaration takes the name off the
                  // module's export surface, breaking importers this fixer
                  // cannot see. The report stands so the local mock is still
                  // surfaced; collapsing it is a cross-file edit a human owns.
                  return null;
                }
                const span = retiredSpan(node);
                if (!span) {
                  // A declaration that cannot be excised cleanly gets no
                  // autofix at all: leaving it behind while adding the import
                  // would report forever, and cutting it anyway would emit
                  // code that no longer parses.
                  return null;
                }
                removals.push(
                  span.whole
                    ? retirementEdit(originalText, span.start, span.end)
                    : { start: span.start, end: span.end, text: '' },
                );
              }

              // Whatever the retired declarations were the last readers of has
              // to go with them, or the fix trades this report for an unused
              // binding the consumer's build fails on (#1900). Only the
              // retirements are handed over: the reference rewrites below swap
              // one name for another rather than deleting a declaration, and a
              // rewritten call to a RENAMED centralized import would otherwise
              // read as unbinding the very import the file is told to keep.
              const orphaned = planOrphanedBindingRemoval(
                sourceCode,
                removals.map(({ start, end }): TextRange => [start, end]),
                retirementCarriesOrphan,
              );
              if (!orphaned) {
                return null;
              }
              const orphanRemovals: SourceEdit[] = orphaned.map(
                ([start, end]) => ({ start, end, text: '' }),
              );

              // Replace custom mockFirestore references with the standard one
              const replacements: SourceEdit[] = [];

              // Add replacements for custom mockFirestore names
              customMockFirestoreCallExpressions.forEach((node) => {
                if (node.callee.type === AST_NODE_TYPES.Identifier) {
                  replacements.push({
                    start: node.callee.range[0],
                    end: node.callee.range[1],
                    text: 'mockFirestore',
                  });
                }
              });

              // Add replacements for this.mockFirestore
              thisExpressions.forEach((expr) => {
                replacements.push({
                  start: expr.range[0],
                  end: expr.range[1],
                  text: 'mockFirestore',
                });
              });

              // A reference inside a deleted range goes away with it, so
              // rewriting it would only fight the removal for the same range.
              const deletions = [...removals, ...orphanRemovals];
              const survivingReplacements = replacements.filter(
                (replacement) =>
                  !deletions.some(
                    (removal) =>
                      replacement.start >= removal.start &&
                      replacement.end <= removal.end,
                  ),
              );

              const edits = mergeEdits([
                ...deletions,
                ...survivingReplacements,
              ]);

              // Every edit is bounded to the characters it owns. Rebuilding
              // the file and writing it over the `Program` node instead would
              // emit whatever precedes `Program.range[0]` — a header comment,
              // a `@ts-nocheck`, a license block — a second time, and would
              // claim a fix range spanning the file, which wins every pass-1
              // fixer race and suppresses sibling rules' fixes.
              const fixes = edits.map(({ start, end, text }) =>
                fixer.replaceTextRange([start, end], text),
              );

              if (!hasCentralizedImport) {
                // The shared anchor keeps the import below the file's
                // prologue: spliced above a `'use client'` / `'use server'`
                // directive it demotes the directive to a plain expression,
                // and above a `#!` shebang it leaves the file unparseable.
                const anchor = importInsertionAnchor(sourceCode);
                const indent = importAnchorIndent(sourceCode, anchor);
                fixes.push(
                  insertAtImportAnchor(
                    sourceCode,
                    fixer,
                    importPlacement(sourceCode, anchor, edits),
                    `${indent}import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';\n`,
                  ),
                );
              }

              return fixes;
            },
          });
        }
      },
    };
  },
});
