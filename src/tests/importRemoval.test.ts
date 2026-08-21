import { SourceCode } from 'eslint';
import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as parser from '@typescript-eslint/parser';
import {
  importBindingReferences,
  importBindingSpecifierOf,
  ImportRemovalSource,
  planImportBindingRemoval,
  planOrphanedImportRemoval,
  removeImportBindingFixes,
  TextRange,
} from '../utils/importRemoval';

/**
 * A `SourceCode` built straight from the parser, so the helper can be exercised
 * without a rule to host it. This is the same object a rule receives from
 * `context.getSourceCode()`.
 */
function sourceOf(code: string, jsx = false): ImportRemovalSource {
  const { ast, scopeManager, visitorKeys, services } = parser.parseForESLint(
    code,
    {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
      tokens: true,
      comment: true,
      ecmaFeatures: { jsx },
      filePath: jsx ? 'file.tsx' : 'file.ts',
    },
  );

  return new SourceCode({
    text: code,
    ast: ast as never,
    parserServices: services as never,
    scopeManager: scopeManager as never,
    visitorKeys: visitorKeys as never,
  }) as unknown as ImportRemovalSource;
}

/** Applies removal ranges the way a fixer would, back to front. */
function applyRemovals(code: string, ranges: readonly TextRange[]): string {
  return [...ranges]
    .sort((left, right) => right[0] - left[0])
    .reduce(
      (text, [start, end]) => text.slice(0, start) + text.slice(end),
      code,
    );
}

function specifiersOf(
  source: ImportRemovalSource,
  ...names: string[]
): TSESTree.ImportClause[] {
  const specifiers = source.ast.body.flatMap((statement) =>
    statement.type === AST_NODE_TYPES.ImportDeclaration
      ? statement.specifiers
      : [],
  );
  return names.map((name) => {
    const specifier = specifiers.find((candidate) => {
      return candidate.local.name === name;
    });
    if (!specifier) throw new Error(`no specifier binds "${name}"`);
    return specifier;
  });
}

/** The end-to-end shape a rule uses: strip a range, unbind what it orphaned. */
function stripAndUnbind(code: string, target: string): string | null {
  const start = code.indexOf(target);
  if (start === -1) throw new Error(`"${target}" not in fixture`);
  const removed: TextRange[] = [[start, start + target.length]];

  const source = sourceOf(code);
  const extra = planOrphanedImportRemoval(source, removed);
  return extra === null ? null : applyRemovals(code, [...removed, ...extra]);
}

