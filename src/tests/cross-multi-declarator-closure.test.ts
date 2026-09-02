/**
 * CROSS-PAIRED multi-declarator closure.
 *
 * `src/tests/multi-declarator-closure.test.ts` pairs each rule with
 * `corpus.byRule.get(rule)` — its OWN fixtures. A rule's own suite is by
 * construction the shapes its author anticipated, so the sibling-declarator
 * perturbation has only ever been applied to inputs the rule already expects.
 *
 * This probe changes ONLY the pairing: every fixture in the corpus is screened
 * under all plugin rules, and each rule that REPORTS on it is then driven
 * through the identical perturbation, oracles and three isolations.
 *
 * The oracles, the attribution isolations and the #1930 destruction licensing
 * are copied verbatim from the shipped guard so a difference in outcome is a
 * difference in PAIRING and nothing else.
 */
import { Linter } from 'eslint';
import { parse as estreeParse } from '@typescript-eslint/typescript-estree';
import {
  FixtureCase,
  defaultFilenameFor,
  defineCorpusParsers,
  harvestFixtureCorpus,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  silentWithoutProgramRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('../index') as {
  rules: Record<string, { meta?: { fixable?: string } }>;
};

const PREFIX = '@blumintinc/blumint/';

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

// ---------------------------------------------------------------------------
// Perturbation (verbatim from the shipped guard)
// ---------------------------------------------------------------------------

const SIBLING_STEM = '__probeSibling';
const SIBLING_INIT = '1';

type VariantKind = 'SUBJECT_FIRST' | 'SUBJECT_SECOND';

type Perturbation = {
  kind: VariantKind;
  code: string;
  sibling: string;
  subject: string;
  subjectRange: [number, number];
  soloSibling: string;
};

const STATEMENT_CONTAINERS = new Set([
  'Program',
  'BlockStatement',
  'StaticBlock',
  'TSModuleBlock',
  'SwitchCase',
]);

type SkipReason =
  | 'multiDeclarator'
  | 'noInitializer'
  | 'destructuringSubject'
  | 'declareModifier'
  | 'usingKind'
  | 'notStatementLevel'
  | 'cappedPerFixture'
  | 'variantUnparseable';

const skipped: Record<SkipReason, number> = {
  multiDeclarator: 0,
  noInitializer: 0,
  destructuringSubject: 0,
  declareModifier: 0,
  usingKind: 0,
  notStatementLevel: 0,
  cappedPerFixture: 0,
  variantUnparseable: 0,
};

const MAX_PER_FIXTURE = 3;

const tryParse = (code: string, jsx: boolean) => {
  try {
    return estreeParse(code, { jsx, range: true, loc: true }) as any;
  } catch {
    return null;
  }
};

const parseEither = (code: string, preferJsx: boolean) =>
  tryParse(code, preferJsx) ?? tryParse(code, !preferJsx);

const walk = (node: any, parent: any, parents: Map<any, any>) => {
  parents.set(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const value = (node as any)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, node, parents);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, node, parents);
    }
  }
};

const declarationsOf = (ast: any) => {
  const parents = new Map<any, any>();
  walk(ast, null, parents);
  const found: any[] = [];
  for (const node of parents.keys()) {
    if (node.type === 'VariableDeclaration') found.push(node);
  }
  return {
    parents,
    declarations: found.sort((a, b) => a.range[0] - b.range[0]),
  };
};

/**
 * Memoised per fixture CODE: with cross-pairing the same fixture is perturbed
 * once per reporting rule, and re-deriving the splices each time is the whole
 * probe's cost. The skip counters would also multiply, making them unreadable.
 */
const perturbationCache = new Map<string, Perturbation[]>();

const perturbationsFor = (code: string, preferJsx: boolean): Perturbation[] => {
  const key = `${preferJsx ? 'x' : 't'}\0${code}`;
  const hit = perturbationCache.get(key);
  if (hit) return hit;
  const out = computePerturbations(code, preferJsx);
  perturbationCache.set(key, out);
  return out;
};

const computePerturbations = (
  code: string,
  preferJsx: boolean,
): Perturbation[] => {
  const ast = parseEither(code, preferJsx);
  if (!ast) return [];
  const { parents, declarations } = declarationsOf(ast);
  const out: Perturbation[] = [];
  let emitted = 0;

  declarations.forEach((declaration: any, index: number) => {
    if (declaration.declarations.length !== 1) {
      skipped.multiDeclarator++;
      return;
    }
    if (declaration.declare) {
      skipped.declareModifier++;
      return;
    }
    if (
      declaration.kind !== 'const' &&
      declaration.kind !== 'let' &&
      declaration.kind !== 'var'
    ) {
      skipped.usingKind++;
      return;
    }
    const parent = parents.get(declaration);
    const container =
      parent?.type === 'ExportNamedDeclaration' ? parents.get(parent) : parent;
    if (!container || !STATEMENT_CONTAINERS.has(container.type)) {
      skipped.notStatementLevel++;
      return;
    }
    const declarator = declaration.declarations[0];
    if (!declarator.init) {
      skipped.noInitializer++;
      return;
    }
    if (declarator.id.type !== 'Identifier') {
      skipped.destructuringSubject++;
      return;
    }
    if (emitted >= MAX_PER_FIXTURE) {
      skipped.cappedPerFixture++;
      return;
    }
    emitted++;

    const sibling = `${SIBLING_STEM}${index}`;
    const [start, end] = declarator.range as [number, number];
    const subject = declarator.id.name as string;
    const soloSibling = `${code.slice(
      0,
      start,
    )}${sibling} = ${SIBLING_INIT}${code.slice(end)}`;
    const leadingInsert = `${sibling} = ${SIBLING_INIT}, `;
    const candidates: Perturbation[] = [
      {
        kind: 'SUBJECT_FIRST',
        sibling,
        subject,
        soloSibling,
        subjectRange: [start, end],
        code: `${code.slice(0, end)}, ${sibling} = ${SIBLING_INIT}${code.slice(
          end,
        )}`,
      },
      {
        kind: 'SUBJECT_SECOND',
        sibling,
        subject,
        soloSibling,
        subjectRange: [
          start + leadingInsert.length,
          end + leadingInsert.length,
        ],
        code: `${code.slice(0, start)}${leadingInsert}${code.slice(start)}`,
      },
    ];
    for (const candidate of candidates) {
      if (!parseEither(candidate.code, preferJsx)) {
        skipped.variantUnparseable++;
        continue;
      }
      out.push(candidate);
    }
  });
  return out;
};

