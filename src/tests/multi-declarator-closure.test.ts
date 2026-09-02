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
 *     subject's fix; and
 *   - a DESTROYED sibling is read together with what became of the SUBJECT in
 *     the same run, because a fixer entitled to remove a whole SPAN removes the
 *     bindings declared inside it, and that is a deletion it owns (#1930).
 * Those isolations are per-ORACLE, not per-rule, and the distinction is the
 * whole point: a report about a binding licenses REWRITING it and never
 * DELETING it, so destruction, duplication and unparseable output are still
 * measured on a rule that reports on the sibling. Keying it on attribution
 * instead would drop that entire class (`control-mixed-destroyer` holds the
 * line). Without the rewrite licensing, `global-const-style` appending
 * `as const` to a module-level literal — exactly what it exists to do —
 * fabricated 148 findings.
 *
 * DESTRUCTION LICENSING (#1930), the narrowest of the four and the one closest
 * to blinding the arm, so its shape is exact. "The sibling is gone" is purely
 * syntactic and cannot by itself separate the defect ARM B hunts — a fixer that
 * CORRUPTS a declaration it was only asked to rewrite — from a fixer that
 * REMOVES a span it is entitled to remove and takes that span's own bindings
 * with it. `prefer-map-over-conditional-dispatch` is the second kind: its
 * documented contract drops a `default` arm that is unreachable for typed
 * values, so an exhaustiveness `const unhandled: never = body;` inside that arm
 * disappears with the arm, and every reference to it disappears in the same
 * span. A deletion is therefore licensed only when ALL of:
 *   - the fixer's edit — the minimal input span outside the common prefix and
 *     suffix of input and output — CONTAINS the whole subject declarator as
 *     well as the sibling's, so the statement went as a unit rather than the
 *     sibling being carved out of a statement the fixer kept; and
 *   - the SUBJECT binding is likewise absent from the finished output, which
 *     both proves the subject was not merely rewritten in place and rejects the
 *     case where a removal leaves a dangling reference behind.
 * The licensing is keyed on the subject's fate, never on a rule name: a
 * rule-keyed exemption un-gates every other arm that rule participates in, which
 * is how #1839 shipped. `control-relocating-destroyer` is the reason it cannot
 * simply ask "is the sibling inside something that got deleted" — a fixer that
 * deletes the whole declaration and re-emits the SUBJECT elsewhere destroyed the
 * sibling for real, and must still be caught. `control-span-deleter` is the
 * converse and proves the gate fires at all.
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
   * The subject declarator's range IN `code`, carried rather than looked up by
   * name: the destruction licensing asks whether the fixer's edit swallowed this
   * exact declarator, and a fixture with two same-named bindings in different
   * scopes would answer that about the wrong one.
   */
  subjectRange: [number, number];
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
    // What SUBJECT_SECOND inserts ahead of the subject, and so exactly how far
    // the subject declarator moves in that variant's coordinates.
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

/** Whole-word occurrences of a binding name, used for both probe bindings. */
const occurrencesOf = (code: string, name: string) =>
  (code.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;

type EditedSpan = {
  /** The replaced region, in the INPUT's coordinates. */
  start: number;
  end: number;
  /** What the fixer put there. */
  replacement: string;
};

/**
 * The minimal region of `before` the fixer can have touched: everything outside
 * the common prefix and suffix it shares with `after`.
 *
 * `verifyAndFix` runs to a fixpoint, so this is the covering span of every pass
 * rather than one edit — which is the conservative direction for a licensing
 * gate, since a WIDER span is easier to satisfy only in combination with the
 * output check that follows it. Nothing here needs the individual edits: the
 * question is whether the subject declarator was inside what went away.
 */
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
   * Sibling DELETIONS where the fixer removed a span containing the whole
   * declaration and the subject went with it, so the binding died inside a
   * removal the fixer owns rather than being carved out of a kept statement.
   */
  destructionLicensed: number;
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
  destructionLicensed: 0,
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
    const occurrences = occurrencesOf(fixed, perturbation.sibling);
    if (occurrences === 0) {
      /**
       * Licensing isolation for DESTRUCTION (#1930). A fixer allowed to remove a
       * whole SPAN removes the bindings declared inside it, and those bindings
       * are unreachable from outside the span by construction, so nothing is
       * left dangling — `prefer-map-over-conditional-dispatch` dropping a
       * `default` arm that is unreachable for typed values is its documented
       * contract, and the exhaustiveness `const unhandled: never = body;` inside
       * that arm goes with it.
       *
       * Two conditions, and BOTH are needed. The span test alone would license
       * `control-relocating-destroyer`, which deletes the same statement but
       * re-emits the subject elsewhere: it destroyed the sibling for real. The
       * output test alone would license a fixer that deletes the two declarators
       * by unrelated edits while keeping the statement around them.
       *
       * Keyed on the SUBJECT's fate rather than on a rule name, since a
       * rule-keyed exemption un-gates every other arm that rule participates in
       * (#1839). The limit worth stating: a fixer that removes the span and
       * re-declares the subject under a DIFFERENT name reads as licensed here.
       * That is a rename defect — the renamer axis owns it — and it is not the
       * silent sibling loss this arm was built to find.
       */
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
 * The REWRITE licensing's own NEGATIVE control: a rule with a genuine opinion
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
 * The REWRITE licensing's POSITIVE control, and the reason that gate is
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

/**
 * The DESTRUCTION licensing's NEGATIVE control (#1930): a fixer that removes an
 * entire statement it owns — here a labelled block, chosen because the gate must
 * not be keyed on any particular syntax — and so removes every binding declared
 * inside it. Nothing outside the block can reference those bindings, which is
 * why the removal is not a sibling loss. The probe must stay silent AND record
 * the skip as LICENSED, since silence produced by never reaching the oracle
 * would prove nothing.
 */
const PLANTED_SPAN_DELETER = 'control-span-deleter';
const plantedSpanDeleter: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'This block is unreachable.' },
  },
  create(context) {
    return {
      LabeledStatement(node: any) {
        if (node.label?.name !== '__probeDrop') return;
        context.report({
          node,
          messageId: 'm',
          fix: (fixer) => fixer.remove(node),
        });
      },
    };
  },
};

/**
 * The DESTRUCTION licensing's POSITIVE control (#1930), and the reason the gate
 * cannot simply ask "did the sibling sit inside something that got deleted": a
 * fixer that removes the whole declaration — sibling included — and re-emits the
 * SUBJECT elsewhere in rewritten form. The subject surviving is precisely what
 * makes this a real sibling loss rather than a span the fixer owns, so it must
 * still be reported. Were the licensing keyed on the deletion alone, this defect
 * — the `hoists the whole statement` shape named in this file's header — would
 * pass unseen.
 */
const PLANTED_RELOCATING_DESTROYER = 'control-relocating-destroyer';
const plantedRelocatingDestroyer: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: { m: 'Move this declaration.' },
  },
  create(context) {
    const source = context.getSourceCode();
    return {
      VariableDeclaration(node: any) {
        if (node.declarations.length < 2) return;
        const kept = source.getText(node.declarations[0]);
        const end = source.getText().length;
        context.report({
          node,
          messageId: 'm',
          // Converges on the second pass: what lands at the end is a single
          // declarator, which this rule has no opinion about.
          fix: (fixer) => [
            fixer.remove(node),
            fixer.insertTextAfterRange([end, end], `\n${node.kind} ${kept};\n`),
          ],
        });
      },
    };
  },
};

