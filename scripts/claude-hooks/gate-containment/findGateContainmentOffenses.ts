import { parse, type ParseEntry } from 'shell-quote';
import { injectNewlineSeparators } from '../injectNewlineSeparators';
import { resolveInvocationHead } from '../resolveInvocationHead';
import { splitShellSegments } from '../splitShellSegments';
import { classifyToolRun } from './classifyToolRun';
import { resolveToolInvocation } from './resolveToolInvocation';
import { stripGovernorEnvironment } from './stripGovernorEnvironment';
import type { GateContainmentOffense } from './types';

/**
 * `xargs` feeds its command's operands on STDIN, where this guard cannot see
 * them, so a run that IS scoped reads as carrying no operands at all. Every
 * rule here reasons about operands, so a segment behind one abstains rather
 * than guessing.
 */
const STDIN_FED_PREFIX = 'xargs' as const;

/**
 * The npm scripts this repo runs jest through. The environment rule needs a
 * jest-or-npm-test head to convict, and this is the second half of that test:
 * touching a governor variable around anything else is somebody's ordinary
 * configuration, and denying it would put this guard in front of every
 * `CI=true npm run build` in the session.
 */
const TEST_SCRIPT_PREFIX = 'test' as const;

/**
 * The jest runs a Bash command would perform ungoverned or unscoped —
 * **lexing and policy, no message**.
 *
 * `unreadable` and an empty `offenses` array are distinct on purpose: the first
 * means the command could not be read and is worth a fail-open stderr line, the
 * second means it was read and runs nothing this guard has an opinion about.
 *
 * **The two rules are ORDERED, and the order is what makes the retry converge
 * in one hop.** The whole-suite remedy is a fresh command carrying no
 * environment prefix at all, so publishing the environment rewrite for a
 * command that is both would hand back a command the first rule denies.
 */
export function findGateContainmentOffenses(command: string) {
  let tokens: ParseEntry[];
  try {
    tokens = parse(injectNewlineSeparators(command));
  } catch {
    return { kind: 'unreadable', reason: 'unparseable-shell' } as const;
  }

  const split = splitShellSegments(tokens);
  if (split.kind === 'unmodelled') {
    return { kind: 'unreadable', reason: split.reason } as const;
  }

  const invocations = split.segments.map((segment) => {
    return resolveSegment(segment);
  });

  const offenses = invocations.flatMap(({ segment, invocation }) => {
    if (invocation === undefined) {
      return [];
    }
    const offense = classifyToolRun(segment, invocation);
    return offense === undefined ? [] : [offense];
  });
  if (offenses.length > 0) {
    return { kind: 'offenses', offenses } as const;
  }

  const hasTestHead = invocations.some(({ invocation }) => {
    return isTestHead(invocation);
  });
  const found = hasTestHead
    ? readGovernorOffense(tokens)
    : ({ kind: 'offenses', offenses: [] } as const);
  if (found.kind === 'unreadable' || found.offenses.length > 0) {
    return found;
  }

  /**
   * The fail-open line is reported LAST, so a command that both hides a wrapper
   * and carries a run this guard denies is still denied: a stderr line an
   * operator may never read is worth less than the deny it would replace.
   *
   * Reported at all because an unmodelled prefix is a hole rather than a
   * verdict — `env -S 'npx jest'` carries a whole invocation inside one token —
   * and abstaining silently is indistinguishable from a command this guard read
   * and had no opinion about.
   */
  return invocations.some(({ unreadable }) => {
    return unreadable;
  })
    ? ({ kind: 'unreadable', reason: 'unmodelled-prefix' } as const)
    : found;
}

/**
 * One segment's head and what it runs.
 *
 * `unreadable` and an absent invocation are distinct: the first means the walk
 * REFUSED to guess at a wrapper option whose value may be a whole command, the
 * second that the segment was read and runs nothing this guard grades. An
 * `xargs` prefix is the second rather than the first, since its operands are on
 * stdin by design rather than hidden by a limitation.
 */
function resolveSegment(segment: readonly ParseEntry[]) {
  const head = resolveInvocationHead(segment);
  if (head.kind !== 'resolved') {
    return { segment, invocation: undefined, unreadable: true } as const;
  }
  if (hasStdinFedPrefix(segment, head.index)) {
    return { segment, invocation: undefined, unreadable: false } as const;
  }
  return {
    segment,
    invocation: resolveToolInvocation(segment, head.index),
    unreadable: false,
  } as const;
}

/** The bare token is the whole test, because `resolveInvocationHead`'s registry
 * keys on it: a path-spelled `/usr/bin/xargs` is never consumed as a prefix at
 * all, so the head stays on it and no rule reaches the wrapped command. */
function hasStdinFedPrefix(segment: readonly ParseEntry[], headIndex: number) {
  return segment.slice(0, headIndex).includes(STDIN_FED_PREFIX);
}

function isTestHead(
  invocation: ReturnType<typeof resolveToolInvocation> | undefined,
) {
  if (invocation === undefined) {
    return false;
  }
  return (
    invocation.kind === 'jest-binary' ||
    invocation.script === TEST_SCRIPT_PREFIX ||
    invocation.script.startsWith(`${TEST_SCRIPT_PREFIX}:`)
  );
}

function readGovernorOffense(tokens: readonly ParseEntry[]) {
  const stripped = stripGovernorEnvironment(tokens);
  if (stripped.kind === 'clean') {
    return { kind: 'offenses', offenses: [] } as const;
  }
  if (stripped.kind === 'unreadable') {
    return { kind: 'unreadable', reason: 'unrepublishable-command' } as const;
  }
  const offense: GateContainmentOffense = {
    rule: 'governor-environment',
    rewrite: stripped.command,
    names: stripped.removed,
  };
  return { kind: 'offenses', offenses: [offense] } as const;
}
