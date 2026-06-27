import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureWorkspaceTrusted } from './ensureWorkspaceTrusted';

const DIR = '/Users/someone/eslint-custom-rules';

describe('ensureWorkspaceTrusted', () => {
  let configPath: string;

  beforeEach(() => {
    configPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'trust-test-')),
      '.claude.json',
    );
  });

  afterEach(() => {
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  const readConfig = (): Record<string, unknown> => {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  };

  it('grants trust and reports a change when the dir is untrusted', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projects: { [DIR]: { hasTrustDialogAccepted: false } },
      }),
    );
    expect(ensureWorkspaceTrusted(DIR, configPath)).toBe(true);
    const config = readConfig() as {
      projects: Record<string, { hasTrustDialogAccepted: boolean }>;
    };
    expect(config.projects[DIR].hasTrustDialogAccepted).toBe(true);
  });

  it('is idempotent: no change and no rewrite when already trusted', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ projects: { [DIR]: { hasTrustDialogAccepted: true } } }),
    );
    const before = fs.statSync(configPath).mtimeMs;
    expect(ensureWorkspaceTrusted(DIR, configPath)).toBe(false);
    expect(fs.statSync(configPath).mtimeMs).toBe(before);
  });

  it('creates the project entry when absent, preserving other keys', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        userID: 'abc',
        projects: { '/other/repo': { hasTrustDialogAccepted: true } },
      }),
    );
    expect(ensureWorkspaceTrusted(DIR, configPath)).toBe(true);
    const config = readConfig() as {
      userID: string;
      projects: Record<string, { hasTrustDialogAccepted: boolean }>;
    };
    expect(config.userID).toBe('abc');
    expect(config.projects['/other/repo'].hasTrustDialogAccepted).toBe(true);
    expect(config.projects[DIR].hasTrustDialogAccepted).toBe(true);
  });

  it('treats a missing config file as empty and creates it', () => {
    expect(ensureWorkspaceTrusted(DIR, configPath)).toBe(true);
    const config = readConfig() as {
      projects: Record<string, { hasTrustDialogAccepted: boolean }>;
    };
    expect(config.projects[DIR].hasTrustDialogAccepted).toBe(true);
  });

  it('treats a malformed config file as empty rather than throwing', () => {
    fs.writeFileSync(configPath, '{ this is not json');
    expect(() => ensureWorkspaceTrusted(DIR, configPath)).not.toThrow();
    expect(readConfig()).toEqual({
      projects: { [DIR]: { hasTrustDialogAccepted: true } },
    });
  });
});
