/**
 * The `--fix` channel `cross-option-crash-closure` does not have.
 *
 * That guard drives ~218k (non-default option payload x foreign fixture) pairs,
 * but its oracle is a THROW. Its header argues a REPORT oracle "would be almost
 * entirely noise" on foreign code, which is true and is why it declines one —
 * but the argument never covered the FIX channel, and it has none.
 *
 * Every fix-quality oracle in the suite runs at DEFAULT options:
 * `fix-core-violation-closure`, `composed-fix-core-violation-closure` and
 * `fix-closure-core-rules` (core violations), `restricted-production-closure`
 * (LineTerminator breaches), `comment-fix-fidelity` and
 * `cross-comment-fidelity-closure` (comment loss), `fix-fixpoint-closure`
 * (fatal/oscillation). So nothing asks whether a consumer-settable option makes
 * a fixer write BROKEN text — and 35 rules are both optioned and fixable, i.e.
 * a documented option sends a shipped autofixer down a path no fix-quality gate
 * exercises.
 *
 * `option-liveness-closure` is a different question: it proves an option
 * CHANGES output, never that the changed output is valid.
 *
 * **The noise objection is answered by the differential.** A finding is not
 * "the output differed" — an option is supposed to change output. A finding is
 * "the payload arm's output is broken in a way the DEFAULT arm's output is
 * not", which is a defect however legitimately the option changed behaviour.
 *
 * **Own-corpus pairs carry this sweep.** Restricted to foreign fixtures the
 * reachable differential population collapses from 6,923 pairs to 2, because a
 * rule is silent on nearly all foreign code; a foreign-only sweep would be very
 * nearly vacuous. The rule's own fixtures are where its fixer actually runs, and
 * no guard checks that corpus under a non-default payload either.
 */
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  defaultFilenameFor,
  FixtureCase,
} from '../utils/fixtureCorpus';
import { restrictedProductionBreaches } from '../utils/restrictedProductions';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as { rules: Record<string, any> };
/**
 * A bare `Linter` does not validate options against `meta.schema`, so a payload
 * real ESLint would REJECT manufactures breakage no consumer can reach. This is
 * ESLint's own validator, borrowed for the same reason and from the same place
 * `cross-option-crash-closure` borrows it.
 */
const eslintLib = require('path').dirname(require.resolve('eslint'));
const { getRuleOptionsSchema } = require(eslintLib +
  '/config/flat-config-helpers.js');
const ajvFactory = require(eslintLib + '/shared/ajv.js');
/* eslint-enable @typescript-eslint/no-var-requires */

const ajv = ajvFactory({ strictDefaults: true });
const PREFIX = '@blumintinc/blumint/';

/** Foreign fixtures probed per (payload, owning suite): one huge corpus would
 *  dominate without adding shape diversity. Own-corpus pairs are uncapped. */
const CAP = 2;

/**
 * The four core rules hardcoded in four sibling guards, plus the `no-unused-vars`
 * entry two of them carry. `no-undef` is deliberately absent for the reason they
 * all give: with no `env`, every ambient global reads as undefined, which is an
 * artefact rather than a finding.
 */
const CORE_RULES: Linter.RulesRecord = {
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
};

const schemaOf = (rule: any): any[] => {
  const schema = rule?.meta?.schema;
  if (!schema) return [];
  return Array.isArray(schema) ? schema : [schema];
};

/** Non-default values a property of this shape can legally take. */
const valuesFor = (prop: any): unknown[] => {
  if (!prop || typeof prop !== 'object') return [];
  if (Array.isArray(prop.enum)) return prop.enum.slice(0, 3);
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  if (type === 'boolean') return [true, false];
  if (type === 'number' || type === 'integer') return [0, 1];
  if (type === 'string') return ['x'];
  if (type === 'array') {
    const itemType = Array.isArray(prop.items?.type)
      ? prop.items.type[0]
      : prop.items?.type;
    if (itemType === 'string') return [[], ['x']];
    if (itemType === 'number' || itemType === 'integer') return [[], [1]];
    if (itemType === 'object') return [[], [{}]];
    return [[]];
  }
  if (type === 'object') return [{}];
  return [];
};

type Payload = { key: string; options: readonly unknown[]; source: string };