// ---------------------------------------------------------------------------
// Lint plumbing
// ---------------------------------------------------------------------------

const configFor = (
  testCase: FixtureCase,
  rules: Record<string, unknown>,
): Linter.Config =>
  ({
    parser: parserKeyFor(testCase),
    parserOptions: parserOptionsFor(testCase),
    rules,
  } as Linter.Config);

/**
 * A fixture's `options` belong to its OWNER. Handing them to a foreign rule
 * configures it with a schema it never declared, and every finding drawn from
 * that run is a fabrication.
 */
const soloRules = (rule: string, testCase: FixtureCase, owner: string) => ({
  [PREFIX + rule]: rule === owner ? severityWithOptions(testCase) : 'error',
});

/**
 * Why a lint produced no verdict, which the null return alone cannot say.
 *
 * A fatal and a throw are different failures — one comes back through the
 * message list, the other never reaches it — and a caller that folds both into
 * `continue` drops the case in silence. The perturbation loop reads this to
 * count what it skipped (#1984).
 */
type LintDrop = { fatal: boolean; threw: boolean };

const verify = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
  owner: string,
  drop?: LintDrop,
): Linter.LintMessage[] | null => {
  try {
    const messages = linter.verify(
      code,
      configFor(testCase, soloRules(rule, testCase, owner)),
      { filename },
    );
    if (messages.some((message) => message.fatal)) {
      if (drop) drop.fatal = true;
      return null;
    }
    return messages.filter((message) => message.ruleId === PREFIX + rule);
  } catch {
    if (drop) drop.threw = true;
    return null;
  }
};

const fix = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
  owner: string,
): string | null => {
  try {
    const result = linter.verifyAndFix(
      code,
      configFor(testCase, soloRules(rule, testCase, owner)),
      { filename },
    );
    return result.output;
  } catch {
    return null;
  }
};

const idsOf = (messages: Linter.LintMessage[]) =>
  messages.map((message) => message.messageId || message.message);

const countOf = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
};

const offsetOf = (code: string, line: number, column: number) => {
  const lines = code.split('\n');
  let offset = 0;
  for (let index = 0; index < line - 1 && index < lines.length; index++) {
    offset += lines[index].length + 1;
  }
  return offset + column - 1;
};

const siblingDeclaratorRange = (
  ast: any,
  sibling: string,
): [number, number] | null => {
  const parents = new Map<any, any>();
  walk(ast, null, parents);
  for (const node of parents.keys()) {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.id.name === sibling
    ) {
      return node.range as [number, number];
    }
  }
  return null;
};

const occurrencesOf = (code: string, name: string) =>
  (code.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;

type EditedSpan = { start: number; end: number; replacement: string };

const editedSpanOf = (before: string, after: string): EditedSpan => {
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    start: prefix,
    end: before.length - suffix,
    replacement: after.slice(prefix, after.length - suffix),
  };
};

// ---------------------------------------------------------------------------
// Probe (oracles + isolations verbatim)
// ---------------------------------------------------------------------------

type Oracle =
  | 'DETECTION_LOST'
  | 'SIBLING_DESTROYED'
  | 'UNPARSEABLE'
  | 'SIBLING_DUPLICATED'
  | 'SIBLING_MUTATED';

type Finding = {
  rule: string;
  owner: string;
  cross: boolean;
  arm: 'A' | 'B';
  oracle: Oracle;
  variant: VariantKind;
  attribution: 'clean' | 'mixed';
  detail: string;
  origin: string;
  filename: string;
  base: string;
  input: string;
  output: string;
};

type Counters = {
  fixturesConsidered: number;
  fixturesWithCandidates: number;
  perturbationsEmitted: number;
  controlReporting: number;
  controlFatal: number;
  fixersRewrote: number;
  declines: number;
  siblingIsSubject: number;
  siblingIsMixedSubject: number;
  attributionRejected: number;
  mutationLicensed: number;
  destructionLicensed: number;
  oraclesEvaluated: number;
  /**
   * Perturbed variants that produced no verdict at all, so ARM A and ARM B were
   * both skipped for them. A fatal is indistinguishable from a rule staying
   * silent once messages are filtered by `ruleId`, and a throw never reaches the
   * message list, so both are counted rather than folded into `continue`.
   */
  variantLintFatal: number;
  variantLintThrew: number;
  /** The fixer itself throwing, which skips ARM B with no oracle evaluated. */
  variantFixThrew: number;
};

