import { buildCommentPrompt, buildCheckFixPrompt } from './buildPrompt';
import type { ReviewComment } from './types';

const humanComment: ReviewComment = {
  url: 'https://github.com/x/y/pull/1#discussion_r1',
  path: 'src/rules/foo.ts',
  line: 42,
  author: 'alice',
  isBot: false,
  body: 'Please rename this variable.',
  diff: '',
};

const botComment: ReviewComment = {
  url: 'https://github.com/x/y/pull/1#discussion_r2',
  path: 'src/rules/bar.ts',
  line: null,
  author: 'coderabbitai',
  isBot: true,
  body: 'Consider null-checking here.',
  diff: '@@ -1 +1 @@\n-const x = 1;\n+const x = 2;',
};

describe('buildCommentPrompt', () => {
  it('includes count, author, path:line, url, and body', () => {
    const prompt = buildCommentPrompt([humanComment]);
    expect(prompt).toContain('1 unresolved review comment(s)');
    expect(prompt).toContain('alice');
    expect(prompt).toContain('src/rules/foo.ts:42');
    expect(prompt).toContain(humanComment.url);
    expect(prompt).toContain('Please rename this variable.');
  });

  it('omits the bot caveat when no bot comments are present', () => {
    const prompt = buildCommentPrompt([humanComment]);
    expect(prompt).not.toContain('Some comments are from review bots');
  });

  it('adds the bot caveat and (bot) tag when a bot comment is present', () => {
    const prompt = buildCommentPrompt([botComment]);
    expect(prompt).toContain('(bot)');
    expect(prompt).toContain('Some comments are from review bots');
    expect(prompt).toContain('half of bot comments are false positives');
  });

  it('renders path without a line suffix when line is null', () => {
    const prompt = buildCommentPrompt([botComment]);
    expect(prompt).toContain('src/rules/bar.ts');
    expect(prompt).not.toContain('src/rules/bar.ts:');
  });

  it('embeds the diff in a fenced block when present', () => {
    const prompt = buildCommentPrompt([botComment]);
    expect(prompt).toContain('Code context:');
    expect(prompt).toContain('const x = 2;');
  });

  it('uses a longer fence than any backtick run inside the diff', () => {
    const tricky: ReviewComment = {
      ...botComment,
      diff: 'text with ``` triple backticks inside',
    };
    const prompt = buildCommentPrompt([tricky]);
    expect(prompt).toContain('````diff');
  });

  it('renders a placeholder for an empty body', () => {
    const prompt = buildCommentPrompt([{ ...humanComment, body: '' }]);
    expect(prompt).toContain('(no body)');
  });
});

describe('buildCheckFixPrompt', () => {
  it('includes the check name, url, and log excerpt', () => {
    const prompt = buildCheckFixPrompt(
      'Jest All',
      'https://github.com/x/y/actions/runs/123',
      'FAIL src/foo.test.ts',
    );
    expect(prompt).toContain('CI Check Failure: Jest All');
    expect(prompt).toContain('https://github.com/x/y/actions/runs/123');
    expect(prompt).toContain('FAIL src/foo.test.ts');
  });

  it('fences the log safely when it contains backtick runs', () => {
    const prompt = buildCheckFixPrompt('Lint', 'url', 'a ```` b');
    expect(prompt).toContain('`````ci-log');
  });
});
