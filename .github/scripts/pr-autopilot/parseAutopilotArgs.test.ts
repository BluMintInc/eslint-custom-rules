import {
  DEFAULT_POLL_INTERVAL,
  parseAutopilotArgs,
} from './parseAutopilotArgs';

describe('parseAutopilotArgs', () => {
  it('defaults to the default poll interval with no args', () => {
    const options = parseAutopilotArgs([]);
    expect(options.pollIntervalSeconds).toBe(DEFAULT_POLL_INTERVAL);
    expect(options.pr).toBeUndefined();
    expect(options.maxIdleCycles).toBeUndefined();
    expect(options.maxRuntimeSeconds).toBeUndefined();
  });

  it('parses all supported flags', () => {
    const options = parseAutopilotArgs([
      '--pr=1229',
      '--poll-interval=30',
      '--max-idle-cycles=3',
      '--max-runtime=600',
    ]);
    expect(options).toEqual({
      pr: 1229,
      pollIntervalSeconds: 30,
      maxIdleCycles: 3,
      maxRuntimeSeconds: 600,
    });
  });

  it.each([
    ['--pr=0'],
    ['--pr=-1'],
    ['--pr=abc'],
    ['--poll-interval=0'],
    ['--poll-interval=foo'],
    ['--max-idle-cycles=0'],
    ['--max-runtime=0'],
  ])('throws on invalid value %s', (arg) => {
    expect(() => parseAutopilotArgs([arg])).toThrow(/Invalid/);
  });

  it('throws on poll interval beyond the setTimeout ceiling', () => {
    expect(() => parseAutopilotArgs(['--poll-interval=9999999'])).toThrow(
      /Invalid --poll-interval/,
    );
  });

  it('throws on an unknown argument', () => {
    expect(() => parseAutopilotArgs(['--push-to=foo'])).toThrow(
      /Unknown argument/,
    );
  });

  it('trims whitespace around values', () => {
    expect(parseAutopilotArgs(['--pr= 42 ']).pr).toBe(42);
  });
});