const blankCounters = (): Counters => ({
  fixturesConsidered: 0,
  fixturesWithCandidates: 0,
  perturbationsEmitted: 0,
  controlReporting: 0,
  controlFatal: 0,
  fixersRewrote: 0,
  declines: 0,
  siblingIsSubject: 0,
  siblingIsMixedSubject: 0,
  attributionRejected: 0,
  mutationLicensed: 0,
  destructionLicensed: 0,
  oraclesEvaluated: 0,
  variantLintFatal: 0,
  variantLintThrew: 0,
  variantFixThrew: 0,
});

const add = (into: Counters, from: Counters) => {
  for (const key of Object.keys(into) as (keyof Counters)[]) {
    into[key] += from[key];
  }
};

const fixableRules = new Set(
  Object.entries(plugin.rules)
    .filter(([, rule]) => !!rule?.meta?.fixable)
    .map(([name]) => name),
);

const probeFixture = (
  rule: string,
  testCase: FixtureCase,
  fixable: boolean,
  owner: string,
): { findings: Finding[]; counters: Counters } => {
  const counters = blankCounters();
  const findings: Finding[] = [];
  const cross = rule !== owner;
  counters.fixturesConsidered++;

  const filename = defaultFilenameFor(testCase);
  const preferJsx = /\.[jt]sx$/.test(filename);

  const control = verify(rule, testCase.code, testCase, filename, owner);
  if (!control) {
    counters.controlFatal++;
    return { findings, counters };
  }
  if (control.length > 0) counters.controlReporting++;

  const perturbations = perturbationsFor(testCase.code, preferJsx);
  if (!perturbations.length) return { findings, counters };
  counters.fixturesWithCandidates++;
  counters.perturbationsEmitted += perturbations.length;

  let baseFixed: string | null | undefined;
  const baseFixClean = () => {
    if (baseFixed === undefined)
      baseFixed = fix(rule, testCase.code, testCase, filename, owner);
    if (baseFixed === null) return false;
    return !!parseEither(baseFixed, preferJsx);
  };

  const controlIds = countOf(idsOf(control));

  for (const perturbation of perturbations) {
    const drop: LintDrop = { fatal: false, threw: false };
    const messages = verify(
      rule,
      perturbation.code,
      testCase,
      filename,
      owner,
      drop,
    );
    if (!messages) {
      if (drop.threw) counters.variantLintThrew++;
      else counters.variantLintFatal++;
      continue;
    }

    // ---------------- ARM A: detection ----------------
    if (control.length > 0) {
      const afterIds = countOf(idsOf(messages));
      const lost = [...controlIds.entries()].filter(
        ([id, count]) => (afterIds.get(id) || 0) < count,
      );
      if (lost.length > 0) {
        findings.push({
          rule,
          owner,
          cross,
          arm: 'A',
          oracle: 'DETECTION_LOST',
          variant: perturbation.kind,
          attribution: 'clean',
          detail: `subject \`${perturbation.subject}\`; lost ${lost
            .map(
              ([id, count]) => `${id} (${count} -> ${afterIds.get(id) || 0})`,
            )
            .join(', ')}`,
          origin: testCase.origin,
          filename,
          base: testCase.code,
          input: perturbation.code,
          output: `reports on the unperturbed fixture: ${
            idsOf(control).join(', ') || '(none)'
          }\nreports on the perturbed fixture: ${
            idsOf(messages).join(', ') || '(none)'
          }`,
        });
      }
    }

    // ---------------- ARM B: fix corruption ----------------
    if (!fixable || messages.length === 0) continue;
    const fixed = fix(rule, perturbation.code, testCase, filename, owner);
    if (fixed === null) {
      counters.variantFixThrew++;
      continue;
    }
    if (fixed === perturbation.code) {
      counters.declines++;
      continue;
    }
    counters.fixersRewrote++;

    const perturbedAst = parseEither(perturbation.code, preferJsx);
    const siblingRange = perturbedAst
      ? siblingDeclaratorRange(perturbedAst, perturbation.sibling)
      : null;
    const insideSibling = (message: Linter.LintMessage) => {
      if (!siblingRange) return false;
      const start = offsetOf(perturbation.code, message.line, message.column);
      const end =
        message.endLine == null || message.endColumn == null
          ? start
          : offsetOf(perturbation.code, message.endLine, message.endColumn);
      return start >= siblingRange[0] && end <= siblingRange[1];
    };
    const onSibling = messages.filter(insideSibling).length;
    if (onSibling === messages.length) {
      counters.siblingIsSubject++;
      continue;
    }
    if (onSibling > 0) counters.siblingIsMixedSubject++;
    counters.oraclesEvaluated++;
    const attribution = onSibling > 0 ? 'mixed' : 'clean';

    const push = (oracle: Oracle, detail: string) => {
      if (!baseFixClean()) {
        counters.attributionRejected++;
        return;
      }
      findings.push({
        rule,
        owner,
        cross,
        arm: 'B',
        oracle,
        variant: perturbation.kind,
        attribution,
        detail: `subject \`${perturbation.subject}\`, sibling \`${perturbation.sibling}\`; ${detail}`,
        origin: testCase.origin,
        filename,
        base: testCase.code,
        input: perturbation.code,
        output: fixed,
      });
    };

    const fixedAst = parseEither(fixed, preferJsx);
    if (!fixedAst) {
      push('UNPARSEABLE', 'the fixed output does not parse');
      continue;
    }
    const occurrences = occurrencesOf(fixed, perturbation.sibling);
    if (occurrences === 0) {
      const editedSpan = editedSpanOf(perturbation.code, fixed);
      const insideEdit = (range: [number, number]) =>
        range[0] >= editedSpan.start && range[1] <= editedSpan.end;
      const subjectSurvives = occurrencesOf(fixed, perturbation.subject) > 0;
      const spanTookBoth =
        siblingRange !== null &&
        insideEdit(siblingRange) &&
        insideEdit(perturbation.subjectRange);
      if (spanTookBoth && !subjectSurvives) {
        counters.destructionLicensed++;
        continue;
      }
      push(
        'SIBLING_DESTROYED',
        `the sibling binding is absent from the output (${
          subjectSurvives
            ? `the subject \`${perturbation.subject}\` survives, so the fixer did not remove the declaration as a unit`
            : 'the edit the fixer made does not cover the whole declaration'
        })`,
      );
      continue;
    }
    if (occurrences > 1) {
      push(
        'SIBLING_DUPLICATED',
        `the sibling appears ${occurrences} times (a re-declaration is a TS error)`,
      );
      continue;
    }
    const fixedRange = siblingDeclaratorRange(fixedAst, perturbation.sibling);
    if (!fixedRange) {
      push('SIBLING_MUTATED', 'the sibling is no longer a variable declarator');
      continue;
    }
    const declaratorText = fixed.slice(fixedRange[0], fixedRange[1]);
    const initText = declaratorText
      .slice(declaratorText.indexOf('=') + 1)
      .trim();
    if (initText !== SIBLING_INIT) {
      const solo = fix(
        rule,
        perturbation.soloSibling,
        testCase,
        filename,
        owner,
      );
      const soloAst = solo === null ? null : parseEither(solo, preferJsx);
      const soloRange =
        soloAst && solo !== null
          ? siblingDeclaratorRange(soloAst, perturbation.sibling)
          : null;
      const soloText =
        solo !== null && soloRange
          ? solo.slice(soloRange[0], soloRange[1])
          : null;
      const soloInit =
        soloText === null
          ? null
          : soloText.slice(soloText.indexOf('=') + 1).trim();
      if (soloInit !== null && soloInit === initText) {
        counters.mutationLicensed++;
      } else {
        push(
          'SIBLING_MUTATED',
          `the sibling initializer became \`${initText}\` (was \`${SIBLING_INIT}\`` +
            `; standing alone the rule makes it \`${
              soloInit ?? '(no rewrite)'
            }\`)`,
        );
      }
    }
  }

  return { findings, counters };
};

