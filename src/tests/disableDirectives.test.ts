import { parse } from '@typescript-eslint/parser';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  createSuppressionChecker,
  createSuppressionCheckerFor,
  parseDisableDirectives,
} from '../utils/disableDirectives';

const RULE_ID = 'foo-bar';

function commentsOf(code: string): TSESTree.Comment[] {
  const ast = parse(code, { comment: true, loc: true, range: true });
  return ast.comments ?? [];
}

/**
 * A checker over `code` for `ruleId`, mirroring what a rule gets from its own
 * source file.
 */
function checkerFor(code: string, ruleId: string = RULE_ID) {
  return createSuppressionCheckerFor(commentsOf(code), ruleId);
}

/**
 * Report positions are addressed by the source text on their line, so a test
 * stays readable when lines shift.
 */
function at(code: string, needle: string, column = 0): TSESTree.Position {
  const index = code.split('\n').findIndex((line) => line.includes(needle));
  if (index === -1) {
    throw new Error(`No line containing ${JSON.stringify(needle)}`);
  }
  return { line: index + 1, column };
}

describe('eslint-disable-next-line', () => {
  const code = `const before = 1;
// eslint-disable-next-line foo-bar
const target = 2;
const after = 3;`;

  it('suppresses the following line only', () => {
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const target'))).toBe(true);
    expect(isSuppressed(at(code, 'const before'))).toBe(false);
    expect(isSuppressed(at(code, 'const after'))).toBe(false);
  });

  it('accepts a bare directive as targeting every rule', () => {
    const bare = `// eslint-disable-next-line
const target = 2;
const after = 3;`;
    const isSuppressed = checkerFor(bare);
    expect(isSuppressed(at(bare, 'const target'))).toBe(true);
    expect(isSuppressed(at(bare, 'const after'))).toBe(false);
  });

  it('matches a rule listed among several', () => {
    const listed = `// eslint-disable-next-line no-console, foo-bar
const target = 2;`;
    expect(checkerFor(listed)(at(listed, 'const target'))).toBe(true);
  });

  it('works as a block comment', () => {
    const block = `/* eslint-disable-next-line foo-bar */
const target = 2;`;
    expect(checkerFor(block)(at(block, 'const target'))).toBe(true);
  });
});

describe('eslint-disable-line', () => {
  const code = `const target = 1; // eslint-disable-line foo-bar
const after = 2;`;

  it('suppresses its own line only', () => {
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const target'))).toBe(true);
    expect(isSuppressed(at(code, 'const after'))).toBe(false);
  });

  it('accepts a bare directive', () => {
    const bare = `const target = 1; // eslint-disable-line
const after = 2;`;
    const isSuppressed = checkerFor(bare);
    expect(isSuppressed(at(bare, 'const target'))).toBe(true);
    expect(isSuppressed(at(bare, 'const after'))).toBe(false);
  });
});

describe('block eslint-disable / eslint-enable', () => {
  it('suppresses between the two directives', () => {
    const code = `const before = 0;
/* eslint-disable foo-bar */
const inside = 1;
/* eslint-enable foo-bar */
const after = 2;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const before'))).toBe(false);
    expect(isSuppressed(at(code, 'const inside'))).toBe(true);
    expect(isSuppressed(at(code, 'const after'))).toBe(false);
  });

  it('runs an unmatched disable to end of file', () => {
    const code = `/* eslint-disable foo-bar */
const first = 1;
const middle = 2;
const last = 3;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const first'))).toBe(true);
    expect(isSuppressed(at(code, 'const last'))).toBe(true);
  });

  it('treats a bare disable as covering every rule', () => {
    const code = `/* eslint-disable */
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
    expect(checkerFor(code, 'other-rule')(at(code, 'const target'))).toBe(true);
  });

  it('lets a bare enable close a named disable', () => {
    const code = `/* eslint-disable foo-bar */
const inside = 1;
/* eslint-enable */
const after = 2;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const inside'))).toBe(true);
    expect(isSuppressed(at(code, 'const after'))).toBe(false);
  });

  it('carves one rule out of a bare disable with eslint-enable <rule>', () => {
    const code = `/* eslint-disable */
const covered = 1;
/* eslint-enable foo-bar */
const carved = 2;`;
    expect(checkerFor(code)(at(code, 'const covered'))).toBe(true);
    // Only the named rule is re-enabled; every other rule stays disabled.
    expect(checkerFor(code)(at(code, 'const carved'))).toBe(false);
    expect(checkerFor(code, 'other-rule')(at(code, 'const carved'))).toBe(true);
  });

  it('ignores eslint-disable written as a line comment', () => {
    const code = `// eslint-disable foo-bar
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });

  it('ignores eslint-enable written as a line comment', () => {
    const code = `/* eslint-disable foo-bar */
// eslint-enable foo-bar
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
  });

  it('does not apply to a position left of the directive on the same line', () => {
    const code = `const target = 1; /* eslint-disable foo-bar */
const after = 2;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const target'))).toBe(false);
    expect(isSuppressed(at(code, 'const after'))).toBe(true);
  });

  it('keeps a next-line directive from re-enabling inside a block disable', () => {
    // Line-scoped directives are evaluated in their own pass, so the implicit
    // re-enable after `-next-line` cannot punch a hole in the block disable.
    const code = `/* eslint-disable foo-bar */
// eslint-disable-next-line foo-bar
const first = 1;
const second = 2;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const first'))).toBe(true);
    expect(isSuppressed(at(code, 'const second'))).toBe(true);
  });
});