describe('planImportBindingRemoval', () => {
  it('collapses a declaration that loses its only specifier', () => {
    const code = "import { A } from './a';\nconst value = 1;\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(ranges).not.toBeNull();
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      'const value = 1;\n',
    );
  });

  it('keeps siblings when one named specifier goes', () => {
    const code = "import { A, B } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import { B } from './a';\n",
    );
  });

  it('takes the comma before a trailing specifier', () => {
    const code = "import { A, B } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'B') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import { A } from './a';\n",
    );
  });

  it('removes a consecutive run of specifiers with one separator each', () => {
    const code = "import { A, B, C } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A', 'B') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import { C } from './a';\n",
    );
  });

  it('removes a run that ends the list', () => {
    const code = "import { A, B, C } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'B', 'C') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import { A } from './a';\n",
    );
  });

  it('removes non-adjacent specifiers without overlapping ranges', () => {
    const code = "import { A, B, C } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A', 'C') as never,
    ) as TextRange[];
    const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
    sorted.forEach((range, index) => {
      const previous = sorted[index - 1];
      if (previous) expect(range[0]).toBeGreaterThanOrEqual(previous[1]);
    });
    expect(applyRemovals(code, ranges)).toBe("import { B } from './a';\n");
  });

  it('preserves the layout of a multi-line specifier list', () => {
    const code = "import {\n  A,\n  B,\n} from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import {\n  B,\n} from './a';\n",
    );
  });

  it('takes the braces when the last named specifier goes', () => {
    const code = "import D, { A } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import D from './a';\n",
    );
  });

  it('removes a default specifier ahead of surviving named ones', () => {
    const code = "import D, { A } from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'D') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import { A } from './a';\n",
    );
  });

  it('removes a default specifier ahead of a surviving namespace', () => {
    const code = "import D, * as NS from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'D') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import * as NS from './a';\n",
    );
  });

  it('removes a trailing namespace specifier', () => {
    const code = "import D, * as NS from './a';\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'NS') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      "import D from './a';\n",
    );
  });

  it('collapses the declaration when every clause goes', () => {
    const code = "import D, { A } from './a';\nconst value = 1;\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'D', 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      'const value = 1;\n',
    );
  });

  it('takes a comment trailing the declaration on its own line', () => {
    const code =
      "import { A } from './a'; // only for typing\nconst value = 1;\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      'const value = 1;\n',
    );
  });

  it('leaves code that shares the declaration line', () => {
    const code = "import { A } from './a'; const value = 1;\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      ' const value = 1;\n',
    );
  });

  it('declines when a directive is bound to the declaration line', () => {
    const code =
      "// eslint-disable-next-line no-unused-vars\nimport { A } from './a';\n";
    const source = sourceOf(code);
    expect(
      planImportBindingRemoval(source, specifiersOf(source, 'A') as never),
    ).toBeNull();
  });

  it('declines when a ts directive is bound to the declaration line', () => {
    const code =
      "// @ts-expect-error untyped module\nimport { A } from './a';\n";
    const source = sourceOf(code);
    expect(
      planImportBindingRemoval(source, specifiersOf(source, 'A') as never),
    ).toBeNull();
  });

  it('keeps an unbound comment above the declaration', () => {
    const code =
      "// the a module\nimport { A } from './a';\nconst value = 1;\n";
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
    );
    expect(applyRemovals(code, ranges as TextRange[])).toBe(
      '// the a module\nconst value = 1;\n',
    );
  });

  it('declines when a comment sits inside the declaration', () => {
    const code = "import { /* keep */ A, B } from './a';\n";
    const source = sourceOf(code);
    expect(
      planImportBindingRemoval(source, specifiersOf(source, 'A') as never),
    ).toBeNull();
  });

  it('declines when the specifiers come from different declarations', () => {
    const code = "import { A } from './a';\nimport { B } from './b';\n";
    const source = sourceOf(code);
    expect(
      planImportBindingRemoval(source, specifiersOf(source, 'A', 'B') as never),
    ).toBeNull();
  });

  it('plans nothing for an empty specifier list', () => {
    const source = sourceOf("import { A } from './a';\n");
    expect(planImportBindingRemoval(source, [])).toEqual([]);
  });
});

/**
 * Prettier writes no blank line at the start or end of a file and at most one
 * between statements, so a removal that leaves more than that emits text
 * `prettier --check` rejects (issue #2078). These pin the whole boundary: what
 * the removal owns, and — the failure mode that matters more — what it does not.
 */
