/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line id-length
const os = require('node:os');

// =============================================================================
// Adaptive resource configuration (ported from the agora repo).
//
// A full-suite run otherwise spawns (cores - 1) ts-jest workers with no
// per-worker memory ceiling and coverage always on. On a developer machine that
// exhausts memory and forces swap. The settings below bound both the worker
// count and per-worker memory, and make coverage opt-in, so a full run stays
// within a predictable footprint. CI keeps full parallelism and coverage.
// =============================================================================

const JEST_CONTEXT = process.env.JEST_CONTEXT || 'local';
const IS_CI = process.env.CI === 'true';

const cpuCount = os.cpus().length;
// eslint-disable-next-line no-restricted-properties
const memoryGb = Math.floor(os.totalmem() / (1024 * 1024 * 1024));

// Coverage is opt-in per context. CI keeps it on; the scoped stop-hook check
// and any `--coverage`/COLLECT_COVERAGE run enable it explicitly (the CLI flag
// overrides this default). Local and agent runs skip it for a lighter run.
const COVERAGE_BY_CONTEXT = {
  'claude-hooks': false,
  ci: true,
  local: false,
};

const isCoverageEnabled = () =>
  process.env.COLLECT_COVERAGE === 'true' ||
  IS_CI ||
  COVERAGE_BY_CONTEXT[JEST_CONTEXT] === true;

// Per-worker memory budget. ts-jest type-checks each file, so the baseline is
// well above a transpile-only setup; coverage instrumentation adds more. The
// idle limit must sit above this baseline or workers thrash (restart per file).
const memoryPerWorkerGb = (coverageEnabled) => (coverageEnabled ? 1.25 : 1);

// Cap workers by both available memory and half the cores (leaving headroom for
// the editor and other processes). Without this, jest defaults to cores - 1.
const calculateWorkers = () => {
  if (IS_CI) return '100%';
  const perWorker = memoryPerWorkerGb(isCoverageEnabled());
  const memBasedLimit = Math.max(1, Math.floor(memoryGb / perWorker));
  const cpuBasedLimit = Math.max(1, Math.floor(cpuCount * 0.5));
  return Math.max(1, Math.min(memBasedLimit, cpuBasedLimit, cpuCount));
};

// Recycle a worker once it exceeds its budget so a long run does not balloon
// unbounded across the suite. Left unset in CI to avoid needless restarts.
const computeWorkerIdleMemoryLimit = () => {
  if (IS_CI) return undefined;
  return `${Math.round(memoryPerWorkerGb(isCoverageEnabled()) * 1024)}MB`;
};

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    // Transpile-only (no per-file type-checking), matching agora's babel-based
    // transform. Type-checking holds a full TS program per worker, which is the
    // dominant test-time memory cost and causes heavy suites to exceed the
    // worker memory limit and get killed. Rule source type safety is enforced
    // separately by `npm run build` (tsc).
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  modulePathIgnorePatterns: ['<rootDir>/lib/'],
  reporters: ['default', 'jest-junit'],

  // Adaptive resource limits (see above) to keep full-suite runs within memory.
  maxWorkers: calculateWorkers(),
  workerIdleMemoryLimit: computeWorkerIdleMemoryLimit(),

  // Coverage is opt-in; CI, `--coverage`, and COLLECT_COVERAGE override it.
  collectCoverage: isCoverageEnabled(),
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/lib/', '.*\\.test\\.ts$'],
};
