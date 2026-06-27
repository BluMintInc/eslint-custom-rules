import { runCheckFixingPhase } from './runCheckFixingPhase';
import { getFailingChecks } from './fetchPrState';
import { spawnClaude } from './spawnClaude';
import { detectRateLimit } from './detectRateLimit';
import { commitAll, hasChanges, pushWithRebaseRetry } from './gitOps';
import { MAX_CHECK_FIX_ATTEMPTS, type CheckStatus } from './types';

jest.mock('node:fs', () => ({ mkdirSync: jest.fn(), writeFileSync: jest.fn() }));
jest.mock('./logWithTimestamp', () => ({ logWithTimestamp: jest.fn() }));
jest.mock('./fetchPrState');
jest.mock('./fetchCheckLogs', () => ({
  fetchCheckLogs: jest.fn(() => ({
    checkName: 'unit',
    workflowUrl: 'url',
    logExcerpt: 'log',
  })),
}));
jest.mock('./buildPrompt', () => ({
  buildCheckFixPrompt: jest.fn(() => 'prompt'),
}));
jest.mock('./spawnClaude', () => ({
  spawnClaude: jest.fn(),
  DEFAULT_SPAWN_TIMEOUT_MS: 1000,
}));
jest.mock('./detectRateLimit', () => ({
  detectRateLimit: jest.fn(() => ({ isRateLimited: false })),
  waitForRateLimit: jest.fn(),
}));
jest.mock('./gitOps');

const mockGetFailingChecks = getFailingChecks as unknown as jest.Mock;
const mockSpawnClaude = spawnClaude as unknown as jest.Mock;
const mockDetectRateLimit = detectRateLimit as unknown as jest.Mock;
const mockCommitAll = commitAll as unknown as jest.Mock;
const mockHasChanges = hasChanges as unknown as jest.Mock;
const mockPush = pushWithRebaseRetry as unknown as jest.Mock;

const check = (name: string, workflow: string): CheckStatus => ({
  name,
  workflow,
  bucket: 'fail',
  state: 'failure',
  link: 'https://github.com/o/r/actions/runs/123',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDetectRateLimit.mockReturnValue({ isRateLimited: false });
  mockSpawnClaude.mockResolvedValue({ exitCode: 0, stderr: '', timedOut: false });
  mockCommitAll.mockReturnValue(true);
  mockHasChanges.mockReturnValue(true);
  mockPush.mockReturnValue(true);
});

describe('runCheckFixingPhase retry budget (#11 keying, #12 push-gated)', () => {
  it('keys attempts by workflow+name, not by name alone', async () => {
    mockGetFailingChecks.mockReturnValue([check('test', 'B')]);
    /** Old name-only key is exhausted; the workflow+name key is fresh, so the
     * distinct job must still be attempted rather than wrongly skipped. */
    const attemptCounts = new Map<string, number>([
      ['test', MAX_CHECK_FIX_ATTEMPTS],
    ]);

    await runCheckFixingPhase(1, '/repo', attemptCounts);

    expect(mockSpawnClaude).toHaveBeenCalledTimes(1);
    expect(attemptCounts.get('B:test')).toBe(1);
  });

  it('skips a check whose workflow+name budget is exhausted', async () => {
    mockGetFailingChecks.mockReturnValue([check('test', 'B')]);
    const attemptCounts = new Map<string, number>([
      ['B:test', MAX_CHECK_FIX_ATTEMPTS],
    ]);

    await runCheckFixingPhase(1, '/repo', attemptCounts);

    expect(mockSpawnClaude).not.toHaveBeenCalled();
  });

  it('consumes an attempt only after a successful push', async () => {
    mockGetFailingChecks.mockReturnValue([check('unit', 'CI')]);
    mockPush.mockReturnValue(true);
    const attemptCounts = new Map<string, number>();

    expect(await runCheckFixingPhase(1, '/repo', attemptCounts)).toBe(true);
    expect(attemptCounts.get('CI:unit')).toBe(1);
  });

  it('does NOT consume an attempt when the push fails', async () => {
    mockGetFailingChecks.mockReturnValue([check('unit', 'CI')]);
    mockPush.mockReturnValue(false);
    const attemptCounts = new Map<string, number>();

    expect(await runCheckFixingPhase(1, '/repo', attemptCounts)).toBe(false);
    /** A failed push leaves a local commit the next cycle re-pushes; burning the
     * budget here could exhaust the check before the fix is ever retried. */
    expect(attemptCounts.get('CI:unit')).toBeUndefined();
  });

  it('consumes an attempt when Claude makes no changes', async () => {
    mockGetFailingChecks.mockReturnValue([check('unit', 'CI')]);
    mockHasChanges.mockReturnValue(false);
    const attemptCounts = new Map<string, number>();

    await runCheckFixingPhase(1, '/repo', attemptCounts);

    expect(attemptCounts.get('CI:unit')).toBe(1);
    expect(mockCommitAll).not.toHaveBeenCalled();
  });
});
