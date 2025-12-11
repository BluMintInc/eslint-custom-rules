import { Rule } from 'eslint';
import { enforceTypescriptMarkdownCodeBlocks } from '../rules/enforce-typescript-markdown-code-blocks';
import { ruleTesterMarkdown } from '../utils/ruleTester';

const rule = enforceTypescriptMarkdownCodeBlocks as unknown as Rule.RuleModule;

ruleTesterMarkdown.run('enforce-typescript-markdown-code-blocks', rule, {
  valid: [
    {
      filename: 'docs/example.md',
      code: [
        '# Some Title',
        '',
        '```typescript',
        'const example = 1;',
        '```',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: [
        '```javascript',
        'const jsExample = 1;',
        '```',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: [
        '```bash',
        'echo "no change"',
        '```',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: 'Some inline `code` snippet should not change.',
    },
    {
      filename: 'docs/example.md',
      code: [
        '````',
        'This is not a triple backtick fence.',
        '````',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: [
        '```typescript   ',
        'const spaced = true;',
        '```',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: [
        '```ts',
        'const shorthand = true;',
        '```',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: [
        '    const example = "indented code block";',
        '    still part of code block',
      ].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: ['```', '```'].join('\n'),
    },
    {
      filename: 'docs/example.md',
      code: ['Text with inline ```code``` block on one line.'].join('\n'),
    },
  ],
  invalid: [
    {
      filename: 'docs/example.md',
      code: [
        '# Title',
        '',
        '```',
        'const example = "missing language";',
        '```',
      ].join('\n'),
      output: [
        '# Title',
        '',
        '```typescript',
        'const example = "missing language";',
        '```',
      ].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 3 }],
    },
    {
      filename: 'docs/example.md',
      code: ['```   ', 'const spaced = true;', '```'].join('\n'),
      output: ['```typescript', 'const spaced = true;', '```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['  ```', '  const indented = true;', '  ```'].join('\n'),
      output: ['  ```typescript', '  const indented = true;', '  ```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['\t```', '\tconst tabbed = true;', '\t```'].join('\n'),
      output: ['\t```typescript', '\tconst tabbed = true;', '\t```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['```', '', 'const content = true;', '```'].join('\n'),
      output: ['```typescript', '', 'const content = true;', '```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['```', 'const first = 1;', '```', '', '```', 'const second = 2;', '```'].join('\n'),
      output: [
        '```typescript',
        'const first = 1;',
        '```',
        '',
        '```typescript',
        'const second = 2;',
        '```',
      ].join('\n'),
      errors: [
        { messageId: 'missingLanguageSpecifier', line: 1 },
        { messageId: 'missingLanguageSpecifier', line: 5 },
      ],
    },
    {
      filename: 'docs/example.md',
      code: ['```', 'const example = 1;', '```', '', '```javascript', 'const jsExample = 2;', '```'].join('\n'),
      output: [
        '```typescript',
        'const example = 1;',
        '```',
        '',
        '```javascript',
        'const jsExample = 2;',
        '```',
      ].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['```', 'const example = true;', '```', 'Text', '```', 'const another = false;', '```'].join('\n'),
      output: [
        '```typescript',
        'const example = true;',
        '```',
        'Text',
        '```typescript',
        'const another = false;',
        '```',
      ].join('\n'),
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
      code: ['```', 'const hasBackticks = "```";', '```'].join('\n'),
      output: ['```typescript', 'const hasBackticks = "```";', '```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
    {
      filename: 'docs/example.md',
      code: ['```', 'function block() {', '  return `template`;', '}', '```'].join('\n'),
      output: ['```typescript', 'function block() {', '  return `template`;', '}', '```'].join('\n'),
      errors: [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    },
  ],
});
