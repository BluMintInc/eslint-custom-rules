import { FixtureCase, severityWithOptions } from './fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

export const PLUGIN_PREFIX = '@blumintinc/blumint/';

/**
 * The composed `--fix` configuration a consumer actually runs, in one place.
 *
 * Every guard that composes the whole recommended config over the harvested
 * corpus has to build the same three things, and each of them has already cost
 * a defect when a guard built its own:
 *
 *   - the shipped RECOMMENDED severities, minus anything shipped `off`. A flat
 *     `'error'` over every registered rule is a different configuration: it
 *     enables rules the consumer never runs, and it drops the shipped
 *     severities that decide which reports arrive at all.
 *   - the owner's own entry carrying the OPTIONS its author declared. Without
 *     them an option-gated fixer is unreachable and an option-gated report
 *     arrives under a configuration nobody wrote (#1732 — 3 of 15 findings in
 *     an earlier probe were faked by exactly this).
 *   - every subset built by FILTERING that config's own key order. Two rules
 *     whose fixes compete for the same range are resolved by the order their
 *     messages arrive, which follows the order the rules sit in the config
 *     object, so a subset assembled in any other order is a configuration the
 *     consumer does not have. Measured on `composed-fix-core-violation-closure`'s
 *     `use-latest-callback` finding: the full set in config order reproduces the
 *     rise and the SAME set sorted does not, which made every ablation step fail
 *     and named all 187 rules as culprits.
 *
 * What stays with each guard: which rules it EXCLUDES and why. An exclusion is
 * a measured claim about one guard's own oracle (`silentWithoutProgramRuleNames`
 * means "reports nothing under a bare Linter"; a divergence entry means "this
 * guard's question is answered differently here than in production"), so
 * sharing one set across guards would un-gate arms nobody measured.
 */
export const recommendedRulesExcluding = (
  excluded: ReadonlySet<string>,
): Record<string, unknown> => {
  const rules: Record<string, unknown> = {};
  for (const [id, severity] of Object.entries(
    plugin.configs.recommended.rules,
  )) {
    if (!id.startsWith(PLUGIN_PREFIX)) continue;
    if (severity === 'off' || severity === 0) continue;
    const name = id.slice(PLUGIN_PREFIX.length);
    if (!plugin.rules[name]) continue;
    if (excluded.has(name)) continue;
    rules[id] = severity;
  }
  return rules;
};

/**
 * The composed set for one fixture: the shipped severities, plus the owner's own
 * entry carrying the options its author wrote.
 */
export const composedRulesFor = (
  recommended: Record<string, unknown>,
  excluded: ReadonlySet<string>,
  owner: string,
  testCase: FixtureCase,
): Record<string, unknown> => {
  const rules: Record<string, unknown> = { ...recommended };
  if (!excluded.has(owner)) {
    rules[`${PLUGIN_PREFIX}${owner}`] = severityWithOptions(testCase);
  }
  return rules;
};

export type OptionCarriage = {
  /** Screens whose composed config carried author-declared options. */
  carried: number;
  /**
   * The first fixture MEASURED to be judged differently at defaults: the owner
   * reports under its declared options and not without them, or the reverse.
   */
  witness: {
    owner: string;
    origin: string;
    bucket: string;
    /** The entry the linter was actually handed for the owner. */
    ownerEntry: unknown;
    options: readonly unknown[];
  } | null;
};

/**
 * Records that a composed config carried a fixture's options, and keeps the
 * first fixture whose ANSWER depends on them.
 *
 * Option carrying is otherwise unfalsifiable: a config that silently reverted to
 * defaults sweeps the same corpus and reports the same clean result, because an
 * option-gated report simply never arrives and reads as a silent rule. A guard
 * that holds both numbers fails instead — the population when the carrying stops
 * happening at all, and the witness when the options stop making a difference
 * (#1732, #2244).
 *
 * `reportsAtDefaults` is a callback rather than a value so the extra lint is
 * paid only until a witness is found.
 */
export const noteOptionCarriage = (
  carriage: OptionCarriage,
  composed: Record<string, unknown>,
  owner: string,
  testCase: FixtureCase,
  reportsUnderComposed: boolean,
  reportsAtDefaults: () => boolean,
): void => {
  const entry = composed[`${PLUGIN_PREFIX}${owner}`];
  if (!Array.isArray(entry)) return;
  carriage.carried++;
  if (carriage.witness) return;
  if (reportsUnderComposed === reportsAtDefaults()) return;
  carriage.witness = {
    owner,
    origin: testCase.origin,
    bucket: testCase.bucket,
    ownerEntry: entry,
    options: testCase.options || [],
  };
};

/**
 * A subset of a composed config, in the config's OWN key order.
 *
 * Not a formatting nicety: two rules whose fixes compete for the same range are
 * resolved by the order their messages arrive, so a re-ordered subset is a
 * different configuration and can produce different text.
 */
export const subsetInConfigOrder = (
  order: readonly string[],
  ids: Iterable<string>,
) => {
  const wanted = new Set(ids);
  return order.filter((id) => wanted.has(id));
};
