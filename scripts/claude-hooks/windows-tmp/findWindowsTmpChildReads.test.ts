import { findWindowsTmpChildReads } from './findWindowsTmpChildReads';

describe('findWindowsTmpChildReads', () => {
  it('reports the line, the shape and the paths the child parses', () => {
    expect(
      findWindowsTmpChildReads(
        "node -p \"require('fs').readFileSync('/tmp/r3.json','utf8')\"",
      ),
    ).toEqual([{ line: 1, shape: 'read-call', paths: ['/tmp/r3.json'] }]);
  });

  it('numbers lines from one', () => {
    expect(
      findWindowsTmpChildReads(
        `npm run build\nnode -e "require('/tmp/r.json')"`,
      ),
    ).toMatchObject([{ line: 2 }]);
  });

  /**
   * The paths come from the classifier's SPAN rather than from the line: the
   * capture idiom puts the redirect and the read on one `&&` line, and a remedy
   * naming the redirect's own path prescribes the over-correction the deny
   * exists to prevent.
   */
  it('names only the path inside the code string', () => {
    expect(
      findWindowsTmpChildReads(
        'gh x > /tmp/out.json && node -e "require(\'/tmp/out.json\')"',
      ),
    ).toMatchObject([{ paths: ['/tmp/out.json'] }]);
  });

  it('reports each distinct path once, in the order it appears', () => {
    expect(
      findWindowsTmpChildReads(
        "node -e \"require('/tmp/b.json');require('/tmp/a.json');require('/tmp/b.json')\"",
      ),
    ).toMatchObject([{ paths: ['/tmp/b.json', '/tmp/a.json'] }]);
  });

  it('reports a rooted directory with no segment after it', () => {
    expect(
      findWindowsTmpChildReads('node -e "process.chdir(`/tmp`)"'),
    ).toMatchObject([{ paths: ['/tmp'] }]);
  });

  it.each([
    ['a redirect', 'gh issue view 1 --json body > /tmp/body.json'],
    ['the prescribed sink', 'node -e "require(\'./.claude/tmp/s/r.json\')"'],
    ['an unrelated command', 'npm run build'],
  ])('reports nothing for %s', (_label, command) => {
    expect(findWindowsTmpChildReads(command)).toEqual([]);
  });
});
