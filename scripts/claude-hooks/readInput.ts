import { readFileSync } from 'node:fs';
import { isStdinInteractive } from './isStdinInteractive';
import { readFromFile } from './readFromFile';

/**
 * A hook's JSON payload: the `JSON_INPUT_FILE` the shims spool stdin into
 * first, then fd 0 for a checker driven by hand. `null` when neither source
 * answers, which every entry point turns into its own fail-open line.
 *
 * The parse is a CAST, not a validation — see `preToolUseInput.ts` — so the
 * declared type is a contract with Claude Code rather than a fact about the
 * bytes, and the one field a guard decides on is read through an `unknown` view
 * in `readBashCommand`.
 */
export function readInput<T>() {
  const jsonInputFile = process.env.JSON_INPUT_FILE;
  if (jsonInputFile) {
    const fileInput = readFromFile<T>(jsonInputFile);
    /** Null is the only no-input sentinel — a valid payload can be falsy. */
    if (fileInput !== null) {
      return fileInput;
    }
  }

  if (isStdinInteractive()) {
    return null;
  }

  try {
    const input = readFileSync(0, 'utf-8');
    if (!input) {
      return null;
    }
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
