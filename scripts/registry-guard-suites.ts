/**
 * The cheap guards a change to `src/index.ts` must still run.
 *
 * The plugin loads through a computed path, so jest's relatedness walk records
 * no edge to the registry and a change to the registry itself relates to
 * nothing. Registering a rule with a missing doc page, a severity that
 * disagrees with its own metadata or an invalid visitor key would then pass the
 * local gate and fail only in CI. These suites check the exported shape rather
 * than any rule's behaviour, so naming them costs the gate under a minute while
 * it checks registration end to end.
 *
 * Admission: a suite belongs here when it loads the whole plugin AND finishes
 * under 30 seconds. `export-surface-integrity` is excluded despite its name and
 * its shape, at 150 s.
 *
 * `measuredSeconds` is the suite's own wall time from a full validate run.
 * Zero means the run's reporter printed no time for it, which it does only for
 * suites under its print threshold — a floor of "faster than the cheapest
 * suite that prints", never an unmeasured entry.
 */
export type RegistryGuardSuite = {
  readonly path: string;
  readonly measuredSeconds: number;
};

export const REGISTRY_GUARD_SUITES: ReadonlyArray<RegistryGuardSuite> = [
  {
    path: 'src/tests/docs-correct-block-regression.test.ts',
    measuredSeconds: 0,
  },
  { path: 'src/tests/docs-options-schema.test.ts', measuredSeconds: 0 },
  { path: 'src/tests/docs-url-consistency.test.ts', measuredSeconds: 0 },
  { path: 'src/tests/fix-closure-core-rules.test.ts', measuredSeconds: 0 },
  {
    path: 'src/tests/no-restricted-imports-config.test.ts',
    measuredSeconds: 0,
  },
  {
    path: 'src/tests/plugin-load-without-compiler-api.test.ts',
    measuredSeconds: 0,
  },
  {
    path: 'src/tests/recommended-override-resolution.test.ts',
    measuredSeconds: 0,
  },
  {
    path: 'src/tests/recommended-severity-consistency.test.ts',
    measuredSeconds: 0,
  },
  {
    path: 'src/tests/rule-option-regex-validation.test.ts',
    measuredSeconds: 0,
  },
  { path: 'src/tests/rule-option-test-coverage.test.ts', measuredSeconds: 0 },
  { path: 'src/tests/validCaseFalsifiability.test.ts', measuredSeconds: 0 },
  { path: 'src/tests/visitor-key-validity.test.ts', measuredSeconds: 13 },
  {
    path: 'src/tests/line-scoped-suppression-exactness.test.ts',
    measuredSeconds: 13,
  },
  { path: 'src/tests/message-negative-example.test.ts', measuredSeconds: 13 },
  { path: 'src/tests/fixture-corpus-accounting.test.ts', measuredSeconds: 17 },
  { path: 'src/tests/lang-fix-closure.test.ts', measuredSeconds: 22 },
  { path: 'src/tests/docs-examples-conformance.test.ts', measuredSeconds: 23 },
  { path: 'src/tests/type-aware-drivability.test.ts', measuredSeconds: 28 },
];
