import { normalizeBranchName } from './normalizeBranchName';

describe('normalizeBranchName', () => {
  it('strips remote prefix and ancestry markers', () => {
    expect(normalizeBranchName('remotes/origin/feature~2^1')).toBe('feature');
  });

  it('trims whitespace', () => {
    expect(normalizeBranchName('  remotes/origin/bugfix  ')).toBe('bugfix');
  });

  it('returns null for empty input', () => {
    expect(normalizeBranchName('')).toBeNull();
  });

  it('returns null for unsafe characters', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(normalizeBranchName('feature; rm -rf /')).toBeNull();
    consoleSpy.mockRestore();
  });
});
