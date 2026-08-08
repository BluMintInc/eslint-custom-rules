/**
 * A rule whose subject is a variable declaration must survive a SIBLING
 * declarator.
 *
 * Every fixture in this repo writes the subject as the sole declarator —
 * `const x = ...;` — because that is what a minimal repro looks like. Real code
 * writes `const x = ..., y = ...;`, and two distinct hazards live in the gap:
 *
 *   ARM A (DETECTION). A rule that reaches its subject through
 *   `node.declarations[0]` answers about the WRONG BINDING the moment the
 *   subject is not first. Five rules index `declarations[0]` and sixty visit
 *   `VariableDeclaration`, so the verdict can change purely by position.
 *
 *   ARM B (FIX CORRUPTION). A fixer that reasons about a `VariableDeclarator`
 *   but splices at the enclosing `VariableDeclaration` range — the usual way to
 *   capture the `const ` keyword — or that hoists/removes the whole statement,
 *   DESTROYS every sibling binding. That is a silent deletion of code the rule
 *   was never asked about.
 *
 * Method, per harvested fixture: find each top-level-of-its-block
 * `VariableDeclaration` with exactly one initialized identifier declarator and
 * emit two semantics-preserving variants of the fixture,
 * `const <subj> = <init>, __probeSiblingN = 1;` and its mirror with the sibling
 * FIRST. The splice is done on the declarator's AST RANGE; a regex over the text
 * corrupts template literals and multi-line initializers.
 *
 * DECLINING IS CORRECT. A fixer that refuses to rewrite a multi-declarator
 * statement produces byte-identical output and keeps its report; splitting a
 * declaration is genuinely harder than it looks, and a decline is the safe
 * answer. Only CORRUPTION (B1-B4) or a silent DETECTION LOSS is a finding, and
 * declines are counted separately as evidence the probe reaches live fixers.
 *
 * ATTRIBUTION (load-bearing). A raw diff between the single-declarator and
 * multi-declarator outcomes conflates "the sibling broke the fixer" with "the
 * fixer legitimately reformatted", and it conflates corruption with a rule
 * acting on the sibling as its OWN subject. Three isolations run before anything
 * is attributed:
 *   - the same fixer is re-run with the sibling REMOVED (the untouched
 *     fixture); a finding survives only if that run is clean, so a pre-existing
 *     fixer defect is not re-filed here;
 *   - a fixture where EVERY report lands inside the sibling declarator is the
 *     rule talking only about `__probeSiblingN`, and is dropped outright; and
 *   - a sibling REWRITE is compared against the same fixer run on the sibling
 *     standing ALONE in the subject's scope. An edit the rule makes either way
 *     is its own consistent opinion about that declarator, not damage from the
 *     subject's fix.
 * That third isolation is per-ORACLE, not per-rule, and the distinction is the
 * whole point: a report about a binding licenses REWRITING it and never
 * DELETING it, so destruction, duplication and unparseable output are still
 * measured on a rule that reports on the sibling. Keying it on attribution
 * instead would drop that entire class (`control-mixed-destroyer` holds the
 * line). Without the licensing isolation, `global-const-style` appending
 * `as const` to a module-level literal — exactly what it exists to do —
 * fabricated 148 findings.
 */
import { Linter, Rule } from 'eslint';
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
// Perturbation
// ---------------------------------------------------------------------------

const SIBLING_STEM = '__probeSibling';
const SIBLING_INIT = '1';

type VariantKind = 'SUBJECT_FIRST' | 'SUBJECT_SECOND';

type Perturbation = {
  kind: VariantKind;
  code: string;
  sibling: string;
  /** The subject binding, so a finding names what was supposed to be probed. */
  subject: string;
  /**
   * The fixture with the SUBJECT replaced by the sibling, so the sibling stands
   * alone in the subject's exact scope, export form and file. This is the
   * licensing control for `SIBLING_MUTATED`: it asks what the rule does to
   * `__probeSiblingN` when that binding is the only thing it can see.
   */
  soloSibling: string;
};

/**
 * Containers whose statement list a declaration can sit directly in. A
 * declaration in a `for` head or a `switch` discriminant is not "top level of
 * its block" and adding a declarator there changes what the loop iterates.
 */
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