const payloadsFor = (rule: any, cases: FixtureCase[]): Payload[] => {
  const out: Payload[] = [];
  const seen = new Set<string>();
  const add = (options: readonly unknown[], source: string) => {
    const key = JSON.stringify(options);
    if (key === '[]' || seen.has(key)) return;
    seen.add(key);
    out.push({ key, options, source });
  };
  // Every payload the rule's own author actually wrote.
  for (const testCase of cases) {
    if (testCase.options && testCase.options.length) {
      add(testCase.options, 'fixture');
    }
  }
  // Legal against nearly every schema here, and the shape an unguarded
  // destructuring read of the options array behaves worst on.
  add([{}], 'empty-object');
  const head = schemaOf(rule)[0];
  const properties = head?.properties;
  if (properties && typeof properties === 'object') {
    const all: Record<string, unknown> = {};
    for (const [prop, propSchema] of Object.entries<any>(properties)) {
      for (const value of valuesFor(propSchema)) {
        add([{ [prop]: value }], 'prop:' + prop);
      }
      const first = valuesFor(propSchema)[0];
      if (first !== undefined) all[prop] = first;
    }
    if (Object.keys(all).length > 1) add([all], 'all-props');
  }
  if (head && !properties)
    for (const value of valuesFor(head)) add([value], 'head');
  return out;
};

const validatorFor = (rule: any): ((o: unknown[]) => boolean) | null => {
  const schema = getRuleOptionsSchema(rule);
  if (!schema) return null;
  return ajv.compile(schema);
};

/**
 * Marker for the comment-fidelity arm. Asserted absent from every fixture's own
 * source below: a token a fixture already contains cannot distinguish "the
 * fixer preserved mine" from "the fixture had one anyway".
 */
const MARKER = 'optFixProbe';

type Finding = {
  rule: string;
  payload: string;
  payloadSource: string;
  owner: string;
  origin: string;
  bucket: string;
  filename: string;
  kind: string;
  detail: string;
};

type Totals = {
  rulesProbed: number;
  payloadsBuilt: number;
  payloadsSchemaValid: number;
  payloadsRejected: number;
  pairsConsidered: number;
  pairsBothSilent: number;
  pairsLinted: number;
  pairsPayloadFixed: number;
  pairsDefaultFixed: number;
  pairsOutputDiffered: number;
  ownPairsOutputDiffered: number;
  pairsOriginalFatal: number;
  pairsThrew: number;
  commentProbesBuilt: number;
  commentProbesNeutral: number;
  commentSkippedNotNeutral: number;
  commentSkippedNoAnchor: number;
  commentSkippedUnparsable: number;
  commentBothLost: number;
  commentBothKept: number;
};

const emptyTotals = (): Totals => ({
  rulesProbed: 0,
  payloadsBuilt: 0,
  payloadsSchemaValid: 0,
  payloadsRejected: 0,
  pairsConsidered: 0,
  pairsBothSilent: 0,
  pairsLinted: 0,
  pairsPayloadFixed: 0,
  pairsDefaultFixed: 0,
  pairsOutputDiffered: 0,
  ownPairsOutputDiffered: 0,
  pairsOriginalFatal: 0,
  pairsThrew: 0,
  commentProbesBuilt: 0,
  commentProbesNeutral: 0,
  commentSkippedNotNeutral: 0,
  commentSkippedNoAnchor: 0,
  commentSkippedUnparsable: 0,
  commentBothLost: 0,
  commentBothKept: 0,
});

/**
 * Controls, driven by the SAME sweep below rather than a bespoke harness: a
 * control validated against its own inline `Linter` proves only that ESLint
 * works, not that this file's oracle wiring, payload builder and schema screen
 * are connected to notice.
 */
