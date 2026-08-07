/**
 * A rule's verdict may not change because a receiver was written with `?.`.
 *
 * Fourth surface of the wrapper family, after `as const` / `satisfies` / `!`
 * (`assertion-wrapper-sweep`) and the degenerate-derivation trio. Optional
 * chaining does something none of those do: ESTree wraps `a?.b` in a
 * **`ChainExpression`**, which sits BETWEEN the member/call and its real
 * parent. So a rule that matches a bare `MemberExpression` / `CallExpression`,
 * or that answers a question by reading `node.parent`, silently returns a
 * different answer — and nothing normalizes the spelling away, unlike the
 * quoted-key arm of the expression-spelling probe. The sweep that produced this
 * guard found defects in ten rules across eleven issues (#1824-#1833, #1836);
 * at the time it ran, only 33 of 194 rules mentioned `ChainExpression` while
 * 101 read `node.parent` without it.
 *
 * The guard is an ALLOWLIST INVERTED: every rule must be chain-transparent
 * unless it appears in `KNOWN_DIVERGENT` with a reason. That is the opposite of
 * how the expression-spelling axis was left — it stayed an unshipped probe
 * because gating it needed a ~90-rule exemption map of unreachable arms. Here
 * the divergent set is small, finite and explained, so the maintainable form is
 * to name it.
 *
 * Both directions of the exemption are enforced, which is what keeps the list
 * honest:
 *
 *   - a rule NOT in the map may not diverge (a new defect fails the build);
 *   - a rule IN the map MUST still diverge (fixing one and leaving the entry
 *     behind fails too, so the map cannot silently accumulate dead exemptions
 *     that would mask a future regression).
 *
 * Anti-vacuity, in the order these have gone wrong before:
 *
 *   - `range: true` on every `tsParser.parse`, or any JSX fixture throws and
 *     the skip reads as "no sites" (#1820).
 *   - Validity is `ts.createSourceFile(...).parseDiagnostics`, never a reparse.
 *   - The floor is on `rulesReporting` — rules that actually fired on their own
 *     baseline. `casesConsidered` stays high even if the corpus reaches nothing,
 *     so it proves nothing on its own.
 *   - Skips are counted and asserted, never folded into "no divergence".
 *   - Teeth are proved against a REAL rule, not only a plant: reverting any of
 *     the shipped unwraps turns this red naming that rule. A plant alone passes
 *     even when the corpus reaches no real rule.
 */
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import * as ts from 'typescript';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  parserOptionsFor,
  typeAwareRuleNames,
  ruleNameByIdentity,
  severityWithOptions,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * Rules whose reports legitimately change under `?.`, with the reason.
 *
 * Two kinds, and the distinction matters when one of these is revisited:
 *
 *   - CORRECT: the rule's remedy stops being equivalent once the receiver may
 *     be nullish, so going silent is the right answer. These must never be
 *     "fixed".
 *   - ARTIFACT: the blindness is real but the only spelling that reaches it is
 *     one nobody writes (`useState?.()`, `this?.value`, `Object?.keys(x)`).
 *     Filing these would add code for inputs that do not occur.
 */