/**
 * A cap, not a filter: three declarations per fixture keeps the sweep inside a
 * single-digit-minute budget while still reaching every rule's shapes, and the
 * residue is counted so the cap can never read as "nothing to perturb".
 */
const MAX_PER_FIXTURE = 3;

const tryParse = (code: string, jsx: boolean) => {
  try {
    // `range`/`loc` are not optional: without them any comment OR JSX throws,
    // and that throw reads as a finding.
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
 * Every semantics-preserving multi-declarator respelling of one fixture.
 *
 * The subject keeps its name, its initializer text and its kind; only a second
 * binding of a literal `1` joins the statement. That is the smallest edit that
 * turns "the sole declarator" into "one of several" without giving any rule a
 * new opinion to have.
 */
const perturbationsFor = (code: string, preferJsx: boolean): Perturbation[] => {
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
    const candidates: Perturbation[] = [
      {
        kind: 'SUBJECT_FIRST',
        sibling,
        subject,
        soloSibling,
        code: `${code.slice(0, end)}, ${sibling} = ${SIBLING_INIT}${code.slice(
          end,
        )}`,
      },
      {
        kind: 'SUBJECT_SECOND',
        sibling,
        subject,
        soloSibling,
        code: `${code.slice(
          0,
          start,
        )}${sibling} = ${SIBLING_INIT}, ${code.slice(start)}`,
      },
    ];
    for (const candidate of candidates) {
      // A splice that does not parse is a probe bug, never a finding.
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

/** A case's options must reach BOTH passes, or a finding is a fabrication. */
const soloRules = (rule: string, testCase: FixtureCase) => ({
  [PREFIX + rule]: severityWithOptions(testCase),
});

const verify = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): Linter.LintMessage[] | null => {
  try {
    const messages = linter.verify(
      code,
      configFor(testCase, soloRules(rule, testCase)),
      { filename },
    );
    // A fatal reports nothing else, so it is indistinguishable from silence.
    if (messages.some((message) => message.fatal)) return null;
    return messages.filter((message) => message.ruleId === PREFIX + rule);
  } catch {
    return null;
  }
};

const fix = (
  rule: string,
  code: string,
  testCase: FixtureCase,
  filename: string,
): string | null => {
  try {
    const result = linter.verifyAndFix(
      code,
      configFor(testCase, soloRules(rule, testCase)),
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

/** 1-based line/column to a 0-based character offset. */
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

const siblingOccurrences = (code: string, sibling: string) =>
  (code.match(new RegExp(`\\b${sibling}\\b`, 'g')) || []).length;

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

type Oracle =
  | 'DETECTION_LOST'
  | 'SIBLING_DESTROYED'
  | 'UNPARSEABLE'
  | 'SIBLING_DUPLICATED'
  | 'SIBLING_MUTATED';

type Finding = {
  rule: string;
  arm: 'A' | 'B';
  oracle: Oracle;
  variant: VariantKind;
  /**
   * `clean` — the rule has no opinion about `__probeSiblingN` at all, so any
   * change to it is corruption. `mixed` — the rule reports on the sibling AND
   * on something else, so the change may be the rule acting on its own subject;
   * kept and labelled rather than dropped, since dropping it is how a real
   * destruction hides behind an incidental report.
   */
  attribution: 'clean' | 'mixed';
  detail: string;
  origin: string;
  filename: string;
  /** The unperturbed fixture, so the isolation is reproducible by hand. */
  base: string;
  /** The exact perturbed source handed to the rule. */
  input: string;
  /** The exact output: the fixer's, or the report delta for arm A. */
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
  /**
   * Sibling rewrites the rule makes IDENTICALLY when the sibling stands alone,
   * so the edit is its own consistent opinion rather than collateral damage.
   */
  mutationLicensed: number;
  /**
   * Rewrites that survived both isolations and were actually measured against
   * B1-B4. The rewrite count alone cannot carry the arm-B zero: if every
   * rewrite were filtered out before the oracles ran, the arm would be silent
   * while looking busy.
   */
  oraclesEvaluated: number;
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
  oraclesEvaluated: 0,
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

/**
 * One fixture, both arms.
 *
 * The control comes first and is the whole reason a zero can mean anything: a
 * rule that is silent on the untouched fixture cannot LOSE a report, and a
 * fixture whose control is fatal is not being linted at all.
 */
const probeFixture = (
  rule: string,
  testCase: FixtureCase,
  fixable: boolean,
): { findings: Finding[]; counters: Counters } => {
  const counters = blankCounters();
  const findings: Finding[] = [];
  counters.fixturesConsidered++;

  const filename = defaultFilenameFor(testCase);
  const preferJsx = /\.[jt]sx$/.test(filename);

  const control = verify(rule, testCase.code, testCase, filename);
  if (!control) {
    counters.controlFatal++;
    return { findings, counters };
  }
  if (control.length > 0) counters.controlReporting++;

  const perturbations = perturbationsFor(testCase.code, preferJsx);
  if (!perturbations.length) return { findings, counters };
  counters.fixturesWithCandidates++;
  counters.perturbationsEmitted += perturbations.length;

  /** The attribution control: the same fixer with NO sibling present. */
  let baseFixed: string | null | undefined;
  const baseFixClean = () => {
    if (baseFixed === undefined)
      baseFixed = fix(rule, testCase.code, testCase, filename);
    if (baseFixed === null) return false;
    return !!parseEither(baseFixed, preferJsx);
  };

  const controlIds = countOf(idsOf(control));

  for (const perturbation of perturbations) {
    const messages = verify(rule, perturbation.code, testCase, filename);
    if (!messages) continue;

    // ---------------- ARM A: detection ----------------
    if (control.length > 0) {
      const afterIds = countOf(idsOf(messages));
      const lost = [...controlIds.entries()].filter(
        ([id, count]) => (afterIds.get(id) || 0) < count,
      );
      if (lost.length > 0) {
        findings.push({
          rule,
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
    const fixed = fix(rule, perturbation.code, testCase, filename);
    if (fixed === null) continue;
    if (fixed === perturbation.code) {
      // A fixer that refuses to rewrite a multi-declarator statement is
      // behaving well, so this is evidence the probe reached a live fixer.
      counters.declines++;
      continue;
    }
    counters.fixersRewrote++;

    /**
     * The rule may have a genuine opinion about `__probeSiblingN` itself — a
     * naming rule renames it, a const-style rule rewrites it. Whatever it then
     * does to that binding is the rule working on its own subject, not
     * corruption, and counting it would fabricate a finding.
     *
     * The skip is deliberately narrow: it applies only when EVERY report lands
     * inside the sibling. A rule that reports on the subject as well is still
     * measured, and its findings are labelled `mixed` — dropping those wholesale
     * is how a real destruction would hide behind one incidental report. What a
     * `mixed` rule is allowed to do to the sibling is decided per-oracle, by the
     * licensing isolation at `SIBLING_MUTATED` below, not here.
     */
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
      // Isolation: a fixer already broken WITHOUT a sibling is a different
      // axis's finding, not this one's.
      if (!baseFixClean()) {
        counters.attributionRejected++;
        return;
      }
      findings.push({
        rule,
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
    const occurrences = siblingOccurrences(fixed, perturbation.sibling);
    if (occurrences === 0) {
      push(
        'SIBLING_DESTROYED',
        'the sibling binding is absent from the output',
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
      /**
       * Licensing isolation, the mirror of `baseFixClean`: that control removes
       * the sibling and keeps the subject, this one removes the SUBJECT and
       * keeps the sibling, in the same scope, export form and file. If the rule
       * rewrites `__probeSiblingN` the same way when it is the only binding in
       * sight, the edit is the rule's own consistent opinion about that
       * declarator and not damage inflicted by the subject's fix —
       * `global-const-style` appending `as const` to a module-level literal is
       * the rule working, and counting it fabricated 148 findings.
       *
       * Deliberately narrower than the `mixed` attribution it replaces: it gates
       * only this oracle, and only on a BYTE-IDENTICAL solo rewrite. A fixer
       * that destroys, duplicates or unparses the sibling is still measured even
       * when the rule reports on it, so a real destruction cannot hide behind an
       * incidental report.
       */
      const solo = fix(rule, perturbation.soloSibling, testCase, filename);
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
// Sweep
// ---------------------------------------------------------------------------

const corpus = harvestFixtureCorpus();

/**
 * The ONLY permitted exclusion is `silentWithoutProgramRuleNames` — rules
 * MEASURED to report nothing under a bare `Linter`, and so able to contribute
 * only a false clean. It is deliberately not "every rule mentioning
 * `getParserServices`": that premise is measured false (all 16 report, #1859),
 * because `@typescript-eslint/parser` returns an isolated single-file program
 * even with no `project`. Dropping those 16 previously hid six shipping fixer
 * defects (#1878 -> #1881-#1885).
 */
const subjects = Object.keys(plugin.rules)
  .filter((name) => !silentWithoutProgramRuleNames.has(name))
  .sort();

const totals = blankCounters();
const findings: Finding[] = [];
let nonTypeScriptSkipped = 0;
const rulesExercised = new Set<string>();
/** Per-rule census, so "the probe reached the fixers" is legible per rule. */
const byRuleCounters = new Map<string, Counters>();

for (const rule of subjects) {
  const fixable = fixableRules.has(rule);
  const ruleCounters = blankCounters();
  for (const testCase of corpus.byRule.get(rule) || []) {
    // A `package.json` body or a Markdown document has no TypeScript
    // declaration to give a sibling; skipping by LANGUAGE keeps the skip honest.
    if (testCase.language !== 'ts') {
      nonTypeScriptSkipped++;
      continue;
    }
    const result = probeFixture(rule, testCase, fixable);
    add(totals, result.counters);
    add(ruleCounters, result.counters);
    if (result.counters.perturbationsEmitted > 0) rulesExercised.add(rule);
    findings.push(...result.findings);
  }
  byRuleCounters.set(rule, ruleCounters);
}

/** Rules whose fixer actually ran the B1-B4 gauntlet, and how often. */
const fixersMeasured = [...byRuleCounters.entries()]
  .filter(([, counters]) => counters.oraclesEvaluated > 0)
  .sort((a, b) => b[1].oraclesEvaluated - a[1].oraclesEvaluated);
/** Rules with an opinion about the planted sibling, so the skip is legible. */
const siblingSubjectRules = [...byRuleCounters.entries()]
  .filter(
    ([, counters]) =>
      counters.siblingIsSubject > 0 || counters.siblingIsMixedSubject > 0,
  )
  .sort((a, b) => b[1].siblingIsSubject - a[1].siblingIsSubject);
const fixersThatDeclined = [...byRuleCounters.entries()]
  .filter(([, counters]) => counters.declines > 0)
  .sort((a, b) => b[1].declines - a[1].declines);

// ---------------------------------------------------------------------------
// Planted controls. A zero over the real rules asserts nothing without these.
// ---------------------------------------------------------------------------

/**
 * The exact defect shape ARM B exists to find: a fixer that reasons about a
 * declarator but splices at the enclosing `VariableDeclaration` range, keeping
 * only the first declarator. Every sibling after it is deleted.
 */
const PLANTED_POSITIVE = 'control-declaration-splicer';
const plantedPositive: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'Collapse this declaration.' },
  },
  create(context) {
    const source = context.getSourceCode();
    return {
      VariableDeclaration(node: any) {
        if (node.declarations.length < 2) return;
        const first = source.getText(node.declarations[0]);
        context.report({
          node,
          messageId: 'm',
          fix: (fixer) => fixer.replaceText(node, `${node.kind} ${first};`),
        });
      },
    };
  },
};

/**
 * The opposite polarity: a fixer that edits only the declarator's INITIALIZER
 * and leaves every binding alone. A probe that fires on this fires on any
 * rewrite at all, and its clean sweep over the real rules would mean nothing.
 */
const PLANTED_NEGATIVE = 'control-initializer-rewriter';
const plantedNegative: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'Rewrite this initializer.' },
  },
  create(context) {
    const source = context.getSourceCode();
    return {
      VariableDeclarator(node: any) {
        if (node.init?.type !== 'ObjectExpression') return;
        // Converge on the second pass; `verifyAndFix` re-lints its own output.
        if (source.getText(node.init) === '{ alpha: 2 }') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer) => fixer.replaceText(node.init, '{ alpha: 2 }'),
        });
      },
    };
  },
};

/**
 * The licensing isolation's own NEGATIVE control: a rule with a genuine opinion
 * about every declarator, whose fix appends `as const` to a literal `1`. It
 * rewrites the sibling identically whether or not the subject is present, which
 * is precisely `global-const-style`'s shape. The probe must stay silent, and
 * must record the skip as LICENSED rather than never reaching the oracle.
 */
const PLANTED_LICENSED = 'control-licensed-rewriter';
const plantedLicensed: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'Freeze this constant.' },
  },
  create(context) {
    const source = context.getSourceCode();
    return {
      VariableDeclarator(node: any) {
        if (!node.init) return;
        const init = source.getText(node.init);
        // Report on EVERY declarator so the attribution is `mixed`; a rule that
        // reported only on the sibling would be skipped before the gate runs.
        context.report({
          node,
          messageId: 'm',
          fix: (fixer) =>
            init === '1' ? fixer.replaceText(node.init, '1 as const') : null,
        });
      },
    };
  },
};

/**
 * The licensing isolation's POSITIVE control, and the reason the gate is
 * per-oracle rather than per-attribution: a fixer that reports on the sibling
 * AND deletes it. A report about a binding never licenses destroying it, so this
 * must still be caught even though its attribution is `mixed`.
 */
const PLANTED_MIXED_DESTROYER = 'control-mixed-destroyer';
const plantedMixedDestroyer: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'Collapse this declaration.' },
  },
  create(context) {
    const source = context.getSourceCode();
    return {
      VariableDeclarator(node: any) {
        const declaration = node.parent;
        if (declaration?.declarations?.length < 2) return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer) =>
            node === declaration.declarations[0]
              ? fixer.replaceText(
                  declaration,
                  `${declaration.kind} ${source.getText(node)};`,
                )
              : null,
        });
      },
    };
  },
};

