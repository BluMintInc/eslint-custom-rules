/**
 * Flushes stdout and exits.
 *
 * Hook processes talk to Claude Code over stdout. When the parent terminates or
 * disconnects the pipe breaks, the `process.stdout.write` callback never fires,
 * and the process hangs indefinitely — holding the Bash call the hook was
 * consulted about. Three paths therefore reach the exit: the write callback,
 * a stdout `error` for the broken pipe, and a one-second timeout for the case
 * neither fires.
 */
export function flushAndExit(code = 0, data = '') {
  let hasExited = false;

  const doExit = () => {
    if (hasExited) {
      return;
    }
    hasExited = true;
    process.exit(code);
  };

  setTimeout(doExit, 1000).unref();
  process.stdout.on('error', doExit);
  process.stdout.write(data, doExit);
}
