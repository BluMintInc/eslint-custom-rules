import { Linter } from 'eslint';
import { harvestRuleTesterCases } from '../utils/harvestRuleTesterCases';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: { messages?: Record<string, string> } }>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

const PREFIX = '@blumintinc/blumint/';

/**
 * A message that says "Instead of `X`, do `Y`" asserts that `X` is something
 * this rule reports. When it is not, the message is wrong in the dangerous
 * direction: the developer flagged on the shape the rule *does* catch reads the
 * remedy, finds `X` sitting in it, rewrites into `X`, and the report clears
 * while the code gets worse. #1611, #1612 and #1613 were all this shape — two
 * path-utils rules whose messages named a string concatenation their own gate
 * rejected, and whose remedy text used a bare callee the rule cannot match.
 *
 * `docs-examples-conformance` deliberately declines the mirror assertion for
 * documented "incorrect" blocks, because those are context-dependent fragments
 * and requiring them to fire produces false alarms. That reasoning does not
 * carry over here only because the population is tiny — a handful of spans
 * across the whole plugin — so each one that needs surrounding context can be
 * given it by name in SPAN_POLICY rather than waved through.
 *
 * SECOND HALF — REMEDY POLARITY. "Instead of `X`, use `Y`" makes two claims,
 * and everything above checks only the first. The second is that `Y` — the
 * spelling the message tells the developer to WRITE — is silent under the rule
 * that named it. A rule that reports on its own remedy gives advice that cannot
 * be followed: the developer does exactly what the message says and the same
 * rule fires again, which is worse than a vague message because it is
 * confidently wrong.
 *
 * SCOPE, measured rather than assumed. 117 backticked spans sit across the
 * plugin's `meta.messages`; the negative half claims 9 and this half claims 30,
 * of which 14 reach a verdict (14 are bare fragments like `as const` or the
 * `@migration` JSDoc tags, and 2 hold unrendered `{{placeholders}}`, since
 * `meta.messages` is the template rather than the string a developer reads).
 * The remaining spans are neither polarity — an identifier being named
 * ("missing `id`"), a type being described — and demanding silence on those
 * would fail the build on messages that are perfectly correct. Every extracted
 * span is accounted for, because a skip no `expect` reads is indistinguishable
 * from a pass (#1984).
 *
 * MUTATION AUDIT of this half:
 *
 *   `enforce-mock-firestore`'s remedy rewritten to advise the very import the
 *     rule reports on ("Replace `X` with `X`") RED, naming the rule, the
 *     messageId and the span.
 *   REMEDY_LEAD broken to match nothing RED four ways: both floors and both
 *     extractor controls. A guard whose corpus collapses cannot go green.
 *   The four SPAN_POLICY filename pins below removed RED naming exactly the 6
 *     silent verdicts that then decide at `src/util/helper.ts`, with the EARNED
 *     count dropping 14 → 8 and its floor failing alongside. The same mutation
 *     leaves the candidate-LIST question green for all 14, which is the gap
 *     `earnsSilence` closes.
 *
 * That first mutation is also why the negative/remedy overlap is keyed on a
 * span's POSITION and never its text: with a text key, "Replace `X` with `X`"
 * filters itself out of the remedy half and the guard stays green (measured).
 */

/**
 * Phrases that frame the code span immediately following them as undesirable.
 * The span must follow the phrase directly: a lead further away in the sentence
 * usually introduces the *remedy* instead ("Replace with safe-stable-stringify's
 * `stringify`"), and treating those as negative examples inverts the assertion.
 */
const NEGATIVE_LEAD_SOURCE =
  "(?:instead of|rather than|avoid(?:\\s+using)?|don't (?:use|write)|do not (?:use|write)|replace)";

const NEGATIVE_LEAD = new RegExp(`${NEGATIVE_LEAD_SOURCE}\\s*:?\\s*\``, 'gi');

export type Span = { rule: string; messageId: string; span: string };

/**
 * A span may contain its own backticks — `enforce-realtimedb-path-utils` embeds
 * a template literal in its example — so the closing backtick is the first one
 * that both leaves an even number of inner backticks behind and sits at a clause
 * boundary. A lazy /`(.+?)`/ with a lookahead cannot express that: it closes at
 * the inner backtick before `)` and silently demotes a real assertion to an
 * unparseable one, which is a false pass.
 *
 * The boundary class is a parameter because a remedy is more often parenthesised
 * than a defect ("(e.g., `catch (error)`)"), and widening the negative side's
 * class would change which spans that half asserts.
 */
const NEGATIVE_BOUNDARY = /[,.;\s]/;
const REMEDY_BOUNDARY = /[,.;:\s)]/;