linter.defineRule(PREFIX + PLANTED_POSITIVE, plantedPositive);
linter.defineRule(PREFIX + PLANTED_NEGATIVE, plantedNegative);
linter.defineRule(PREFIX + PLANTED_LICENSED, plantedLicensed);
linter.defineRule(PREFIX + PLANTED_MIXED_DESTROYER, plantedMixedDestroyer);

const controlCase: FixtureCase = {
  code: 'const probeSubject = { alpha: 1 };\nexport { probeSubject };\n',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted control',
  bucket: 'invalid',
};

const positiveResult = probeFixture(PLANTED_POSITIVE, controlCase, true);
const negativeResult = probeFixture(PLANTED_NEGATIVE, controlCase, true);
const licensedResult = probeFixture(PLANTED_LICENSED, controlCase, true);
const mixedDestroyerResult = probeFixture(
  PLANTED_MIXED_DESTROYER,
  controlCase,
  true,
);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const groupKey = (finding: Finding) =>
  `${finding.rule} | ARM ${finding.arm} | ${finding.oracle} | ` +
  `${finding.variant} | ${finding.attribution}`;

const grouped = new Map<string, Finding[]>();
for (const finding of findings) {
  const key = groupKey(finding);
  grouped.set(key, [...(grouped.get(key) || []), finding]);
}

