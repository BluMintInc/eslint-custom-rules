/**
 * BluMint's fast-deep-equal fork: the dependency this codebase declares, and
 * therefore the only specifier a fixer may emit. An unscoped `fast-deep-equal`
 * import resolves nowhere here (TS2307).
 */
export const FAST_DEEP_EQUAL_MODULE = '@blumintinc/fast-deep-equal';

/**
 * Every specifier that resolves to a deep-equality function of the same shape:
 * the fork, its React entry point, upstream, and upstream's ESM build. A file on
 * any of them already has the comparison this rule asks for, so all four have to
 * be read identically when deciding whether an import is still needed.
 *
 * The literals live here rather than in each rule because the microdiff pair
 * drifted twice: a rule carrying only the unscoped name is inert on every call
 * site in a codebase that depends on the fork, and a fixer emitting the unscoped
 * name writes an import that does not resolve.
 */
export const FAST_DEEP_EQUAL_MODULES: ReadonlySet<string> = new Set([
  FAST_DEEP_EQUAL_MODULE,
  '@blumintinc/fast-deep-equal/react',
  'fast-deep-equal',
  'fast-deep-equal/es6',
]);

/**
 * The import statement a fixer writes to bind the equality function to
 * `localName`.
 *
 * It is assembled here, beside the literal, rather than in the rule that emits
 * it: `src/tests/enforce-dynamic-imports.test.ts` derives the modules this
 * plugin's fixers inject by resolving module-scope string constants *within each
 * source file*, so a specifier interpolated from an imported constant reads as
 * unresolved and drops out of the check that every injected module is one the
 * recommended config accepts.
 */
export const fastDeepEqualImport = (localName: string): string =>
  `import ${localName} from '${FAST_DEEP_EQUAL_MODULE}';`;