function closeSpan(message: string, start: number, boundary: RegExp) {
  let i = start;
  let innerTicks = 0;
  while (i < message.length) {
    if (message[i] === '`') {
      const next = message[i + 1] ?? '';
      if (innerTicks % 2 === 0 && (next === '' || boundary.test(next))) {
        return { span: message.slice(start, i), end: i };
      }
      innerTicks += 1;
    }
    i += 1;
  }
  return { span: null, end: i };
}

function spansAfterLead(
  message: string,
  lead: RegExp,
  boundary: RegExp,
): { span: string; start: number }[] {
  const out: { span: string; start: number }[] = [];
  lead.lastIndex = 0;
  let match = lead.exec(message);
  while (match) {
    const start = match.index + match[0].length;
    const { span, end } = closeSpan(message, start, boundary);
    if (span !== null) out.push({ span, start });
    lead.lastIndex = Math.max(lead.lastIndex, end + 1);
    match = lead.exec(message);
  }
  return out;
}

export function extractNegativeSpans(message: string): string[] {
  return spansAfterLead(message, NEGATIVE_LEAD, NEGATIVE_BOUNDARY).map(
    (found) => found.span,
  );
}

/**
 * Phrases that frame the code span immediately following them as the SPELLING
 * THE DEVELOPER SHOULD WRITE — the other half of "Instead of `X`, use `Y`".
 *
 * Deliberately a curated list rather than "any backticked span that is not a
 * negative example". Of the 117 backticked spans across the plugin's messages,
 * most are neither polarity — a bare identifier being named ("missing `id`"), a
 * type being described. Capturing those would demand a rule stay silent on text
 * that is not advice at all, and an over-capture here fails the build on a
 * message that is perfectly correct.
 */
const REMEDY_LEAD_SOURCE =
  '(?:use|prefer|call|write|switch to|change (?:it )?to|rename (?:it )?to|' +
  'with|as|into|export|add|include|bind|derive|annotate|wrap (?:it )?in)';

const REMEDY_LEAD = new RegExp(`${REMEDY_LEAD_SOURCE}\\s*:?\\s*\``, 'gi');

/**
 * The OCCURRENCE the same message frames as the defect is not a remedy:
 * `replace` leads both lists ("Replace `X` with `Y`"), so the negative half
 * wins to keep the two assertions from demanding opposite things of one span.
 *
 * Keyed on the span's POSITION, never its text. Keying on text drops the one
 * message shape that matters most — "Replace `X` with `X`", advice to write the
 * very thing being forbidden — because both halves capture identical strings
 * and the remedy half then filters itself away. Measured: with a text key, that
 * mutation planted in `enforce-mock-firestore` leaves this guard green.
 */
export function extractRemedySpans(message: string): string[] {
  const negativeStarts = new Set(
    spansAfterLead(message, NEGATIVE_LEAD, NEGATIVE_BOUNDARY).map(
      (found) => found.start,
    ),
  );
  return spansAfterLead(message, REMEDY_LEAD, REMEDY_BOUNDARY)
    .filter((found) => !negativeStarts.has(found.start))
    .map((found) => found.span);
}

export function collectRemedySpans(rules: typeof plugin.rules): Span[] {
  const out: Span[] = [];
  for (const [rule, def] of Object.entries(rules)) {
    for (const [messageId, text] of Object.entries(def?.meta?.messages ?? {})) {
      if (typeof text !== 'string') continue;
      for (const span of extractRemedySpans(text)) {
        out.push({ rule, messageId, span });
      }
    }
  }
  return out;
}

export function collectSpans(rules: typeof plugin.rules): Span[] {
  const out: Span[] = [];
  for (const [rule, def] of Object.entries(rules)) {
    for (const [messageId, text] of Object.entries(def?.meta?.messages ?? {})) {
      if (typeof text !== 'string') continue;
      for (const span of extractNegativeSpans(text)) {
        out.push({ rule, messageId, span });
      }
    }
  }
  return out;
}

type Policy = {
  /** Supplies the file shape a rule legitimately requires before it will fire. */
  wrap?: (span: string) => string;
  filename?: string;
  /** Why this span cannot be asserted. Presence here is audited for staleness. */
  exempt?: string;
};

/**
 * Keyed by `rule|messageId`. A rule that gates on surrounding evidence is not
 * defective for staying silent on a bare fragment — that mistake read three of
 * four raw candidates as bugs during the #1611 sweep — so such rules get the
 * context they ask for instead of an exemption.
 */
