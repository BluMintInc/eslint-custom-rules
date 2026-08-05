import { TSESLint, TSESTree } from '@typescript-eslint/utils';

/**
 * A shebang is only a shebang at character 0. One byte in front of it and the
 * file stops parsing outright (`TS18026: '#!' can only be used at the start of
 * a file`) and stops being executable.
 *
 * ESLint hands it to rules as an ordinary leading comment of the first
 * statement, which is what makes it easy to lose: a fixer that relocates a
 * statement together with its leading comments carries the shebang into the
 * middle of the file, and one that splices at offset 0 pushes it off line 1.
 * `importInsertion` already encodes this for the rules that add an import;
 * these are the same rule for the ones that reorder or hoist.
 */
export function isShebangComment(
  sourceCode: Pick<TSESLint.SourceCode, 'text'>,
  comment: TSESTree.Comment,
): boolean {
  return comment.range[0] === 0 && sourceCode.text.startsWith('#!');
}

/**
 * The first offset at which text may be spliced without displacing a shebang.
 * Zero for the overwhelmingly common file that has none.
 */
export function afterShebang(text: string): number {
  if (!text.startsWith('#!')) {
    return 0;
  }
  const lineEnd = text.indexOf('\n');
  return lineEnd === -1 ? text.length : lineEnd + 1;
}
