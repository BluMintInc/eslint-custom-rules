import { basename } from 'node:path';

/**
 * True when the named hook entry point is the file Node was invoked with,
 * rather than a module some other file imported. Every entry point in this
 * directory guards its bare bottom-of-file `runCli()` on this, which is what
 * makes the module importable without side effects — a test that imports it to
 * call `executeMain` would otherwise run the whole hook against the test
 * process's stdin.
 *
 * Callers name themselves rather than the predicate deriving it from
 * `__filename`, which would make the answer depend on the module system's view
 * of the CALLER — and that differs between the tsx runtime the hooks execute
 * under and the ts-jest transform the tests execute under.
 *
 * **Basename equality, never a suffix match.** A suffix match makes every entry
 * point claim every longer sibling that ends with its name, and the consequence
 * is not a wrong boolean but a hook body running during an IMPORT.
 */
export function isDirectExecution(fileName: string) {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && basename(entryPoint) === fileName;
}
