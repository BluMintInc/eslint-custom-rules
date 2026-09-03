/**
 * The project's memo wrapper: the module `use-custom-memo`'s fixer points every
 * `import { memo } from 'react'` at. It re-exports React's `memo`.
 *
 * The quotes live inside the value because the fixer splices the specifier into
 * emitted import text verbatim, beside `sourceCode.getText(node.source)`, which
 * carries its own quotes.
 */
export const CUSTOM_MEMO_MODULE_SOURCE = `'src/util/memo'`;

/** `CUSTOM_MEMO_MODULE_SOURCE` carries the quotes the fixer emits; a path never does. */
export const CUSTOM_MEMO_MODULE_PATH = CUSTOM_MEMO_MODULE_SOURCE.slice(1, -1);
