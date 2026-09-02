import { parseForESLint } from '@typescript-eslint/parser';
import { SourceCode } from 'eslint';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  importAnchorIndent,
  importAnchorLineStartIfOwned,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

const IMPORT_TEXT = "import stringify from 'safe-stable-stringify';\n";

function sourceCodeOf(text: string): TSESLint.SourceCode {
  const { ast, scopeManager, services, visitorKeys } = parseForESLint(text, {
    comment: true,
    tokens: true,
    range: true,
    loc: true,
  });
  return new SourceCode({
    text,
    ast: ast as never,
    scopeManager: scopeManager as never,
    parserServices: services as never,
    visitorKeys: visitorKeys as never,
  }) as unknown as TSESLint.SourceCode;
}

/**
 * A fixer double producing the same `{range, text}` shape ESLint applies, so
 * assertions run on the actual post-fix source rather than on anchor
 * internals.
 */
const fixer = {
  insertTextBefore(node: TSESTree.Node, text: string) {
    return { range: [node.range[0], node.range[0]], text };
  },
  insertTextBeforeRange(range: [number, number], text: string) {
    return { range: [range[0], range[0]], text };
  },
} as unknown as TSESLint.RuleFixer;

function applyInsert(text: string, importText: string = IMPORT_TEXT): string {
  const sourceCode = sourceCodeOf(text);
  const anchor = importInsertionAnchor(sourceCode);
  const fix = insertAtImportAnchor(sourceCode, fixer, anchor, importText);
  return text.slice(0, fix.range[0]) + fix.text + text.slice(fix.range[1]);
}

function firstStatement(text: string): TSESTree.ProgramStatement {
  return sourceCodeOf(text).ast.body[0];
}

describe('directive prologue', () => {
  it("keeps 'use client' the first statement", () => {
    const output = applyInsert(
      `'use client';\n\nexport const log = (o: object) => JSON.stringify(o);\n`,
    );
    const first = firstStatement(output);
    expect(
      first.type === AST_NODE_TYPES.ExpressionStatement && first.directive,
    ).toBe('use client');
    expect(output.indexOf("'use client'")).toBeLessThan(
      output.indexOf('import stringify'),
    );
  });

  it('keeps a multi-directive prologue intact', () => {
    const output = applyInsert(
      `'use strict';\n'use client';\n\nexport const a = 1;\n`,
    );
    const body = sourceCodeOf(output).ast.body;
    expect(
      body[0].type === AST_NODE_TYPES.ExpressionStatement && body[0].directive,
    ).toBe('use strict');
    expect(
      body[1].type === AST_NODE_TYPES.ExpressionStatement && body[1].directive,
    ).toBe('use client');
    expect(body[2].type).toBe(AST_NODE_TYPES.ImportDeclaration);
  });

  it('anchors after the directive in a directive-only file', () => {
    const output = applyInsert(`'use client';\n`);
    expect(output).toBe(
      `'use client';\nimport stringify from 'safe-stable-stringify';\n`,
    );
  });

  it('starts a new line after an unterminated directive line', () => {
    const output = applyInsert(`'use client';`);
    expect(output).toBe(
      `'use client';\nimport stringify from 'safe-stable-stringify';\n`,
    );
  });
});

describe('shebang', () => {
  it('keeps the shebang at character zero and parseable output', () => {
    const output = applyInsert(
      `#!/usr/bin/env node\nconst run = () => JSON.stringify({});\nrun();\n`,
    );
    expect(output.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(() => sourceCodeOf(output)).not.toThrow();
    expect(output.indexOf('#!')).toBe(0);
  });

  it('anchors below a shebang in a shebang-only file', () => {
    const output = applyInsert(`#!/usr/bin/env node\n`);
    expect(output).toBe(
      `#!/usr/bin/env node\nimport stringify from 'safe-stable-stringify';\n`,
    );
  });

  it('breaks the line for a shebang with no trailing newline', () => {
    const output = applyInsert(`#!/usr/bin/env node`);
    expect(output).toBe(
      `#!/usr/bin/env node\nimport stringify from 'safe-stable-stringify';\n`,
    );
  });

  it('handles a shebang followed by a directive prologue', () => {
    const output = applyInsert(
      `#!/usr/bin/env node\n'use strict';\nconst x = 1;\n`,
    );
    expect(output.indexOf('#!')).toBe(0);
    expect(output.indexOf("'use strict'")).toBeLessThan(
      output.indexOf('import stringify'),
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('const x'),
    );
  });
});

describe('leading comment headers', () => {
  it('keeps // @ts-nocheck above the inserted import', () => {
    const output = applyInsert(`// @ts-nocheck\nconst x: number = 'nope';\n`);
    expect(output.indexOf('@ts-nocheck')).toBeLessThan(
      output.indexOf('import stringify'),
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('const x'),
    );
  });

  it('keeps a block pragma header above the import', () => {
    const output = applyInsert(
      `/**\n * @jest-environment jsdom\n */\nconst x = 1;\n`,
    );
    expect(output.indexOf('@jest-environment')).toBeLessThan(
      output.indexOf('import stringify'),
    );
  });
});

describe('line-binding suppression comments', () => {
  it('anchors above an eslint-disable-next-line bound to the first statement', () => {
    const output = applyInsert(
      `// eslint-disable-next-line no-console\nconsole.log(1);\n`,
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('eslint-disable-next-line'),
    );
  });

  it('anchors above an @ts-expect-error bound to the first statement', () => {
    const output = applyInsert(
      `// @ts-expect-error legacy\nconst x: number = 'x';\n`,
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('@ts-expect-error'),
    );
  });

  it('climbs a run of consecutive suppression comments', () => {
    const output = applyInsert(
      `// eslint-disable-next-line no-console\n// @ts-expect-error legacy\nconsole.log(x);\n`,
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('eslint-disable-next-line'),
    );
  });

  it('does not climb a suppression separated by a blank line', () => {
    const source = `// eslint-disable-next-line no-console\n\nconst x = 1;\n`;
    const output = applyInsert(source);
    expect(output.indexOf('eslint-disable-next-line')).toBeLessThan(
      output.indexOf('import stringify'),
    );
  });

  it('does not climb an ordinary documentation comment', () => {
    const output = applyInsert(`/** doc for x */\nconst x = 1;\n`);
    expect(output.indexOf('doc for x')).toBeLessThan(
      output.indexOf('import stringify'),
    );
  });

  it('keeps a directive prologue above a climbed suppression run', () => {
    const output = applyInsert(
      `'use client';\n// eslint-disable-next-line no-console\nconsole.log(1);\n`,
    );
    expect(output.indexOf("'use client'")).toBeLessThan(
      output.indexOf('import stringify'),
    );
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('eslint-disable-next-line'),
    );
  });
});