// ---------------------------------------------------------------------------
// Cross sweep
// ---------------------------------------------------------------------------

const corpus = harvestFixtureCorpus();

const subjects = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .sort();

/** The screen: every plugin rule, so no rule is excluded by `recommended`. */
const SCREEN_RULES: Record<string, unknown> = {};
for (const name of subjects) SCREEN_RULES[PREFIX + name] = 'error';

const totals = blankCounters();
const crossTotals = blankCounters();
const findings: Finding[] = [];
const stats = {
  fixtures: 0,
  nonTs: 0,
  screenFatal: 0,
  screenThrew: 0,
  pairs: 0,
  crossPairs: 0,
  fixers: new Set<string>(),
  crossFixers: new Set<string>(),
  owners: new Set<string>(),
};

const started = Date.now();
let done = 0;
for (const [owner, cases] of corpus.byRule) {
  for (const testCase of cases) {
    done++;
    if (done % 2000 === 0) {
      process.stderr.write(
        `  ...${done} fixtures, ${stats.pairs} pairs (${
          stats.crossPairs
        } cross), ${findings.length} findings, ${Math.round(
          (Date.now() - started) / 1000,
        )}s\n`,
      );
    }
    if (testCase.language !== 'ts') {
      stats.nonTs++;
      continue;
    }
    stats.fixtures++;
    const filename = defaultFilenameFor(testCase);
    const ownerId = PREFIX + owner;
    let screened: Linter.LintMessage[];
    try {
      screened = linter.verify(
        testCase.code,
        configFor(testCase, {
          ...SCREEN_RULES,
          ...(SCREEN_RULES[ownerId]
            ? { [ownerId]: severityWithOptions(testCase) }
            : {}),
        }),
        { filename },
      );
    } catch {
      stats.screenThrew++;
      continue;
    }
    if (screened.some((message) => message.fatal)) {
      stats.screenFatal++;
      continue;
    }
    const reporting = new Set(
      screened
        .map((message) => message.ruleId)
        .filter((id): id is string => !!id && id.startsWith(PREFIX))
        .map((id) => id.slice(PREFIX.length)),
    );
    // The owner is probed too, so the shipped guard's cell is reproduced here
    // rather than assumed: an own finding this probe cannot see would mean the
    // machinery diverged.
    reporting.add(owner);
    stats.owners.add(owner);
    for (const rule of reporting) {
      if (!subjects.includes(rule)) continue;
      const cross = rule !== owner;
      stats.pairs++;
      if (cross) stats.crossPairs++;
      const result = probeFixture(
        rule,
        testCase,
        fixableRules.has(rule),
        owner,
      );
      add(totals, result.counters);
      if (cross) add(crossTotals, result.counters);
      if (result.counters.oraclesEvaluated > 0) {
        stats.fixers.add(rule);
        if (cross) stats.crossFixers.add(rule);
      }
      findings.push(...result.findings);
    }
  }
}

// ---------------------------------------------------------------------------
// Planted controls. A zero over the real rules asserts nothing without these.
//
// The oracles, the attribution isolations and the destruction licensing are a
// second copy of the shipped guard's, so every gate they depend on is exercised
// HERE too — an unexercised copy rots into a permanent green.
// ---------------------------------------------------------------------------