describe('blank lines a statement removal leaves', () => {
  const dropA = (
    code: string,
    context?: Parameters<typeof planImportBindingRemoval>[2],
  ) => {
    const source = sourceOf(code);
    const ranges = planImportBindingRemoval(
      source,
      specifiersOf(source, 'A') as never,
      context,
    );
    expect(ranges).not.toBeNull();
    return applyRemovals(code, ranges as TextRange[]);
  };

  it('takes the blank line under an import that opened the file', () => {
    expect(dropA("import { A } from './a';\n\nexport const value = 1;\n")).toBe(
      'export const value = 1;\n',
    );
  });

  it('takes every blank line under an import that opened the file', () => {
    expect(
      dropA("import { A } from './a';\n\n\n\nexport const value = 1;\n"),
    ).toBe('export const value = 1;\n');
  });

  it('keeps the blank line that separated the neighbours of a removal', () => {
    expect(
      dropA(
        "const first = 1;\nimport { A } from './a';\n\nconst second = 2;\n",
      ),
    ).toBe('const first = 1;\n\nconst second = 2;\n');
  });

  it('leaves one blank line where a removal would double them', () => {
    expect(
      dropA(
        "const first = 1;\nimport { A } from './a';\n\n\nconst second = 2;\n",
      ),
    ).toBe('const first = 1;\n\nconst second = 2;\n');
  });

  it('leaves one blank line when the removal is fenced by two', () => {
    expect(
      dropA(
        "const first = 1;\n\nimport { A } from './a';\n\nconst second = 2;\n",
      ),
    ).toBe('const first = 1;\n\nconst second = 2;\n');
  });

  it('keeps the line below an import with no blank line under it', () => {
    expect(dropA("import { A } from './a';\nconst value = 1;\n")).toBe(
      'const value = 1;\n',
    );
  });

  it('keeps a second import line intact', () => {
    expect(
      dropA(
        "import { A } from './a';\nimport { B } from './b';\n\nconst v = B;\n",
      ),
    ).toBe("import { B } from './b';\n\nconst v = B;\n");
  });

  it('keeps the blank line when only one specifier of the import goes', () => {
    expect(dropA("import { A, B } from './a';\n\nconst v = B;\n")).toBe(
      "import { B } from './a';\n\nconst v = B;\n",
    );
  });

  it('takes the trailing blank lines of a removal that ends the file', () => {
    expect(dropA("const value = 1;\nimport { A } from './a';\n\n\n")).toBe(
      'const value = 1;\n',
    );
  });

  it('keeps the separator above a comment that follows the removal', () => {
    expect(
      dropA("const value = 1;\nimport { A } from './a';\n\n// keep me\n"),
    ).toBe('const value = 1;\n\n// keep me\n');
  });

  // A fix that writes an import back over the one it deletes leaves the file
  // opening on that import, so the blank line beneath is still a separator
  // between two statements rather than a gap at the top of the file.
  it('keeps the blank line when the same fix writes text into the removal', () => {
    expect(
      dropA("import { A } from './a';\n\nexport const value = 1;\n", {
        insertions: [0],
      }),
    ).toBe('\nexport const value = 1;\n');
  });

  it('takes the blank line when the fix writes text below the removal', () => {
    expect(
      dropA("import { A } from './a';\n\nexport const value = 1;\n", {
        insertions: [26],
      }),
    ).toBe('export const value = 1;\n');
  });

  it('unbinds two imports off the top of a file as one opening', () => {
    const code =
      "import type { A } from './a';\nimport type { B } from './b';\n\nexport const v: Record<A, B> = {};\n";
    expect(stripAndUnbind(code, ': Record<A, B>')).toBe(
      'export const v = {};\n',
    );
  });

  it('keeps the separator when two unbound imports sit under a survivor', () => {
    const code =
      "import { keep } from './keep';\nimport type { A } from './a';\nimport type { B } from './b';\n\nexport const v: Record<A, B> = keep;\n";
    expect(stripAndUnbind(code, ': Record<A, B>')).toBe(
      "import { keep } from './keep';\n\nexport const v = keep;\n",
    );
  });
});

describe('removeImportBindingFixes', () => {
  it('turns the plan into fixes over the same ranges', () => {
    const code = "import { A, B } from './a';\n";
    const source = sourceOf(code);
    const fixer = {
      removeRange: (range: TSESTree.Range) => ({ range, text: '' }),
    } as unknown as TSESLint.RuleFixer;

    const fixes = removeImportBindingFixes(
      source,
      fixer,
      specifiersOf(source, 'A') as never,
    );
    expect(fixes).not.toBeNull();
    expect(
      applyRemovals(
        code,
        (fixes as TSESLint.RuleFix[]).map((fix) => fix.range),
      ),
    ).toBe("import { B } from './a';\n");
  });

  it('passes the decline through', () => {
    const code = "import { /* keep */ A, B } from './a';\n";
    const source = sourceOf(code);
    expect(
      removeImportBindingFixes(
        source,
        {} as TSESLint.RuleFixer,
        specifiersOf(source, 'A') as never,
      ),
    ).toBeNull();
  });
});

describe('importBindingSpecifierOf', () => {
  it('ignores a binding that is not an import', () => {
    const source = sourceOf('const value = 1;\n');
    const [variable] = source.scopeManager?.globalScope?.childScopes[0]
      .variables as TSESLint.Scope.Variable[];
    expect(importBindingSpecifierOf(variable)).toBeUndefined();
  });

  it('ignores an import-equals declaration', () => {
    const source = sourceOf(
      "import A = require('./a');\nexport const b = A;\n",
    );
    const variable = (
      source.scopeManager?.globalScope?.childScopes[0]
        .variables as TSESLint.Scope.Variable[]
    ).find((candidate) => candidate.name === 'A');
    expect(importBindingSpecifierOf(variable as TSESLint.Scope.Variable)).toBe(
      undefined,
    );
  });
});