const SPAN_POLICY: Record<string, Policy> = {
  'enforce-callback-memo|enforceCallback': {
    filename: 'src/components/Row.tsx',
    wrap: (span) =>
      `const Row = ({ id }: { id: string }) => {\n  return ${span};\n};`,
  },
  'enforce-firestore-set-merge|preferSetMerge': {
    filename: 'src/util/save.ts',
    wrap: (span) =>
      `const admin = require('firebase-admin');\n` +
      `const db = admin.firestore();\n` +
      `export async function save() {\n  await ${span};\n}`,
  },
  // Gated on `*.f.ts` under `/callable/`, which no CANDIDATE matches, so
  // without this entry the rule never runs and its remedy banks an unearned
  // `silent` (#2036). The wrap is a whole callable module because the rule only
  // reaches unusedPropsType once a callable function exists to check.
  'enforce-callable-types|unusedPropsType': {
    filename: 'functions/src/callable/doThing.f.ts',
    wrap: (span) =>
      `import { CallableRequest } from 'firebase-functions/v2/https';\n` +
      `export type Props = { a: string };\n` +
      `export type Response = { b: string };\n` +
      `export const doThing = onCall(\n` +
      `  async (request: ${span}): Promise<Response> => {\n` +
      `    return { b: request.data.a };\n` +
      `  },\n` +
      `);`,
  },

  // Reachable only at a `.tsx` candidate. Every one of this rule's 48 invalid
  // fixtures holds JSX, and a `.ts` path forces `ScriptKind.TS`, which
  // `ecmaFeatures.jsx: true` does not override — so at `src/util/helper.ts` all
  // 48 are a fatal parse and the rule's silence on the remedy is the parser's,
  // not the rule's. Measured: 48/48 fatal at `src/util/helper.ts`, 48/48
  // reporting here.
  'prevent-children-clobber|childrenClobbered': {
    filename: 'src/components/Widget.tsx',
  },

  // Same extension gate as `prevent-children-clobber`: every fixture is a JSX
  // element, so at `src/util/helper.ts` all 32 are a fatal parse and the
  // remedy's silence belongs to the parser rather than to the rule. Measured:
  // 32/32 fatal at `src/util/helper.ts`, 30/32 reporting here (the residue is
  // the two option-carrying fixtures, which the replay drives at defaults).
  'enforce-use-flex-gap-on-wrap|useFlexGapRequired': {
    filename: 'src/components/Widget.tsx',
  },

  // Gated on `targetPaths` (`src/hooks/**`, `src/contexts/**`, `src/pages/**`,
  // `src/components/**`): off-path its `create` returns an empty visitor set, so
  // a remedy probed at `src/util/helper.ts` banks silence from a rule that never
  // ran. Measured on the 13 JSX-free fixtures, which parse at both paths and so
  // separate the path gate from the extension: silent at `src/util/helper.ts`,
  // reporting at a target path. All three messageIds share the gate.
  'prefer-use-base62-id|preferUseBase62IdHook': {
    filename: 'src/components/Widget.tsx',
  },
  'prefer-use-base62-id|preferUseBase62IdUseMemo': {
    filename: 'src/components/Widget.tsx',
  },
  'prefer-use-base62-id|preferUseBase62IdTopLevel': {
    filename: 'src/components/Widget.tsx',
  },

  // `require-migration-script-metadata` is the third path-gated remedy owner and
  // deliberately has no entry: its 8 spans are JSDoc tag names (`@migration`,
  // `@migrationPhase`, …), which stay `unparseable` at its own
  // `functions/src/callable/scripts/*.f.ts` path exactly as they are under the
  // CANDIDATES (measured). `unparseable` banks no pass, so an entry would be
  // dead config rather than a missing assertion.

  // Exemptions. Each states why the span is not a testable code example; the
  // suite fails if one of these stops matching a real span.
  'enforce-callback-memo|enforceMemo': {
    exempt:
      'the span is illustrative pseudo-code — `{...}` stands in for a body and cannot parse',
  },
  'prefer-type-over-interface|preferType': {
    exempt:
      'the span is the bare keyword `interface`, not a code example the rule could report',
  },
  'prefer-type-alias-over-typeof-constant|preferTypeAlias': {
    exempt:
      'the span holds an unrendered {{constName}} placeholder; meta.messages is the template, not the rendered text',
  },
};

/**
 * Tried in order. Many rules key off the path, so a single hard-coded filename
 * would report a false gap for a reason the message never claimed.
 */
const CANDIDATES = [
  'src/util/helper.ts',
  'src/components/Widget.tsx',
  'functions/src/util/helper.ts',
  'src/util/helper.test.ts',
];

const linter = new Linter();
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}
linter.defineParser('ts', tsParser);

export type SpanVerdict = {
  key: string;
  status: 'reported' | 'silent' | 'unparseable' | 'exempt';
  detail?: string;
};

