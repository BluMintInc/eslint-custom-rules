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
 *   - a rule/arm NOT in the map may not diverge (a new defect fails the build);
 *   - a rule/arm IN the map MUST still diverge (fixing one and leaving the
 *     entry behind fails too, so the map cannot silently accumulate dead
 *     exemptions that would mask a future regression).
 *
 * The unit of both directions is `rule::arm`, not the rule. A mutation audit —
 * reverting each of the eleven fixes above in turn — found 4 invisible while
 * this file stayed green (#1839). Three were rule-keyed exemptions covering a
 * `call`-arm residue that also exempted the `member` arm the fix was on
 * (#1824, #1825, #1826). The fourth was #1836, whose subject sits in an
 * object-literal value — a slot `inForbiddenContext` skipped wholesale as if it
 * were a destructuring target, withholding 901 sites and hiding two live
 * divergences (`no-circular-references`, filed as #1838, and an artifact in
 * `no-unsafe-firestore-spread`).
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
  silentWithoutProgramRuleNames,
  ruleNameByIdentity,
  severityWithOptions,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * Rule/arm pairs whose reports legitimately change under `?.`, with the reason.
 *
 * Two kinds, and the distinction matters when one of these is revisited:
 *
 *   - CORRECT: the rule's remedy stops being equivalent once the receiver may
 *     be nullish, so going silent is the right answer. These must never be
 *     "fixed".
 *   - ARTIFACT: the blindness is real but the only spelling that reaches it is
 *     one nobody writes (`useState?.()`, `this?.value`, `Object?.keys(x)`, an
 *     optional link on an array literal). Filing these would add code for
 *     inputs that do not occur.
 *   - DEFECT: a spelling a developer WOULD write reaches it, so the entry is a
 *     placeholder holding the suite actionable until the filed issue is fixed —
 *     never a decision. Each carries the writable spelling that reproduces it,
 *     because "only reachable via `?.`" is the claim an ARTIFACT makes and a
 *     DEFECT refutes; the difference was established by probing the realistic
 *     sub-spelling, not by reading the perturbed fixture.
 *
 * Keyed `rule::arm`, never on the rule alone. Three entries here are the
 * `call`-arm residue of a `member`-arm fix (#1824, #1825, #1826); a rule-keyed
 * map exempted the fixed arm too, so reverting any of those three reintroduced
 * the defect with this file fully green (#1839).
 */
const KNOWN_DIVERGENT: Record<string, string> = {
  'array-methods-this-context::call':
    'ARTIFACT: `.map?.()` / `.bind?.(this)`, optional calls on array and function methods that always exist',
  'array-methods-this-context::member':
    'ARTIFACT: `this?.method` and `[...]?.map`, optional links on a receiver that is never nullish',
  'enforce-assert-throws::call':
    'ARTIFACT: only reached via `process.exit?.()` / `this?.assertX()`',
  'enforce-assert-throws::member':
    'ARTIFACT: only reached via `process?.exit` / `process?.env`, optional links on the Node global',
  'enforce-callback-memo::call': 'ARTIFACT: only reached via `useCallback?.()`',
  'enforce-console-error::call':
    'ARTIFACT: only reached via an optional hook callee',
  'enforce-css-media-queries::call': 'ARTIFACT: only reached via a hook callee',
  'enforce-exported-function-types::call':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'enforce-exported-function-types::member':
    'ARTIFACT: only reached via `React?.memo`, an optional link on the namespace import',
  'enforce-firestore-doc-ref-generic::call':
    'ARTIFACT: residue of #1826 — the member arm is fixed; only `db.collection<T>?.(...)`, an optional call on a generic method, remains',
  'enforce-firestore-facade::call':
    'ARTIFACT: `db.collection?.()` / `ref.set?.()`, optional calls on Firestore methods that always exist',
  'enforce-firestore-facade::member':
    'ARTIFACT: reached only via a facade handle nobody writes optional',
  'enforce-microdiff::call':
    'ARTIFACT: needs both `JSON.stringify?.()` sites perturbed at once',
  'enforce-microdiff::member':
    'ARTIFACT: needs both `JSON?.stringify` sites perturbed at once',
  'enforce-mock-firestore::member':
    'ARTIFACT: only reached via `jest?.mock` / `jest?.fn`, optional links on the Jest global',
  'enforce-render-hits-memoization::call':
    'ARTIFACT: only reached via a hook callee',
  'enforce-single-exported-unit-per-file::call':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'enforce-snapshot-state-narrowing::call':
    'ARTIFACT: only reached via `useDocSnapshot?.()`',
  'enforce-timestamp-now::call':
    'ARTIFACT: only reached via `Date.now?.()` / `Timestamp.fromMillis?.()`',
  'enforce-timestamp-now::member':
    'ARTIFACT: only reached via `Date?.now` / `Timestamp?.fromMillis`',
  'enforce-transform-memoization::call':
    'ARTIFACT: only reached via `forwardRef?.()`',
  'enforce-verb-noun-naming::call':
    'ARTIFACT: only reached via `createElement?.()`',
  'enforce-verb-noun-naming::member':
    'ARTIFACT: only reached via `React?.createElement`',
  'enforce-empty-object-check::call':
    'ARTIFACT: only reached via `Object.keys?.(x)`; the writable `Object.keys(x)?.length === 0` stays silent (measured)',
  'enforce-empty-object-check::member':
    'ARTIFACT: only reached via `Object?.keys`; the writable `u?.name` in the same fixture stays silent (measured)',
  'fast-deep-equal-over-microdiff::call':
    'ARTIFACT: residue of #1825 — the binary arm is fixed; only `diff?.(a, b)`, an optional call on a static import binding, remains',
  'firestore-transaction-reads-before-writes::call':
    'ARTIFACT: only reached via `runTransaction?.()` / `transaction.set?.()`',
  'flatten-push-calls::call':
    'CORRECT: `arr.push?.(a); arr.push?.(b)` is a mixed group, and `arr.push?.(a, b)` is not equivalent to the pair',
  'flatten-push-calls::member':
    'CORRECT: `arr?.push(a); arr?.push(b)` is a mixed group, and `arr?.push(a, b)` is not equivalent to the pair',
  'global-const-style::call':
    'ARTIFACT: only reached via `memo?.()` / `forwardRef?.()`',
  'global-const-style::member': 'ARTIFACT: only reached via `React?.memo`',
  'memo-compare-deeply-complex-props::call':
    'ARTIFACT: only reached via `memo<any, Props>?.(Comp)`, an optional call on the React memo binding',
  'memo-compare-deeply-complex-props::member':
    'ARTIFACT: only reached via `React?.forwardRef`, an optional link on the namespace import',
  'memo-nested-react-components::call':
    'ARTIFACT: only reached via `describe?.()` / `it?.()`',
  'memo-nested-react-components::member':
    'ARTIFACT: only reached via `it?.each`',
  'no-always-true-false-conditions::call':
    'CORRECT: `?.` introduces a nullish branch, so a condition that was statically decidable no longer is',
  'no-always-true-false-conditions::member':
    'CORRECT: `?.` introduces a nullish branch, so a condition that was statically decidable no longer is',
  'no-complex-cloud-params::call':
    'ARTIFACT: only reached via a hook/global callee',
  'no-complex-cloud-params::member':
    'ARTIFACT: only reached via an optional link on a payload receiver nobody writes optional',
  'no-console-error::call':
    'ARTIFACT: only reached via an optional hook callee',
  'no-direct-function-state::call':
    'ARTIFACT: residue of #1824 — the argument readers are fixed; only `useState<T>?.(...)`, an optional hook call, remains',
  'no-empty-dependency-use-callbacks::call':
    'ARTIFACT: only reached via `useCallback?.()`',
  'no-excessive-parent-chain::member':
    'CORRECT-ISH: `event?.data` is unreachable — the four BluMint wrapper types this rule targets instantiate the data generic without `| undefined`, so strict TS never forces the optional link (refuted #1832-era triage)',
  'no-fill-template-mutation::call':
    'ARTIFACT: only reached via `fillTemplate?.()`',
  'no-fill-template-mutation::member':
    'ARTIFACT: only reached via `ns?.fillTemplate` on a namespace import',
  'no-handler-suffix::member':
    'ARTIFACT: only reached via `External?.Handler` in a type-ish position',
  'no-hungarian::call':
    'ARTIFACT: only reached via `Symbol?.(...)`, an optional call on the global',
  'no-inline-component-prop::call':
    'ARTIFACT: only reached via `React.forwardRef<T, P>?.(render)`, an optional call on forwardRef',
  'no-jsx-in-hooks::call': 'ARTIFACT: only reached via a hook callee',
  'no-margin-properties::call':
    'ARTIFACT: only reached via `Object.assign?.()`',
  'no-margin-properties::member': 'ARTIFACT: only reached via `Object?.assign`',
  'no-object-values-on-strings::call':
    'DEFECT TODO(#NNNN — filed from the #1859 widening): the blindness is on the ARGUMENT, not the callee. `Object.values("x".toUpperCase?.())` and the writable `Object.values(s?.toUpperCase())` both go silent, while `Object.values?.(...)` and `Object?.values(...)` still report — so the argument reader misses a ChainExpression',
  'no-object-values-on-strings::member':
    'DEFECT TODO(#NNNN — filed from the #1859 widening): same argument reader as the call arm; `Object.values("x"?.toUpperCase())` goes silent',
  'no-passthrough-getters::member':
    'DEFECT TODO(#NNNN — filed from the #1859 widening): `private get x() { return this.settings?.x; }` — the idiomatic spelling for an optional field — is not seen as a passthrough, while `this.settings.x` is',
  'no-redundant-this-params::member':
    'ARTIFACT: only reached via `this?.value` / `this?.method`',
  'no-redundant-usecallback-wrapper::call':
    'CORRECT: `useCallback(() => f?.(), [f])` is not equivalent to passing `f`, which is undefined when f is nullish',
  'no-redundant-usecallback-wrapper::member':
    'CORRECT: `useCallback(() => svc?.handle(), [])` is not equivalent to passing `svc.handle`, which throws when svc is nullish',
  'no-separate-loading-state::call':
    'ARTIFACT: only reached via `useState?.()`',
  'no-stale-state-across-await::call':
    'ARTIFACT: only reached via `useState?.()`',
  'no-undefined-null-passthrough::call':
    'ARTIFACT: only reached via an imported transform callee',
  'no-undefined-null-passthrough::member':
    'ARTIFACT: only reached via `Object?.keys`',
  'no-unsafe-firestore-spread::call':
    'ARTIFACT: only reached via `[...arr].filter?.()` / `ref.set?.()`; every realistic chain — `[...props?.tags].filter(f)`, `[...(props?.tags ?? [])]`, `userDoc?.ref?.set` — still reports',
  'no-unsafe-firestore-spread::member':
    'ARTIFACT: only reached via `[...arr]?.filter()`, an optional link on an array literal, which is never nullish',
  'no-unused-usestate::call': 'ARTIFACT: only reached via `useState?.()`',
  'optimize-object-boolean-conditions::call':
    'ARTIFACT: only reached via `useState?.()` / `useMemo?.()`',
  'optimize-object-boolean-conditions::member':
    'ARTIFACT: only reached via `React?.useState`',
  'prefer-destructuring-no-class::member':
    'CORRECT: `const { name } = user` throws when `user` is nullish, so the remedy is not equivalent to `user?.name`',
  'prefer-map-over-conditional-dispatch::member':
    'DEFECT TODO(#NNNN — filed from the #1859 widening): a switch that NARROWS its union is correctly silent on `switch (result.kind)` and reports `preferMapManual` ("a collision-free lookup name could not be derived") on `switch (result?.kind)`. The remedy it then urges breaks the narrowing that `result.data` depends on, and the nullable discriminant is the case where `?.` is written',
  'prefer-next-dynamic::call': 'ARTIFACT: only reached via `useDynamic?.()`',
  'prefer-nullish-coalescing-boolean-props::call':
    'ARTIFACT: only reached via `useState?.(a || b)`, an optional call on the hook that carries the exemption',
  'prefer-use-base62-id::call': 'ARTIFACT: only reached via `uuidv4Base62?.()`',
  'prefer-use-deep-compare-memo::call':
    'ARTIFACT: only reached via `useMemo?.(factory, deps)`, an optional call on the hook',
  'prefer-usecallback-over-usememo-for-functions::call':
    'ARTIFACT: only reached via `useMemo?.()`',
  'prefer-usememo-over-useeffect-usestate::call':
    'ARTIFACT: only reached via `useState?.()` / `useEffect?.()`',
  'react-usememo-should-be-component::call':
    'ARTIFACT: only reached via `useMemo?.()`',
  'require-props-composition::call': 'ARTIFACT: only reached via `memo?.()`',
  'use-latest-callback::call': 'ARTIFACT: only reached via `useCallback?.()`',
  'use-latest-callback::member':
    'ARTIFACT: only reached via `React?.useCallback`',
  'warn-https-error-message-user-friendly::call':
    'ARTIFACT: only reached via a single-letter local callee written optional',
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
    case 'Property':
      // A `Property` is a binding target only inside an `ObjectPattern`. Inside
      // an `ObjectExpression` its value is an ordinary expression slot — and
      // the most common one in this corpus, since every options bag, props
      // object and Firestore payload is written that way. Treating the two
      // alike withheld that whole shape from the sweep rather than avoiding a
      // syntax error, which is how #1836's regression stayed invisible here.
      // A computed key is an ordinary expression in either parent.
      return parentOf(parent)?.type === 'ObjectPattern' && slotIs('value');
    case 'AssignmentPattern':
      // `left` is the binding target; `right` is the default, an ordinary
      // expression that may be optional-chained.
      return slotIs('left');
    case 'Decorator':
    case 'ArrayPattern':
    case 'ObjectPattern':
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

/**
 * Exemptions are keyed on the ARM, not on the rule.
 *
 * Three of the entries below exist because a rule was fixed on one arm and
 * still diverges on a residual spelling on the other. A rule-keyed map exempts
 * the fixed arm too, so reverting that fix reintroduced the defect with this
 * file fully green — measured for #1824, #1825 and #1826, whose fixes were all
 * on `member` while their residues are all on `call` (#1839).
 */
const pairKey = (rule: string, arm: Arm) => `${rule}::${arm}`;

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

/**
 * Only rules that measurably report NOTHING under this harness are excluded —
 * currently none. The wider "mentions the type checker" set was excluded before
 * on the theory that a bare `Linter` builds no program; it builds an isolated
 * single-file one, and all 16 of those rules report over their own fixtures, so
 * the exclusion suppressed live coverage rather than a false clean (#1859).
 */
const guardedRuleNames = [...ruleByName.keys()]
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .sort();

describe('optional-chaining closure', () => {
  const corpus = harvestFixtureCorpus();

  const divergences: Divergence[] = [];
  const divergentPairs = new Set<string>();
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

          divergentPairs.add(pairKey(rule, arm));
          // One example PER RULE+ARM, not the first N overall: a flat cap lets
          // a chatty rule crowd out every example for a quiet one, and the
          // failure message then names a pair it cannot illustrate.
          if (
            !divergences.some(
              (existing) => existing.rule === rule && existing.arm === arm,
            )
          ) {
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
    expect(rulesReporting.size).toBeGreaterThan(170);
    expect(casesWithBaselineReports).toBeGreaterThan(6500);
    expect(rulesPerturbed.size).toBeGreaterThan(155);
    expect(sitesRewritten).toBeGreaterThan(26000);
    expect(casesConsidered).toBeGreaterThan(13200);
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
    const unexpected = [...divergentPairs]
      .filter((key) => !(key in KNOWN_DIVERGENT))
      .sort();

    if (unexpected.length) {
      const detail = unexpected
        .map((key) => {
          const example = divergences.find(
            (d) => pairKey(d.rule, d.arm) === key,
          );
          return [
            `  ${key} (${example?.bucket} fixture from ${example?.origin})`,
            `    ${example?.before}  ->  ${example?.after}`,
            `    input:   ${example?.input.replace(/\s+/g, ' ').slice(0, 160)}`,
            `    variant: ${example?.output
              .replace(/\s+/g, ' ')
              .slice(0, 160)}`,
          ].join('\n');
        })
        .join('\n');
      throw new Error(
        `${unexpected.length} rule/arm pair(s) change their verdict when a receiver is written with \`?.\`.\n` +
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
      .filter((key) => !divergentPairs.has(key))
      .sort();
    expect({ stale }).toEqual({ stale: [] });
  });

  /**
   * The expression slots a pattern-shaped context test can wrongly swallow.
   *
   * Asserted here rather than left to the corpus floors, because the floors
   * cannot see this: restoring the blanket `Property` skip removes 901 of
   * ~27000 sites, which still clears any floor loose enough to survive corpus
   * churn. The withheld shape read as "nothing to perturb" instead of as lost
   * coverage, and it hid #1836's regression plus two live divergences (#1839).
   */
  it('perturbs an expression slot that sits beside a binding target', () => {
    const cases: [string, Arm, string][] = [
      // Object-literal values: where every options bag, props object and
      // Firestore payload puts its expressions.
      ['({ key: a.b });', 'member', '({ key: a?.b });'],
      ['({ key: f(1) });', 'call', '({ key: f?.(1) });'],
      ['const o = { m: x.y };', 'member', 'const o = { m: x?.y };'],
      [
        'useRouterState({ key: k.u });',
        'member',
        'useRouterState({ key: k?.u });',
      ],
      // A default is an ordinary expression, in a pattern or a parameter list.
      ['function g(a = d.e) {}', 'member', 'function g(a = d?.e) {}'],
      ['const { a = d.e } = x;', 'member', 'const { a = d?.e } = x;'],
      // A computed key is an ordinary expression under either parent.
      ['({ [k.n]: 1 });', 'member', '({ [k?.n]: 1 });'],
      // ...while the binding targets beside them stay untouched, since `?.` is
      // a syntax error in a destructuring position.
      ['const { a } = obj;', 'member', 'const { a } = obj;'],
      ['const { a: b } = obj;', 'member', 'const { a: b } = obj;'],
      ['const [x] = arr;', 'member', 'const [x] = arr;'],
      ['({ a: b.c } = x);', 'member', '({ a: b.c } = x);'],
    ];
    for (const [code, arm, expected] of cases) {
      const ast = astOf(code, false);
      expect({
        code,
        arm,
        output: ast && applySites(code, sitesOf(code, ast, arm)),
      }).toEqual({ code, arm, output: expected });
    }
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
      // Property/AssignmentPattern slots: an expression position in an object
      // literal or a default is perturbable, the binding target beside it is not.
      '({ key: a.b });',
      'const o = { m: x.y, n: f(1) };',
      '({ a: b.c } = x);',
      'const { a = d.e } = x;',
      'function g(a = d.e) {}',
      'const { [k.n]: v } = x;',
      '({ [k.n]: 1 });',
      'const [{ p }] = arr;',
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
