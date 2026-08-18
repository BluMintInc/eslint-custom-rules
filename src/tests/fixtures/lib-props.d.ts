/**
 * Stands in for a third-party UI library's prop surface (MUI's `TypographyProps`,
 * React's `HTMLAttributes`, …) so `memo-compare-deeply-complex-props` cases can
 * intersect a component's props with an interface the author does not own. The
 * plugin has no React or MUI dependency, and an unresolvable module contributes
 * no members — which is precisely the condition under test.
 *
 * Deliberately a SCRIPT: no top-level `import`/`export`, so `declare module`
 * declares an ambient module rather than augmenting one, and the declaration is
 * visible to every file in the program.
 */
declare module 'fake-ui-lib' {
  export interface LibBaseProps {
    classes?: Record<string, string>;
    variantMapping?: Record<string, string>;
  }
}
