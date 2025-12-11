import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

// React hooks to check
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

// Name of the rule
export type MessageIds = 'noArrayLengthInDeps';

type Options = [
  {
    hashImport?: {
      source?: string;
      importName?: string;
    };
  }?,
];

const DEFAULT_HASH_IMPORT = {
  source: 'functions/src/util/hash/stableHash',
  importName: 'stableHash',
};

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

function collectAllTakenNames(sourceCode: TSESLint.SourceCode): Set<string> {
  const names = new Set<string>();
  const scopeManager = sourceCode.scopeManager;
  const visit = (scope: any) => {
    if (!scope) return;
    for (const v of scope.variables) {
      names.add(v.name);
    }
    if (Array.isArray(scope.childScopes)) {
      for (const child of scope.childScopes) visit(child);
    }
  };
  visit(scopeManager?.globalScope);
  return names;
}

function findEnclosingFunction(node: TSESTree.Node): TSESTree.Node | null {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

function ensureWeakMapEntry<K extends object, V>(
  map: WeakMap<K, V>,
  key: K,
  factory: () => V,
): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = factory();
  map.set(key, next);
  return next;
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

function isStableHashImported(
  sourceCode: TSESLint.SourceCode,
  hashSource: string,
  hashImportName: string,
): boolean {
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === hashSource
    ) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier &&
          spec.imported.type === AST_NODE_TYPES.Identifier &&
          spec.imported.name === hashImportName
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export const noArrayLengthInDeps = createRule<Options, MessageIds>({
  name: 'no-array-length-in-deps',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent using array.length in React hook dependency arrays. Instead, memoize stableHash(array) with useMemo and depend on the hash.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          hashImport: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              importName: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noArrayLengthInDeps:
        'Avoid using array.length in hook dependency arrays. Use a memoized stableHash(variable) via useMemo and depend on the hash instead.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options = {}] = context.options;
    const { hashImport } = options;
    const hashImportConfig = {
      source: hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
      importName: hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
    };

    // Track planned file-wide changes to avoid overlapping fixers
    let importsPlanned = false;
    const perFuncDeclaredBases = new WeakMap<TSESTree.Node, Set<string>>();
    const perFuncBaseToVar = new WeakMap<TSESTree.Node, Map<string, string>>();

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

        // Report once on the dependency array
        context.report({
          node: depsArg,
          messageId: 'noArrayLengthInDeps',
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const fixes: TSESLint.RuleFix[] = [];
            const hostFn =
              findEnclosingFunction(node) ?? (sourceCode.ast as TSESTree.Node);
            const declaredBases = ensureWeakMapEntry(
              perFuncDeclaredBases,
              hostFn,
              () => new Set<string>(),
            );
            const baseToVar = ensureWeakMapEntry(
              perFuncBaseToVar,
              hostFn,
              () => new Map<string, string>(),
            );

            // Prepare variable names (consistent across file) and taken names (across all scopes)
            const allTaken = collectAllTakenNames(sourceCode);
            for (const name of baseToVar.values()) {
              allTaken.add(name);
            }

            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (!baseToVar.has(baseText)) {
                const lastPropName = getLastPropertyName(baseExpr) || 'array';
                const varName = generateUniqueName(lastPropName, allTaken);
                baseToVar.set(baseText, varName);
                allTaken.add(varName);
              }
            }

            // Build declarations text (one per base)
            let declText = '';
            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (!declaredBases.has(baseText)) {
                const varName = baseToVar.get(baseText)!;
                declText += `const ${varName} = useMemo(() => ${hashImportConfig.importName}(${baseText}), [${baseText}]);\n`;
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
            const needStableHash = !isStableHashImported(
              sourceCode,
              hashImportConfig.source,
              hashImportConfig.importName,
            );
            if (needUseMemo)
              importText += `${indent}import { useMemo } from 'react';\n`;
            if (needStableHash)
              importText += `${indent}import { ${hashImportConfig.importName} } from '${hashImportConfig.source}';\n`;

            if (importDecls.length === 0) {
              // No existing imports. Normalize by removing leading whitespace and inserting at file start with no indentation.
              if (declText || importText) {
                // Build non-indented versions of import and decl blocks
                let importTextNoIndent = '';
                if (needUseMemo)
                  importTextNoIndent += `import { useMemo } from 'react';\n`;
                if (needStableHash)
                  importTextNoIndent += `import { ${hashImportConfig.importName} } from '${hashImportConfig.source}';\n`;
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
              const varName = baseToVar.get(baseText)!;
              fixes.push(fixer.replaceText(element, varName));
            }

            return fixes;
          },
        });
      },
    };
  },
});