const KNOWN_DIVERGENT: Record<string, string> = {
  'array-methods-this-context': 'ARTIFACT: only reached via `this?.method`',
  'enforce-assert-throws':
    'ARTIFACT: only reached via `process.exit?.()` / `this?.assertX()`',
  'enforce-callback-memo': 'ARTIFACT: only reached via `useCallback?.()`',
  'enforce-console-error': 'ARTIFACT: only reached via `console?.error()`',
  'enforce-css-media-queries': 'ARTIFACT: only reached via a hook callee',
  'enforce-exported-function-types':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'enforce-firestore-doc-ref-generic':
    'ARTIFACT: residue of #1826 — the member arm is fixed; only `db.collection<T>?.(...)`, an optional call on a generic method, remains',
  'enforce-firestore-facade':
    'ARTIFACT: reached only via a facade-function callee nobody writes optional',
  'enforce-microdiff':
    'ARTIFACT: needs both `JSON?.stringify` sites perturbed at once',
  'enforce-mock-firestore': 'ARTIFACT: only reached via a mock-helper callee',
  'enforce-render-hits-memoization': 'ARTIFACT: only reached via a hook callee',
  'enforce-single-exported-unit-per-file':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'enforce-snapshot-state-narrowing':
    'ARTIFACT: only reached via `useDocSnapshot?.()`',
  'enforce-timestamp-now': 'ARTIFACT: only reached via `Date.now?.()`',
  'enforce-transform-memoization':
    'ARTIFACT: only reached via `forwardRef?.()`',
  'enforce-verb-noun-naming': 'ARTIFACT: only reached via `createElement?.()`',
  'fast-deep-equal-over-microdiff':
    'ARTIFACT: residue of #1825 — the binary arm is fixed; only `diff?.(a, b)`, an optional call on a static import binding, remains',
  'firestore-transaction-reads-before-writes':
    'ARTIFACT: only reached via `assertSafe?.()`',
  'flatten-push-calls':
    'CORRECT: `arr?.push(a); arr.push(b)` is a mixed group, and `arr?.push(a, b)` is not equivalent to the pair',
  'global-const-style':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'memo-nested-react-components':
    'ARTIFACT: only reached via `memo?.()` / `it.each?.()`',
  'no-always-true-false-conditions':
    'CORRECT: `?.` introduces a nullish branch, so a condition that was statically decidable no longer is',
  'no-complex-cloud-params': 'ARTIFACT: only reached via a hook/global callee',
  'no-console-error': 'ARTIFACT: only reached via `console?.error()`',
  'no-direct-function-state':
    'ARTIFACT: residue of #1824 — the argument readers are fixed; only `useState<T>?.(...)`, an optional hook call, remains',
  'no-empty-dependency-use-callbacks':
    'ARTIFACT: only reached via `useCallback?.()`',
  'no-excessive-parent-chain':
    'CORRECT-ISH: `event?.data` is unreachable — the four BluMint wrapper types this rule targets instantiate the data generic without `| undefined`, so strict TS never forces the optional link (refuted #1832-era triage)',
  'no-fill-template-mutation': 'ARTIFACT: only reached via `fillTemplate?.()`',
  'no-handler-suffix':
    'ARTIFACT: only reached via `External?.Handler` in a type-ish position',
  'no-hungarian':
    'ARTIFACT: only reached via `Symbol?.(...)`, an optional call on the global',
  'no-jsx-in-hooks': 'ARTIFACT: only reached via a hook callee',
  'no-margin-properties': 'ARTIFACT: only reached via a global/hook callee',
  'no-redundant-this-params': 'ARTIFACT: only reached via `this?.value`',
  'no-redundant-usecallback-wrapper':
    'CORRECT: `useCallback(() => f?.(), [f])` is not equivalent to passing `f`, which is undefined when f is nullish',
  'no-separate-loading-state': 'ARTIFACT: only reached via `useState?.()`',
  'no-stale-state-across-await': 'ARTIFACT: only reached via `useState?.()`',
  'no-undefined-null-passthrough':
    'ARTIFACT: only reached via an imported transform callee',
  'no-unused-usestate': 'ARTIFACT: only reached via `useState?.()`',
  'optimize-object-boolean-conditions':
    'ARTIFACT: only reached via `Object?.keys(x)` / `React?.useState()`',
  'prefer-destructuring-no-class':
    'CORRECT: `const { name } = user` throws when `user` is nullish, so the remedy is not equivalent to `user?.name`',
  'prefer-next-dynamic': 'ARTIFACT: only reached via `useDynamic?.()`',
  'prefer-use-base62-id': 'ARTIFACT: only reached via `uuidv4Base62?.()`',
  'prefer-usecallback-over-usememo-for-functions':
    'ARTIFACT: only reached via `useMemo?.()`',
  'prefer-usememo-over-useeffect-usestate':
    'ARTIFACT: only reached via a state setter callee',
  'react-usememo-should-be-component':
    'ARTIFACT: only reached via `useMemo?.()`',
  'require-props-composition': 'ARTIFACT: only reached via `memo?.()`',
  'use-latest-callback': 'ARTIFACT: only reached via `useLatestCallback?.()`',
  'warn-https-error-message-user-friendly':
    'ARTIFACT: only reached via a single-letter local callee',
};

