# enforce-typescript-code-blocks

This rule ensures that TypeScript code snippets in Markdown files use the correct syntax highlighting by enforcing the `typescript` language specifier in triple backtick (```) code blocks. If a code block is missing a language specifier, it defaults to enforcing `typescript`.

This improves readability, enhances syntax highlighting, and ensures consistency across documentation.

## Rule Details

This rule applies only to Markdown files (`.md`). If a triple backtick block lacks a language specifier, it is assumed to contain TypeScript code and should be auto-corrected.

Other languages (e.g., `javascript`, `json`, `bash`) remain unaffected.

### ❌ Incorrect

```markdown
# Some Title

```
const example = 'TypeScript code without a language specifier';
```
```

### ✅ Correct

```markdown
# Some Title

```typescript
const example = 'TypeScript code with proper highlighting';
```

```javascript
const jsExample = 'This should remain unchanged';
```

```json
{
  "key": "value"
}
```
```

## Options

This rule has no options.

## When Not To Use It

If you don't care about syntax highlighting in your Markdown files or if you prefer to use a different language specifier for TypeScript code blocks.

## Edge Cases

1. **Code Blocks That Already Have a Language Specifier**: The rule will not modify code blocks that already specify a language (e.g., `javascript`, `json`).

2. **Empty Code Blocks**: Empty code blocks without a language specifier will be updated to include the `typescript` language specifier.

3. **Inline Code (Single Backticks)**: Inline code snippets using single backticks (`example`) will not be modified.

4. **Multi-Line Code Blocks with Indentation**: The rule only applies to fenced code blocks (triple backticks), not indented ones.
