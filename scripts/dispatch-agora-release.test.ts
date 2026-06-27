import {
  AGORA_REPO,
  EVENT_TYPE,
  buildManifestUrl,
  dispatch,
  parseArgs,
} from './dispatch-agora-release';

describe('dispatch-agora-release', () => {
  it('targets the agora repo and the eslint-rules-released event', () => {
    expect(AGORA_REPO).toBe('BluMintInc/agora');
    expect(EVENT_TYPE).toBe('eslint-rules-released');
  });

  it('builds an unpkg manifest URL for the version', () => {
    expect(buildManifestUrl('1.16.0')).toBe(
      'https://unpkg.com/@blumintinc/eslint-plugin-blumint@1.16.0/release-manifest.json',
    );
  });

  it('parses equals-form args', () => {
    expect(parseArgs(['--version=1.16.0'])).toEqual({ version: '1.16.0' });
  });

  it('skips (returns false) when no token is supplied', () => {
    const exec = jest.fn();
    expect(dispatch({ version: '1.16.0', token: '', exec })).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('posts a repository_dispatch with the version payload when a token is present', () => {
    const exec = jest.fn();
    const result = dispatch({ version: '1.16.0', token: 'tok', exec });
    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe('gh');
    expect(args).toContain(`repos/${AGORA_REPO}/dispatches`);
    expect(args).toContain('--input');
    const body = JSON.parse((opts as { input: string }).input);
    expect(body).toEqual({
      event_type: EVENT_TYPE,
      client_payload: {
        version: '1.16.0',
        manifestUrl: buildManifestUrl('1.16.0'),
      },
    });
    expect((opts as { env: Record<string, string> }).env.GH_TOKEN).toBe('tok');
  });
});