const ruleByName = new Map<string, unknown>(
  [...ruleNameByIdentity].map(([rule, name]) => [name, rule]),
);

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of ruleByName) {
  linter.defineRule(`b/${name}`, rule as never);
}

type Arm = 'member' | 'call';
const ARMS: Arm[] = ['member', 'call'];

type Node = Record<string, unknown> & { type?: string; range?: number[] };

const parseErrorCount = (code: string, filename: string) => {
  const kind = filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  return (sourceFile as unknown as { parseDiagnostics: unknown[] })
    .parseDiagnostics.length;
};

const astOf = (code: string, jsx: boolean): Node | null => {
  try {
    return tsParser.parse(code, {
      range: true,
      loc: false,
      sourceType: 'module',
      ecmaFeatures: { jsx },
    }) as unknown as Node;
  } catch {
    return null;
  }
};

const walk = (node: unknown, parent: Node | null, visit: (n: Node) => void) => {
  if (!node || typeof node !== 'object') return;
  const candidate = node as Node;
  if (typeof candidate.type === 'string') {
    (candidate as { __parent?: Node | null }).__parent = parent;
    visit(candidate);
  }
  for (const key of Object.keys(candidate)) {
    if (key === 'parent' || key === '__parent') continue;
    const value = (candidate as Record<string, unknown>)[key];
    const nextParent = typeof candidate.type === 'string' ? candidate : parent;
    if (Array.isArray(value)) {
      value.forEach((child) => walk(child, nextParent, visit));
    } else if (value && typeof value === 'object') {
      walk(value, nextParent, visit);
    }
  }
};

const parentOf = (node: Node) => (node as { __parent?: Node | null }).__parent;

/**
 * The head of the chain this link belongs to. `a?.b.c = 1` and `new a?.b()` are
 * syntax errors decided by the WHOLE chain, not by the link being perturbed.
 */
const chainHead = (node: Node): Node => {
  let current = node;
  for (;;) {
    const parent = parentOf(current);
    if (!parent) return current;
    const isLink =
      (parent.type === 'MemberExpression' &&
        (parent as { object?: unknown }).object === current) ||
      (parent.type === 'CallExpression' &&
        (parent as { callee?: unknown }).callee === current) ||
      parent.type === 'TSNonNullExpression' ||
      parent.type === 'ChainExpression';
    if (!isLink) return current;
    current = parent;
  }
};

const inForbiddenContext = (node: Node): boolean => {
  const head = chainHead(node);
  const parent = parentOf(head);
  if (!parent) return false;
  const slotIs = (key: string) =>
    (parent as Record<string, unknown>)[key] === head;
  switch (parent.type) {
    case 'AssignmentExpression':
    case 'ForInStatement':
    case 'ForOfStatement':
      return slotIs('left');
    case 'UpdateExpression':
      return slotIs('argument');
    case 'NewExpression':
      return slotIs('callee');
    case 'TaggedTemplateExpression':
      return slotIs('tag');
    case 'ClassDeclaration':
    case 'ClassExpression':
      return slotIs('superClass');
    case 'Decorator':
    case 'Property':
    case 'ArrayPattern':
    case 'ObjectPattern':
    case 'AssignmentPattern':
    case 'RestElement':
      return true;
    default:
      return false;
  }
};

