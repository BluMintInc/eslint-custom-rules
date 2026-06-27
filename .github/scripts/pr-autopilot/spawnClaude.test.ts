import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnClaude } from './spawnClaude';

type FakeChild = EventEmitter & {
  stdin: { write: jest.Mock; end: jest.Mock };
  stderr: EventEmitter;
  kill: jest.Mock;
};

const makeFakeChild = (): FakeChild => {
  const child = new EventEmitter() as FakeChild;
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
};

const fakeSpawner = (child: FakeChild): typeof nodeSpawn => {
  return (() => child) as unknown as typeof nodeSpawn;
};

describe('spawnClaude', () => {
  let promptPath: string;

  beforeAll(() => {
    promptPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-test-')),
      'prompt.md',
    );
    fs.writeFileSync(promptPath, 'do the thing', 'utf8');
  });

  afterAll(() => {
    fs.rmSync(path.dirname(promptPath), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('feeds the prompt via stdin and resolves with the exit code on close', async () => {
    const child = makeFakeChild();
    const promise = spawnClaude(promptPath, '/repo', 1000, fakeSpawner(child));
    child.emit('close', 0);
    await expect(promise).resolves.toEqual({
      exitCode: 0,
      stderr: '',
      timedOut: false,
    });
    expect(child.stdin.write).toHaveBeenCalledWith('do the thing');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('captures stderr and maps a null exit code to 1', async () => {
    const child = makeFakeChild();
    const promise = spawnClaude(promptPath, '/repo', 1000, fakeSpawner(child));
    child.stderr.emit('data', Buffer.from('some warning'));
    child.emit('close', null);
    await expect(promise).resolves.toEqual({
      exitCode: 1,
      stderr: 'some warning',
      timedOut: false,
    });
  });

  it('resolves exitCode 1 with the message on spawn error', async () => {
    const child = makeFakeChild();
    const promise = spawnClaude(promptPath, '/repo', 1000, fakeSpawner(child));
    child.emit('error', new Error('boom'));
    await expect(promise).resolves.toEqual({
      exitCode: 1,
      stderr: 'boom',
      timedOut: false,
    });
  });

  it('kills a hung child after the timeout and resolves timedOut', async () => {
    jest.useFakeTimers();
    const child = makeFakeChild();
    const promise = spawnClaude(promptPath, '/repo', 5000, fakeSpawner(child));
    jest.advanceTimersByTime(5000);
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    jest.advanceTimersByTime(10000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('ignores a late close after a timeout (first result wins)', async () => {
    jest.useFakeTimers();
    const child = makeFakeChild();
    const promise = spawnClaude(promptPath, '/repo', 5000, fakeSpawner(child));
    jest.advanceTimersByTime(5000);
    child.emit('close', 0);
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
  });
});