const mkControl = (
  breakFn: (text: string) => string,
  benign: (text: string) => string,
  target: string,
) => ({
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    docs: { description: 'control', recommended: 'error' as const },
    schema: [
      {
        type: 'object',
        properties: { breaks: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: { ctl: 'control' },
  },
  defaultOptions: [{ breaks: false }],
  create(context: any) {
    const breaks = (context.options[0] || {}).breaks === true;
    const src = context.getSourceCode();
    let done = 0;
    return {
      [target](node: any) {
        if (done >= 1) return;
        done++;
        const text = src.getText(node);
        const next = breaks ? breakFn(text) : benign(text);
        if (next === text) return;
        context.report({
          node,
          messageId: 'ctl',
          fix: (fixer: any) => fixer.replaceText(node, next),
        });
      },
    };
  },
});

const CONTROL_RULES: Record<string, any> = {
  '__ctl-fatal': mkControl(
    (t) => '{' + t,
    (t) => '/*c*/' + t,
    'ObjectExpression',
  ),
  '__ctl-core': mkControl(
    (t) => {
      const m = /^\{\s*([A-Za-z_$][\w$]*)\s*:/.exec(t);
      if (!m) return t;
      return t.replace(/\}\s*$/, ', ' + m[1] + ': 0 }');
    },
    (t) => '/*c*/' + t,
    'ObjectExpression',
  ),
  // The parser ACCEPTS a LineTerminator after `throw`, so the fatal arm is
  // structurally blind to this one; it exists to prove the third oracle runs.
  '__ctl-restricted': mkControl(
    (t) => t.replace(/^throw\s+/, 'throw\n'),
    (t) => t.replace(/^throw\s+/, 'throw /*c*/ '),
    'ThrowStatement',
  ),
  // A fix range anchored so it swallows a neighbouring comment: the shape of
  // #2208, and the only control that exercises the comment arm.
  '__ctl-comment': {
    meta: {
      type: 'suggestion' as const,
      fixable: 'code' as const,
      docs: { description: 'control', recommended: 'error' as const },
      schema: [
        {
          type: 'object',
          properties: { breaks: { type: 'boolean' } },
          additionalProperties: false,
        },
      ],
      messages: { ctl: 'control' },
    },
    defaultOptions: [{ breaks: false }],
    create(context: any) {
      const breaks = (context.options[0] || {}).breaks === true;
      const src = context.getSourceCode();
      let done = 0;
      return {
        ObjectExpression(node: any) {
          if (done >= 1) return;
          done++;
          context.report({
            node,
            messageId: 'ctl',
            fix(fixer: any) {
              if (!breaks) return fixer.insertTextBefore(node, '/*d*/ ');
              const fixes = [fixer.insertTextBefore(node, '/*p*/ ')];
              for (const c of src.getCommentsBefore(node))
                fixes.push(fixer.remove(c));
              return fixes;
            },
          });
        },
      };
    },
  },
  // Changes the fix output under its payload while keeping it valid. Must stay
  // silent, or every "finding" above is just the differential firing.
  '__ctl-negative': mkControl(
    (t) => '/*aaa*/' + t,
    (t) => '/*b*/' + t,
    'ObjectExpression',
  ),
};

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule);
}
for (const [name, rule] of Object.entries(CONTROL_RULES)) {
  linter.defineRule(PREFIX + name, rule);
}

const baseConfig = (tc: FixtureCase) => ({
  parser: parserKeyFor(tc),
  parserOptions: parserOptionsFor(tc),
});

const configFor = (
  tc: FixtureCase,
  ruleId: string,
  options: readonly unknown[] | null,
) => ({
  ...baseConfig(tc),
  rules: {
    [ruleId]: (options && options.length
      ? ['error', ...options]
      : 'error') as any,
  },
});

const isFatal = (text: string, tc: FixtureCase, filename: string): boolean => {
  try {
    return linter
      .verify(text, { ...baseConfig(tc), rules: {} } as any, filename)
      .some((m) => m.fatal);
  } catch {
    return true;
  }
};

/** Counts are filtered by `ruleId` first: a "rule not found" row reads as both
 *  silence and inflation depending on which side you count it on. */
const coreCounts = (
  text: string,
  tc: FixtureCase,
  filename: string,
): Record<string, number> | null => {
  let messages: Linter.LintMessage[];
  try {
    messages = linter.verify(
      text,
      { ...baseConfig(tc), rules: CORE_RULES } as any,
      filename,
    );
  } catch {
    return null;
  }
  if (messages.some((m) => m.fatal)) return null;
  const out: Record<string, number> = {};
  for (const m of messages) {
    if (!m.ruleId || !(m.ruleId in CORE_RULES)) continue;
    out[m.ruleId] = (out[m.ruleId] || 0) + 1;
  }
  return out;
};

const risen = (
  before: Record<string, number> | null,
  after: Record<string, number> | null,
): string[] => {
  if (!before || !after) return [];
  return Object.keys(after)
    .filter((id) => (after[id] || 0) > (before[id] || 0))
    .sort();
};

