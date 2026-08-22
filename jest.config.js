/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line id-length
const os = require('node:os');
const fs = require('node:fs');

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

// Per-worker memory budget, measured rather than estimated: workers of a
// stop-hook run reached 1.3-2.3GB RSS against a 1GB figure, so the budget
// under-counted real cost by half and the idle limit sat below the very working
// set it exists to bound. computeWorkerIdleMemoryLimit derives from this number,
// which makes it the ceiling a run ENFORCES rather than a description of one --
// workers reached 2.3GB precisely because the old limit failed to bind.
// ts-jest type-checks each file, which is why it sits far above transpile-only.
const memoryPerWorkerGb = (coverageEnabled) => (coverageEnabled ? 2.5 : 2);

// Headroom left to the OS and to whatever else holds the machine.
const RESERVED_GB = 2;

// Floor on the budget, so a momentarily tight machine still makes progress.
const MIN_BUDGET_GB = 1;

// Memory actually obtainable right now, or null where no trustworthy signal
// exists. Linux MemAvailable counts reclaimable page cache; os.freemem()
// (MemFree) omits it and understates real headroom several-fold on a warm box,
// so the absent case keeps the total-memory budget rather than acting on a
// signal known to be wrong.
const readAvailableGb = () => {
  try {
    const match = fs
      .readFileSync('/proc/meminfo', 'utf8')
      .match(/^MemAvailable:\s+(\d+)\s+kB/m);
    return match ? Number(match[1]) / (1024 * 1024) : null;
  } catch {
    return null;
  }
};

// Cap workers by obtainable memory and by half the cores (leaving headroom for
// the editor and other processes). Without this, jest defaults to cores - 1.
//
// The memory bound reads what is AVAILABLE rather than what is installed. This
// suite runs on a host shared by several concurrent agent loops; sized against
// total RAM each pool believes it owns the box, so co-resident pools commit a
// multiple of what exists. That drove the host into a memory stall deep enough
// to starve tailscaled and drop it off its network, which surfaced as ssh
// timing out. Available memory coordinates the pools with no lock between them:
// one starting while another is resident simply sees less.
const calculateWorkers = () => {
  if (IS_CI) return '100%';
  const perWorker = memoryPerWorkerGb(isCoverageEnabled());
  const availableGb = readAvailableGb();
  const budgetGb =
    availableGb === null
      ? memoryGb
      : Math.max(MIN_BUDGET_GB, availableGb - RESERVED_GB);
  const memBasedLimit = Math.max(1, Math.floor(budgetGb / perWorker));
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
  // Scratch roots hold transient *.test.ts fixtures that rules analyse on disk
  // (test-file-location-enforcement writes into .cursor/tmp). Discovery would
  // otherwise race their cleanup and fail the run on files that no longer exist.
  //
  // Agent worktrees are a full checkout of this repo, so discovery finds a
  // second copy of every suite and runs it against that checkout's sources. A
  // run then costs one multiple per live worktree and, worse, reports another
  // checkout's failures under a path that reads as this one's.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.cursor/tmp/',
    '<rootDir>/.claude/tmp/',
    '<rootDir>/.claude/worktrees/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    // Transpile-only (no per-file type-checking), matching agora's babel-based
    // transform. Type-checking holds a full TS program per worker, which is the
    // dominant test-time memory cost and causes heavy suites to exceed the
    // worker memory limit and get killed. Rule source type safety is enforced
    // separately by `npm run build` (tsc).
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  // A worktree's `__mocks__` collide with this checkout's in the haste map,
  // which resolves manual mocks by basename alone.
  modulePathIgnorePatterns: ['<rootDir>/lib/', '<rootDir>/.claude/worktrees/'],
  reporters: ['default', 'jest-junit'],

  // Asserts every RuleTester `valid` case can actually fail. Loaded globally
  // rather than from `src/utils/ruleTester.ts` because suites that build their
  // own RuleTester would otherwise skip the check.
  setupFiles: ['<rootDir>/src/utils/installValidCaseGuard.ts'],

  // Adaptive resource limits (see above) to keep full-suite runs within memory.
  maxWorkers: calculateWorkers(),
  workerIdleMemoryLimit: computeWorkerIdleMemoryLimit(),

  // Coverage is opt-in; CI, `--coverage`, and COLLECT_COVERAGE override it.
  collectCoverage: isCoverageEnabled(),
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: ['/node_modules/', '/lib/', '.*\\.test\\.ts$'],
};
