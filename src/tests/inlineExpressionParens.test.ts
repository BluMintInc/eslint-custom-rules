import { Linter, Rule } from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';
import { isRestrictedProduction } from '../utils/inlineExpressionParens';

/**
 * `isRestrictedProduction` answers a grammar question on behalf of any fixer
 * that inlines an expression carrying an internal line break. Its arms are
 * exercised here rather than through a single rule because the rule that reads
 * it today cannot reach all of them: no `useMemo(...)` call is a valid operand
 * of `++`, so that arm would ship measured only by inspection.
 *
 * The predicate is asked through a linter rather than a bare parse, since the
 * answer is a property of a node's PARENT and only a traversal guarantees the
 * parent pointers are in place.
 */
const linter = new Linter();
linter.defineParser(
  '@typescript-eslint/parser',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@typescript-eslint/parser'),
);

let collected: string[] = [];

linter.defineRule('probe/restricted-production', {
  create: (context) => ({
    '*'(node: TSESTree.Node) {
      if (isRestrictedProduction(node)) {
        collected.push(context.sourceCode.getText(node as never));
      }
    },
  }),
} as unknown as Rule.RuleModule);

const restrictedSpansOf = (code: string): string[] => {
  collected = [];
  const messages = linter.verify(code, {
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { 'probe/restricted-production': 'error' },
  } as Linter.Config);
  const fatal = messages.filter((message) => message.fatal);
  // A fatal parse collects nothing, which is indistinguishable from a
  // predicate that answered `false` everywhere.
  expect(fatal).toEqual([]);
  return collected;
};

describe('isRestrictedProduction', () => {
  it('holds for a return argument', () => {
    expect(restrictedSpansOf('function f() { return a ? b : c; }')).toEqual([
      'a ? b : c',
    ]);
  });

  it('holds for a throw argument', () => {
    expect(restrictedSpansOf('throw makeError;')).toEqual(['makeError']);
  });

  it('holds for a yield argument', () => {
    expect(restrictedSpansOf('function* g() { yield value; }')).toEqual([
      'value',
    ]);
  });

  it('holds for the operand of a postfix update', () => {
    expect(restrictedSpansOf('counter++;')).toEqual(['counter']);
  });

  it('does not hold for the operand of a prefix update', () => {
    expect(restrictedSpansOf('++counter;')).toEqual([]);
  });

  it('does not hold for a declarator initializer, where a break is inert', () => {
    expect(restrictedSpansOf('const label = a ? b : c;')).toEqual([]);
  });

  it('does not hold for a call argument', () => {
    expect(restrictedSpansOf('render(a ? b : c);')).toEqual([]);
  });

  it('does not hold for a bare return, which has no argument to restrict', () => {
    expect(restrictedSpansOf('function f() { return; }')).toEqual([]);
  });

  it('is not vacuous: the probe reaches nodes at all', () => {
    // The negative cases above pass just as well if the traversal never runs.
    expect(restrictedSpansOf('function f() { return x; }')).toEqual(['x']);
  });
});
