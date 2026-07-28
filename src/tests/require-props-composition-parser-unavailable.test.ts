import path from 'path';
import { Linter, Rule } from 'eslint';
import { requirePropsComposition } from '../rules/require-props-composition';

/**
 * Issue #1316 (reopened): proving an imported child prop-less needs a real
 * parse of the child module, which the rule gets by requiring
 * `@typescript-eslint/typescript-estree` lazily. A consumer install that somehow
 * cannot load that parser must degrade to "not provable" — the dependency stays
 * in the set and the rule keeps reporting — rather than throw out of the lint.
 *
 * The parser lookup is memoized for the life of the process (failure included),
 * so this probe lives in its own test file: it needs a module registry where the
 * lookup has not happened yet, and it must not poison the lookup for the other
 * cases.
 */
const FIXTURE_DIR = path.join(__dirname, 'fixtures/require-props-composition');
const PARENT_FILENAME = path.join(FIXTURE_DIR, 'TeamVersusRecord.tsx');
const FIXTURE_TARGET_PATHS = ['**/fixtures/**/*.tsx'];

// BestOfText.tsx declares `export const BestOfText = () => …`, i.e. a child that
// really is prop-less. Whether it is proven so is exactly what the parser
// decides.
const PARENT_CODE = `
import { BestOfText } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`;

// Captured before the module registry is reset, so the Linter keeps a working
// TypeScript parser even while typescript-estree is mocked out from under the
// rule. Re-requiring it after the mock is registered would fail instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const lintParent = (rule: unknown) => {
  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser);
  linter.defineRule('test/require-props-composition', rule as Rule.RuleModule);
  return linter.verify(
    PARENT_CODE,
    {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/require-props-composition': [
          'error',
          { targetPaths: FIXTURE_TARGET_PATHS },
        ],
      },
    },
    PARENT_FILENAME,
  );
};

describe('require-props-composition: child parser unavailable (issue #1316)', () => {
  afterEach(() => {
    jest.dontMock('@typescript-eslint/typescript-estree');
    jest.resetModules();
  });

  it('keeps reporting instead of throwing when the parser cannot be loaded', () => {
    // Baseline: with the parser present the child is proven prop-less and
    // dropped from the dependency set, so nothing is reported.
    expect(lintParent(requirePropsComposition)).toHaveLength(0);

    // A fresh registry so the rule's memoized parser lookup runs again, this
    // time against a module that cannot be loaded at all.
    jest.resetModules();
    jest.doMock('@typescript-eslint/typescript-estree', () => {
      throw new Error('@typescript-eslint/typescript-estree is unavailable');
    });
    const reloaded =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../rules/require-props-composition').requirePropsComposition;

    const messages = lintParent(reloaded);

    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('missingPropsComposition');
  });
});