const gapIndexOf = (code: string, from: number, to: number, char: string) => {
  const index = code.indexOf(char, from);
  return index >= 0 && index < to ? index : -1;
};

const sitesOf = (
  code: string,
  ast: Node,
  arm: Arm,
): { index: number; text: string }[] => {
  const sites: { index: number; text: string }[] = [];
  walk(ast, null, (node) => {
    if ((node as { optional?: unknown }).optional === true) return;

    if (arm === 'member' && node.type === 'MemberExpression') {
      const object = (node as { object?: Node }).object;
      const property = (node as { property?: Node }).property;
      if (!object?.range || !property?.range) return;
      if (object.type === 'Super') return;
      if (inForbiddenContext(node)) return;
      if ((node as { computed?: unknown }).computed === true) {
        const bracket = gapIndexOf(
          code,
          object.range[1],
          property.range[0],
          '[',
        );
        if (bracket < 0) return;
        sites.push({ index: bracket, text: '?.' });
      } else {
        const dot = gapIndexOf(code, object.range[1], property.range[0], '.');
        if (dot < 0) return;
        sites.push({ index: dot, text: '?' });
      }
      return;
    }

    if (arm === 'call' && node.type === 'CallExpression') {
      const callee = (node as { callee?: Node }).callee;
      if (!callee?.range || !node.range) return;
      if (callee.type === 'Super' || callee.type === 'Import') return;
      if (parentOf(node)?.type === 'NewExpression') return;
      if (inForbiddenContext(node)) return;
      const typeArguments =
        (node as { typeArguments?: Node }).typeArguments ??
        (node as { typeParameters?: Node }).typeParameters;
      const from = typeArguments?.range
        ? typeArguments.range[1]
        : callee.range[1];
      const paren = gapIndexOf(code, from, node.range[1], '(');
      if (paren < 0) return;
      sites.push({ index: paren, text: '?.' });
    }
  });
  return sites;
};

const applySites = (
  code: string,
  sites: { index: number; text: string }[],
): string => {
  let output = code;
  for (const site of [...sites].sort((a, b) => b.index - a.index)) {
    output = output.slice(0, site.index) + site.text + output.slice(site.index);
  }
  return output;
};

/**
 * All sites at once when that parses, else the largest greedy subset that does.
 * Dropping a whole case for one illegal site is coverage silently withheld,
 * which reads as a clean sweep.
 */
const perturb = (
  code: string,
  sites: { index: number; text: string }[],
  filename: string,
  baselineErrors: number,
): string | null => {
  const all = applySites(code, sites);
  if (parseErrorCount(all, filename) <= baselineErrors) return all;
  const kept: { index: number; text: string }[] = [];
  for (const site of sites) {
    if (
      parseErrorCount(applySites(code, [...kept, site]), filename) <=
      baselineErrors
    ) {
      kept.push(site);
    }
  }
  return kept.length ? applySites(code, kept) : null;
};

const signatureOf = (messages: readonly Linter.LintMessage[]) => {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const key = message.messageId || message.message;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return (
    [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `${key}x${count}`)
      .join(',') || '<none>'
  );
};

type Divergence = {
  rule: string;
  arm: Arm;
  bucket: string;
  origin: string;
  before: string;
  after: string;
  input: string;
  output: string;
};

const guardedRuleNames = [...ruleByName.keys()]
  .filter((name) => !typeAwareRuleNames.has(name))
  .sort();

