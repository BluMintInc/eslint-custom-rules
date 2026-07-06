import path from 'path';

import { createRule } from '../utils/createRule';

type MessageIds = 'avoidUtils';

export const avoidUtilsDirectory = createRule<[], MessageIds>({
  name: 'avoid-utils-directory',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using util/ instead of utils/ directory',
      recommended: 'error',
    },
    schema: [],
    messages: {
      avoidUtils:
        'Path "{{path}}" lives under a "utils/" directory. Generic "utils" folders become grab bags where unrelated helpers accumulate, which makes imports unpredictable and hides ownership. Move this file into a focused "util/" folder (e.g., "util/date" or "util/string") so callers know where to find it and understand its responsibility.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        // Normalize Windows backslash separators so the forward-slash `utils/`
        // regex below matches on every platform. Without this, `getFilename()`
        // returns `C:\repo\src\utils\foo.ts` on Windows, the regex never
        // matches, and the rule silently reports nothing (issue #1270).
        const filename = context.getFilename().replace(/\\/g, '/');
        const relativePath = path.isAbsolute(filename)
          ? path.relative(process.cwd(), filename) || filename
          : filename;

        // Skip files in node_modules
        if (filename.includes('node_modules')) {
          return;
        }

        // Match /utils/ directory (case insensitive) but not as part of another word
        const utilsPattern = /(?:^|\/)utils\/(?!.*\/)/i;

        if (utilsPattern.test(filename)) {
          context.report({
            node,
            messageId: 'avoidUtils',
            data: {
              path: relativePath,
            },
          });
        }
      },
    };
  },
});
