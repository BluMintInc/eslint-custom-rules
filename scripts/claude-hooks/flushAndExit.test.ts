import { flushAndExit } from './flushAndExit';

/**
 * Both process-level effects are stubbed, so the suite grades the ordering
 * rather than ending its own worker: an unstubbed `process.exit` here kills the
 * jest run, and an unstubbed write puts hook JSON into the reporter's stream.
 */
describe('flushAndExit', () => {
  let exit: jest.SpyInstance;
  let write: jest.SpyInstance;

  beforeEach(() => {
    exit = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((_data: unknown, callback?: unknown) => {
        if (typeof callback === 'function') {
          callback();
        }
        return true;
      });
  });

  afterEach(() => {
    exit.mockRestore();
    write.mockRestore();
    process.stdout.removeAllListeners('error');
  });

  it('writes the payload, then exits with the given code', () => {
    flushAndExit(0, '{}');

    expect(write).toHaveBeenCalledWith('{}', expect.any(Function));
    expect(exit).toHaveBeenCalledWith(0);
  });

  /** Hook processes talk to Claude Code over stdout. When the parent
   * disconnects the pipe breaks and the write callback never fires, so the
   * error listener is what keeps the process from hanging forever. */
  it('exits once, however many paths fire', () => {
    flushAndExit(1);
    process.stdout.emit('error', new Error('EPIPE'));

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