const defineControl = (
  id: string,
  create: (context: any) => Record<string, unknown>,
) => {
  linter.defineRule(PREFIX + id, {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: { probe: 'planted control' },
    },
    create,
  } as never);
  return id;
};

/** The subject every planted control keys on, so none of them fires corpus-wide. */
const TARGET = 'probeControlTarget';

const declarationOf = (node: any) => node.parent;

/**
 * The exact defect ARM B exists to find: reason about a declarator, splice at
 * the enclosing `VariableDeclaration`, and every sibling after it is deleted.
 */
const DESTROYER = defineControl(
  'control-declaration-range-destroyer',
  (context) => ({
    VariableDeclarator(node: any) {
      if (node.id?.type !== 'Identifier' || node.id.name !== TARGET) return;
      const declaration = declarationOf(node);
      context.report({
        node,
        messageId: 'probe',
        fix: (fixer: any) =>
          fixer.replaceTextRange(
            declaration.range,
            `${declaration.kind} ${node.id.name} = ${context
              .getSourceCode()
              .getText(node.init)};`,
          ),
      });
    },
  }),
);

/** Edits only its own subject's initializer: nothing may be attributed to it. */
const INITIALIZER_ONLY = defineControl(
  'control-initializer-only',
  (context) => ({
    VariableDeclarator(node: any) {
      if (node.id?.type !== 'Identifier' || node.id.name !== TARGET) return;
      if (context.getSourceCode().getText(node.init) === '99') return;
      context.report({
        node,
        messageId: 'probe',
        fix: (fixer: any) => fixer.replaceText(node.init, '99'),
      });
    },
  }),
);

/**
 * Removes the whole declaration as a unit and re-emits NOTHING: the subject
 * dies with the sibling, which is the deletion #1930 licenses.
 */
const SPAN_DELETER = defineControl('control-span-deleter', (context) => ({
  VariableDeclarator(node: any) {
    if (node.id?.type !== 'Identifier' || node.id.name !== TARGET) return;
    context.report({
      node,
      messageId: 'probe',
      fix: (fixer: any) => fixer.removeRange(declarationOf(node).range),
    });
  },
}));

/**
 * Deletes the same statement but re-emits the SUBJECT elsewhere. It destroyed
 * the sibling for real, so the licensing must NOT swallow it — this is why the
 * gate cannot simply ask "was the sibling inside something that got deleted".
 */
const RELOCATING_DESTROYER = defineControl(
  'control-relocating-destroyer',
  (context) => ({
    VariableDeclarator(node: any) {
      if (node.id?.type !== 'Identifier' || node.id.name !== TARGET) return;
      const source = context.getSourceCode();
      const declaration = declarationOf(node);
      const init = source.getText(node.init);
      const text = source.getText();
      if (declaration.range[1] >= text.length) return;
      /**
       * Everything after the declaration is carried through UNCHANGED. An
       * earlier spelling replaced the declaration's start through EOF outright,
       * which also swallowed the fixture's other statements — and on the
       * perturbation of one of THOSE the subject and the sibling then vanished
       * together, which is a correctly LICENSED deletion. The control read as
       * broken while measuring something it was not built to measure.
       */
      const rest = text.slice(declaration.range[1]);
      context.report({
        node,
        messageId: 'probe',
        // Removes the declaration AS A UNIT and re-emits the SUBJECT past the
        // deleted span. The span test alone would license this, so it is the
        // control proving the licensing also requires the subject to be gone.
        fix: (fixer: any) =>
          fixer.replaceTextRange(
            [declaration.range[0], text.length],
            `${rest}\n${declaration.kind} ${node.id.name} = ${init};\n`,
          ),
      });
    },
  }),
);

/**
 * Reports on the SIBLING as well as the subject and still destroys it. A gate
 * keyed on attribution rather than per-oracle would drop this whole class.
 */
const MIXED_DESTROYER = defineControl('control-mixed-destroyer', (context) => ({
  VariableDeclarator(node: any) {
    if (node.id?.type !== 'Identifier') return;
    if (node.id.name.startsWith(SIBLING_STEM)) {
      context.report({ node, messageId: 'probe' });
      return;
    }
    if (node.id.name !== TARGET) return;
    const declaration = declarationOf(node);
    context.report({
      node,
      messageId: 'probe',
      fix: (fixer: any) =>
        fixer.replaceTextRange(
          declaration.range,
          `${declaration.kind} ${node.id.name} = ${context
            .getSourceCode()
            .getText(node.init)};`,
        ),
    });
  },
}));

/**
 * A FOREIGN owner name, so every control runs through the cross path: its
 * `options` are never the case's, exactly as for a real cross pair.
 */
const CONTROL_OWNER = 'some-foreign-owner';

/**
 * The subject is referenced NOWHERE else, which is what lets
 * `control-span-deleter` be licensed: the licensing requires the subject to be
 * absent from the finished output, and a surviving reference would keep it
 * present and turn the licensing control into a finding.
 */
const controlCase: FixtureCase = {
  code: `const ${TARGET} = 1;\nexport const other = 2;\n`,
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted-cross-control',
  bucket: 'valid',
};

const runControl = (id: string) =>
  probeFixture(id, controlCase, true, CONTROL_OWNER);

const destroyerResult = runControl(DESTROYER);
const initializerOnlyResult = runControl(INITIALIZER_ONLY);
const spanDeleterResult = runControl(SPAN_DELETER);
const relocatingResult = runControl(RELOCATING_DESTROYER);
const mixedResult = runControl(MIXED_DESTROYER);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const keyOf = (finding: Finding) =>
  `${finding.rule} | ARM ${finding.arm} | ${finding.oracle} | ${finding.variant} | ${finding.attribution}`;

