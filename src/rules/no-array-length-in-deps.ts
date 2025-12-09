import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

// React hooks to check
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

// Name of the rule
export type MessageIds = 'noArrayLengthInDeps';

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isLengthMemberExpression(
  node: TSESTree.Expression,
): node is TSESTree.MemberExpression {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'length'
    );
  }
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isLengthMemberExpression(node.expression as TSESTree.Expression);
  }
  return false;
}

function getLengthMember(
  node: TSESTree.Expression,
): TSESTree.MemberExpression | null {
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    isLengthMemberExpression(node)
  ) {
    return node;
  }
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    const expr = node.expression as TSESTree.Expression;
    return getLengthMember(expr);
  }
  return null;
}

function getBaseExpression(
  member: TSESTree.MemberExpression,
): TSESTree.Expression {
  // For foo?.bar.length we want foo?.bar as base
  return member.object as TSESTree.Expression;
}

function getLastPropertyName(expr: TSESTree.Expression): string | null {
  let current: TSESTree.Expression = expr;
  while (current.type === AST_NODE_TYPES.ChainExpression) {
    current = current.expression as TSESTree.Expression;
  }
  if (current.type === AST_NODE_TYPES.Identifier) {
    return current.name;
  }
  if (current.type === AST_NODE_TYPES.MemberExpression) {
    if (
      !current.computed &&
      current.property.type === AST_NODE_TYPES.Identifier
    ) {
      return current.property.name;
    }
    // Fallback to walking further up the chain
    return getLastPropertyName(current.object as TSESTree.Expression);
  }
  return null;
}

function generateUniqueName(base: string, taken: Set<string>): string {
  let candidate = `${base}Hash`;
  if (!taken.has(candidate)) return candidate;
  let i = 2;
  while (taken.has(`${candidate}${i}`)) {
    i++;
  }
  return `${candidate}${i}`;
}

function collectAllTakenNames(
  context: TSESLint.RuleContext<MessageIds, []>,
): Set<string> {
  const names = new Set<string>();
  let scope: any = context.getScope();
  while (scope) {
    for (const v of scope.variables) {
      names.add(v.name);
    }
    scope = scope.upper;
  }
  return names;
}

