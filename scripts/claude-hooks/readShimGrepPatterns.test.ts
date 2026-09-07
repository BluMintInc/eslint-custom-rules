import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readShimGrepPatterns } from './readShimGrepPatterns';

const CREATED_ROOTS: string[] = [];

afterAll(() => {
  for (const root of CREATED_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

const writeShim = (contents: string) => {
  const root = mkdtempSync(join(tmpdir(), 'shim-grep-'));
  CREATED_ROOTS.push(root);
  const path = join(root, 'guard.sh');
  writeFileSync(path, contents);
  return path;
};

describe('readShimGrepPatterns', () => {
  it('reads every prefilter in file order', () => {
    const path = writeShim(
      [
        '#!/bin/bash',
        `grep -qE -- '(^|[^[:alnum:]_-])(git)([^[:alnum:]_-]|$)' "$TMP_FILE" || {`,
        '  exit 0',
        '}',
        `grep -qE -- '(show|cat-file)' "$TMP_FILE" || {`,
        '  exit 0',
        '}',
      ].join('\n'),
    );

    expect(readShimGrepPatterns(path)).toEqual([
      '(^|[^[:alnum:]_-])(git)([^[:alnum:]_-]|$)',
      '(show|cat-file)',
    ]);
  });

  /**
   * Anchored on the FLAGS rather than on the pattern, so editing a pattern is
   * what a binding test grades rather than what hides the pattern from it — and
   * a grep against some other file is not a prefilter.
   */
  it.each([
    ['a grep against another file', `grep -qE -- 'x' "$OTHER"\n`],
    ['a grep carrying different flags', `grep -q -- 'x' "$TMP_FILE"\n`],
    ['an indented grep', ` grep -qE -- 'x' "$TMP_FILE"\n`],
    ['no grep at all', 'echo "{}"\n'],
  ])('reads nothing from %s', (_label, contents) => {
    expect(readShimGrepPatterns(writeShim(contents))).toEqual([]);
  });
});
