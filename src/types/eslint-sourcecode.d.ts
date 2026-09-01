import type { TSESTree } from '@typescript-eslint/utils';

/**
 * `SourceCode#getAncestors(node)` is the ESLint 9 replacement for the rule
 * context's own `getAncestors()`. `@typescript-eslint/utils@5.59.6` predates it
 * and so does not declare it, while the method is present at runtime on any
 * ESLint that ships it — `ASTHelpers.getAncestors` feature-detects before
 * calling. The augmentation exists to type that detection, not to assert the
 * method is always there.
 *
 * The rule context's `sourceCode` PROPERTY is deliberately NOT augmented here.
 * ESLint adds it in 8.40, which is inside the declared
 * `peerDependencies.eslint` range, so a rule reading it throws on a
 * peer-satisfying older install. Declaring it would let tsc bless exactly the
 * call sites that crash. `getSourceCode()` is the accessor every supported
 * major exposes and is what the source uses;
 * `src/tests/eslint-peer-range-consistency.test.ts` holds that line.
 */
declare module '@typescript-eslint/utils/ts-eslint' {
  interface SourceCode {
    getAncestors(node: TSESTree.Node): TSESTree.Node[];
  }
}