/** `null` means "could not parse", which callers must treat as abstention
 *  rather than as "no breaches". */
const breachCount = (text: string): number | null => {
  const b = restrictedProductionBreaches(text);
  return b === null ? null : b.length;
};

const insertMarkerBefore = (code: string, line: number): string | null => {
  const lines = code.split('\n');
  if (line < 1 || line > lines.length) return null;
  const indent = /^\s*/.exec(lines[line - 1])?.[0] ?? '';
  lines.splice(line - 1, 0, indent + '// ' + MARKER);
  return lines.join('\n');
};

/**
 * Present as TEXT is not enough — a marker can be absorbed into a string
 * literal or another comment's body, which reads as survival while the comment
 * is gone. Require it inside a parsed comment.
 */
const markerLive = (text: string, tc: FixtureCase): boolean => {
  if (!text.includes(MARKER)) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parser = require('@typescript-eslint/parser');
    const ast = parser.parse(text, {
      ...(parserOptionsFor(tc) as any),
      comment: true,
      loc: true,
      range: true,
    });
    return (ast.comments || []).some((c: any) => c.value.includes(MARKER));
  } catch {
    return false;
  }
};

type OwnedCase = { owner: string; testCase: FixtureCase };

const sweep = (
  rulesUnderTest: Record<string, any>,
  allCases: OwnedCase[],
  ownCasesOf: (name: string) => FixtureCase[],
): { totals: Totals; findings: Finding[] } => {
  const totals = emptyTotals();
  const findings: Finding[] = [];

  for (const [name, rule] of Object.entries(rulesUnderTest)) {
    if (!schemaOf(rule).length) continue;
    if (!rule?.meta?.fixable) continue;

    const ruleId = PREFIX + name;
    const payloads = payloadsFor(rule, ownCasesOf(name));
    totals.payloadsBuilt += payloads.length;

    const validate = validatorFor(rule);
    const valid: Payload[] = [];
    for (const p of payloads) {
      if (validate && !validate(p.options as unknown[])) {
        totals.payloadsRejected++;
        continue;
      }
      valid.push(p);
    }
    totals.payloadsSchemaValid += valid.length;
    if (!valid.length) continue;
    totals.rulesProbed++;

    const used = new Map<string, number>();

    for (const { owner, testCase } of allCases) {
      const isOwn = owner === name;
      const filename = defaultFilenameFor(testCase);

      // The default arm is a property of (rule, fixture), not of the payload,
      // so it is computed at most once however many payloads follow.
      let defaultDone = false;
      let defaultOut = '';
      let defaultFixed = false;
      let defaultSilent = false;
      const runDefault = (): boolean => {
        if (defaultDone) return true;
        defaultDone = true;
        try {
          defaultSilent =
            linter.verify(
              testCase.code,
              configFor(testCase, ruleId, null) as any,
              filename,
            ).length === 0;
          const r = linter.verifyAndFix(
            testCase.code,
            configFor(testCase, ruleId, null) as any,
            filename,
          );
          defaultOut = r.output;
          defaultFixed = r.fixed === true;
        } catch {
          return false;
        }
        return true;
      };

      for (const payload of valid) {
        if (!isOwn) {
          const capKey = payload.key + ' ' + owner;
          const count = used.get(capKey) || 0;
          if (count >= CAP) continue;
          used.set(capKey, count + 1);
        }
        totals.pairsConsidered++;

        let payloadMsgs: Linter.LintMessage[];
        try {
          payloadMsgs = linter.verify(
            testCase.code,
            configFor(testCase, ruleId, payload.options) as any,
            filename,
          );
        } catch {
          totals.pairsThrew++;
          continue;
        }

        if (!runDefault()) {
          totals.pairsThrew++;
          continue;
        }
        if (payloadMsgs.length === 0 && defaultSilent) {
          totals.pairsBothSilent++;
          continue;
        }
        totals.pairsLinted++;

        let payloadOut = '';
        try {
          const r = linter.verifyAndFix(
            testCase.code,
            configFor(testCase, ruleId, payload.options) as any,
            filename,
          );
          payloadOut = r.output;
          if (r.fixed === true) totals.pairsPayloadFixed++;
        } catch {
          totals.pairsThrew++;
          continue;
        }
        if (defaultFixed) totals.pairsDefaultFixed++;

        // No option-induced difference means nothing for this guard to judge.
        if (payloadOut === defaultOut) continue;
        totals.pairsOutputDiffered++;
        if (isOwn) totals.ownPairsOutputDiffered++;

        // A fixture that does not parse would hand every oracle below its own
        // breakage to report.
        if (isFatal(testCase.code, testCase, filename)) {
          totals.pairsOriginalFatal++;
          continue;
        }

        const push = (kind: string, detail: string) =>
          findings.push({
            rule: name,
            payload: payload.key,
            payloadSource: payload.source,
            owner,
            origin: testCase.origin,
            bucket: testCase.bucket,
            filename,
            kind: (isOwn ? 'OWN:' : 'FOREIGN:') + kind,
            detail,
          });

        const payloadFatal = isFatal(payloadOut, testCase, filename);
        const defaultFatal = isFatal(defaultOut, testCase, filename);
        if (payloadFatal && !defaultFatal) {
          push('FATAL', 'payload arm output no longer parses');
          continue;
        }
        if (payloadFatal) continue;

        const baseCore = coreCounts(testCase.code, testCase, filename);
        const payloadRise = risen(
          baseCore,
          coreCounts(payloadOut, testCase, filename),
        );
        const defaultRise = defaultFatal
          ? []
          : risen(baseCore, coreCounts(defaultOut, testCase, filename));
        const coreOnly = payloadRise.filter((r) => !defaultRise.includes(r));
        if (coreOnly.length) push('CORE', coreOnly.join(','));

        const baseB = breachCount(testCase.code);
        const payloadB = breachCount(payloadOut);
        const defaultB = defaultFatal ? null : breachCount(defaultOut);
        if (baseB !== null && payloadB !== null && payloadB > baseB) {
          if (!(defaultB !== null && defaultB > baseB)) {
            push('RESTRICTED', `breaches ${baseB} -> ${payloadB}`);
          }
        }

        // Comment fidelity, anchored on a line THIS rule reports. ESLint's
        // "Definition for rule was not found" row sits on a directive comment,
        // so perturbing an arbitrary line can silently withdraw a suppression.
        const ownReports = payloadMsgs.filter(
          (m) => m.ruleId === ruleId && !m.fatal,
        );
        if (!ownReports.length) {
          totals.commentSkippedNoAnchor++;
          continue;
        }
        const perturbed = insertMarkerBefore(testCase.code, ownReports[0].line);
        if (perturbed === null) {
          totals.commentSkippedNoAnchor++;
          continue;
        }
        if (isFatal(perturbed, testCase, filename)) {
          totals.commentSkippedUnparsable++;
          continue;
        }
        totals.commentProbesBuilt++;

        let payloadPerturbed: Linter.FixReport;
        let defaultPerturbed: Linter.FixReport;
        let perturbedMsgs: Linter.LintMessage[];
        try {
          perturbedMsgs = linter.verify(
            perturbed,
            configFor(testCase, ruleId, payload.options) as any,
            filename,
          );
          payloadPerturbed = linter.verifyAndFix(
            perturbed,
            configFor(testCase, ruleId, payload.options) as any,
            filename,
          );
          defaultPerturbed = linter.verifyAndFix(
            perturbed,
            configFor(testCase, ruleId, null) as any,
            filename,
          );
        } catch {
          totals.commentSkippedUnparsable++;
          continue;
        }

        // Inserting the marker must not change what the rule reports, or the
        // two arms are no longer comparable.
        const stillReports = perturbedMsgs.filter(
          (m) => m.ruleId === ruleId && !m.fatal,
        ).length;
        if (stillReports !== ownReports.length) {
          totals.commentSkippedNotNeutral++;
          continue;
        }
        totals.commentProbesNeutral++;

        const keptPayload = markerLive(payloadPerturbed.output, testCase);
        const keptDefault = markerLive(defaultPerturbed.output, testCase);
        if (keptPayload && keptDefault) totals.commentBothKept++;
        else if (!keptPayload && !keptDefault) totals.commentBothLost++;
        else if (!keptPayload && keptDefault) {
          push(
            'COMMENT',
            'marker survives at default options, eaten under payload',
          );
        }
      }
    }
  }
  return { totals, findings };
};

