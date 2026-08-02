import { Linter } from 'eslint';

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
 */
export function extractNegativeSpans(message: string): string[] {
  const out: string[] = [];
  NEGATIVE_LEAD.lastIndex = 0;
  let lead = NEGATIVE_LEAD.exec(message);
  while (lead) {
    const start = lead.index + lead[0].length;
    let i = start;
    let innerTicks = 0;
    while (i < message.length) {
      if (message[i] === '`') {
        const next = message[i + 1] ?? '';
        if (innerTicks % 2 === 0 && (next === '' || /[,.;\s]/.test(next))) {
          out.push(message.slice(start, i));
          break;
        }
        innerTicks += 1;
      }
      i += 1;
    }
    NEGATIVE_LEAD.lastIndex = Math.max(NEGATIVE_LEAD.lastIndex, i + 1);
    lead = NEGATIVE_LEAD.exec(message);
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
const MIN_ASSERTED_SPANS = 5;

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
    const present = new Set(spans.map((s) => `${s.rule}|${s.messageId}`));
    const stale = Object.entries(SPAN_POLICY)
      .filter(([key, policy]) => policy.exempt && !present.has(key))
      .map(([key]) => key);
    expect(stale).toEqual([]);
  });
});

describe('the harness itself (controls)', () => {
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