const grouped = new Map<string, Finding[]>();
for (const finding of findings) {
  const key = keyOf(finding);
  const list = grouped.get(key) || [];
  list.push(finding);
  grouped.set(key, list);
}

const render = (finding: Finding) =>
  [
    `  witness owner=${finding.owner} origin=${finding.origin} as ${finding.filename}`,
    `  ${finding.detail}`,
    '  --- unperturbed fixture ---',
    finding.base.replace(/^/gm, '    '),
    '  --- perturbed input ---',
    finding.input.replace(/^/gm, '    '),
    `  --- ${finding.arm === 'B' ? 'fixed output' : 'report delta'} ---`,
    finding.output.replace(/^/gm, '    '),
  ].join('\n');

console.log(
  [
    '[cross multi-declarator] counters',
    `  fixtures (ts):             ${stats.fixtures}`,
    `  non-TypeScript skipped:    ${stats.nonTs}`,
    `  screen fatal / threw:      ${stats.screenFatal} / ${stats.screenThrew}`,
    `  owners reached:            ${stats.owners.size}`,
    `  PAIRS:                     ${stats.pairs} (${stats.crossPairs} CROSS)`,
    `  fixtures considered:       ${totals.fixturesConsidered} (${crossTotals.fixturesConsidered} cross)`,
    `  fixtures with candidates:  ${totals.fixturesWithCandidates} (${crossTotals.fixturesWithCandidates} cross)`,
    `  control REPORTING:         ${totals.controlReporting} (${crossTotals.controlReporting} cross)`,
    `  control fatal:             ${totals.controlFatal} (${crossTotals.controlFatal} cross)`,
    `  perturbations emitted:     ${totals.perturbationsEmitted} (${crossTotals.perturbationsEmitted} cross)`,
    `  fixers REWROTE:            ${totals.fixersRewrote} (${crossTotals.fixersRewrote} cross)`,
    `  rewrites MEASURED (B1-B4): ${totals.oraclesEvaluated} (${crossTotals.oraclesEvaluated} cross)`,
    `  fixers that DECLINED:      ${totals.declines} (${crossTotals.declines} cross)`,
    `  skipped sibling-is-subject:${totals.siblingIsSubject} (${crossTotals.siblingIsSubject} cross)`,
    `  measured but MIXED:        ${totals.siblingIsMixedSubject} (${crossTotals.siblingIsMixedSubject} cross)`,
    `  attribution rejected:      ${totals.attributionRejected} (${crossTotals.attributionRejected} cross)`,
    `  mutation LICENSED:         ${totals.mutationLicensed} (${crossTotals.mutationLicensed} cross)`,
    `  destruction LICENSED:      ${totals.destructionLicensed} (${crossTotals.destructionLicensed} cross)`,
    `  variant fatal / threw:     ${totals.variantLintFatal} / ${totals.variantLintThrew}`,
    `  variant FIX threw:         ${totals.variantFixThrew}`,
    `  distinct fixers measured:  ${stats.fixers.size} (${stats.crossFixers.size} cross)`,
    '  declarations skipped, by reason:',
    ...Object.entries(skipped).map(
      ([reason, count]) => `    ${reason}: ${count}`,
    ),
    `  findings: ${findings.length} in ${grouped.size} group(s)`,
    ...[...grouped.entries()].flatMap(([key, hits]) => [
      `\n${key} (${hits.length} occurrence(s), ${
        hits.filter((hit) => hit.cross).length
      } cross, over ${new Set(hits.map((hit) => hit.owner)).size} owner(s))`,
      render(hits.find((hit) => hit.cross) || hits[0]),
    ]),
  ].join('\n'),
);

// ---------------------------------------------------------------------------
// Floors and ceilings, each cut just under (or just over) its measured value.
// A floor parked far below what the sweep actually reaches readmits a silent
// corpus collapse — the floors that hid #1984 sat at 5,500 against an 8,141.
// ---------------------------------------------------------------------------

const FIXTURE_FLOOR = 20200; // measured 23,872
const PAIR_FLOOR = 72000; // measured 84,757
const CROSS_PAIR_FLOOR = 52000; // measured 60,885
const OWNER_FLOOR = 190; // measured 192
const CONTROL_REPORTING_FLOOR = 60500; // measured 71,134
const CROSS_CONTROL_REPORTING_FLOOR = 52000; // measured 60,885
const CANDIDATE_FIXTURE_FLOOR = 50000; // measured 54646
const PERTURBATION_FLOOR = 137000; // measured 159,492
const CROSS_PERTURBATION_FLOOR = 103000; // measured 119,630
const REWRITE_FLOOR = 26500; // measured 31,185
const CROSS_REWRITE_FLOOR = 20000; // measured 22,811
const MEASURED_FLOOR = 26300; // measured 30,865
const CROSS_MEASURED_FLOOR = 20000; // measured 22,811
const DECLINE_FLOOR = 41800; // measured 49,097
const CROSS_DECLINE_FLOOR = 39300; // measured 46,163
const FIXER_FLOOR = 80; // measured 81
const CROSS_FIXER_FLOOR = 57; // measured 58

const SCREEN_FATAL_CEILING = 0;
const SCREEN_THREW_CEILING = 0;
const CONTROL_FATAL_CEILING = 0;
const ATTRIBUTION_REJECTED_CEILING = 0;
const UNPARSEABLE_VARIANT_CEILING = 0;
/**
 * A perturbed variant that goes fatal, or throws, skips ARM A *and* ARM B for
 * that variant. The splice adds one initialized declarator to a statement the
 * unperturbed control already linted cleanly, so any of these is a probe defect
 * rather than a property of the corpus — hence zero rather than a ceiling.
 */