function lintOnce(rule: string, filename: string, code: string) {
  const config = {
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: { [PREFIX + rule]: 'error' as const },
  } as unknown as Linter.Config;

  try {
    const messages = linter.verify(code, config, { filename });
    if (messages.some((m) => m.fatal)) return 'unparseable' as const;
    return messages.some((m) => m.ruleId === PREFIX + rule)
      ? ('reported' as const)
      : ('silent' as const);
  } catch {
    // A type-aware rule throws without parserOptions.project; out of scope.
    return 'unparseable' as const;
  }
}

export function verdictFor(
  { rule, messageId, span }: Span,
  policies: Record<string, Policy> = SPAN_POLICY,
): SpanVerdict {
  const key = `${rule}|${messageId}`;
  const policy = policies[key];
  if (policy?.exempt) {
    return { key, status: 'exempt', detail: policy.exempt };
  }

  const wrap = policy?.wrap ?? ((s: string) => s);
  const filenames = policy?.filename ? [policy.filename] : CANDIDATES;
  // A fragment may only be a statement in some framings; try each rather than
  // let a wrapping detail decide the verdict.
  const variants = policy?.wrap
    ? [wrap(span)]
    : [span, `${span};`, `const probe = ${span};`];

  let sawParse = false;
  for (const filename of filenames) {
    for (const code of variants) {
      const result = lintOnce(rule, filename, code);
      if (result === 'reported') return { key, status: 'reported' };
      if (result === 'silent') sawParse = true;
    }
  }
  return {
    key,
    status: sawParse ? 'silent' : 'unparseable',
    detail: span,
  };
}

/**
 * A floor, not an exact count: new rules may legitimately add spans. It exists
 * so a broken extractor — which would make every assertion below vacuously
 * pass — fails loudly instead.
 */
const MIN_ASSERTED_SPANS = 5; // measured 6

/**
 * The exact `(filename, variant)` a verdict was decided at.
 *
 * A `silent` verdict is worth no more than the site that produced it: silence
 * from a filename whose path gate excluded the rule, or whose extension made the
 * rule's own fixtures a fatal parse, is not evidence about the remedy. Carrying
 * the site lets the reachability arm ask about THAT filename instead of
 * re-deriving the candidate list, which asks the weaker question of whether the
 * rule is reachable anywhere (#2246).
 *
 * The variant is carried too, because a span reaches different verdicts in
 * different framings — a site naming only the file cannot say which framing
 * banked the pass.
 */
export type ProbeSite = { filename: string; variant: string };

export type RemedyVerdict = {
  key: string;
  status: 'silent' | 'reported' | 'unparseable' | 'templated';
  reportedAs?: string;
  detail?: string;
  decidedAt?: ProbeSite;
};

/**
 * The remedy half of the same question, and the sharper one.
 *
 * "Instead of `X`, use `Y`" makes two claims. `verdictFor` above checks the
 * first — that `X` is a shape the rule reports. This checks the second: that
 * `Y`, the spelling the message TELLS the developer to write, is SILENT under
 * the rule that named it. When it is not, the developer does exactly what the
 * message says and the same rule fires again — advice that is confidently
 * wrong, which is worse than advice that is vague.
 *
 * One silent framing is enough. A fragment is a statement in some framings and
 * not others, and a remedy that clears the rule anywhere proves a spelling
 * exists that satisfies it; requiring silence in EVERY framing would fail on
 * the framing rather than on the advice.
 *
 * The framing that decides is recorded in `decidedAt`. Since the first silent
 * `(filename, variant)` wins, the deciding filename skews towards the one the
 * rule is LEAST likely to run at — a path gate excludes the rule there, and
 * silence is the passing verdict — so the site has to travel with the verdict
 * for the reachability arm to be able to check it (#2246).
 */