const corpus = harvestFixtureCorpus();
const allCases: OwnedCase[] = [];
for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) allCases.push({ owner, testCase });
}
const ownCasesOf = (name: string) => corpus.byRule.get(name) || [];

describe('cross-option --fix closure', () => {
  it('has a corpus that cannot already contain the fidelity marker', () => {
    const polluted = allCases.filter(({ testCase }) =>
      testCase.code.includes(MARKER),
    );
    expect(polluted).toEqual([]);
    expect(allCases.length).toBeGreaterThanOrEqual(20_000);
  });

  it('trips every oracle on a fixer that breaks only under its payload', () => {
    const { totals, findings } = sweep(CONTROL_RULES, allCases, () => []);
    const byKind: Record<string, number> = {};
    for (const f of findings) {
      const kind = f.kind.replace(/^(OWN|FOREIGN):/, '');
      byKind[kind] = (byKind[kind] || 0) + 1;
    }

    // Each oracle must be independently live. Floors sit just under measured
    // (144 / 69 / 11 / 4) so a control that stops firing is loud.
    expect(byKind.FATAL || 0).toBeGreaterThanOrEqual(100);
    expect(byKind.CORE || 0).toBeGreaterThanOrEqual(45);
    expect(byKind.RESTRICTED || 0).toBeGreaterThanOrEqual(8);
    expect(byKind.COMMENT || 0).toBeGreaterThanOrEqual(3);

    // The negative control changes the fix output but keeps it valid. If it
    // reported, every finding above would just be the differential firing.
    expect(findings.filter((f) => f.rule === '__ctl-negative')).toEqual([]);

    // The controls must have reached the differential at all.
    expect(totals.pairsOutputDiffered).toBeGreaterThanOrEqual(300);
    expect(totals.commentProbesNeutral).toBeGreaterThanOrEqual(200);
  }, 600_000);

  it('lets no option payload make a fixer write broken output', () => {
    const { totals, findings } = sweep(plugin.rules, allCases, ownCasesOf);

    expect(
      findings.map(
        (f) =>
          `${f.rule} [${f.kind}] payload=${f.payload} (${f.payloadSource}) ` +
          `owner=${f.owner} origin=${f.origin}/${f.bucket} :: ${f.detail}`,
      ),
    ).toEqual([]);

    // Floors cut just under each measured value, so a sweep that silently
    // stopped reaching the population fails rather than passing empty.
    expect(totals.rulesProbed).toBeGreaterThanOrEqual(30); // 35
    expect(totals.payloadsSchemaValid).toBeGreaterThanOrEqual(240); // 270
    expect(totals.pairsConsidered).toBeGreaterThanOrEqual(140_000); // 158,719
    expect(totals.pairsLinted).toBeGreaterThanOrEqual(35_000); // 40,209
    expect(totals.pairsPayloadFixed).toBeGreaterThanOrEqual(16_000); // 18,412
    // The one that proves the options are not inert decoration.
    expect(totals.pairsOutputDiffered).toBeGreaterThanOrEqual(6_000); // 6,923
    // Own-corpus pairs are 4,553 of those; a foreign-only sweep leaves 2.
    expect(totals.ownPairsOutputDiffered).toBeGreaterThanOrEqual(4_000);
    expect(totals.commentProbesNeutral).toBeGreaterThanOrEqual(5_000); // 5,929

    // What the sweep DISCARDS is asserted too: a skip counter no expectation
    // reads is how a population leaves silently.
    expect(totals.pairsThrew).toBeLessThanOrEqual(10); // 0
    expect(totals.pairsOriginalFatal).toBeLessThanOrEqual(50); // 0
    expect(totals.commentSkippedNotNeutral).toBeLessThanOrEqual(100); // 10
    expect(totals.commentSkippedUnparsable).toBeLessThanOrEqual(100); // 7
    expect(totals.commentSkippedNoAnchor).toBeLessThanOrEqual(2_000); // 977
    // Payloads the rule's own schema refused, of 298 built. Rejection is
    // correct where a generated payload is not valid for that rule, but the
    // count is the only evidence it stays incidental: a schema read that
    // started refusing wholesale would shrink the swept population to
    // nothing while every floor above still passed on what remained.
    expect(totals.payloadsRejected).toBeLessThanOrEqual(50); // 25
  }, 900_000);
});
