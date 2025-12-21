import { Rule } from 'eslint';
import { enforceTypescriptMarkdownCodeBlocks } from '../rules/enforce-typescript-markdown-code-blocks';
import { ruleTesterMarkdown } from '../utils/ruleTester';

const rule = enforceTypescriptMarkdownCodeBlocks as unknown as Rule.RuleModule;
const joinLines = (...lines: string[]) => lines.join('\n');

const createValidTestCase = (code: string) => ({
  filename: 'docs/example.md',
  code,
});

const createInvalidTestCase = (
  code: string,
  output: string,
  errors: { messageId: string; line: number }[],
) => ({
  filename: 'docs/example.md',
  code,
  output,
  errors,
});

ruleTesterMarkdown.run('enforce-typescript-markdown-code-blocks', rule, {
  valid: [
    createValidTestCase(
      joinLines(
        '# Some Title',
        '',
        '```typescript',
        'const example = 1;',
        '```',
      ),
    ),
    createValidTestCase(
      joinLines('```javascript', 'const jsExample = 1;', '```'),
    ),
    createValidTestCase(joinLines('```bash', 'echo "no change"', '```')),
    createValidTestCase('Some inline `code` snippet should not change.'),
    createValidTestCase(
      joinLines('````', 'This is not a triple backtick fence.', '````'),
    ),
    createValidTestCase(
      joinLines('```typescript   ', 'const spaced = true;', '```'),
    ),
    createValidTestCase(joinLines('```ts', 'const shorthand = true;', '```')),
    createValidTestCase(
      joinLines(
        '    const example = "indented code block";',
        '    still part of code block',
      ),
    ),
    createValidTestCase(joinLines('```', '```')),
    createValidTestCase('Text with inline ```code``` block on one line.'),
  ],
  invalid: [
    createInvalidTestCase(
      joinLines(
        '# Title',
        '',
        '```',
        'const example = "missing language";',
        '```',
      ),
      joinLines(
        '# Title',
        '',
        '```typescript',
        'const example = "missing language";',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 3 }],
    ),
    createInvalidTestCase(
      joinLines('```   ', 'const spaced = true;', '```'),
      joinLines('```typescript', 'const spaced = true;', '```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines('  ```', '  const indented = true;', '  ```'),
      joinLines('  ```typescript', '  const indented = true;', '  ```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines('\t```', '\tconst tabbed = true;', '\t```'),
      joinLines('\t```typescript', '\tconst tabbed = true;', '\t```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines('```', '', 'const content = true;', '```'),
      joinLines('```typescript', '', 'const content = true;', '```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines(
        '```',
        'const first = 1;',
        '```',
        '',
        '```',
        'const second = 2;',
        '```',
      ),
      joinLines(
        '```typescript',
        'const first = 1;',
        '```',
        '',
        '```typescript',
        'const second = 2;',
        '```',
      ),
      [
        { messageId: 'missingLanguageSpecifier', line: 1 },
        { messageId: 'missingLanguageSpecifier', line: 5 },
      ],
    ),
    createInvalidTestCase(
      joinLines(
        '```',
        'const example = 1;',
        '```',
        '',
        '```javascript',
        'const jsExample = 2;',
        '```',
      ),
      joinLines(
        '```typescript',
        'const example = 1;',
        '```',
        '',
        '```javascript',
        'const jsExample = 2;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines(
        '```',
        'const example = true;',
        '```',
        'Text',
        '```',
        'const another = false;',
        '```',
      ),
      joinLines(
        '```typescript',
        'const example = true;',
        '```',
        'Text',
        '```typescript',
        'const another = false;',
        '```',
      ),
      [
        { messageId: 'missingLanguageSpecifier', line: 1 },
        { messageId: 'missingLanguageSpecifier', line: 5 },
      ],
    ),
    createInvalidTestCase(
      '```\r\nconst windows = true;\r\n```',
      '```typescript\r\nconst windows = true;\r\n```',
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines('```', 'const hasBackticks = "```";', '```'),
      joinLines('```typescript', 'const hasBackticks = "```";', '```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines(
        '```',
        'function block() {',
        '  return `template`;',
        '}',
        '```',
      ),
      joinLines(
        '```typescript',
        'function block() {',
        '  return `template`;',
        '}',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
  ],
});