const VARIANT_LINT_FATAL_CEILING = 0;
const VARIANT_LINT_THREW_CEILING = 0;
const VARIANT_FIX_THREW_CEILING = 0;

/**
 * Declarations the perturbation refuses, by reason, each cut just above its
 * measurement. Six of these eight were printed and read by nothing, which is the
 * state a number has to be in to move unnoticed (#2222, #2225): a filter that
 * started swallowing declarations wholesale would empty the sweep while every
 * floor above still passed on what remained.
 */
const SKIP_CEILINGS: Record<SkipReason, number> = {
  multiDeclarator: 120,
  noInitializer: 170,
  destructuringSubject: 2800,
  declareModifier: 950,
  // No fixture declares a `using` binding; adding a declarator to one would
  // change what gets disposed, so the shape is refused rather than perturbed.
  usingKind: 10,
  notStatementLevel: 360,
  cappedPerFixture: 950,
  variantUnparseable: UNPARSEABLE_VARIANT_CEILING,
};

/**
 * Open defects this CROSS pairing found, keyed at the full finding granularity
 * (`<rule> | ARM <arm> | <oracle> | <variant> | <attribution>`). A rule-keyed
 * entry would un-gate every other arm the same rule participates in (#1839),
 * and would let a fix to `SUBJECT_FIRST` shield a still-broken `SUBJECT_SECOND`.
 */
export const CROSS_MULTI_DECLARATOR_BASELINE: Record<string, string> = {};

