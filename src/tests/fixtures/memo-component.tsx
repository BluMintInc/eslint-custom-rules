/**
 * Fixture path for `memo-compare-deeply-complex-props` cases that need a REAL
 * `ts.Program`. RuleTester lints virtual code, so a case only joins the tsconfig
 * project program when its filename names a file that exists under `include`;
 * an invented path falls back to a single-file default program in which the
 * ambient `lib-props.d.ts` is absent and library-declared props silently vanish.
 */
export {};