function isUseMemoImported(sourceCode: TSESLint.SourceCode): boolean {
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === 'react'
    ) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier &&
          spec.imported.type === AST_NODE_TYPES.Identifier &&
          spec.imported.name === 'useMemo'
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function isStableHashImported(sourceCode: TSESLint.SourceCode): boolean {
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === 'functions/src/util/hash/stableHash'
    ) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier &&
          spec.imported.type === AST_NODE_TYPES.Identifier &&
          spec.imported.name === 'stableHash'
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export const noArrayLengthInDeps = createRule<[], MessageIds>({
  name: 'no-array-length-in-deps',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Detects array.length entries in React hook dependency arrays because length ignores content changes; auto-fixes by memoizing stableHash(array) with useMemo and depending on the hash instead.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noArrayLengthInDeps:
        'Dependency array includes length-based entries ({{dependencies}}). Array length only changes when items are added or removed, so hooks miss updates when array contents change at the same size. Memoize a stableHash of each array with useMemo and depend on that hash so the hook reruns when contents change.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track planned file-wide changes to avoid overlapping fixers
    let importsPlanned = false;
    const declaredBases = new Set<string>();
    const globalBaseToVar = new Map<string, string>();

    return {
      CallExpression(node) {
        if (!isHookCall(node)) return;
        if (node.arguments.length < 2) return;
        const depsArg = node.arguments[node.arguments.length - 1];
        if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        // Collect .length deps
        const lengthDeps: {
          element: TSESTree.Expression;
          member: TSESTree.MemberExpression;
        }[] = [];
        for (const el of depsArg.elements) {
          if (!el) continue;
          if (el.type === AST_NODE_TYPES.SpreadElement) continue;
          const member = getLengthMember(el as TSESTree.Expression);
          if (member) {
            lengthDeps.push({ element: el as TSESTree.Expression, member });
          }
        }

        if (lengthDeps.length === 0) return;

        const sourceCode = context.getSourceCode();
        const dependencies = lengthDeps
          .map(({ element }) => sourceCode.getText(element))
          .join(', ');

        // Report once on the dependency array
        context.report({
          node: depsArg,
          messageId: 'noArrayLengthInDeps',
          data: {
            dependencies,
          },
          fix(fixer) {
            const fixes: TSESLint.RuleFix[] = [];

            // Prepare variable names (consistent across file) and taken names (across all scopes)
            const allTaken = collectAllTakenNames(context);
            for (const name of globalBaseToVar.values()) {
              allTaken.add(name);
            }

            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (!globalBaseToVar.has(baseText)) {
                const lastPropName = getLastPropertyName(baseExpr) || 'array';
                const varName = generateUniqueName(lastPropName, allTaken);
                globalBaseToVar.set(baseText, varName);
                allTaken.add(varName);
              }
            }

            // Build declarations text (one per base)
            let declText = '';
            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (!declaredBases.has(baseText)) {
                const varName = globalBaseToVar.get(baseText)!;
                declText += `const ${varName} = useMemo(() => stableHash(${baseText}), [${baseText}]);\n`;
                declaredBases.add(baseText);
              }
            }
            if (declText) {
              // Add a blank line after declarations block
              declText += `\n`;
            }

            // Determine import text and insertion strategy
            const program = sourceCode.ast;
            const importDecls = program.body.filter(
              (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
            ) as TSESTree.ImportDeclaration[];

            // Compute indentation based on the whitespace before the first token
            const fullText = sourceCode.getText();
            const prefixBeforeProgram = fullText.slice(0, program.range[0]);
            const lastNewlineIndex = prefixBeforeProgram.lastIndexOf('\n');
            const indent =
              lastNewlineIndex >= 0
                ? prefixBeforeProgram.slice(lastNewlineIndex + 1)
                : prefixBeforeProgram;

            let importText = '';
            const needUseMemo = !isUseMemoImported(sourceCode);
            const needStableHash = !isStableHashImported(sourceCode);
            if (needUseMemo)
              importText += `${indent}import { useMemo } from 'react';\n`;
            if (needStableHash)
              importText += `${indent}import { stableHash } from 'functions/src/util/hash/stableHash';\n`;

            if (importDecls.length === 0) {
              // No existing imports. Normalize by removing leading whitespace and inserting at file start with no indentation.
              if (declText || importText) {
                // Build non-indented versions of import and decl blocks
                let importTextNoIndent = '';
                if (needUseMemo)
                  importTextNoIndent += `import { useMemo } from 'react';\n`;
                if (needStableHash)
                  importTextNoIndent += `import { stableHash } from 'functions/src/util/hash/stableHash';\n`;
                const declNoIndent = declText;
                const combined = `${importTextNoIndent}${
                  importTextNoIndent && declNoIndent ? '\n' : ''
                }${declNoIndent}`;
                // Remove leading whitespace
                fixes.push(fixer.replaceTextRange([0, program.range[0]], ''));
                // Insert at column 0
                fixes.push(fixer.insertTextBeforeRange([0, 0], combined));
              }
              importsPlanned = true;
            } else {
              // Existing imports present: insert missing import lines before the first import, and declarations after the last import
              const firstImport = importDecls[0];
              const lastImport = importDecls[importDecls.length - 1];
              if (importText && !importsPlanned) {
                fixes.push(fixer.insertTextBefore(firstImport, importText));
                importsPlanned = true;
              }
              if (declText) {
                const declWithIndent = declText
                  .split('\n')
                  .map((line) => (line ? `${indent}${line}` : line))
                  .join('\n');
                fixes.push(
                  fixer.insertTextAfter(lastImport, `\n${declWithIndent}`),
                );
              }
            }

            // Replace each .length dep with the corresponding var name
            for (const { element, member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              const varName = globalBaseToVar.get(baseText)!;
              fixes.push(fixer.replaceText(element, varName));
            }

            return fixes;
          },
        });
      },
    };
  },
});