describe('the cross multi-declarator sweep is load-bearing', () => {
  it('harvests a corpus large enough for a zero to mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(subjects.length).toBeGreaterThan(150); // measured 194
    expect(stats.fixtures).toBeGreaterThanOrEqual(FIXTURE_FLOOR);
    expect(stats.owners.size).toBeGreaterThanOrEqual(OWNER_FLOOR);
  });

  it('pairs fixtures with FOREIGN rules, not just their owners', () => {
    expect(stats.pairs).toBeGreaterThanOrEqual(PAIR_FLOOR);
    // The whole point of the file: without this the sweep is the shipped
    // own-corpus guard run a second time.
    expect(stats.crossPairs).toBeGreaterThanOrEqual(CROSS_PAIR_FLOOR);
    /**
     * The denominator every count below is drawn from. CLOSED against the
     * pairing rather than only floored: `probeFixture` runs exactly once per
     * counted pair, so the identity fails the moment a pair stops reaching the
     * probe — a loss no floor cut under a moving corpus can promise to catch.
     * The floor beside it keeps that identity from being satisfied by a corpus
     * which collapsed on both sides at once.
     */
    expect(totals.fixturesConsidered).toBe(stats.pairs);
    expect(totals.fixturesConsidered).toBeGreaterThanOrEqual(PAIR_FLOOR); // measured 84770
  });

  it('reaches the rules: the unperturbed control REPORTS', () => {
    expect(totals.controlReporting).toBeGreaterThanOrEqual(
      CONTROL_REPORTING_FLOOR,
    );
    expect(crossTotals.controlReporting).toBeGreaterThanOrEqual(
      CROSS_CONTROL_REPORTING_FLOOR,
    );
  });

  it('actually perturbs the fixtures it pairs', () => {
    expect(totals.perturbationsEmitted).toBeGreaterThanOrEqual(
      PERTURBATION_FLOOR,
    );
    expect(crossTotals.perturbationsEmitted).toBeGreaterThanOrEqual(
      CROSS_PERTURBATION_FLOOR,
    );
    /**
     * The narrower population the perturbation totals are spread over. A
     * perturbation count alone cannot distinguish a sweep reaching most of the
     * corpus from one emitting many variants of a handful of fixtures, which is
     * the shape a shrinking candidate set decays into.
     */
    expect(totals.fixturesWithCandidates).toBeGreaterThanOrEqual(
      CANDIDATE_FIXTURE_FLOOR,
    );
  });

  it('reaches live FIXERS through foreign fixtures', () => {
    expect(totals.fixersRewrote).toBeGreaterThanOrEqual(REWRITE_FLOOR);
    expect(crossTotals.fixersRewrote).toBeGreaterThanOrEqual(
      CROSS_REWRITE_FLOOR,
    );
    // …and the rewrites must survive both isolations to be MEASURED. A filter
    // that swallowed them all would leave arm B silent while looking busy.
    expect(totals.oraclesEvaluated).toBeGreaterThanOrEqual(MEASURED_FLOOR);
    expect(crossTotals.oraclesEvaluated).toBeGreaterThanOrEqual(
      CROSS_MEASURED_FLOOR,
    );
    expect(stats.fixers.size).toBeGreaterThanOrEqual(FIXER_FLOOR);
    expect(stats.crossFixers.size).toBeGreaterThanOrEqual(CROSS_FIXER_FLOOR);
    // A decline is correct behaviour, and its presence proves the sweep reaches
    // fixers with a real opinion about these statements.
    expect(totals.declines).toBeGreaterThanOrEqual(DECLINE_FLOOR);
    expect(crossTotals.declines).toBeGreaterThanOrEqual(CROSS_DECLINE_FLOOR);
  });

  it('accounts for every case it does NOT judge', () => {
    // A skip counter no `expect` reads discards cases in silence — which is how
    // 106 fatal-parse fixtures went unnoticed in #1984. Each ceiling is cut
    // close to its measured value, so a NEW silent loss fails here.
    expect(stats.screenFatal).toBeLessThanOrEqual(SCREEN_FATAL_CEILING);
    expect(stats.screenThrew).toBeLessThanOrEqual(SCREEN_THREW_CEILING);
    expect(totals.controlFatal).toBeLessThanOrEqual(CONTROL_FATAL_CEILING);
    expect(totals.attributionRejected).toBeLessThanOrEqual(
      ATTRIBUTION_REJECTED_CEILING,
    );
    expect(skipped.variantUnparseable).toBeLessThanOrEqual(
      UNPARSEABLE_VARIANT_CEILING,
    );
    // The two drops the perturbation loop used to fold into a bare `continue`:
    // a variant that produces no verdict is skipped by BOTH arms, and a fixer
    // that throws leaves ARM B with nothing to measure.
    expect(totals.variantLintFatal).toBeLessThanOrEqual(
      VARIANT_LINT_FATAL_CEILING,
    );
    expect(totals.variantLintThrew).toBeLessThanOrEqual(
      VARIANT_LINT_THREW_CEILING,
    );
    expect(totals.variantFixThrew).toBeLessThanOrEqual(
      VARIANT_FIX_THREW_CEILING,
    );
    const exceeded = (Object.keys(SKIP_CEILINGS) as SkipReason[])
      .filter((reason) => skipped[reason] > SKIP_CEILINGS[reason])
      .map(
        (reason) => `${reason}: ${skipped[reason]} > ${SKIP_CEILINGS[reason]}`,
      );
    expect(exceeded).toEqual([]);
  });

  /**
   * The language skip, pinned to the corpus property it must equal rather than
   * to a ceiling: every non-TypeScript case is skipped (a `package.json` body
   * has no declaration to give a sibling) and no TypeScript one is, so a filter
   * that started dropping TS fixtures for an unrelated reason fails here instead
   * of shrinking the sweep in silence. Dropping the non-TS testers wholesale is
   * what hid #1860.
   */
  it('skips exactly the non-TypeScript fixtures, and no others', () => {
    const nonTsAvailable = [...corpus.byRule.values()].reduce(
      (count, cases) =>
        count + cases.filter((testCase) => testCase.language !== 'ts').length,
      0,
    );
    expect(stats.nonTs).toBe(nonTsAvailable);
    // Floored so the equality cannot be satisfied by a corpus that stopped
    // carrying non-TypeScript fixtures at all.
    expect(stats.nonTs).toBeGreaterThanOrEqual(100); // measured 108
    // Nothing is lost between the walk and the two buckets.
    expect(stats.fixtures + stats.nonTs).toBe(corpus.totalCases);
  });

  it('detects a fixer that destroys a sibling (planted POSITIVE control)', () => {
    expect(destroyerResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(destroyerResult.counters.oraclesEvaluated).toBeGreaterThan(0);
    expect(
      destroyerResult.findings.filter(
        (finding) => finding.oracle === 'SIBLING_DESTROYED',
      ).length,
    ).toBeGreaterThan(0);
    // It must fire through the CROSS path, or the positive control proves only
    // that the own-corpus arm works.
    expect(destroyerResult.findings.every((finding) => finding.cross)).toBe(
      true,
    );
  });

  it('stays silent on a fixer that edits only the initializer (NEGATIVE control)', () => {
    // A control the sweep never actually rewrote would prove nothing.
    expect(initializerOnlyResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(initializerOnlyResult.findings).toEqual([]);
  });

  it('licenses a deletion that removes the subject and the sibling together', () => {
    // Silence must come from the DESTRUCTION licensing, not from an earlier
    // filter: an attribution rejection or a decline produces the same zero.
    expect(spanDeleterResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(spanDeleterResult.counters.oraclesEvaluated).toBeGreaterThan(0);
    expect(spanDeleterResult.counters.attributionRejected).toBe(0);
    expect(spanDeleterResult.counters.destructionLicensed).toBeGreaterThan(0);
    expect(spanDeleterResult.findings).toEqual([]);
  });

  it('still catches a deletion that keeps the SUBJECT and drops the sibling', () => {
    expect(relocatingResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(relocatingResult.counters.attributionRejected).toBe(0);
    expect(relocatingResult.counters.destructionLicensed).toBe(0);
    expect(
      relocatingResult.findings.filter(
        (finding) => finding.oracle === 'SIBLING_DESTROYED',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('still catches a fixer that reports on the sibling AND destroys it', () => {
    // The gate is per-oracle: a report about a binding licenses rewriting it,
    // never deleting it.
    expect(mixedResult.counters.siblingIsMixedSubject).toBeGreaterThan(0);
    const destroyed = mixedResult.findings.filter(
      (finding) => finding.oracle === 'SIBLING_DESTROYED',
    );
    expect(destroyed.length).toBeGreaterThan(0);
    expect(destroyed.every((finding) => finding.attribution === 'mixed')).toBe(
      true,
    );
  });
});

describe('a sibling declarator survives every rule that REPORTS on the fixture', () => {
  it('reports every finding outside the documented baseline', () => {
    const summary = [...grouped.entries()]
      .filter(([key]) => !(key in CROSS_MULTI_DECLARATOR_BASELINE))
      .map(([key, hits]) => `${key} (${hits.length})`)
      .sort();
    expect(summary).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    // A baseline that outlives its defect shields the next regression.
    const live = new Set(grouped.keys());
    const stale = Object.keys(CROSS_MULTI_DECLARATOR_BASELINE).filter(
      (key) => !live.has(key),
    );
    expect(stale).toEqual([]);
  });
});
