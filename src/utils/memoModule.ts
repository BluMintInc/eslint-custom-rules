import path from 'path';

/**
 * The project's memo wrapper: the module `use-custom-memo`'s fixer points every
 * `import { memo } from 'react'` at. It re-exports React's `memo`, so a rule
 * that recognises a `memo(...)` call has to accept this module's binding as
 * React's — keying recognition on the `'react'` spelling alone lets that fixer
 * switch the recogniser off on the very convention this plugin enforces.
 *
 * The quotes live inside the value because the fixer splices the specifier into
 * emitted import text verbatim, beside `sourceCode.getText(node.source)`, which
 * carries its own quotes.
 */
export const CUSTOM_MEMO_MODULE_SOURCE = `'src/util/memo'`;

/** `CUSTOM_MEMO_MODULE_SOURCE` carries the quotes the fixer emits; a path never does. */
export const CUSTOM_MEMO_MODULE_PATH = CUSTOM_MEMO_MODULE_SOURCE.slice(1, -1);

/**
 * The trailing segments that identify the wrapper module however it is spelled.
 * Only the leading segments vary between spellings of the same module — the
 * `src/` alias the fixer emits, a `@/` alias, or any depth of `../` — so the
 * tail is what a specifier has to carry. It has to land on a segment boundary,
 * so `./memo`, `lodash-memo` and `react-memo` name other modules and stay out.
 */
const MODULE_TAIL = CUSTOM_MEMO_MODULE_PATH.split('/').slice(-2).join('/');
const MODULE_TAIL_PATTERN = new RegExp(`(?:^|/)${MODULE_TAIL}$`);

/** Whether an import specifier, read alone, names the memo wrapper module. */
export const isCustomMemoModuleSource = (source: string): boolean =>
  MODULE_TAIL_PATTERN.test(source);

/**
 * Whether `source`, imported from `filename`, names the memo wrapper module.
 *
 * A relative specifier is resolved against the importing file before matching,
 * because a file that sits inside the wrapper's own directory spells the same
 * module `../memo` — a specifier naming no `util` segment of its own. Only
 * relative specifiers resolve: a bare specifier is a package or an alias whose
 * target the linter cannot know without a resolver.
 */
export const isCustomMemoModuleImport = (
  source: string,
  filename?: string,
): boolean => {
  if (isCustomMemoModuleSource(source)) {
    return true;
  }
  if (!filename || !source.startsWith('.')) {
    return false;
  }
  const importerDirectory = path.posix.dirname(filename.replace(/\\/g, '/'));
  return isCustomMemoModuleSource(
    path.posix.normalize(path.posix.join(importerDirectory, source)),
  );
};