describe('importBindingReferences', () => {
  const namesAndCounts = (code: string) =>
    importBindingReferences(sourceOf(code)).map((use) => [
      use.specifier.local.name,
      use.references.length,
    ]);

  it('pairs each binding with every position that reads it', () => {
    expect(
      namesAndCounts(
        "import type { A, B } from './a';\nconst v: A = 1;\nconst w: A = 2;\nconst x: B = 3;\n",
      ),
    ).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });

  it('reports a binding nothing reads', () => {
    expect(namesAndCounts("import type { A } from './a';\n")).toEqual([
      ['A', 0],
    ]);
  });

  it('covers default and namespace bindings', () => {
    expect(
      namesAndCounts(
        "import A, { b } from './a';\nimport * as N from './n';\nexport const v = [new A(), b, N.c];\n",
      ),
    ).toEqual([
      ['A', 1],
      ['b', 1],
      ['N', 1],
    ]);
  });

  it('ignores bindings that are not imports', () => {
    expect(
      namesAndCounts('type Local = number;\nconst v: Local = 1;\n'),
    ).toEqual([]);
  });

  it('ignores an import-equals declaration it cannot unbind', () => {
    expect(
      namesAndCounts("import A = require('./a');\nexport const b = A;\n"),
    ).toEqual([]);
  });

  it('does not count a shadowing binding as a reference', () => {
    expect(
      namesAndCounts(
        "import type { A } from './a';\nconst v: A = 1;\nexport const f = (A: string) => A;\n",
      ),
    ).toEqual([['A', 1]]);
  });

  // The ranges must line up with the deletions a caller plans, or a batch would
  // be assembled from positions nothing deletes.
  it('reports ranges that address the referencing text', () => {
    const code = "import type { A } from './a';\nconst v: A = 1;\n";
    const [use] = importBindingReferences(sourceOf(code));
    expect(
      use.references.map(([start, end]) => code.slice(start, end)),
    ).toEqual(['A']);
    expect(use.references[0][0]).toBeGreaterThan(code.indexOf('const'));
  });
});

