import { enforceTypescriptCodeBlocks } from '../rules/enforce-typescript-code-blocks';

// Since we can't easily test Markdown with backticks using the standard ESLint rule tester,
// we'll test the core functionality directly
describe('enforce-typescript-code-blocks', () => {
  // Mock context for testing
  const createMockContext = (filename: string, text: string) => {
    const reports: any[] = [];
    const fixes: any[] = [];

    return {
      getFilename: () => filename,
      getSourceCode: () => ({
        getText: () => text,
        getLocFromIndex: (index: number) => ({ line: 1, column: index }),
      }),
      report: (report: any) => {
        reports.push(report);
        if (report.fix) {
          fixes.push(report.fix);
        }
      },
      reports,
      fixes,
    };
  };

  // Mock node for Program
  const mockNode = { type: 'Program', body: [] };

  test('should not report for non-markdown files', () => {
    const mockContext = createMockContext(
      'example.js',
      '```\nconst example = "TypeScript code without a language specifier";\n```'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(0);
  });

  test('should not report for code blocks with language specifiers', () => {
    const mockContext = createMockContext(
      'example.md',
      '# Title\n\n```typescript\nconst example = "TypeScript code with proper highlighting";\n```'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(0);
  });

  test('should report for code blocks without language specifiers', () => {
    const mockContext = createMockContext(
      'example.md',
      '# Title\n\n```\nconst example = "TypeScript code without a language specifier";\n```'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(1);
    expect(mockContext.reports[0].messageId).toBe('missingLanguageSpecifier');
    expect(mockContext.fixes.length).toBe(1);
  });

  test('should report multiple code blocks without language specifiers', () => {
    const mockContext = createMockContext(
      'example.md',
      '# Title\n\n```\nconst example1 = "First block";\n```\n\n```typescript\nconst example2 = "Second block";\n```\n\n```\nconst example3 = "Third block";\n```'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(2);
    expect(mockContext.fixes.length).toBe(2);
  });

  test('should not report for other language specifiers', () => {
    const mockContext = createMockContext(
      'example.md',
      '# Title\n\n```javascript\nconst example = "JavaScript code with proper highlighting";\n```'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(0);
  });

  test('should not report for inline code', () => {
    const mockContext = createMockContext(
      'example.md',
      '# Title\n\nThis is `inline code` that should be ignored.'
    );

    const rule = enforceTypescriptCodeBlocks.create(mockContext as any);
    if (rule.Program) {
      rule.Program(mockNode as any);
    }

    expect(mockContext.reports.length).toBe(0);
  });
});
