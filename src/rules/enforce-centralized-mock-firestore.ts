import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCentralizedMockFirestore';

const MOCK_FIRESTORE_PATH = '../../../../../__test-utils__/mockFirestore';

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
 * Widens a declaration to the `export` that fronts it, whose keyword lives
 * outside the declaration's own range and would otherwise be stranded.
 */
function retirableStatement(
  declaration: TSESTree.VariableDeclaration,
): TSESTree.Node | undefined {
  const statement =
    declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
      ? declaration.parent
      : declaration;
  return statement.parent &&
    STATEMENT_CONTAINERS.has(statement.parent.type as string)
    ? statement
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

function applyEdits(text: string, edits: SourceEdit[]): string {
  let result = text;
  for (let index = edits.length - 1; index >= 0; index--) {
    const { start, end, text: replacement } = edits[index];
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
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

      // Handle dynamic imports
      'AwaitExpression > CallExpression[callee.type="ImportExpression"]'(
        node: TSESTree.CallExpression,
      ) {
        const parent = node.parent;
        if (
          parent?.type === AST_NODE_TYPES.AwaitExpression &&
          parent.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.parent.id.type === AST_NODE_TYPES.ObjectPattern
        ) {
          for (const prop of parent.parent.id.properties) {
            if (
              prop.type === AST_NODE_TYPES.Property &&
              prop.key.type === AST_NODE_TYPES.Identifier &&
              prop.key.name === 'mockFirestore'
            ) {
              mockFirestoreNodes.add(parent.parent);
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
          const sourceCode = context.sourceCode;

          // Report only once for the entire file
          context.report({
            node: Array.from(mockFirestoreNodes)[0],
            messageId: 'useCentralizedMockFirestore',
            data: {
              requiredPath: MOCK_FIRESTORE_PATH,
            },
            fix(fixer) {
              const originalText = sourceCode.getText();
              const lines = originalText.split('\n');

              // Find the indentation of the code
              const indentMatch = lines[0].match(/^(\s*)/);
              const indent = indentMatch ? indentMatch[1] : '';

              // Create the import statement
              const importLine = `${indent}import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';`;

              // Retire each declaration by its own character range. Line
              // indices would take every other occupant of those lines with
              // them.
              const removals: SourceEdit[] = [];
              for (const node of mockFirestoreNodes) {
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

              // A reference inside a retired declaration goes away with it, so
              // rewriting it would only fight the removal for the same range.
              const survivingReplacements = replacements.filter(
                (replacement) =>
                  !removals.some(
                    (removal) =>
                      replacement.start >= removal.start &&
                      replacement.end <= removal.end,
                  ),
              );

              const fixedText = applyEdits(
                originalText,
                mergeEdits([...removals, ...survivingReplacements]),
              );

              const result = hasCentralizedImport
                ? fixedText
                : `${importLine}\n${fixedText}`;

              // One replacement of the whole program, since the import belongs
              // above every statement while the removals sit anywhere below
              // it. Every edit folded into `result` is bounded to its own
              // node, so the text between them is reproduced verbatim.
              return fixer.replaceText(sourceCode.ast, result);
            },
          });
        }
      },
    };
  },
});
