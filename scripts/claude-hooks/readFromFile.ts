import { existsSync, readFileSync } from 'node:fs';

/**
 * Reads and parses a JSON hook-input payload from `filePath`, or `null` when
 * the file is missing, empty, or fails to parse.
 *
 * Null rather than a throw because every caller has another input source to
 * fall back to, and a hook that throws on a missing spool file wedges the Bash
 * call it was asked about.
 */
export function readFromFile<T>(filePath: string) {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const input = readFileSync(filePath, 'utf-8');
    if (!input) {
      return null;
    }
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