describe('optional-chaining closure', () => {
  const corpus = harvestFixtureCorpus();

  const divergences: Divergence[] = [];
  const divergentRules = new Set<string>();
  const rulesReporting = new Set<string>();
  const rulesPerturbed = new Set<string>();
  let casesConsidered = 0;
  let sitesRewritten = 0;
  let casesWithBaselineReports = 0;
  let skippedBaselineUnparsable = 0;
  let skippedBaselineFatal = 0;
  let skippedVariantFatal = 0;
  let skippedNoAst = 0;

  beforeAll(() => {
    for (const rule of guardedRuleNames) {
      for (const testCase of corpus.byRule.get(rule) || []) {
        const filename = testCase.filename ?? defaultFilenameFor(testCase);
        const jsx = filename.endsWith('x');
        const baselineErrors = parseErrorCount(testCase.code, filename);
        if (baselineErrors > 0) {
          skippedBaselineUnparsable++;
          continue;
        }
        const ast = astOf(testCase.code, jsx);
        if (!ast) {
          skippedNoAst++;
          continue;
        }

        const config = {
          parser: 'ts',
          parserOptions: parserOptionsFor(testCase as FixtureCase),
          rules: {
            [`b/${rule}`]: severityWithOptions(testCase as FixtureCase),
          },
        } as never;

        const lint = (code: string) => {
          try {
            return linter.verify(code, config, filename);
          } catch {
            return null;
          }
        };

        const baseline = lint(testCase.code);
        if (!baseline || baseline.some((message) => message.fatal)) {
          skippedBaselineFatal++;
          continue;
        }
        const before = signatureOf(baseline);
        if (before !== '<none>') {
          casesWithBaselineReports++;
          rulesReporting.add(rule);
        }

        for (const arm of ARMS) {
          const sites = sitesOf(testCase.code, ast, arm);
          if (!sites.length) continue;
          casesConsidered++;
          const output = perturb(
            testCase.code,
            sites,
            filename,
            baselineErrors,
          );
          if (!output || output === testCase.code) continue;
          sitesRewritten += sites.length;
          rulesPerturbed.add(rule);

          const variant = lint(output);
          if (!variant || variant.some((message) => message.fatal)) {
            skippedVariantFatal++;
            continue;
          }
          const after = signatureOf(variant);
          if (after === before) continue;

          divergentRules.add(rule);
          // One example PER RULE, not the first N overall: a flat cap lets a
          // chatty rule crowd out every example for a quiet one, and the
          // failure message then names a rule it cannot illustrate.
          if (!divergences.some((existing) => existing.rule === rule)) {
            divergences.push({
              rule,
              arm,
              bucket: testCase.bucket,
              origin: testCase.origin,
              before,
              after,
              input: testCase.code,
              output,
            });
          }
        }
      }
    }
  }, 1800000);

  it('reaches enough of the corpus for a clean result to mean something', () => {
    // A rule that never fired on its own baseline cannot LOSE a report, so a
    // clean run over a silent corpus asserts nothing.
    expect(rulesReporting.size).toBeGreaterThan(150);
    expect(casesWithBaselineReports).toBeGreaterThan(5000);
    expect(rulesPerturbed.size).toBeGreaterThan(140);
    expect(sitesRewritten).toBeGreaterThan(20000);
    expect(casesConsidered).toBeGreaterThan(10000);
    // Skips are how a sweep silently loses coverage, so each is asserted on its
    // own rather than summed. Only an unparsable BASELINE is legitimate — the
    // corpus declares a couple of deliberately malformed fixtures — and even
    // that is bounded, because a parser or harness regression would show up
    // here as a large number rather than as a failure.
    expect({
      skippedNoAst,
      skippedBaselineFatal,
      skippedVariantFatal,
    }).toEqual({
      skippedNoAst: 0,
      skippedBaselineFatal: 0,
      skippedVariantFatal: 0,
    });
    expect(skippedBaselineUnparsable).toBeLessThan(5);
  });

  it('no rule changes its verdict under optional chaining', () => {
    const unexpected = [...divergentRules]
      .filter((rule) => !(rule in KNOWN_DIVERGENT))
      .sort();

    if (unexpected.length) {
      const detail = unexpected
        .map((rule) => {
          const example = divergences.find((d) => d.rule === rule);
          return [
            `  ${rule} (${example?.arm} arm, ${example?.bucket} fixture from ${example?.origin})`,
            `    ${example?.before}  ->  ${example?.after}`,
            `    input:   ${example?.input.replace(/\s+/g, ' ').slice(0, 160)}`,
            `    variant: ${example?.output
              .replace(/\s+/g, ' ')
              .slice(0, 160)}`,
          ].join('\n');
        })
        .join('\n');
      throw new Error(
        `${unexpected.length} rule(s) change their verdict when a receiver is written with \`?.\`.\n` +
          `ESTree wraps \`a?.b\` in a ChainExpression, so a bare MemberExpression/CallExpression\n` +
          `match — or a \`node.parent\` read — sees something else. Unwrap it, or add the rule to\n` +
          `KNOWN_DIVERGENT with a reason if the change is CORRECT (the remedy stops being\n` +
          `equivalent under a nullish receiver) or an ARTIFACT (no one writes the spelling).\n\n` +
          detail,
      );
    }
  });

  it('carries no stale exemptions', () => {
    // An entry left behind after a fix would mask the next regression in that
    // rule, so the map is required to be exactly the divergent set.
    const stale = Object.keys(KNOWN_DIVERGENT)
      .filter((rule) => !divergentRules.has(rule))
      .sort();
    expect({ stale }).toEqual({ stale: [] });
  });

  /**
   * Positive control: the canonical blindness this guard exists to catch. `f()`
   * as a statement has parent `ExpressionStatement`; `f?.()` has parent
   * `ChainExpression`, so a parent-reading rule goes silent.
   */
  it('detects a parent-slot rule going blind', () => {
    const planted = {
      meta: {
        type: 'problem',
        schema: [],
        messages: { statementCall: 'call in statement position' },
      },
      create(context: { report: (d: Record<string, unknown>) => void }) {
        return {
          CallExpression(node: { parent?: { type?: string } }) {
            if (node.parent?.type !== 'ExpressionStatement') return;
            context.report({ node, messageId: 'statementCall' });
          },
        };
      },
    };
    linter.defineRule('planted/statementCall', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/statementCall': 'error' },
    } as never;
    expect(linter.verify('doThing(1);', config, 'file.ts')).toHaveLength(1);
    expect(linter.verify('doThing?.(1);', config, 'file.ts')).toHaveLength(0);
  });

  /** Negative control: a name-keyed rule must be untouched by the rewrite. */
  it('leaves a name-keyed rule alone', () => {
    const planted = {
      meta: { type: 'problem', schema: [], messages: { named: 'saw it' } },
      create(context: { report: (d: Record<string, unknown>) => void }) {
        return {
          Identifier(node: { name?: string }) {
            if (node.name !== 'doThing') return;
            context.report({ node, messageId: 'named' });
          },
        };
      },
    };
    linter.defineRule('planted/named', planted as never);
    const config = {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: { 'planted/named': 'error' },
    } as never;
    expect(linter.verify('doThing(1);', config, 'file.ts')).toHaveLength(1);
    expect(linter.verify('doThing?.(1);', config, 'file.ts')).toHaveLength(1);
  });

  /** The rewrite must never manufacture a syntax error. */
  it('never emits code that fails to parse', () => {
    const cases = [
      'a.b.c;',
      'a[b];',
      'f(1);',
      'obj.method(1);',
      'new Foo.Bar();',
      'a.b = 1;',
      'a.b++;',
      'for (o.k of xs) {}',
      'tag.fn`x`;',
      'class X extends Base.Inner {}',
      'const { a } = obj;',
      'f<T>(1);',
      'delete a.b;',
      '({ ...a.b });',
    ];
    for (const code of cases) {
      const baselineErrors = parseErrorCount(code, 'f.ts');
      for (const arm of ARMS) {
        const ast = astOf(code, false);
        if (!ast) continue;
        const output = applySites(code, sitesOf(code, ast, arm));
        expect({
          code,
          arm,
          output,
          clean: parseErrorCount(output, 'f.ts') <= baselineErrors,
        }).toMatchObject({ clean: true });
      }
    }
  });
});
