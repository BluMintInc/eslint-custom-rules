/**
 * BluMint's microdiff fork: the dependency this codebase declares, and the
 * specifier every real call site resolves against.
 */
export const MICRODIFF_MODULE = '@blumintinc/microdiff';

/**
 * Every specifier that resolves to microdiff. The fork and upstream are the
 * same library under two names, so a file on either one is diffing
 * structurally and has to be matched identically.
 *
 * The literal lives here rather than in each rule because the pair drifted
 * twice: a rule carrying only the unscoped name is inert on every call site in
 * a codebase that depends on the fork.
 */
export const MICRODIFF_MODULES: ReadonlySet<string> = new Set([
  MICRODIFF_MODULE,
  'microdiff',
]);
