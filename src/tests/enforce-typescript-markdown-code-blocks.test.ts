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
    createValidTestCase(
      joinLines('Doc', '', '    ```', '    const indented = true;', '    ```'),
    ),
    createValidTestCase(
      joinLines('Doc', '', '\t```', '\tconst tabbed = true;', '\t```'),
    ),
    createValidTestCase(
      joinLines(
        '````markdown',
        '```',
        'const a = 1;',
        '```',
        '````',
        '',
        '````markdown',
        '```',
        'const b = 2;',
        '```',
        '````',
      ),
    ),
    createValidTestCase(
      joinLines('    ```', '    const indentedOnly = true;', '    ```'),
    ),
    createValidTestCase(
      joinLines('     ```', '     const five = true;', '     ```'),
    ),
    createValidTestCase(
      joinLines(' \t```', ' \tconst mixedIndent = true;', ' \t```'),
    ),
    createValidTestCase(
      joinLines('````markdown', '```', 'const single = 1;', '```', '````'),
    ),
    createValidTestCase(
      joinLines('````', '```', 'const inner = 1;', '```', '````'),
    ),
    createValidTestCase(joinLines('````', 'const four = 1;', '````')),
    createValidTestCase(joinLines('````', 'const four = 1;', '`````')),
    createValidTestCase(
      joinLines('````markdown', '```', 'const unclosedOuter = 1;', '```'),
    ),
    createValidTestCase(
      joinLines(
        '  ````markdown',
        '  ```',
        '  const indentedOuter = 1;',
        '  ```',
        '  ````',
      ),
    ),
    createValidTestCase(joinLines('~~~', 'const tilde = true;', '~~~')),
    createValidTestCase(joinLines('~~~~', 'const longTilde = true;', '~~~~')),
    createValidTestCase(joinLines('```', 'const unclosed = true;')),
    createValidTestCase(
      joinLines('```', 'const closedByLongerRun = 1;', '`````'),
    ),
    createValidTestCase(
      joinLines('~~~', '```', 'const inner = 1;', '```', '~~~'),
    ),
    createValidTestCase(
      joinLines('~~~markdown', '```', 'const inner = 1;', '```', '~~~'),
    ),
    createValidTestCase(
      joinLines('~~~ `ts`', '```', 'const inner = 1;', '```', '~~~'),
    ),
    createValidTestCase(
      joinLines('~~~~', '```', 'const inner = 1;', '```', '~~~~'),
    ),
    createValidTestCase(
      joinLines('  ~~~', '  ```', '  const inner = 1;', '  ```', '  ~~~'),
    ),
    createValidTestCase(
      joinLines('~~~', '```', 'const unclosedTilde = 1;', '```'),
    ),
    createValidTestCase(
      joinLines('~~~', '```', 'const inner = 1;', '```', '~~~~~'),
    ),
    createValidTestCase(joinLines('~~~', 'const tildeOnly = 1;', '```', '~~~')),
    createValidTestCase(
      joinLines(
        '  ```',
        '  ````',
        '',
        '   ````',
        '   ```',
        '   inner',
        '   ```',
        '   `````',
      ),
    ),
    createValidTestCase(
      joinLines('```', '    ```', '    const buried = 1;', '    ```'),
    ),
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
    createInvalidTestCase(
      joinLines(' ```', ' const single = true;', ' ```'),
      joinLines(' ```typescript', ' const single = true;', ' ```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines('   ```', '   const three = true;', '   ```'),
      joinLines('   ```typescript', '   const three = true;', '   ```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines(
        '````markdown',
        '```',
        'const inner = 1;',
        '```',
        '````',
        '',
        '```',
        'const after = 1;',
        '```',
      ),
      joinLines(
        '````markdown',
        '```',
        'const inner = 1;',
        '```',
        '````',
        '',
        '```typescript',
        'const after = 1;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 7 }],
    ),
    createInvalidTestCase(
      joinLines(
        '````markdown',
        '```',
        'const a = 1;',
        '```',
        '````',
        '',
        '````markdown',
        '```',
        'const b = 2;',
        '```',
        '````',
        '',
        '```',
        'const after = 2;',
        '```',
      ),
      joinLines(
        '````markdown',
        '```',
        'const a = 1;',
        '```',
        '````',
        '',
        '````markdown',
        '```',
        'const b = 2;',
        '```',
        '````',
        '',
        '```typescript',
        'const after = 2;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 13 }],
    ),
    createInvalidTestCase(
      joinLines(
        'Doc',
        '',
        '    ```',
        '    literal backticks',
        '    ```',
        '',
        '```',
        'const real = 1;',
        '```',
      ),
      joinLines(
        'Doc',
        '',
        '    ```',
        '    literal backticks',
        '    ```',
        '',
        '```typescript',
        'const real = 1;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 7 }],
    ),
    createInvalidTestCase(
      joinLines('```', '    ```', '    nested literal', '```'),
      joinLines('```typescript', '    ```', '    nested literal', '```'),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
    createInvalidTestCase(
      joinLines(
        '~~~',
        '```',
        'const a = 1;',
        '```',
        '~~~',
        '',
        '```',
        'const b = 2;',
        '```',
      ),
      joinLines(
        '~~~',
        '```',
        'const a = 1;',
        '```',
        '~~~',
        '',
        '```typescript',
        'const b = 2;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 7 }],
    ),
    createInvalidTestCase(
      joinLines('```', '````', '```', 'const buried = 1;', '```'),
      joinLines('```', '````', '```typescript', 'const buried = 1;', '```'),
      [{ messageId: 'missingLanguageSpecifier', line: 3 }],
    ),
    createInvalidTestCase(
      joinLines('```', 'const a = 1;', '', '```', 'const b = 2;', '```'),
      joinLines(
        '```typescript',
        'const a = 1;',
        '',
        '```',
        'const b = 2;',
        '```',
      ),
      [{ messageId: 'missingLanguageSpecifier', line: 1 }],
    ),
  ],
});
