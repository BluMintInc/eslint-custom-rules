import {
  parseUnresolvedComments,
  parsePrChecks,
  derivePrCiStatus,
  deriveFailingChecks,
} from './fetchPrState';
import type { CheckStatus } from './types';

describe('parseUnresolvedComments', () => {
  const wrap = (nodes: unknown[]): string =>
    JSON.stringify({
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes } },
        },
      },
    });

  it('flattens unresolved threads into comments', () => {
    const json = wrap([
      {
        isResolved: false,
        comments: {
          nodes: [
            {
              url: 'u1',
              path: 'src/a.ts',
              line: 10,
              bodyText: 'fix this',
              diffHunk: '@@ hunk',
              author: { login: 'alice', __typename: 'User' },
            },
          ],
        },
      },
    ]);
    const comments = parseUnresolvedComments(json);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toEqual({
      url: 'u1',
      path: 'src/a.ts',
      line: 10,
      author: 'alice',
      isBot: false,
      body: 'fix this',
      diff: '@@ hunk',
    });
  });

  it('skips resolved threads', () => {
    const json = wrap([
      {
        isResolved: true,
        comments: {
          nodes: [
            { url: 'u', path: 'p', bodyText: 'x', author: { login: 'a' } },
          ],
        },
      },
    ]);
    expect(parseUnresolvedComments(json)).toHaveLength(0);
  });

  it('flags bot authors by typename or login pattern', () => {
    const json = wrap([
      {
        isResolved: false,
        comments: {
          nodes: [
            {
              url: 'u1',
              path: 'p',
              bodyText: 'b',
              author: { login: 'coderabbitai', __typename: 'User' },
            },
            {
              url: 'u2',
              path: 'p',
              bodyText: 'b',
              author: { login: 'some-app', __typename: 'Bot' },
            },
          ],
        },
      },
    ]);
    const comments = parseUnresolvedComments(json);
    expect(comments.map((c) => c.isBot)).toEqual([true, true]);
  });

  it('drops comments addressed to humans', () => {
    const json = wrap([
      {
        isResolved: false,
        comments: {
          nodes: [
            {
              url: 'u',
              path: 'p',
              bodyText: '  human: do this manually',
              author: { login: 'alice' },
            },
          ],
        },
      },
    ]);
    expect(parseUnresolvedComments(json)).toHaveLength(0);
  });

  it('skips comments without an author login', () => {
    const json = wrap([
      {
        isResolved: false,
        comments: { nodes: [{ url: 'u', path: 'p', bodyText: 'b' }] },
      },
    ]);
    expect(parseUnresolvedComments(json)).toHaveLength(0);
  });

  it('defaults missing fields gracefully', () => {
    const json = wrap([
      {
        isResolved: false,
        comments: { nodes: [{ author: { login: 'a' } }] },
      },
    ]);
    const [comment] = parseUnresolvedComments(json);
    expect(comment.url).toBe('No URL');
    expect(comment.path).toBe('Unknown file');
    expect(comment.line).toBeNull();
    expect(comment.body).toBe('');
    expect(comment.diff).toBe('');
  });

  it('returns empty when the response has no threads', () => {
    expect(parseUnresolvedComments(JSON.stringify({ data: {} }))).toHaveLength(
      0,
    );
  });
});

describe('parsePrChecks', () => {
  it('parses the gh pr checks JSON array', () => {
    const raw = JSON.stringify([
      {
        name: 'Jest All',
        bucket: 'fail',
        state: 'FAILURE',
        workflow: 'CI',
        link: 'l',
      },
    ]);
    expect(parsePrChecks(raw)).toEqual([
      {
        name: 'Jest All',
        bucket: 'fail',
        state: 'FAILURE',
        workflow: 'CI',
        link: 'l',
      },
    ]);
  });
});

describe('derivePrCiStatus / deriveFailingChecks', () => {
  const check = (
    name: string,
    bucket: CheckStatus['bucket'],
  ): CheckStatus => ({ name, bucket, state: '', workflow: '', link: '' });

  it('returns green when all non-bot checks pass', () => {
    expect(
      derivePrCiStatus([check('Jest All', 'pass'), check('Build', 'skipping')]),
    ).toBe('green');
  });

  it('returns failing when a non-bot check fails', () => {
    expect(
      derivePrCiStatus([check('Jest All', 'fail'), check('Build', 'pending')]),
    ).toBe('failing');
  });

  it('prioritizes failing over pending', () => {
    expect(
      derivePrCiStatus([check('a', 'pending'), check('b', 'fail')]),
    ).toBe('failing');
  });

  it('returns pending when a check is in-flight and none fail', () => {
    expect(
      derivePrCiStatus([check('a', 'pass'), check('b', 'pending')]),
    ).toBe('pending');
  });

  it('ignores failing bot review checks', () => {
    expect(
      derivePrCiStatus([
        check('CodeRabbit', 'fail'),
        check('Cursor Bugbot', 'pending'),
        check('Jest All', 'pass'),
      ]),
    ).toBe('green');
  });

  it('returns only non-bot failing checks', () => {
    const failing = deriveFailingChecks([
      check('Jest All', 'fail'),
      check('CodeRabbit', 'fail'),
      check('Build', 'pass'),
    ]);
    expect(failing.map((c) => c.name)).toEqual(['Jest All']);
  });
});
