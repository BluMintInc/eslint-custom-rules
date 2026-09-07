import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFromFile } from './readFromFile';

const CREATED_ROOTS: string[] = [];

afterAll(() => {
  for (const root of CREATED_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

const writeFixture = (contents: string) => {
  const root = mkdtempSync(join(tmpdir(), 'read-from-file-'));
  CREATED_ROOTS.push(root);
  const path = join(root, 'payload.json');
  writeFileSync(path, contents);
  return path;
};

describe('readFromFile', () => {
  it('parses a JSON payload', () => {
    expect(readFromFile(writeFixture('{"tool_name":"Bash"}'))).toEqual({
      tool_name: 'Bash',
    });
  });

  /** Callers fall back to another input source rather than throwing, so every
   * unusable file reports the one no-input sentinel. */
  it.each([
    ['an empty file', ''],
    ['malformed JSON', '{not json'],
  ])('reports %s as no input', (_label, contents) => {
    expect(readFromFile(writeFixture(contents))).toBeNull();
  });

  it('reports a missing file as no input', () => {
    expect(
      readFromFile(join(tmpdir(), 'read-from-file-absent.json')),
    ).toBeNull();
  });
});
