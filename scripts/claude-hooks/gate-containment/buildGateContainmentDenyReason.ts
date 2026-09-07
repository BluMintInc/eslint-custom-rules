import { formatBacktickedList } from '../formatBacktickedList';
import type { GateContainmentOffense } from './types';

const WHOLE_SUITE_CAUSE =
  'A jest carrying neither a path operand nor a scoping flag runs the whole suite — 355 files here, seventeen of which take 8 to 22 minutes each — and fans out at whatever it reads as free, reserving nothing from the machine-wide memory budget. A narrowed run is not denied: a path operand, `--findRelatedTests`, `--testPathPatterns` or `-t` all leave the command alone.' as const;

const GOVERNOR_CAUSE =
  "This repo's whole governor participation hangs on a handful of variables, so a run that assigns, exports, unsets or `env -u`s one of them costs the machine what an unadmitted run costs while every check still reads green. The family is `BLUMINT_GOVERNOR_*`, `BLUMINT_MAX_WORKERS`, `BLUMINT_WORKER_BUDGET_MB`, `TSX_TSCONFIG_PATH` and `CI`." as const;

/** The sanctioned route, named because an agent that WANTS governance reads a
 * deny with no allowed spelling and treats it as a bug. */
const GOVERNOR_REMEDY =
  '`BLUMINT_GOVERNOR_CLI` belongs in `.claude/settings.local.json`, where it is set once per machine, never on the command line around a run.' as const;

const DOCTRINE_REFERENCE =
  'Reservation implies adoption: every heavy local check holds a machine-wide lease, and `npm run test:related` takes it for you. See .claude/skills/repo-maintenance/SKILL.md.' as const;

/**
 * The deny text an agent reads off the tool result.
 *
 * **Written for an opaque delivery.** A `PreToolUse:Bash` deny frequently
 * surfaces as a bare "permission denied" naming no rule, so the corrected
 * command LEADS and the rationale follows it. Every published rewrite is a
 * command this guard itself allows, which is what lets the one blind retry
 * converge.
 *
 * The command is never echoed back. This hook sees every Bash call in every
 * session, and that traffic routinely carries credentials.
 */
export function buildGateContainmentDenyReason(
  offense: GateContainmentOffense,
) {
  return [
    `Retry with:\n\n  ${offense.rewrite}`,
    ...describeCause(offense),
    DOCTRINE_REFERENCE,
  ].join('\n\n');
}

/**
 * Each rule owes its own cause, and the environment rule also owes the LIST it
 * removed: a remedy naming one of several variables, followed exactly, still
 * strips the rest — while reading as complete.
 */
function describeCause(offense: GateContainmentOffense) {
  if (offense.rule === 'whole-suite') {
    return [WHOLE_SUITE_CAUSE];
  }
  const [first, ...rest] = offense.names;
  if (first === undefined) {
    /** Unreachable through the guard: the environment arm is built only from a
     * non-empty removal list. A throw rather than a fallback, so a future caller
     * that breaks that invariant fails loudly instead of publishing a rewrite
     * whose difference from the original command is unexplained. */
    throw new Error('an environment remedy must name at least one variable');
  }
  return [
    `The rewrite above removes ${formatBacktickedList(first, rest)}.`,
    GOVERNOR_CAUSE,
    GOVERNOR_REMEDY,
  ];
}
