import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInput } from './readInput';

const CREATED_ROOTS: string[] = [];
const ORIGINAL_JSON_INPUT_FILE = process.env.JSON_INPUT_FILE;
const ORIGINAL_IS_TTY = process.stdin.isTTY;

/**
 * Pretending stdin is a terminal is what keeps this suite off fd 0: a jest
 * worker's stdin is a pipe nobody writes, so a genuine read there blocks the
 * run rather than answering. The interactive arm returns before that read, and
 * it is the arm every case here means.
 */
beforeEach(() => {
  process.stdin.isTTY = true;
});

afterEach(() => {
  process.stdin.isTTY = ORIGINAL_IS_TTY;
  if (ORIGINAL_JSON_INPUT_FILE === undefined) {
    delete process.env.JSON_INPUT_FILE;
    return;
  }
  process.env.JSON_INPUT_FILE = ORIGINAL_JSON_INPUT_FILE;
});

afterAll(() => {
  for (const root of CREATED_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

const writeFixture = (contents: string) => {
  const root = mkdtempSync(join(tmpdir(), 'read-input-'));
  CREATED_ROOTS.push(root);
  const path = join(root, 'payload.json');
  writeFileSync(path, contents);
  return path;
};

describe('readInput', () => {
  /** The shims spool stdin to a `mktemp` file and pass it here, so this is the
   * path every `PreToolUse:Bash` guard actually takes. */
  it('reads the JSON_INPUT_FILE payload', () => {
    process.env.JSON_INPUT_FILE = writeFixture('{"tool_name":"Bash"}');

    expect(readInput()).toEqual({ tool_name: 'Bash' });
  });

  it.each([
    ['an unusable file', () => writeFixture('{not json')],
    ['no file at all', () => ''],
  ])('reports no input for %s', (_label, resolvePath) => {
    process.env.JSON_INPUT_FILE = resolvePath();

    expect(readInput()).toBeNull();
  });
});