const render = (finding: Finding) =>
  [
    `  ${finding.detail}`,
    `  fixture: src/tests/${finding.origin} as ${finding.filename}`,
    '  --- unperturbed fixture ---',
    finding.base.replace(/^/gm, '    '),
    '  --- perturbed input ---',
    finding.input.replace(/^/gm, '    '),
    `  --- ${finding.arm === 'B' ? 'fixed output' : 'report delta'} ---`,
    finding.output.replace(/^/gm, '    '),
  ].join('\n');

console.log(
  [
    '[multi-declarator] counters',
    `  rules exercised:          ${rulesExercised.size} of ${subjects.length}`,
    `  fixtures considered:      ${totals.fixturesConsidered}`,
    `  fixtures with candidates: ${totals.fixturesWithCandidates}`,
    `  perturbations emitted:    ${totals.perturbationsEmitted}`,
    `  control REPORTING on the unperturbed fixture: ${totals.controlReporting}`,
    `  control fatal (skipped):  ${totals.controlFatal}`,
    `  fixers that REWROTE the perturbed input: ${totals.fixersRewrote}`,
    `  rewrites MEASURED against B1-B4: ${totals.oraclesEvaluated}`,
    `  fixers that DECLINED (correct behaviour): ${totals.declines}`,
    `  skipped: EVERY report lands on the sibling (rule's own subject): ${totals.siblingIsSubject}`,
    `  measured but MIXED (rule reports on the sibling too): ${totals.siblingIsMixedSubject}`,
    ...siblingSubjectRules.map(
      ([rule, counters]) =>
        `    ${rule}: ${counters.siblingIsSubject} skipped, ` +
        `${counters.siblingIsMixedSubject} measured as mixed`,
    ),
    `  skipped: attribution rejected (broken without a sibling): ${totals.attributionRejected}`,
    `  skipped: sibling rewrite LICENSED (identical when it stands alone): ${totals.mutationLicensed}`,
    `  non-TypeScript fixtures skipped: ${nonTypeScriptSkipped}`,
    '  declarations skipped, by reason:',
    ...Object.entries(skipped).map(
      ([reason, count]) => `    ${reason}: ${count}`,
    ),
    `  fixers measured against the oracles: ${fixersMeasured.length} rule(s)`,
    ...fixersMeasured
      .slice(0, 25)
      .map(([rule, counters]) => `    ${rule}: ${counters.oraclesEvaluated}`),
    `  fixers that declined: ${fixersThatDeclined.length} rule(s)`,
    ...fixersThatDeclined
      .slice(0, 25)
      .map(([rule, counters]) => `    ${rule}: ${counters.declines}`),
    `  findings: ${findings.length} in ${grouped.size} group(s)`,
    ...[...grouped.entries()].flatMap(([key, hits]) => [
      `\n${key} (${hits.length} occurrence(s) over ${
        new Set(hits.map((hit) => hit.origin)).size
      } suite(s): ${[...new Set(hits.map((hit) => hit.origin))]
        .sort()
        .join(', ')})`,
      render(hits[0]),
    ]),
  ].join('\n'),
);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe('the multi-declarator probe is load-bearing', () => {
  it('harvests a corpus large enough for a zero to mean something', () => {
    expect(corpus.failures).toEqual([]);
    expect(subjects.length).toBeGreaterThan(150);
    expect(corpus.totalCases).toBeGreaterThan(4000);
    expect(totals.fixturesConsidered).toBeGreaterThan(4000);
  });

  it('actually perturbs, across most of the rule set', () => {
    expect(totals.perturbationsEmitted).toBeGreaterThan(3000);
    expect(totals.fixturesWithCandidates).toBeGreaterThan(1500);
    expect(rulesExercised.size).toBeGreaterThan(120);
    // A cap that swallowed everything would read as "nothing to perturb".
    expect(skipped.variantUnparseable).toBeLessThan(
      totals.perturbationsEmitted / 10,
    );
  });

  it('reaches the rules: the unperturbed control REPORTS', () => {
    // If this collapses toward zero the corpus is not reaching the rules at
    // all, and every clean arm below is vacuous.
    expect(totals.controlReporting).toBeGreaterThan(800);
  });

  it('reaches live FIXERS: they rewrite the perturbed input', () => {
    // Only a rewrite can produce an arm-B finding.
    expect(totals.fixersRewrote).toBeGreaterThan(200);
    // …and the rewrites must survive both isolations to be MEASURED. A filter
    // that swallowed them all would leave arm B silent while looking busy.
    expect(totals.oraclesEvaluated).toBeGreaterThan(200);
    // Spread across rules, not piled onto one fixer.
    expect(fixersMeasured.length).toBeGreaterThan(20);
    // A decline is correct behaviour, and its presence is what proves the
    // corpus reaches fixers that have a real opinion about these statements.
    expect(totals.declines).toBeGreaterThan(100);
  });

  it('detects a fixer that destroys a sibling (planted POSITIVE control)', () => {
    expect(positiveResult.counters.perturbationsEmitted).toBeGreaterThan(0);
    expect(positiveResult.counters.fixersRewrote).toBeGreaterThan(0);
    const destroyed = positiveResult.findings.filter(
      (finding) => finding.oracle === 'SIBLING_DESTROYED',
    );
    expect(destroyed.length).toBeGreaterThan(0);
  });

  it('stays silent on a fixer that edits only the initializer (planted NEGATIVE control)', () => {
    expect(negativeResult.counters.perturbationsEmitted).toBeGreaterThan(0);
    // A control the probe never actually rewrote would prove nothing.
    expect(negativeResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(negativeResult.findings).toEqual([]);
  });

  it('licenses a sibling rewrite the rule makes identically alone', () => {
    expect(licensedResult.counters.fixersRewrote).toBeGreaterThan(0);
    // Silence must come from the LICENSING gate, not from never reaching it:
    // an attribution skip or a filtered rewrite would also produce zero.
    expect(licensedResult.counters.siblingIsMixedSubject).toBeGreaterThan(0);
    expect(licensedResult.counters.mutationLicensed).toBeGreaterThan(0);
    expect(licensedResult.findings).toEqual([]);
  });

  it('still catches a fixer that reports on the sibling AND destroys it', () => {
    // The gate is per-oracle: a report about a binding licenses rewriting it,
    // never deleting it. Were the gate keyed on attribution instead, this whole
    // class of destruction would be dropped as "the rule's own subject".
    expect(mixedDestroyerResult.counters.siblingIsMixedSubject).toBeGreaterThan(
      0,
    );
    const destroyed = mixedDestroyerResult.findings.filter(
      (finding) => finding.oracle === 'SIBLING_DESTROYED',
    );
    expect(destroyed.length).toBeGreaterThan(0);
    expect(destroyed.every((finding) => finding.attribution === 'mixed')).toBe(
      true,
    );
  });
});

/**
 * Open defects this axis found, keyed at the FULL finding granularity
 * (`<rule> | ARM <arm> | <oracle> | <variant> | <attribution>`) rather than by
 * rule. A rule-keyed entry would un-gate every other arm the same rule
 * participates in, which is how #1839 shipped; here it would also let a fix to
 * `SUBJECT_FIRST` silently shield a still-broken `SUBJECT_SECOND`.
 *
 * Every entry below is one shape: an early return on
 * `declarations.length !== 1` that drops the REPORT, not merely the fix. A rule
 * that cannot safely rewrite a multi-declarator statement should still say what
 * is wrong with it — declining the fix is correct, going silent is not, because
 * the violation then ships unseen.
 */
export const DETECTION_LOSS_BASELINE: Record<string, string> = {
  'vertically-group-related-functions | ARM A | DETECTION_LOST | SUBJECT_FIRST | clean':
    'src/rules/vertically-group-related-functions.ts returns early unless the declaration has exactly one declarator, so `misorderedFunction` is lost on a helper declared alongside any sibling binding (#1891)',
  'vertically-group-related-functions | ARM A | DETECTION_LOST | SUBJECT_SECOND | clean':
    'same early return as the SUBJECT_FIRST entry, reached with the sibling declared first (#1891)',
};

describe('a sibling declarator changes no verdict and loses no binding', () => {
  it('reports every finding outside the documented baseline', () => {
    const summary = [...grouped.entries()]
      .filter(([key]) => !(key in DETECTION_LOSS_BASELINE))
      .map(([key, hits]) => `${key} (${hits.length})`)
      .sort();
    expect(summary).toEqual([]);
  });

  it('carries no stale baseline entry', () => {
    // A baseline that outlives its defect is a shield for the next regression:
    // the entry keeps matching nothing while the arm it names looks covered.
    const live = new Set(grouped.keys());
    const stale = Object.keys(DETECTION_LOSS_BASELINE).filter(
      (key) => !live.has(key),
    );
    expect(stale).toEqual([]);
  });
});
