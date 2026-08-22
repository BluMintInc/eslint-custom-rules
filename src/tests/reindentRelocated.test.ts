import { Linter, Rule } from 'eslint';
import { TSESTree, TSESLint } from '@typescript-eslint/utils';
import { reindentRelocated } from '../utils/reindentRelocated';

/**
 * `reindentRelocated` shifts text copied out of one column and emitted at
 * another. Its arms are exercised here rather than through a single rule
 * because the rule that reads it today cannot reach all of them: the batch
 * manager descriptor always lands two columns DEEPER than the call it replaces,
 * so the shallowing arm, the mixed tab/space arm and the un-absorbable-delta
 * arm would ship measured only by inspection.
 *
 * The helper is asked through a linter rather than a bare parse, because it
 * reads tokens and comments off a real `SourceCode` — a hand-built node would
 * answer `frozenLinesOf` with nothing and certify the freezing arms vacuously.
 */
const linter = new Linter();
linter.defineParser(
  '@typescript-eslint/parser',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@typescript-eslint/parser'),
);

let collected: string[] = [];
let landingIndent = '';

// The relocated span is the sole argument of `relocate(...)`, which keeps each
// fixture's subject unambiguous while leaving it in real syntactic position.
linter.defineRule('probe/reindent', {
  create: (context) => ({
    CallExpression(node: TSESTree.CallExpression) {
      if (
        node.callee.type !== 'Identifier' ||
        node.callee.name !== 'relocate' ||
        node.arguments.length !== 1
      ) {
        return;
      }
      const sourceCode =
        context.getSourceCode() as unknown as TSESLint.SourceCode;
      collected.push(
        reindentRelocated(node.arguments[0], landingIndent, sourceCode),
      );
    },
  }),
} as unknown as Rule.RuleModule);

const relocatedTo = (toIndent: string, code: string): string => {
  collected = [];
  landingIndent = toIndent;
  const messages = linter.verify(code, {
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { 'probe/reindent': 'error' },
  } as Linter.Config);
  // A fatal parse collects nothing, which is indistinguishable from a helper
  // that returned its input untouched.
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  expect(collected).toHaveLength(1);
  return collected[0];
};

const lines = (...parts: string[]): string => parts.join('\n');

describe('reindentRelocated', () => {
  it('returns a single-line span untouched', () => {
    expect(relocatedTo('    ', 'relocate({ a: 1 });')).toBe('{ a: 1 }');
  });

  it('returns a span already at its landing column untouched', () => {
    const code = lines('relocate({', '  a: 1,', '});');
    expect(relocatedTo('', code)).toBe(lines('{', '  a: 1,', '}'));
  });

  it('shifts continuation lines right when the span lands deeper', () => {
    const code = lines('relocate({', '  a: 1,', '  b: { c: 2 },', '});');
    expect(relocatedTo('    ', code)).toBe(
      lines('{', '      a: 1,', '      b: { c: 2 },', '    }'),
    );
  });

  it('preserves relative nesting inside the shifted span', () => {
    const code = lines('relocate({', '  a: {', '    b: 1,', '  },', '});');
    expect(relocatedTo('  ', code)).toBe(
      lines('{', '    a: {', '      b: 1,', '    },', '  }'),
    );
  });

  it('shifts continuation lines left when the span lands shallower', () => {
    const code = lines('    relocate({', '      a: 1,', '    });');
    expect(relocatedTo('', code)).toBe(lines('{', '  a: 1,', '}'));
  });

  it('leaves a line that cannot absorb the outdent where it is', () => {
    // The `a: 1,` line carries less indentation than the delta being removed,
    // so shifting it would eat indentation the span does not own.
    const code = lines('    relocate({', '  a: 1,', '    });');
    expect(relocatedTo('', code)).toBe(lines('{', '  a: 1,', '}'));
  });

  it('does not pad a blank line, which would leave trailing whitespace', () => {
    const code = lines('relocate({', '  a: 1,', '', '  b: 2,', '});');
    expect(relocatedTo('    ', code)).toBe(
      lines('{', '      a: 1,', '', '      b: 2,', '    }'),
    );
  });

  it('leaves a span alone when old and new indentation share no prefix', () => {
    // A tab against spaces has no delta expressible as whitespace, and picking
    // a tab width would rewrite the file's own indentation style.
    const code = lines('\trelocate({', '\t\ta: 1,', '\t});');
    expect(relocatedTo('    ', code)).toBe(lines('{', '\t\ta: 1,', '\t}'));
  });

  describe('whitespace that is data rather than layout', () => {
    it('freezes the interior of a multi-line template literal', () => {
      const code = lines(
        'relocate({',
        '  msg: `line one',
        '      line two',
        '  line three`,',
        '});',
      );
      expect(relocatedTo('    ', code)).toBe(
        lines(
          '{',
          '      msg: `line one',
          '      line two',
          '  line three`,',
          '    }',
        ),
      );
    });

    it('freezes the interior of a line-continued string', () => {
      const code = lines(
        'relocate({',
        "  s: 'one \\",
        '      two \\',
        "  three',",
        '});',
      );
      expect(relocatedTo('    ', code)).toBe(
        lines('{', "      s: 'one \\", '      two \\', "  three',", '    }'),
      );
    });

    it('freezes the interior of a block comment that is not star-aligned', () => {
      const code = lines(
        'relocate({',
        '  /* prose one',
        '     prose two */',
        '  a: 1,',
        '});',
      );
      expect(relocatedTo('    ', code)).toBe(
        lines(
          '{',
          '      /* prose one',
          '     prose two */',
          '      a: 1,',
          '    }',
        ),
      );
    });

    it('moves a star-aligned block comment, which is layout', () => {
      const code = lines(
        'relocate({',
        '  /**',
        '   * aligned',
        '   */',
        '  a: 1,',
        '});',
      );
      expect(relocatedTo('    ', code)).toBe(
        lines(
          '{',
          '      /**',
          '       * aligned',
          '       */',
          '      a: 1,',
          '    }',
        ),
      );
    });
  });
});
