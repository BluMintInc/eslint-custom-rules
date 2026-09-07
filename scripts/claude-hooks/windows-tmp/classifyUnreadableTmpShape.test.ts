import { classifyUnreadableTmpShape } from './classifyUnreadableTmpShape';

describe('classifyUnreadableTmpShape', () => {
  it.each([
    ['a require', 'node -e "require(\'/tmp/r.json\')"'],
    ['a readFileSync', `node -p "require('fs').readFileSync('/tmp/r.json')"`],
    ['a python open', `python3 -c "json.load(open('/tmp/r.json'))"`],
    ['a spaced argument', 'node -e "require( \'/tmp/r.json\' )"'],
  ])('claims %s as a read call', (_label, text) => {
    expect(classifyUnreadableTmpShape(text)).toMatchObject({
      shape: 'read-call',
    });
  });

  /** The backstop, for a code string whose `/tmp` sits outside any
   * recognizable call. */
  it('claims a bare interpreter body', () => {
    expect(
      classifyUnreadableTmpShape('node -e "process.chdir(String.raw`/tmp`)"'),
    ).toMatchObject({ shape: 'interpreter-body' });
  });

  /**
   * WHICH POSITION the literal occupies is the entire rule. A path bash
   * resolves, or hands to a child in argv, works on Git Bash exactly as it does
   * everywhere else — flagging it is the over-correction the deny's own text
   * warns against.
   */
  it.each([
    ['a redirect target', 'gh issue view 1 --json body > /tmp/body.json'],
    ['a shell read', 'cat /tmp/body.json'],
    ['an argv path', 'jq .body /tmp/body.json'],
    ['the prescribed sink', 'node -e "require(\'./.claude/tmp/s/r.json\')"'],
    [
      'a script option that merely spells -c',
      'python3 render.py -c /tmp/x.json',
    ],
    ['a prose parenthetical', 'the slug (`/tmp/claude-<uid>/…`) is per-user'],
    ['no /tmp at all', 'npm run build'],
  ])('holds no opinion about %s', (_label, text) => {
    expect(classifyUnreadableTmpShape(text)).toBeUndefined();
  });

  /**
   * The span is what makes a caller's path extraction position-aware: a benign
   * `/tmp` elsewhere on the same `&&` line sits outside it, so a remedy built
   * from the span never prescribes rewriting the redirect.
   */
  it('claims only the code string, not the whole line', () => {
    const classified = classifyUnreadableTmpShape(
      'gh x > /tmp/out.json && node -e "require(\'/tmp/out.json\')"',
    );

    expect(classified?.span).toContain("require('/tmp/out.json'");
    expect(classified?.span).not.toContain('gh x');
  });

  /** A line carrying two read calls hands the child two paths, and a remedy
   * naming one of them reads as complete while the other still breaks. */
  it('claims every read call on the line', () => {
    const classified = classifyUnreadableTmpShape(
      "node -e \"require('/tmp/a.json');require('/tmp/b.json')\"",
    );

    expect(classified?.span).toContain('/tmp/a.json');
    expect(classified?.span).toContain('/tmp/b.json');
  });
});