linter.defineRule(PREFIX + PLANTED_POSITIVE, plantedPositive);
linter.defineRule(PREFIX + PLANTED_NEGATIVE, plantedNegative);
linter.defineRule(PREFIX + PLANTED_LICENSED, plantedLicensed);
linter.defineRule(PREFIX + PLANTED_MIXED_DESTROYER, plantedMixedDestroyer);
linter.defineRule(PREFIX + PLANTED_SPAN_DELETER, plantedSpanDeleter);
linter.defineRule(
  PREFIX + PLANTED_RELOCATING_DESTROYER,
  plantedRelocatingDestroyer,
);

const controlCase: FixtureCase = {
  code: 'const probeSubject = { alpha: 1 };\nexport { probeSubject };\n',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted control',
  bucket: 'invalid',
};

/**
 * A deletable span with a binding declared INSIDE it and used only from within,
 * which is the shape the destruction licensing exists for: the fix removes the
 * label, and `probeSubject` — plus whichever sibling the probe plants beside it
 * — can have no reader left anywhere.
 */
const spanDeletionCase: FixtureCase = {
  code:
    'const probeGate = (flag: boolean) => {\n' +
    '  __probeDrop: {\n' +
    '    const probeSubject = flag ? 1 : 2;\n' +
    '    console.log(probeSubject);\n' +
    '  }\n' +
    '  return 0;\n' +
    '};\n',
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
const spanDeleterResult = probeFixture(
  PLANTED_SPAN_DELETER,
  spanDeletionCase,
  true,
);
const relocatingDestroyerResult = probeFixture(
  PLANTED_RELOCATING_DESTROYER,
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
    `  corpus cases harvested:   ${corpus.totalCases}`,
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
    `  skipped: sibling deletion LICENSED (the subject went with it): ${totals.destructionLicensed}`,
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
    expect(subjects.length).toBeGreaterThan(190); // measured 194
    // Cut just under the measurement (23,928 harvested, 23,824 considered), not
    // parked far below it: at 4,000 five sixths of the corpus could vanish while
    // this read healthy, which is more slack than the entire loss the guard
    // exists to notice — the floors that hid #1984 were only 1.5x out.
    expect(corpus.totalCases).toBeGreaterThan(21000); // measured 23,980
    expect(totals.fixturesConsidered).toBeGreaterThan(21000); // measured 23,872

    // The language skip, asserted rather than merely printed into the summary
    // below (#2225). Pinned to the corpus property it is supposed to equal, not
    // to a ceiling: every non-TypeScript case among the subjects is skipped and
    // no TypeScript one is, so a filter that started dropping TS fixtures for
    // some other reason fails here instead of shrinking the corpus in silence.
    // Dropping the non-TS testers wholesale is what hid #1860, where two rules
    // shipping `recommended: 'error'` with a fixer had zero fixtures while every
    // harvest-based guard iterated over them and passed.
    const nonTypeScriptAvailable = subjects.reduce(
      (count, rule) =>
        count +
        (corpus.byRule.get(rule) || []).filter(
          (testCase) => testCase.language !== 'ts',
        ).length,
      0,
    );
    expect(nonTypeScriptSkipped).toBe(nonTypeScriptAvailable);
    // 108 when measured. Floored so the equality above cannot be satisfied by
    // a corpus that stopped carrying non-TypeScript fixtures altogether.
    expect(nonTypeScriptSkipped).toBeGreaterThanOrEqual(100); // measured 108
  });

  it('actually perturbs, across most of the rule set', () => {
    // 39,806 measured; the 3,000 this replaces tolerated a 92% collapse. The
    // other two sat in that same state: 1,500 against 14,044 fixtures with a
    // candidate, and 120 against 184 rules reached.
    expect(totals.perturbationsEmitted).toBeGreaterThan(35000); // measured 39,862
    expect(totals.fixturesWithCandidates).toBeGreaterThan(13800); // measured 14,044
    expect(rulesExercised.size).toBeGreaterThan(180); // measured 184
    expect(skipped.variantUnparseable).toBeLessThan(
      totals.perturbationsEmitted / 10,
    );
  });

  /**
   * Every declaration the perturbation refuses, and every rewrite the licensing
   * gates absorb. Each of these was printed into the summary above and read by
   * no `expect`, which is the state a number has to be in to move unnoticed
   * (#2222, #2225): a skip that starts biting reads exactly like a corpus that
   * has nothing to perturb.
   *
   * Pinned by CLASS. The probe-bug and fatal channels are exact zeros, since one
   * occurrence is already a defect; the shape skips carry ceilings cut just above
   * their measurement, because a filter that started swallowing declarations
   * wholesale is what a far-off ceiling would hide.
   */
  it('accounts for every declaration it refuses to perturb', () => {
    // Measured 94 / 137 / 2,489 / 835 / 0 / 302 / 831 / 0.
    const SKIP_CEILINGS: Record<SkipReason, number> = {
      multiDeclarator: 120,
      noInitializer: 170,
      destructuringSubject: 2800,
      declareModifier: 950,
      // No fixture declares a `using` binding; the shape is skipped because
      // adding a declarator to one changes what gets disposed.
      usingKind: 10,
      notStatementLevel: 360,
      // The residue of MAX_PER_FIXTURE, which the comment on that constant
      // promises is counted "so the cap can never read as nothing to perturb".
      cappedPerFixture: 950,
      // A splice that does not parse is a probe bug, never a finding, so the
      // only defensible value is zero.
      variantUnparseable: 0,
    };
    const exceeded = (Object.keys(SKIP_CEILINGS) as SkipReason[])
      .filter((reason) => skipped[reason] > SKIP_CEILINGS[reason])
      .map(
        (reason) => `${reason}: ${skipped[reason]} > ${SKIP_CEILINGS[reason]}`,
      );
    expect(exceeded).toEqual([]);
  });

  it('accounts for every rewrite its isolations absorb', () => {
    // A control that cannot be linted withholds its whole fixture, and a fatal
    // is indistinguishable from silence once messages are filtered by `ruleId`.
    expect(totals.controlFatal).toBe(0);
    // A rewrite the probe cannot attribute is a verdict it never reaches.
    expect(totals.attributionRejected).toBe(0);
    // The two licensing gates. Each is correct behaviour on a rewrite the rule
    // makes identically without a sibling present, but each also SUPPRESSES an
    // arm-B finding, so a gate that widened would empty the arm at a steady
    // green. Ceilings cut just above the measured 256 and 2.
    expect(totals.mutationLicensed).toBeLessThanOrEqual(300);
    expect(totals.destructionLicensed).toBeLessThanOrEqual(10);
    /**
     * The sibling-is-subject skip, pinned by rule MEMBERSHIP rather than by
     * count: it fires when EVERY report lands on the planted binding, which is a
     * property of which rules have an opinion about a bare `const x = 1`, and a
     * count moves with every fixture added to a rule already in the list. A
     * SECOND such rule is a conscious edit here (#2225).
     */
    expect(siblingSubjectRules.map(([rule]) => rule)).toEqual([
      'global-const-style',
    ]);
  });

  it('reaches the rules: the unperturbed control REPORTS', () => {
    // If this collapses toward zero the corpus is not reaching the rules at
    // all, and every clean arm below is vacuous. A floor of 800 against 10,228
    // is a twelvefold collapse that never fails.
    expect(totals.controlReporting).toBeGreaterThan(10000); // measured 10,228
  });

  it('reaches live FIXERS: they rewrite the perturbed input', () => {
    // Only a rewrite can produce an arm-B finding.
    expect(totals.fixersRewrote).toBeGreaterThan(8200); // measured 8,368
    // …and the rewrites must survive both isolations to be MEASURED. A filter
    // that swallowed them all would leave arm B silent while looking busy.
    expect(totals.oraclesEvaluated).toBeGreaterThan(7900); // measured 8,048
    // Spread across rules, not piled onto one fixer.
    expect(fixersMeasured.length).toBeGreaterThan(76); // measured 78
    // A decline is correct behaviour, and its presence is what proves the
    // corpus reaches fixers that have a real opinion about these statements.
    expect(totals.declines).toBeGreaterThan(2850); // measured 2,932
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

  it('licenses a deletion that removes the subject and the sibling together', () => {
    // Silence must come from the DESTRUCTION licensing, not from an earlier
    // filter: an attribution rejection, a decline or a fixer the probe never
    // drove would each produce the same empty findings list.
    expect(spanDeleterResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(spanDeleterResult.counters.oraclesEvaluated).toBeGreaterThan(0);
    expect(spanDeleterResult.counters.attributionRejected).toBe(0);
    expect(spanDeleterResult.counters.destructionLicensed).toBeGreaterThan(0);
    expect(spanDeleterResult.findings).toEqual([]);
  });

  it('still catches a deletion that keeps the SUBJECT and drops the sibling', () => {
    // The licensing is keyed on the subject's fate, so a fixer that removes the
    // same statement but re-emits the subject elsewhere stays a finding. Without
    // this the licensing would swallow the very defect ARM B exists to find.
    expect(relocatingDestroyerResult.counters.fixersRewrote).toBeGreaterThan(0);
    expect(relocatingDestroyerResult.counters.attributionRejected).toBe(0);
    expect(relocatingDestroyerResult.counters.destructionLicensed).toBe(0);
    const destroyed = relocatingDestroyerResult.findings.filter(
      (finding) => finding.oracle === 'SIBLING_DESTROYED',
    );
    expect(destroyed.length).toBeGreaterThan(0);
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
 * An entry here records one shape: an early return on
 * `declarations.length !== 1` that drops the REPORT, not merely the fix. A rule
 * that cannot safely rewrite a multi-declarator statement should still say what
 * is wrong with it — declining the fix is correct, going silent is not, because
 * the violation then ships unseen.
 */
export const DETECTION_LOSS_BASELINE: Record<string, string> = {};

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
