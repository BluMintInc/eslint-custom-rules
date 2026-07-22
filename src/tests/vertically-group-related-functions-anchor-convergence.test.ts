import { ruleTesterTs } from '../utils/ruleTester';
import { verticallyGroupRelatedFunctions } from '../rules/vertically-group-related-functions';

// Regression for #1330: on a diamond / shared-leaf call graph the rule used to
// emit a non-converging "anchor chase" — each single-move instruction it printed
// evicted the wrong occupant of the first mismatched slot instead of filling
// that slot with the function that belongs there, so obeying the instructions
// one at a time bounced siblings of the shared leaves back and forth and even
// pushed a helper AWAY from its only caller before (eventually) settling.
//
// The fix reports the function that BELONGS in the first mismatched slot
// (expected[i]) and anchors it on the already-correct predecessor
// (expected[i-1]). Each emitted instruction now extends the correct prefix by
// one, so following them verbatim strictly converges on the fixed point.
ruleTesterTs.run(
  'vertically-group-related-functions-anchor-convergence',
  verticallyGroupRelatedFunctions,
  {
    valid: [
      {
        // The converged order is a stable fixed point: re-linting it is clean.
        // Pre-fix this same order still drew a fresh (contradicting) instruction.
        code: `
export async function orchestrate() {
  const context = buildContext();
  const outcome = await round(context);
  if (outcome.kind === 'failed') {
    return reportFailed(outcome.reason);
  }
  return finalize(outcome.value);
}

async function finalize(value: string) {
  return fetchDetails(value);
}

async function fetchDetails(value: string) {
  return value;
}

async function round(context: Record<string, string>) {
  try {
    return { kind: 'posted', value: post(context) } as const;
  } catch (error) {
    return { kind: 'failed', reason: classify(error) } as const;
  }
}

function post(context: Record<string, string>) {
  return JSON.stringify(context);
}

function reportFailed(reason: string) {
  return rows(reason);
}

function buildContext() {
  return {} as Record<string, string>;
}

async function recover(error: unknown) {
  return rows(classify(error));
}

function rows(reason: string) {
  return [reason];
}

function classify(error: unknown) {
  return String(error);
}

export const recoverEntry = recover;
`,
      },
    ],
    invalid: [
      {
        // The reported diamond/shared-leaf geometry. The single emitted
        // instruction names the function that belongs in the first mismatched
        // slot (fetchDetails) and anchors it on its already-correct predecessor
        // (finalize) — pre-fix it named the displaced occupant (round) after
        // fetchDetails, the first hop of the non-converging chase.
        code: `
export async function orchestrate() {
  const context = buildContext();
  const outcome = await round(context);
  if (outcome.kind === 'failed') {
    return reportFailed(outcome.reason);
  }
  return finalize(outcome.value);
}

async function finalize(value: string) {
  return fetchDetails(value);
}

async function round(context: Record<string, string>) {
  try {
    return { kind: 'posted', value: post(context) } as const;
  } catch (error) {
    return { kind: 'failed', reason: classify(error) } as const;
  }
}

function reportFailed(reason: string) {
  return rows(reason);
}

async function recover(error: unknown) {
  return rows(classify(error));
}

function rows(reason: string) {
  return [reason];
}

function buildContext() {
  return {} as Record<string, string>;
}

async function fetchDetails(value: string) {
  return value;
}

function post(context: Record<string, string>) {
  return JSON.stringify(context);
}

function classify(error: unknown) {
  return String(error);
}

export const recoverEntry = recover;
`,
        errors: [
          {
            message:
              'Function "fetchDetails" is out of order: keep related functions adjacent; utilities should follow the configured group order. Move it after "finalize" to keep related call chains grouped so readers can scan the file top-down.',
          },
        ],
        // The full reorder is a single, converged fixed point (the `valid` case
        // above): applying the autofix once and re-linting reports nothing.
        output: `
export async function orchestrate() {
  const context = buildContext();
  const outcome = await round(context);
  if (outcome.kind === 'failed') {
    return reportFailed(outcome.reason);
  }
  return finalize(outcome.value);
}

async function finalize(value: string) {
  return fetchDetails(value);
}

async function fetchDetails(value: string) {
  return value;
}

async function round(context: Record<string, string>) {
  try {
    return { kind: 'posted', value: post(context) } as const;
  } catch (error) {
    return { kind: 'failed', reason: classify(error) } as const;
  }
}

function post(context: Record<string, string>) {
  return JSON.stringify(context);
}

function reportFailed(reason: string) {
  return rows(reason);
}

function buildContext() {
  return {} as Record<string, string>;
}

async function recover(error: unknown) {
  return rows(classify(error));
}

function rows(reason: string) {
  return [reason];
}

function classify(error: unknown) {
  return String(error);
}

export const recoverEntry = recover;
`,
      },
    ],
  },
);
