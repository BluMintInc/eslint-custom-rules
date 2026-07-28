import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCustomMemo';

const MEMO_MODULE = `'src/util/memo'`;

const isMemoSpecifier = (
  specifier: TSESTree.ImportClause,
): specifier is TSESTree.ImportSpecifier =>
  specifier.type === AST_NODE_TYPES.ImportSpecifier &&
  specifier.imported.type === AST_NODE_TYPES.Identifier &&
  specifier.imported.name === 'memo';

/**
 * Rebuilding an import from `local.name` alone silently drops the pieces that
 * make a binding resolve: the default/namespace position outside the braces,
 * `as` aliases, and inline `type` modifiers. Re-emitting each surviving
 * specifier verbatim keeps every one of them intact.
 */
const buildImport = (
  specifiers: TSESTree.ImportClause[],
  source: string,
  importKind: TSESTree.ImportDeclaration['importKind'],
  sourceCode: Readonly<TSESLint.SourceCode>,
): string => {
  const defaultSpecifier = specifiers.find(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
  );
  const namespaceSpecifier = specifiers.find(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
  );
  const namedSpecifiers = specifiers.filter(
    (specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier,
  );

  const clauses: string[] = [];
  if (defaultSpecifier) {
    clauses.push(sourceCode.getText(defaultSpecifier));
  }
  if (namespaceSpecifier) {
    clauses.push(sourceCode.getText(namespaceSpecifier));
  }
  // Braces are emitted only when a named binding survives, so a lone default
  // import stays `import React from 'react'` rather than `import {} from ...`.
  if (namedSpecifiers.length > 0) {
    clauses.push(
      `{ ${namedSpecifiers
        .map((specifier) => sourceCode.getText(specifier))
        .join(', ')} }`,
    );
  }

  const prefix = importKind === 'type' ? 'import type ' : 'import ';
  return `${prefix}${clauses.join(', ')} from ${source};`;
};

export const useCustomMemo = createRule<[], MessageIds>({
  name: 'use-custom-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using src/util/memo instead of React memo',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomMemo: 'Import memo from src/util/memo instead of react',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value !== 'react') {
          return;
        }

        const memoSpecifiers = node.specifiers.filter(isMemoSpecifier);
        if (memoSpecifiers.length === 0) {
          return;
        }

        context.report({
          node,
          messageId: 'useCustomMemo',
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const memoImport = buildImport(
              memoSpecifiers,
              MEMO_MODULE,
              node.importKind,
              sourceCode,
            );

            const survivingSpecifiers = node.specifiers.filter(
              (specifier) => !isMemoSpecifier(specifier),
            );
            if (survivingSpecifiers.length === 0) {
              return fixer.replaceText(node, memoImport);
            }

            const reactImport = buildImport(
              survivingSpecifiers,
              sourceCode.getText(node.source),
              node.importKind,
              sourceCode,
            );

            return fixer.replaceText(node, `${memoImport}\n${reactImport}`);
          },
        });
      },
    };
  },
});
