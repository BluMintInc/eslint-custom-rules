/**
 * Whether fd 0 is a terminal.
 *
 * `isTTY` is `undefined` — never `false` — whenever stdin is a pipe, a file or
 * `/dev/null`, which is every CI job and every agent-spawned command. Reading
 * fd 0 when it IS a terminal blocks on a human who was never asked anything, so
 * `readInput` returns before that read rather than hanging the Bash call the
 * hook was consulted about.
 */
export function isStdinInteractive() {
  return process.stdin.isTTY === true;
}
