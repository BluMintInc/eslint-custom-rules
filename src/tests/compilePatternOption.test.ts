import {
  PatternRejection,
  compilePatternOption,
} from '../utils/compilePatternOption';

/**
 * The four pattern-compiling rules delegate their config validation here, so a
 * regression in this helper corrupts every one of their error messages at once.
 * These cases pin the message shape directly, independent of any rule.
 */
describe('compilePatternOption', () => {
  describe('valid patterns', () => {
    it('compiles every source in order', () => {
      const compiled = compilePatternOption('a-rule', 'allowPatterns', [
        '^foo',
        'bar$',
      ]);
      expect(compiled).toHaveLength(2);
      expect(compiled.map((regex) => regex.source)).toEqual(['^foo', 'bar$']);
      expect(compiled[0]?.test('foobar')).toBe(true);
      expect(compiled[1]?.test('foobar')).toBe(true);
    });

    it('returns an empty array for an empty list', () => {
      expect(compilePatternOption('a-rule', 'allowPatterns', [])).toEqual([]);
    });

    it('applies no flags by default', () => {
      const [regex] = compilePatternOption('a-rule', 'patterns', ['^fetching']);
      expect(regex?.flags).toBe('');
      expect(regex?.test('Fetching')).toBe(false);
    });

    it('applies the requested flags to every pattern', () => {
      const compiled = compilePatternOption(
        'a-rule',
        'patterns',
        ['^fetching', 'loading$'],
        'i',
      );
      expect(compiled.map((regex) => regex.flags)).toEqual(['i', 'i']);
      expect(compiled[0]?.test('FetchingUsers')).toBe(true);
      expect(compiled[1]?.test('isLOADING')).toBe(true);
    });

    it('supports multi-character flags', () => {
      const [regex] = compilePatternOption('a-rule', 'patterns', ['a'], 'gi');
      expect(regex?.flags).toBe('gi');
    });

    it('treats an explicit undefined flags argument as no flags', () => {
      const [regex] = compilePatternOption(
        'a-rule',
        'patterns',
        ['a'],
        undefined,
      );
      expect(regex?.flags).toBe('');
    });

    it('accepts a readonly list', () => {
      const patterns: readonly string[] = ['^ok$'] as const;
      expect(
        compilePatternOption('a-rule', 'allowNames', patterns),
      ).toHaveLength(1);
    });
  });

  describe('malformed patterns', () => {
    it('throws naming the rule, the option, the pattern and the regex reason', () => {
      expect(() =>
        compilePatternOption('a-rule', 'ignorePatterns', ['C++']),
      ).toThrow(/^a-rule: invalid ignorePatterns: C\+\+ \(.*Nothing to repeat/);
    });

    it('lists every malformed pattern in a single error', () => {
      let thrown: unknown;
      try {
        compilePatternOption('a-rule', 'patterns', [
          '*Loading',
          '^fetching',
          '(foo',
          'C++',
        ]);
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const { message } = thrown as Error;
      expect(message.startsWith('a-rule: invalid patterns: ')).toBe(true);
      expect(message).toContain('*Loading');
      expect(message).toContain('(foo');
      expect(message).toContain('C++');
      // One error, not one per pattern: the consumer fixes the whole option in
      // a single pass instead of rediscovering the next failure each run.
      expect(message.split('invalid patterns')).toHaveLength(2);
    });

    it('does not accuse a well-formed neighbour', () => {
      let thrown: unknown;
      try {
        compilePatternOption('a-rule', 'patterns', ['^fetching', '(foo']);
      } catch (error: unknown) {
        thrown = error;
      }

      const { message } = thrown as Error;
      expect(message).toContain('(foo');
      expect(message).not.toContain('^fetching');
    });

    it('joins the malformed patterns with a comma', () => {
      expect(() =>
        compilePatternOption('a-rule', 'patterns', ['[', '(foo']),
      ).toThrow(/invalid patterns: \[ \(.*\), \(foo \(.*\)/);
    });

    it.each([['*.test.ts'], ['C++'], ['['], ['(foo'], ['a{2,1}']])(
      'rejects the malformed pattern %j',
      (pattern) => {
        expect(() =>
          compilePatternOption('a-rule', 'allowNames', [pattern]),
        ).toThrow(/invalid allowNames/);
      },
    );

    it('accepts sources that are only well-formed under the requested flags', () => {
      // `\p{L}` means something else without the `u` flag, so the flags must
      // reach the compile site rather than a bare probe compile.
      expect(() =>
        compilePatternOption('a-rule', 'patterns', ['\\p{L}+'], 'u'),
      ).not.toThrow();
    });
  });

  describe('rejection extension point', () => {
    const UNSAFE: PatternRejection = {
      isRejected: (pattern) =>
        /\((?:[^()\\]|\\.)*[+*{][^)]*\)\s*[+*{]/.test(pattern),
      describe: (optionName) =>
        `unsafe ${optionName} (avoid nested quantifiers that risk catastrophic backtracking)`,
    };

    it('compiles patterns the rejection accepts', () => {
      expect(
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['^onSave'],
          undefined,
          UNSAFE,
        ),
      ).toHaveLength(1);
    });

    it('throws a clause built from the rejection description', () => {
      expect(() =>
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['(a+)+$'],
          undefined,
          UNSAFE,
        ),
      ).toThrow(
        'a-rule: unsafe allowPatterns (avoid nested quantifiers that risk catastrophic backtracking): (a+)+$',
      );
    });

    it('joins the invalid and rejected clauses with a semicolon', () => {
      let thrown: unknown;
      try {
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['(a+)+$', '(foo'],
          undefined,
          UNSAFE,
        );
      } catch (error: unknown) {
        thrown = error;
      }

      const { message } = thrown as Error;
      // Invalid first, then unsafe, both inside one `a-rule: ` prefix.
      expect(message).toMatch(
        /^a-rule: invalid allowPatterns: \(foo \(.*\); unsafe allowPatterns \(avoid nested quantifiers that risk catastrophic backtracking\): \(a\+\)\+\$$/,
      );
    });

    it('lists every rejected pattern in one clause', () => {
      expect(() =>
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['(a+)+$', '(b*)*'],
          undefined,
          UNSAFE,
        ),
      ).toThrow(/backtracking\): \(a\+\)\+\$, \(b\*\)\*$/);
    });

    it('does not report a rejected pattern as invalid too', () => {
      // The rejection runs before compilation, so a refused source never also
      // reaches `new RegExp` and cannot appear in both clauses.
      let thrown: unknown;
      try {
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['(a+)+$'],
          undefined,
          UNSAFE,
        );
      } catch (error: unknown) {
        thrown = error;
      }
      expect((thrown as Error).message).not.toContain('invalid allowPatterns');
    });

    it('accepts unsafe-looking sources when no rejection is supplied', () => {
      expect(
        compilePatternOption('a-rule', 'allowPatterns', ['(a+)+$']),
      ).toHaveLength(1);
    });

    it('applies the rejection to an empty list without throwing', () => {
      expect(
        compilePatternOption('a-rule', 'allowPatterns', [], undefined, UNSAFE),
      ).toEqual([]);
    });

    it('surfaces only the invalid clause when nothing is rejected', () => {
      expect(() =>
        compilePatternOption(
          'a-rule',
          'allowPatterns',
          ['(foo'],
          undefined,
          UNSAFE,
        ),
      ).toThrow(/^a-rule: invalid allowPatterns: \(foo \(.*\)$/);
    });

    it('passes each pattern to the rejection predicate exactly once', () => {
      const isRejected = jest.fn().mockReturnValue(false);
      compilePatternOption('a-rule', 'allowPatterns', ['a', 'b'], undefined, {
        isRejected,
        describe: (optionName) => `unsafe ${optionName}`,
      });
      expect(isRejected.mock.calls).toEqual([['a'], ['b']]);
    });
  });

  describe('error shape', () => {
    it('throws an Error instance', () => {
      let thrown: unknown;
      try {
        compilePatternOption('a-rule', 'patterns', ['[']);
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
    });

    it('names the option verbatim, including unusual option names', () => {
      expect(() =>
        compilePatternOption('a-rule', 'allowFilePatterns', ['[']),
      ).toThrow(/invalid allowFilePatterns/);
    });
  });
});