export function remedyVerdictFor(
  { rule, messageId, span }: Span,
  policies: Record<string, Policy> = SPAN_POLICY,
): RemedyVerdict {
  const key = `${rule}|${messageId}`;
  // `meta.messages` is the TEMPLATE, not the rendered string: a span holding
  // {{placeholder}} is not text any developer ever reads.
  if (/\{\{/.test(span)) {
    return { key, status: 'templated', detail: span };
  }

  // A path-gated rule cannot fire under any of the CANDIDATES, so probing a
  // remedy there yields `silent` — the PASSING verdict — without the rule ever
  // running. `verdictFor` consults SPAN_POLICY for exactly this reason; sharing
  // it here closes the same hole on the remedy half (#2036). `filename` is a
  // property of the rule's path gate rather than of the span kind, so the entry
  // that unlocks the negative half unlocks this one too.
  const policy = policies[key];
  const variants = policy?.wrap
    ? [policy.wrap(span)]
    : [span, `${span};`, `const probe = ${span};`];
  const filenames = policy?.filename ? [policy.filename] : CANDIDATES;
  let sawParse = false;
  let reportedAs: string | undefined;
  let reportedAt: ProbeSite | undefined;
  for (const filename of filenames) {
    for (const code of variants) {
      const config = {
        parser: 'ts',
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: { [PREFIX + rule]: 'error' as const },
      } as unknown as Linter.Config;
      let messages;
      try {
        messages = linter.verify(code, config, { filename });
      } catch {
        continue;
      }
      if (messages.some((m) => m.fatal)) continue;
      sawParse = true;
      const hit = messages.find((m) => m.ruleId === PREFIX + rule);
      if (!hit) {
        return {
          key,
          status: 'silent',
          decidedAt: { filename, variant: code },
        };
      }
      reportedAs = String(hit.messageId);
      reportedAt = reportedAt ?? { filename, variant: code };
    }
  }
  if (reportedAs) {
    return {
      key,
      status: 'reported',
      reportedAs,
      detail: span,
      decidedAt: reportedAt,
    };
  }
  // Deliberately siteless. Reaching a `silent` here would mean a variant parsed
  // yet neither reported nor returned above, so there is no site to name — and
  // `earnsSilence` counts a siteless silence as unearned rather than waving it
  // through, since an absent site is not evidence.
  return { key, status: sawParse ? 'silent' : 'unparseable', detail: span };
}

/**
 * A floor on the number of remedy spans actually driven to a verdict. Most
 * backticked spans are templates or bare fragments, so flooring the EXTRACTED
 * count would let the asserted population fall to zero while the guard stayed
 * green.
 */
const MIN_ASSERTED_REMEDIES = 12; // measured 14

/**
 * The same floor over spans whose rule was MEASURED reachable at the filename
 * that DECIDED their verdict. Kept just under the measured value so a regression
 * that unhooks a rule from the probe fails here rather than sliding by on
 * unearned silence.
 */
const MIN_EARNED_REMEDIES = 13; // measured 14

/** Human-readable form of the site a verdict was decided at. */
function describeSite(site: ProbeSite | undefined): string {
  return site
    ? `${site.filename} framed as \`${site.variant}\``
    : 'no recorded site';
}

/**
 * Known-violating inputs per rule, taken from the suite's own `invalid`
 * fixtures. Matched by OBJECT IDENTITY: ~100 suites pass a display name that is
 * not a rule name, and name-keyed matching drops every one of them.
 */
const invalidFixturesByRule = (() => {
  const { suites } = harvestRuleTesterCases();
  const nameByRule = new Map<unknown, string>(
    Object.entries(plugin.rules).map(([name, rule]) => [rule, name]),
  );
  const out = new Map<string, string[]>();
  for (const suite of suites) {
    const name = nameByRule.get(suite.rule);
    if (!name) continue;
    const codes = out.get(name) ?? [];
    for (const testCase of suite.invalid) {
      const code =
        typeof testCase === 'string'
          ? testCase
          : (testCase as { code?: unknown })?.code;
      if (typeof code === 'string') codes.push(code);
    }
    out.set(name, codes);
  }
  return out;
})();

const reachabilityCache = new Map<string, boolean>();

/**
 * Does this rule report on at least one of its own invalid fixtures at one of
 * these filenames? A `false` means the probe's silence says nothing about the
 * remedy — the rule was gated out before it ever looked.
 *
 * Fixtures are linted with the `ts` parser, the same one the probe itself uses,
 * so a JSON- or Markdown-only rule's fixtures would parse fatally here and read
 * as unreachable. No remedy-owning rule is one today, and the direction is safe
 * if that changes: the guard FAILS naming the rule rather than waving a span
 * through, which is the whole point of asserting reachability.
 */
function ruleReportsAt(rule: string, filenames: string[]): boolean {
  const cacheKey = `${rule}|${filenames.join(',')}`;
  const cached = reachabilityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fixtures = invalidFixturesByRule.get(rule) ?? [];
  let reaches = false;
  outer: for (const code of fixtures) {
    for (const filename of filenames) {
      if (lintOnce(rule, filename, code) === 'reported') {
        reaches = true;
        break outer;
      }
    }
  }
  reachabilityCache.set(cacheKey, reaches);
  return reaches;
}

/**
 * Is this `silent` verdict evidence about the remedy, or an artefact of where it
 * was taken?
 *
 * Asked of the ONE filename that decided the verdict, never of the candidate
 * list. Those are different questions, and the difference is not academic: 6 of
 * 14 silent verdicts were decided at `src/util/helper.ts` by rules that cannot
 * run there — one excluded by its `targetPaths` gate, one whose every fixture is
 * a fatal parse under a `.ts` extension — while both report at another candidate
 * and so satisfied the list-wide question (#2246).
 *
 * A verdict with no site is unearned by construction: an absent site is not
 * evidence, and defaulting it to "reachable" would restore the hole in the shape
 * hardest to notice.
 */
function earnsSilence(span: Span, verdict: RemedyVerdict): boolean {
  return (
    verdict.decidedAt !== undefined &&
    ruleReportsAt(span.rule, [verdict.decidedAt.filename])
  );
}

describe('message negative examples are reportable', () => {
  const spans = collectSpans(plugin.rules);
  const verdicts = spans.map((s) => ({ span: s, verdict: verdictFor(s) }));

  it('extracts at least the known negative-example spans', () => {
    expect(spans.length).toBeGreaterThanOrEqual(MIN_ASSERTED_SPANS);
  });

  it('asserts a non-vacuous number of spans', () => {
    const asserted = verdicts.filter(
      ({ verdict }) => verdict.status === 'reported',
    );
    expect(asserted.length).toBeGreaterThanOrEqual(MIN_ASSERTED_SPANS);
  });

  it('every non-exempt span is reported by its own rule', () => {
    const failures = verdicts
      .filter(
        ({ verdict }) =>
          verdict.status !== 'reported' && verdict.status !== 'exempt',
      )
      .map(
        ({ span, verdict }) =>
          `${span.rule} [${span.messageId}] is ${verdict.status} on the example its own message ` +
          `frames as wrong: \`${span.span}\`. Either the message should cite a shape the rule ` +
          `reports, or the rule should report this shape. If it needs surrounding context, add a ` +
          `wrap to SPAN_POLICY rather than an exemption.`,
      );
    expect(failures).toEqual([]);
  });

  it('carries no stale exemptions', () => {
    // Audited against the NEGATIVE spans only, even though SPAN_POLICY now
    // serves both halves: `exempt` states why a span is not a testable negative
    // example, so a surviving remedy span at the same key does not keep the
    // exemption alive. Widening this to the union would let an exemption whose
    // negative span disappeared sit here unnoticed. A remedy-only entry carries
    // `filename`/`wrap` rather than `exempt`, so it is out of this filter.
    const present = new Set(spans.map((s) => `${s.rule}|${s.messageId}`));
    const stale = Object.entries(SPAN_POLICY)
      .filter(([key, policy]) => policy.exempt && !present.has(key))
      .map(([key]) => key);
    expect(stale).toEqual([]);
  });
});

describe('message remedies are silent under their own rule', () => {
  const spans = collectRemedySpans(plugin.rules);
  const verdicts = spans.map((span) => ({
    span,
    verdict: remedyVerdictFor(span),
  }));

  it('drives a non-vacuous number of remedies to a verdict', () => {
    const asserted = verdicts.filter(
      ({ verdict }) => verdict.status === 'silent',
    );
    expect(asserted.length).toBeGreaterThanOrEqual(MIN_ASSERTED_REMEDIES);
  });

  it('accounts for every extracted remedy span', () => {
    // Closes the accounting: a span dropped by a skip no `expect` reads is
    // indistinguishable from one that passed. 106 fixtures went missing that
    // way in #1984.
    const counted = verdicts.reduce<Record<string, number>>(
      (acc, { verdict }) => {
        acc[verdict.status] = (acc[verdict.status] || 0) + 1;
        return acc;
      },
      {},
    );
    const total = Object.values(counted).reduce((a, b) => a + b, 0);
    expect(total).toBe(spans.length);
    expect(counted.silent ?? 0).toBeGreaterThanOrEqual(MIN_ASSERTED_REMEDIES);
  });

  // A rule the probe cannot reach is SILENT on everything, and `silent` is the
  // passing verdict — so an unreachable rule banks a pass for advice nobody
  // checked, and counts toward MIN_ASSERTED_REMEDIES while doing it. That is
  // how enforce-identifiable-firestore-type shipped a message prescribing two
  // spellings it reported on (#2035). Reachability is therefore asserted from
  // the rule's OWN invalid fixtures — inputs measured to report — replayed at
  // the very filename that decided this verdict, which is the only filename the
  // verdict is a statement about.
  it('earns every silent verdict: the rule can report at that filename', () => {
    const unreachable = verdicts
      .filter(({ verdict }) => verdict.status === 'silent')
      .filter(({ span, verdict }) => !earnsSilence(span, verdict))
      .map(
        ({ span, verdict }) =>
          `${span.rule} [${span.messageId}] records the PASSING verdict for \`${span.span}\`, ` +
          `decided at ${describeSite(
            verdict.decidedAt,
          )} — but the rule reports on none of its ` +
          `own invalid fixtures THERE, so nothing about this remedy was actually checked. ` +
          `Reaching the rule at some other candidate does not earn this verdict. Give it a ` +
          `filename/wrap in SPAN_POLICY that reaches the rule.`,
      );
    expect(unreachable).toEqual([]);
  });

  it('reports its own counters', () => {
    const silent = verdicts.filter(
      ({ verdict }) => verdict.status === 'silent',
    );
    const earned = silent.filter(({ span, verdict }) =>
      earnsSilence(span, verdict),
    );
    const tally = verdicts.reduce<Record<string, number>>(
      (acc, { verdict }) => {
        acc[verdict.status] = (acc[verdict.status] || 0) + 1;
        return acc;
      },
      {},
    );
    console.log(
      `[message-negative-example] remedy spans: ${verdicts.length} over ` +
        `${new Set(verdicts.map(({ span }) => span.rule)).size} rule(s); ` +
        `verdicts ${JSON.stringify(tally)}; silent ${
          silent.length
        }, of which ` +
        `EARNED ${earned.length} (floor ${MIN_EARNED_REMEDIES}); ` +
        `fixture corpus ${invalidFixturesByRule.size} rule(s)`,
    );
    expect(verdicts.length).toBeGreaterThan(0);
  });

  it('drives a non-vacuous number of remedies to an EARNED verdict', () => {
    // Floors the population that survives the reachability check, not the raw
    // `silent` count: the raw count is satisfiable by unreachable rules alone.
    const earned = verdicts
      .filter(({ verdict }) => verdict.status === 'silent')
      .filter(({ span, verdict }) => earnsSilence(span, verdict));
    expect(earned.length).toBeGreaterThanOrEqual(MIN_EARNED_REMEDIES);
  });

  it('never tells a developer to write something its own rule reports', () => {
    const failures = verdicts
      .filter(({ verdict }) => verdict.status === 'reported')
      .map(
        ({ span, verdict }) =>
          `${span.rule} [${span.messageId}] reports ${verdict.reportedAs} on the very spelling ` +
          `its own message tells the developer to write: \`${span.span}\`. Following this advice ` +
          `does not clear the report. Either the remedy should name a shape the rule accepts, or ` +
          `the rule should accept this one.`,
      );
    expect(failures).toEqual([]);
  });
});

describe('the harness itself (controls)', () => {
  it('captures the remedy half of "Instead of X, use Y"', () => {
    expect(
      extractRemedySpans('Instead of `foo()`, use `bar()` at this site.'),
    ).toEqual(['bar()']);
  });

  it('does not capture a defect span that "Replace" leads', () => {
    // "Replace `X` with `Y`" leads BOTH lists on `X`; the negative half wins,
    // or the two assertions demand opposite things of one span.
    expect(
      extractRemedySpans('Replace `mockFirebase()` with `mockFirestore()`.'),
    ).toEqual(['mockFirestore()']);
  });

  it('flags a planted remedy its own rule reports (red path)', () => {
    // `prefer-type-over-interface` reports every `interface`, so a message
    // advising one would be advice that cannot be followed.
    const planted: Span = {
      rule: 'prefer-type-over-interface',
      messageId: 'preferType',
      span: 'interface Foo { a: string }',
    };
    const verdict = remedyVerdictFor(planted);
    expect(verdict.status).toBe('reported');
    expect(verdict.reportedAs).toBe('preferType');
  });

  it('clears the same advice once it names the accepted spelling', () => {
    const fixed: Span = {
      rule: 'prefer-type-over-interface',
      messageId: 'preferType',
      span: 'type Foo = { a: string }',
    };
    expect(remedyVerdictFor(fixed).status).toBe('silent');
  });

  it('does not read an unrendered template as advice', () => {
    const templated: Span = {
      rule: 'prefer-union-from-const-array',
      messageId: 'preferDerivedUnion',
      span: 'const {{constName}} = [...] as const',
    };
    expect(remedyVerdictFor(templated).status).toBe('templated');
  });

  // The reachability oracle is what stops an unreachable rule from banking a
  // pass, so it needs a control on BOTH sides: an oracle stuck on `true` waves
  // every gated rule through, and one stuck on `false` fails the build for
  // rules that are fine. `enforce-callable-types` is the natural probe — it
  // gates on `*.f.ts` under `/callable/`, so the same fixtures flip the answer
  // purely on the filename.
  it('reachability oracle: says NO where the path gate excludes the rule', () => {
    expect(ruleReportsAt('enforce-callable-types', CANDIDATES)).toBe(false);
  });

  it('reachability oracle: says YES at the filename the gate admits', () => {
    expect(
      ruleReportsAt('enforce-callable-types', [
        'functions/src/callable/doThing.f.ts',
      ]),
    ).toBe(true);
  });

  // The tightened arm reads the verdict's OWN deciding site, so it needs a
  // control on exactly that, both ways: silence taken at a filename the rule is
  // gated out of must read UNEARNED, and the same span must read EARNED once a
  // policy moves the probe onto a path the rule runs at.
  //
  // `prefer-use-base62-id` is the natural probe because its `targetPaths` gate
  // turns the answer purely on the filename, leaving the span untouched — and
  // because the list-wide question this replaces answers YES for it, so the two
  // questions demonstrably differ on a real input rather than only in principle.
  it('deciding site: silence taken off-path earns nothing', () => {
    const planted: Span = {
      rule: 'prefer-use-base62-id',
      messageId: 'preferUseBase62IdHook',
      span: 'useBase62Id()',
    };
    const verdict = remedyVerdictFor(planted, {});
    expect(verdict.status).toBe('silent');
    expect(verdict.decidedAt).toEqual({
      filename: CANDIDATES[0],
      variant: 'useBase62Id()',
    });
    expect(earnsSilence(planted, verdict)).toBe(false);
    // The list-wide question passes this very span: the rule reaches
    // `src/components/Widget.tsx`, which is not where the verdict was decided.
    expect(ruleReportsAt('prefer-use-base62-id', CANDIDATES)).toBe(true);
  });

  it('deciding site: a policy filename moves the probe onto a live path', () => {
    const planted: Span = {
      rule: 'prefer-use-base62-id',
      messageId: 'preferUseBase62IdHook',
      span: 'useBase62Id()',
    };
    const verdict = remedyVerdictFor(planted, {
      'prefer-use-base62-id|preferUseBase62IdHook': {
        filename: 'src/components/Widget.tsx',
      },
    });
    expect(verdict.status).toBe('silent');
    expect(verdict.decidedAt?.filename).toBe('src/components/Widget.tsx');
    expect(earnsSilence(planted, verdict)).toBe(true);
  });

  it('deciding site names the framing, not just the file', () => {
    // Two framings of one span reach different verdicts, so a site that records
    // only the filename cannot say which framing banked the pass. A `wrap`
    // replaces all three default framings with one, and the site must follow it.
    const planted: Span = {
      rule: 'prefer-type-over-interface',
      messageId: 'preferType',
      span: 'type Foo = { a: string }',
    };
    expect(remedyVerdictFor(planted, {}).decidedAt).toEqual({
      filename: CANDIDATES[0],
      variant: 'type Foo = { a: string }',
    });
    expect(
      remedyVerdictFor(planted, {
        'prefer-type-over-interface|preferType': {
          filename: 'src/components/Widget.tsx',
          wrap: (span) => `export ${span};`,
        },
      }).decidedAt,
    ).toEqual({
      filename: 'src/components/Widget.tsx',
      variant: 'export type Foo = { a: string };',
    });
  });

  it('reachability oracle reads a real fixture corpus', () => {
    // A corpus that silently harvested nothing would make the oracle answer
    // `false` everywhere, which reads as "every rule is unreachable" rather
    // than as the broken harvest it is (#1984).
    expect(invalidFixturesByRule.size).toBeGreaterThanOrEqual(150); // measured 194
    expect(
      (invalidFixturesByRule.get('enforce-callable-types') ?? []).length,
    ).toBeGreaterThan(0);
  });
});

describe('the harness itself (negative-example controls)', () => {
  it('captures a span containing its own backticks', () => {
    // The realtimedb example embeds a template literal; a naive matcher cuts it
    // at the inner backtick and demotes the assertion to "unparseable".
    const message =
      'Use a helper. Instead of `admin.database().ref(`users/${id}`)`, use `ref(toUserPath(id))`.';
    expect(extractNegativeSpans(message)).toEqual([
      'admin.database().ref(`users/${id}`)',
    ]);
  });

  it('does not treat a remedy span as a negative example', () => {
    // "Replace with X" names the fix, not the defect; capturing it would invert
    // the assertion and demand the rule report its own recommended output.
    expect(
      extractNegativeSpans(
        "Replace with safe-stable-stringify's `stringify` (import it as `import stringify from 'x'`).",
      ),
    ).toEqual([]);
  });

  it('flags a planted message whose example its rule cannot report (red path)', () => {
    const planted: Span = {
      rule: 'enforce-firestore-path-utils',
      messageId: 'requirePathUtil',
      // Bare callee: isFirestoreCall requires an explicit receiver, so this is
      // exactly the #1613 defect. The guard must call it out, not pass it.
      span: 'doc("users/" + userId)',
    };
    expect(verdictFor(planted, {}).status).toBe('silent');
  });

  it('clears the same span once it uses the supported receiver form', () => {
    const fixed: Span = {
      rule: 'enforce-firestore-path-utils',
      messageId: 'requirePathUtil',
      span: 'db.doc("users/" + userId)',
    };
    expect(verdictFor(fixed, {}).status).toBe('reported');
  });
});
