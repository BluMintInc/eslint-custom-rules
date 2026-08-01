import { TSESLint } from '@typescript-eslint/utils';
import { Linter } from 'eslint';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';

/**
 * Pins the parse mode of the shared `RuleTester` instances.
 *
 * `@typescript-eslint/parser` defaults `sourceType` to `'script'`. Under that
 * default a snippet's top-level `import`/`const` still binds, but the binding
 * hangs off the *global* scope and no module scope exists at all — a shape no
 * file in the linted codebase has, since every one of them is an ES module. A
 * rule that discriminates on `scope.type`, walks `globalScope.childScopes`, or
 * reads `globalScope.variables` would then be exercised against something it
 * never meets in production, and a `valid` case could pass for the parse mode
 * rather than for the rule being right.
 *
 * The probes below assert the shape from both directions — a module scope is
 * present, and the file's own declarations are absent from the global scope —
 * so reverting the shared testers to the parser default fails here rather than
 * silently changing what ~280 suites are testing.
 */

const SNIPPET = `import { useCallback } from 'react';
const CONFIG = { retries: 1 };
export function useThing() {
  return useCallback(() => CONFIG, []);
}
`;

const JSX_SNIPPET = `import { memo } from 'react';
const LABEL = 'ok';
export const Widget = memo(() => <div>{LABEL}</div>);
`;

type ModuleScopeIds = 'moduleScope';
type GlobalBindingIds = 'globalBinding';

const meta = <T extends string>(
  messageId: T,
  message: string,
): TSESLint.RuleMetaData<T> => ({
  type: 'problem',
  docs: {
    description: 'Test probe for the shared RuleTester parse mode',
    recommended: 'error',
  },
  schema: [],
  messages: { [messageId]: message } as Record<T, string>,
});

/** Reports only when the parse produced a module scope. */
const reportsUnderModule: TSESLint.RuleModule<ModuleScopeIds, []> = {
  defaultOptions: [],
  meta: meta<ModuleScopeIds>('moduleScope', 'A module scope exists'),
  create(context) {
    return {
      Program(node) {
        const hasModuleScope = context
          .getScope()
          .childScopes.some((scope) => scope.type === 'module');
        if (hasModuleScope) {
          context.report({ node, messageId: 'moduleScope' });
        }
      },
    };
  },
};

/**
 * Reports only when the snippet's own top-level declarations landed in the
 * global scope, which is what `sourceType: 'script'` does with them.
 */
const reportsUnderScript: TSESLint.RuleModule<GlobalBindingIds, []> = {
  defaultOptions: [],
  meta: meta<GlobalBindingIds>(
    'globalBinding',
    'Top-level declarations bound into the global scope',
  ),
  create(context) {
    return {
      Program(node) {
        const globalScope = context.getSourceCode().scopeManager?.globalScope;
        const declaredGlobally = [
          'CONFIG',
          'LABEL',
          'useCallback',
          'memo',
        ].some((name) => globalScope?.set.has(name));
        if (declaredGlobally) {
          context.report({ node, messageId: 'globalBinding' });
        }
      },
    };
  },
};

/**
 * Falsifiability control. Run directly, each probe must discriminate between
 * the two parse modes; without this the RuleTester assertions below could pass
 * because a probe reports (or stays silent) unconditionally.
 */
describe('the parse-mode probes discriminate', () => {
  const messageIdsFor = (
    rule: TSESLint.RuleModule<string, []>,
    sourceType: 'script' | 'module',
  ): string[] => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule('probe/parse-mode', rule as never);
    return linter
      .verify(
        SNIPPET,
        {
          parser: '@typescript-eslint/parser',
          parserOptions: { sourceType },
          rules: { 'probe/parse-mode': 'error' },
        },
        { filename: 'file.ts' },
      )
      .map((message) => message.messageId ?? message.message);
  };

  it('sees a module scope only under sourceType module', () => {
    expect(messageIdsFor(reportsUnderModule, 'script')).toEqual([]);
    expect(messageIdsFor(reportsUnderModule, 'module')).toEqual([
      'moduleScope',
    ]);
  });

  it('sees global bindings only under sourceType script', () => {
    expect(messageIdsFor(reportsUnderScript, 'script')).toEqual([
      'globalBinding',
    ]);
    expect(messageIdsFor(reportsUnderScript, 'module')).toEqual([]);
  });
});

ruleTesterTs.run('shared-tester-ts-parses-as-module', reportsUnderModule, {
  valid: [],
  invalid: [{ code: SNIPPET, errors: [{ messageId: 'moduleScope' }] }],
});

ruleTesterTs.run(
  'shared-tester-ts-has-no-global-top-level-bindings',
  reportsUnderScript,
  { valid: [SNIPPET], invalid: [] },
);

ruleTesterJsx.run('shared-tester-jsx-parses-as-module', reportsUnderModule, {
  valid: [],
  invalid: [{ code: JSX_SNIPPET, errors: [{ messageId: 'moduleScope' }] }],
});

ruleTesterJsx.run(
  'shared-tester-jsx-has-no-global-top-level-bindings',
  reportsUnderScript,
  { valid: [JSX_SNIPPET], invalid: [] },
);
