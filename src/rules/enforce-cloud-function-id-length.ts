import { createRule } from '../utils/createRule';
import * as path from 'path';

type Options = [{ maxLength?: number }?];
type MessageIds = 'tooLong';

const DEFAULT_MAX_LENGTH = 62;
const F_TS_EXTENSION = '.f.ts';

// Normalize any backslashes to forward slashes so the marker check works
// identically on Windows and POSIX. Firebase derives function IDs the same
// way regardless of OS, so the normalized form is canonical.
// We replace both the OS separator AND the literal backslash so that tests
// running on POSIX hosts can also exercise Windows-style paths.
function normalizeSeparators(filepath: string): string {
  // Replace OS-specific sep first, then any remaining backslashes.
  return filepath.split(path.sep).join('/').split('\\').join('/');
}

// Build a normalized marker that always uses forward slashes after
// normalizeSeparators is applied.
const FUNCTIONS_SRC_MARKER = '/functions/src/';

function deriveFunctionId(filename: string): string | null {
  const normalized = normalizeSeparators(filename);
  const idx = normalized.lastIndexOf(FUNCTIONS_SRC_MARKER);
  if (idx === -1) return null;
  const relative = normalized.slice(idx + FUNCTIONS_SRC_MARKER.length);
  if (!relative.endsWith(F_TS_EXTENSION)) return null;
  const withoutExtension = relative.slice(0, -F_TS_EXTENSION.length);
  // Firebase replaces path separators with hyphens and lowercases the result.
  // After normalizeSeparators, separators are already forward slashes.
  return withoutExtension.split('/').join('-').toLowerCase();
}

export const enforceCloudFunctionIdLength = createRule<Options, MessageIds>({
  name: 'enforce-cloud-function-id-length',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensures .f.ts file paths generate Firebase Cloud Function IDs within the 62-character limit',
      recommended: 'error',
    },
    messages: {
      tooLong:
        'Firebase Cloud Function ID "{{id}}" is {{length}} characters; the limit is {{max}}. Shorten the filename or flatten the containing path.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxLength: {
            type: 'number',
            default: DEFAULT_MAX_LENGTH,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
    return {
      Program(node) {
        const filename = context.getFilename();
        const id = deriveFunctionId(filename);
        if (id === null) return;
        if (id.length <= maxLength) return;
        context.report({
          node,
          messageId: 'tooLong',
          data: {
            id,
            length: String(id.length),
            max: String(maxLength),
          },
        });
      },
    };
  },
});