describe('existing imports', () => {
  it('anchors before the first import, preserving the directive', () => {
    const output = applyInsert(
      `'use client';\n\nimport { x } from './x';\n\nexport const log = (o: object) => JSON.stringify(o) + x;\n`,
    );
    const body = sourceCodeOf(output).ast.body;
    expect(
      body[0].type === AST_NODE_TYPES.ExpressionStatement && body[0].directive,
    ).toBe('use client');
    expect(output.indexOf('import stringify')).toBeLessThan(
      output.indexOf('import { x }'),
    );
  });

  it('anchors before an import that precedes other statements', () => {
    const output = applyInsert(`import { x } from './x';\nconst y = x;\n`);
    expect(output.startsWith('import stringify')).toBe(true);
  });
});

describe('degenerate files', () => {
  it('inserts at the top of an empty file', () => {
    expect(applyInsert('')).toBe(IMPORT_TEXT);
  });

  it('inserts at the top of a comment-only file', () => {
    const output = applyInsert(`// just a note\n`);
    expect(output).toBe(`${IMPORT_TEXT}// just a note\n`);
  });
});

describe('importAnchorLineStartIfOwned and importAnchorIndent', () => {
  it('widens a before-anchor that owns its line', () => {
    const text = `'use client';\n  const x = 1;\n`;
    const sourceCode = sourceCodeOf(text);
    const anchor = importAnchorLineStartIfOwned(
      sourceCode,
      importInsertionAnchor(sourceCode),
    );
    expect(anchor).toEqual({ kind: 'index', index: text.indexOf('  const') });
    expect(
      importAnchorIndent(sourceCode, importInsertionAnchor(sourceCode)),
    ).toBe('  ');
  });

  it('passes a raw-offset anchor through unchanged', () => {
    const sourceCode = sourceCodeOf(`'use client';\n`);
    const anchor = importInsertionAnchor(sourceCode);
    expect(importAnchorLineStartIfOwned(sourceCode, anchor)).toEqual(anchor);
    expect(importAnchorIndent(sourceCode, anchor)).toBe('');
  });

  // Issue #1960: widening past a non-whitespace prefix is what demoted a
  // `'use client'` sharing the anchor's line in #1957-#1959. The anchor is
  // returned untouched instead, so the insertion lands after the prologue.
  it('declines to widen an anchor sharing its line with a directive', () => {
    const sourceCode = sourceCodeOf(`'use client'; const x = 1;\n`);
    const anchor = importInsertionAnchor(sourceCode);
    expect(anchor.kind).toBe('before');
    expect(importAnchorLineStartIfOwned(sourceCode, anchor)).toBe(anchor);
  });

  it('declines to widen an anchor sharing its line with an import', () => {
    const sourceCode = sourceCodeOf(
      `'use client'; import { a } from 'lib';\nconst x = a;\n`,
    );
    const anchor = importInsertionAnchor(sourceCode);
    expect(anchor.kind).toBe('before');
    expect(importAnchorLineStartIfOwned(sourceCode, anchor)).toBe(anchor);
  });

  it('widens a tab-indented anchor that owns its line', () => {
    const text = `'use client';\n\tconst x = 1;\n`;
    const sourceCode = sourceCodeOf(text);
    expect(
      importAnchorLineStartIfOwned(
        sourceCode,
        importInsertionAnchor(sourceCode),
      ),
    ).toEqual({ kind: 'index', index: text.indexOf('\tconst') });
  });

  it('widens an anchor that opens the file', () => {
    const sourceCode = sourceCodeOf(`const x = 1;\n`);
    expect(
      importAnchorLineStartIfOwned(
        sourceCode,
        importInsertionAnchor(sourceCode),
      ),
    ).toEqual({ kind: 'index', index: 0 });
  });
});