describe('planOrphanedImportRemoval', () => {
  it('unbinds an import whose last reference is deleted', () => {
    expect(
      stripAndUnbind("import type { A } from './a';\nconst v: A = 1;\n", ': A'),
    ).toBe('const v = 1;\n');
  });

  it('keeps an import with a surviving reference', () => {
    const code =
      "import type { A } from './a';\nconst v: A = 1;\nconst w: A = 2;\n";
    expect(stripAndUnbind(code, ': A')).toBe(
      "import type { A } from './a';\nconst v = 1;\nconst w: A = 2;\n",
    );
  });

  it('keeps an import that is also exported', () => {
    const code =
      "import type { A } from './a';\nexport type { A };\nconst v: A = 1;\n";
    expect(stripAndUnbind(code, ': A')).toBe(
      "import type { A } from './a';\nexport type { A };\nconst v = 1;\n",
    );
  });

  it('unbinds several orphans across declarations', () => {
    const code =
      "import type { A } from './a';\nimport type { B } from './b';\nconst v: Record<A, B> = {};\n";
    expect(stripAndUnbind(code, ': Record<A, B>')).toBe('const v = {};\n');
  });

  it('declines when a shadowing binding shares the name', () => {
    const code =
      "import type { A } from './a';\nconst v: A = 1;\nfunction f(A: number) { return A; }\n";
    expect(stripAndUnbind(code, ': A')).toBeNull();
  });

  it('declines when an orphan cannot be unbound cleanly', () => {
    const code =
      "// @ts-expect-error untyped\nimport type { A } from './a';\nconst v: A = 1;\n";
    expect(stripAndUnbind(code, ': A')).toBeNull();
  });

  it('plans nothing when the deleted text orphans nothing', () => {
    const code =
      "import type { A } from './a';\ntype B = number;\nconst v: B = 1;\nconst w: B | A = 2;\n";
    expect(stripAndUnbind(code, ': B')).toBe(
      "import type { A } from './a';\ntype B = number;\nconst v = 1;\nconst w: B | A = 2;\n",
    );
  });

  // A type alias or a type parameter cannot be unbound by deleting a specifier,
  // so an edit that would strand one is refused rather than half-applied.
  it('declines when a local declaration would be orphaned', () => {
    expect(
      stripAndUnbind('type B = number;\nconst v: B = 1;\n', ': B'),
    ).toBeNull();
  });

  it('declines when a type parameter would be orphaned', () => {
    const code = 'export function f<T>(): T[] {\n  return [];\n}\n';
    expect(stripAndUnbind(code, ': T[]')).toBeNull();
  });

  // A binding's own initializer write is not a use of it. Counted as one, a
  // `const` could never be judged orphaned while the identical `function` — which
  // records no self-reference at all — always could, so whether a rule offered a
  // fix came down to how the helper it would strand had been SPELLED (#1868).
  // The two spellings are pinned as a pair so neither can drift alone.
  it('declines when a const-declared local would be orphaned', () => {
    const code = "const SHAPE = { id: '' };\nconst v: typeof SHAPE = x;\n";
    expect(stripAndUnbind(code, ': typeof SHAPE')).toBeNull();
  });

  it('declines alike when the same local is a function declaration', () => {
    const code =
      'function shape() {\n  return 1;\n}\nconst v: typeof shape = x;\n';
    expect(stripAndUnbind(code, ': typeof shape')).toBeNull();
  });

  // The other half of the pin: discounting the self-write must not turn every
  // `const` into an orphan. A second reader outside the edit keeps the binding
  // alive exactly as it always did.
  it('keeps a const-declared local a surviving reference still reads', () => {
    const code = "const SHAPE = { id: '' };\nconst v: typeof SHAPE = SHAPE;\n";
    expect(stripAndUnbind(code, ': typeof SHAPE')).toBe(
      "const SHAPE = { id: '' };\nconst v = SHAPE;\n",
    );
  });

  // An import records reads only — never an initializer write — so discounting
  // self-writes cannot cost an import a reference. Were it to, the import would
  // be unbound while still read, which is the failure this whole helper exists to
  // avoid; this asserts the filter leaves the import channel untouched.
  it('still counts every reference an import binding has', () => {
    const code =
      "import type { A } from './a';\nconst v: A = 1;\nconst w: A = 2;\n";
    const source = sourceOf(code);
    const start = code.indexOf(': A');
    expect(
      planOrphanedImportRemoval(source, [[start, start + ': A'.length]]),
    ).toEqual([]);
  });

  // Only the DECLARATION's write is discounted. A later assignment is a separate
  // statement this edit does not delete, so it still counts and the binding is
  // not orphaned — the narrowest reading of "a binding whose only use is its own
  // initialization", deliberately not widened to every write.
  it('counts a later assignment to a local as a surviving reference', () => {
    const code =
      'let handler = () => 1;\nhandler = other;\nconst v: typeof handler = x;\n';
    expect(stripAndUnbind(code, ': typeof handler')).toBe(
      'let handler = () => 1;\nhandler = other;\nconst v = x;\n',
    );
  });

  it('keeps an exported declaration out of the orphan set', () => {
    expect(
      stripAndUnbind('export type B = number;\nconst v: B = 1;\n', ': B'),
    ).toBe('export type B = number;\nconst v = 1;\n');
  });

  it('ignores a global, which this file never declared', () => {
    expect(
      stripAndUnbind('const v: typeof window = window;\n', ': typeof window'),
    ).toBe('const v = window;\n');
  });

  it('counts a JSX reference as a survivor', () => {
    const code = "import { A } from './a';\nconst v: A = <A />;\n";
    const source = sourceOf(code, true);
    const start = code.indexOf(': A');
    expect(
      planOrphanedImportRemoval(source, [[start, start + ': A'.length]]),
    ).toEqual([]);
  });

  // The removal is judged against one edit and the file as it stands. A caller
  // cannot ask "what if my sibling edit also lands", because a sibling report
  // may be `eslint-disable`d — invisible to a rule — and never land at all.
  it('keeps a binding a second reference still uses, whatever else may be edited', () => {
    const code =
      "import type { A } from './a';\nconst v: A = 1;\nconst w: A = 2;\n";
    const source = sourceOf(code);
    const first = code.indexOf(': A');
    const second = code.indexOf(': A', first + 1);

    expect(planOrphanedImportRemoval(source, [[first, first + 3]])).toEqual([]);
    expect(planOrphanedImportRemoval(source, [[second, second + 3]])).toEqual(
      [],
    );
  });

  it('unbinds once a single edit covers every reference', () => {
    const code = "import type { A } from './a';\nconst pair: [A, A] = x;\n";
    const source = sourceOf(code);
    const start = code.indexOf(': [A, A]');
    const removed: TextRange = [start, start + ': [A, A]'.length];

    const ranges = planOrphanedImportRemoval(source, [removed]) as TextRange[];
    expect(ranges).toHaveLength(1);
    expect(applyRemovals(code, [removed, ...ranges])).toBe('const pair = x;\n');
  });
});
