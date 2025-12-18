import { Rule } from 'eslint';
import { enforceTypescriptMarkdownCodeBlocks } from '../rules/enforce-typescript-markdown-code-blocks';
import { ruleTesterMarkdown } from '../utils/ruleTester';

const rule = enforceTypescriptMarkdownCodeBlocks as unknown as Rule.RuleModule;
const joinLines = (...lines: string[]) => lines.join('\n');

ruleTesterMarkdown.run('enforce-typescript-markdown-code-blocks', rule, {
  valid: [
    {
      filename: 'docs/example.md',
      code: joinLines(
        '# Some Title',
        '',
        '```typescript',
        'const example = 1;',
        '```',
      ),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```javascript', 'const jsExample = 1;', '```'),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```bash', 'echo "no change"', '```'),
    },
    {
      filename: 'docs/example.md',
      code: 'Some inline `code` snippet should not change.',
    },
    {
      filename: 'docs/example.md',
      code: joinLines('````', 'This is not a triple backtick fence.', '````'),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```typescript   ', 'const spaced = true;', '```'),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```ts', 'const shorthand = true;', '```'),
    },
    {
      filename: 'docs/example.md',
      code: joinLines(
        '    const example = "indented code block";',
        '    still part of code block',
      ),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```', '```'),
    },
    {
      filename: 'docs/example.md',
      code: joinLines('Text with inline ```code``` block on one line.'),
    },
  ],
  invalid: [
    {
      filename: 'docs/example.md',
      code: joinLines(
        '# Title',
        '',
        '```',
        'const example = "missing language";',
        '```',
      ),
      output: joinLines(
        '# Title',
        '',
        '```typescript',
        'const example = "missing language";',
        '```',
      ),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 3 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```   ', 'const spaced = true;', '```'),
      output: joinLines('```typescript', 'const spaced = true;', '```'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines('  ```', '  const indented = true;', '  ```'),
      output: joinLines('  ```typescript', '  const indented = true;', '  ```'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines('\t```', '\tconst tabbed = true;', '\t```'),
      output: joinLines('\t```typescript', '\tconst tabbed = true;', '\t```'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```', '', 'const content = true;', '```'),
      output: joinLines('```typescript', '', 'const content = true;', '```'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines(
        '```',
        'const first = 1;',
        '```',
        '',
        '```',
        'const second = 2;',
        '```',
      ),
      output: joinLines(
        '```typescript',
        'const first = 1;',
        '```',
        '',
        '```typescript',
        'const second = 2;',
        '```',
      ),
      errors: [
        { messageId: 'missingLanguageSpecifier', line: 1 },
        { messageId: 'missingLanguageSpecifier', line: 5 },
      ],
    },
    {
      filename: 'docs/example.md',
      code: joinLines(
        '```',
        'const example = 1;',
        '```',
        '',
        '```javascript',
        'const jsExample = 2;',
        '```',
      ),
      output: joinLines(
        '```typescript',
        'const example = 1;',
        '```',
        '',
        '```javascript',
        'const jsExample = 2;',
        '```',
      ),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines(
        '```',
        'const example = true;',
        '```',
        'Text',
        '```',
        'const another = false;',
        '```',
      ),
      output: joinLines(
        '```typescript',
        'const example = true;',
        '```',
        'Text',
        '```typescript',
        'const another = false;',
        '```',
      ),
      errors: [
        { messageId: 'missingLanguageSpecifier', line: 1 },
        { messageId: 'missingLanguageSpecifier', line: 5 },
      ],
    },
    {
      filename: 'docs/example.md',
      code: '```\r\nconst windows = true;\r\n```',
      output: '```typescript\r\nconst windows = true;\r\n```',
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines('```', 'const hasBackticks = "```";', '```'),
      output: joinLines('```typescript', 'const hasBackticks = "```";', '```'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: joinLines(
        '```',
        'function block() {',
        '  return `template`;',
        '}',
        '```',
      ),
      output: joinLines(
        '```typescript',
        'function block() {',
        '  return `template`;',
        '}',
        '```',
      ),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
  ],
});