describe('justifications', () => {
  it('strips a -- justification from a next-line directive', () => {
    const code = `// eslint-disable-next-line foo-bar -- results must not be cached
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
  });

  it('strips a -- justification from a block disable', () => {
    const code = `/* eslint-disable foo-bar -- legacy module */
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
  });

  it('strips a -- justification from a bare directive', () => {
    const code = `// eslint-disable-next-line -- everything here is generated
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
  });

  it('does not read a rule name out of the justification', () => {
    const code = `// eslint-disable-next-line no-console -- foo-bar is fine here
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });
});

describe('multi-line comment forms', () => {
  it('targets the line after a multi-line next-line directive ends', () => {
    const code = `const before = 0;
/* eslint-disable-next-line
   foo-bar */
const target = 1;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const target'))).toBe(true);
    expect(isSuppressed(at(code, 'const before'))).toBe(false);
  });

  it('rejects a multi-line eslint-disable-line', () => {
    const code = `const target = 1; /* eslint-disable-line
   foo-bar */
const after = 2;`;
    const isSuppressed = checkerFor(code);
    expect(isSuppressed(at(code, 'const target'))).toBe(false);
    expect(isSuppressed(at(code, 'const after'))).toBe(false);
  });

  it('honours a multi-line block disable', () => {
    const code = `/* eslint-disable
   foo-bar */
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(true);
  });
});

describe('rule name matching', () => {
  it('does not match a directive naming a different rule', () => {
    const code = `// eslint-disable-next-line no-console
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });

  it('does not match a longer rule name that starts with this one', () => {
    const code = `// eslint-disable-next-line foo-bar-baz
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });

  it('does not match a shorter rule name this one starts with', () => {
    const code = `/* eslint-disable foo-bar */
const target = 1;`;
    expect(checkerFor(code, 'foo-bar-baz')(at(code, 'const target'))).toBe(
      false,
    );
  });

  it('matches a plugin-prefixed id only when the directive spells it out', () => {
    const prefixed = '@blumintinc/blumint/foo-bar';
    const withPrefix = `// eslint-disable-next-line @blumintinc/blumint/foo-bar
const target = 1;`;
    expect(
      checkerFor(withPrefix, prefixed)(at(withPrefix, 'const target')),
    ).toBe(true);

    const withoutPrefix = `// eslint-disable-next-line foo-bar
const target = 1;`;
    expect(
      checkerFor(withoutPrefix, prefixed)(at(withoutPrefix, 'const target')),
    ).toBe(false);
  });
});

describe('non-directive comments', () => {
  it('ignores ordinary comments', () => {
    const code = `// eslint is great
/* disable foo-bar */
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });

  it('ignores a directive-like word that is not a directive', () => {
    const code = `/* eslint-disabled foo-bar */
const target = 1;`;
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });

  it('reports nothing suppressed in a file without comments', () => {
    const code = 'const target = 1;';
    expect(parseDisableDirectives(commentsOf(code))).toEqual([]);
    expect(checkerFor(code)(at(code, 'const target'))).toBe(false);
  });
});

describe('parseDisableDirectives', () => {
  it('orders directives by position regardless of comment order', () => {
    const code = `const a = 1; /* eslint-disable foo-bar */ /* eslint-enable foo-bar */
/* eslint-disable */`;
    const directives = parseDisableDirectives(commentsOf(code));
    expect(directives.map((directive) => directive.kind)).toEqual([
      'disable',
      'enable',
      'disable',
    ]);
    expect(directives[2].rules).toBeNull();
    expect(directives[0].rules).toEqual(new Set(['foo-bar']));
  });
});

describe('createSuppressionChecker', () => {
  const code = `// eslint-disable-next-line foo-bar
const target = 1;
const after = 2;`;

  /**
   * A rule context stub exposing only what the checker consumes.
   *
   * The SourceCode is reachable through `getSourceCode()` and NOT through a
   * `sourceCode` property, which is the shape every ESLint in the declared
   * `peerDependencies.eslint` range guarantees — the property arrives only in
   * 8.40. Withholding it keeps this stub a local check that the checker stays
   * on the version-safe accessor (#2251).
   */
  function contextStub(id: string, comments: TSESTree.Comment[]) {
    let getAllCommentsCalls = 0;
    const sourceCode = {
      getAllComments: () => {
        getAllCommentsCalls += 1;
        return comments;
      },
    };
    const context = {
      id,
      getSourceCode: () => sourceCode,
    } as unknown as Readonly<TSESLint.RuleContext<string, unknown[]>>;
    return { context, callCount: () => getAllCommentsCalls };
  }

  it('matches on context.id', () => {
    const matching = contextStub('foo-bar', commentsOf(code));
    expect(
      createSuppressionChecker(matching.context)(at(code, 'const target')),
    ).toBe(true);

    const other = contextStub('other-rule', commentsOf(code));
    expect(
      createSuppressionChecker(other.context)(at(code, 'const target')),
    ).toBe(false);
  });

  it('parses the file once no matter how many violations ask', () => {
    const stub = contextStub('foo-bar', commentsOf(code));
    const isSuppressed = createSuppressionChecker(stub.context);
    expect(stub.callCount()).toBe(0);
    isSuppressed(at(code, 'const target'));
    isSuppressed(at(code, 'const after'));
    isSuppressed(at(code, 'const target'));
    expect(stub.callCount()).toBe(1);
  });

  it('accepts a node as readily as a position', () => {
    const stub = contextStub('foo-bar', commentsOf(code));
    const isSuppressed = createSuppressionChecker(stub.context);
    const ast = parse(code, { comment: true, loc: true, range: true });
    const [suppressedNode, survivingNode] = ast.body;
    expect(isSuppressed(suppressedNode)).toBe(true);
    expect(isSuppressed(survivingNode)).toBe(false);
  });
});
