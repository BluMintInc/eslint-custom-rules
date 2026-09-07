import { isDirectExecution } from './isDirectExecution';

const ORIGINAL_ENTRY_POINT = process.argv[1];

afterEach(() => {
  process.argv[1] = ORIGINAL_ENTRY_POINT as string;
});

describe('isDirectExecution', () => {
  it.each([
    ['a bare basename', 'gate-containment-guard-check.ts'],
    [
      'an absolute path',
      '/repo/scripts/claude-hooks/gate-containment-guard-check.ts',
    ],
  ])('reports %s as the entry point', (_label, entryPoint) => {
    process.argv[1] = entryPoint;

    expect(isDirectExecution('gate-containment-guard-check.ts')).toBe(true);
  });

  /**
   * Basename EQUALITY, never a suffix match: a suffix match makes every entry
   * point claim every longer sibling that ends with its name, and the
   * consequence is a hook body running during an IMPORT — consuming the
   * importing process's stdin and printing hook output into whatever that
   * process was doing.
   */
  it('refuses a longer sibling that merely ends with the name', () => {
    process.argv[1] = '/repo/scripts/claude-hooks/other-guard-check.ts';

    expect(isDirectExecution('guard-check.ts')).toBe(false);
  });

  it('reports a genuine boolean when Node was given no entry point', () => {
    delete process.argv[1];

    expect(isDirectExecution('gate-containment-guard-check.ts')).toBe(false);
  });
});
