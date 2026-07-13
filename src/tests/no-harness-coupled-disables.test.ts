import { Linter } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { noHarnessCoupledDisables } from '../rules/no-harness-coupled-disables';

// The disable directives embedded in the test code below reference plugin rules
// (import/*, react-hooks/*, @typescript-eslint/*, @blumintinc/blumint/*) that are
// not loaded into the RuleTester's linter. Without stubs, ESLint reports
// "Definition for rule '<name>' was not found", polluting the expected error
// count. Register inert no-op stubs so only this rule's diagnostics remain. Each
// test file gets its own module registry under Jest, so this does not leak to
// other suites.
const linter = (ruleTesterTs as unknown as { linter: Linter }).linter;
const STUBBED_RULES = [
  'import/order',
  'import/no-extraneous-dependencies',
  'react-hooks/exhaustive-deps',
  '@typescript-eslint/no-non-null-assertion',
  '@typescript-eslint/no-var-requires',
  '@typescript-eslint/no-explicit-any',
  '@blumintinc/blumint/enforce-types-directory-placement',
  '@blumintinc/blumint/parallelize-async-operations',
];
STUBBED_RULES.forEach((ruleId) => {
  linter.defineRule(ruleId, {
    meta: { type: 'problem', schema: [] },
    create: () => ({}),
  });
});

ruleTesterTs.run('no-harness-coupled-disables', noHarnessCoupledDisables, {
  valid: [
    // Bare "hook" = React hook; code-level justification must not flag.
    `// eslint-disable-next-line react-hooks/exhaustive-deps -- this hook fetches once on mount, deps are intentionally empty
const x = 1;`,
    // Real code-level hook justification (stable ref).
    `// eslint-disable-next-line react-hooks/exhaustive-deps -- onSnap is a stable ref from useLatestCallback
const y = 2;`,
    // React-hook recompute-trigger rationale (real EventEndedText.tsx).
    '// eslint-disable-next-line react-hooks/exhaustive-deps -- `hydrated` is an intentional recompute trigger that forces the single post-mount recompute\nconst z = 3;',
    // Bare "session" = auth session; domain vocabulary must not flag.
    `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- this session token is regenerated per auth session, see SessionContext
const a = 4;`,
    // "stop" and "hook" present but distant/incidental — must not flag.
    `// eslint-disable-next-line react-hooks/exhaustive-deps -- stop polling when unmounted; the hook cleans up after itself
const b = 5;`,
    // CI environment difference, no harness terms, "editor" is out of vocab.
    `// eslint-disable-next-line no-process-env -- disabled in CI where NODE_ENV differs, unrelated to editor tooling
const c = 6;`,
    // Build-environment rationale referencing CI only.
    `/* eslint-disable @typescript-eslint/no-var-requires -- CI bundles this entry with CommonJS; ESM import breaks the functions build */
const d = 7;`,
    // Bare disable with NO justification text — out of scope.
    `// eslint-disable-next-line import/order
import type { Member } from 'functions/src/types/Team';`,
    // Bare block disables with no justification — out of scope.
    `/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
const e = 8;`,
    // Empty justification after the separator — nothing to classify.
    `/* eslint-disable import/order -- */
const f = 9;`,
    // eslint-enable carries no justification and is ignored.
    `/* eslint-enable import/order */
const g = 10;`,
    // Arbitrary non-directive comment mentioning worktree, no directive at all.
    `// This helper manages the worktree layout for local dev
const h = 11;`,
    // Tracked, code-level rule false positive — issue ref is neutral text.
    `// eslint-disable-next-line @blumintinc/blumint/enforce-types-directory-placement -- FP: frontend-coupled type file imports DialogCenteredProps from src/components and has ~41 importers. Re-enable once fixed: BluMintInc/eslint-custom-rules#1263
const i = 12;`,
    // Code-level sequencing rationale.
    `// eslint-disable-next-line @blumintinc/blumint/parallelize-async-operations -- sequence intentionally: resolve username before the non-idempotent livestream side effect
const j = 13;`,
    // Code-level rationale for empty-string handling.
    `// eslint-disable-next-line no-restricted-syntax -- empty string omits the <mj-text> tag from the rendered email body
const k = 14;`,
    // "local" is out of vocabulary.
    `// eslint-disable-next-line no-console -- allowed for local debugging output only
const l = 15;`,
    // Adjacent preceding comment with NO harness term; directive code-level.
    `// deps are stable across renders
// eslint-disable-next-line react-hooks/exhaustive-deps -- see above
const m = 16;`,
  ],
  invalid: [
    // worktree, lowercase, next-line form.
    {
      code: `// eslint-disable-next-line import/no-extraneous-dependencies -- false positive in git worktrees
const x = 1;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // worktrees plural in a block directive.
    {
      code: `/* eslint-disable import/no-extraneous-dependencies -- false positive in worktrees using node_modules junction */
const y = 2;`,
      errors: [{ messageId: 'harnessCoupled' }],
    },
    // Capitalized Worktree.
    {
      code: `// eslint-disable-next-line import/order -- Worktree path mapping issue
const z = 3;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // All-caps WORKTREE.
    {
      code: `// eslint-disable-next-line import/order -- WORKTREE-only false positive
const a = 4;`,
      errors: [{ messageId: 'harnessCoupled' }],
    },
    // cwd, lowercase.
    {
      code: `/* eslint-disable import/order -- functions/src resolves differently across primary-repo lint cwd, freeze the order */
const b = 5;`,
      errors: [{ messageId: 'harnessCoupled', data: { matchedTerm: 'cwd' } }],
    },
    // Uppercase-plural CWDs must still match.
    {
      code: `/* eslint-disable import/no-extraneous-dependencies -- false positive under certain CWDs where the resolver treats it as external */
const c = 6;`,
      errors: [{ messageId: 'harnessCoupled', data: { matchedTerm: 'cwd' } }],
    },
    // Possessive cwd's.
    {
      code: `// eslint-disable-next-line import/order -- the cwd's mismatch reorders imports
const d = 7;`,
      errors: [{ messageId: 'harnessCoupled', data: { matchedTerm: 'cwd' } }],
    },
    // claude, lowercase.
    {
      code: `// eslint-disable-next-line complexity -- flagged only under the claude lint pass, clean in CI
const e = 8;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'claude' } },
      ],
    },
    // Claude's possessive.
    {
      code: `/* eslint-disable import/no-extraneous-dependencies -- Claude's worktree symlinks node_modules differently */
const f = 9;`,
      errors: [{ messageId: 'harnessCoupled' }],
    },
    // "claude code" compound.
    {
      code: `// eslint-disable-next-line max-lines-per-function -- claude code's stop hook times out re-linting this file
const g = 10;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'claude' } },
      ],
    },
    // stop-hook hyphenated compound.
    {
      code: `/* eslint-disable import/order -- the stop-hook lints from the wrong directory */
const h = 11;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'stop-hook' } },
      ],
    },
    // "stop hook" space-separated.
    {
      code: `/* eslint-disable import/order -- the stop hook lints from the wrong directory */
const i = 12;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'stop-hook' } },
      ],
    },
    // Stop-Hook mixed case.
    {
      code: `// eslint-disable-next-line import/order -- Stop-Hook re-lint artifact
const j = 13;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'stop-hook' } },
      ],
    },
    // stop_hook underscore-separated.
    {
      code: `// eslint-disable-next-line import/order -- stop_hook cwd mismatch
const k = 14;`,
      errors: [{ messageId: 'harnessCoupled' }],
    },
    // Near-adjacent "stop lint hook".
    {
      code: `// eslint-disable-next-line import/order -- the stop lint hook reorders these
const l = 15;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'stop-hook' } },
      ],
    },
    // Block eslint-disable form with worktree.
    {
      code: `/* eslint-disable import/order -- worktree stop-hook runs ESLint from the primary repo cwd; order below is correct for CI */
const m = 16;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // Trailing directive form (justification trails the code on the same line).
    {
      code: `import { memo } from 'src/util/memo'; // eslint-disable-line import/no-extraneous-dependencies -- false positive in git worktrees`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // Multi-line block, harness term mid-body.
    {
      code: `/* eslint-disable import/order --
   see the guard-flow refactor notes above;
   worktree cwd artifact, order is correct for CI */
const n = 17;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // Split justification: preceding comment carries the harness term.
    {
      code: `// see the note above for the real reason: worktree cwd artifact
// eslint-disable-next-line import/order -- see above
const o = 18;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // Harness reference WITH a tracking issue — still flagged.
    {
      code: `// eslint-disable-next-line import/order -- tracked at BluMintInc/agora#12345, stop-hook cwd bug
const p = 19;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'stop-hook' } },
      ],
    },
    // Real GroupModeToggles multi-clause example (worktree-cwd deep in prose).
    {
      code: `/* eslint-disable import/no-extraneous-dependencies, import/order -- worktree-cwd lint resolver misclassifies functions/src/* aliased imports as @blumint/agora externals AND oscillates the import order on autofix; CI's eslint disagrees, so this file pins a stable order */
const q = 20;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // worktree-hook compound form.
    {
      code: `/* eslint-disable import/no-extraneous-dependencies -- same worktree-hook cwd artifact: functions/src/* mis-read as the package */
const r = 21;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // cross-worktree compound form.
    {
      code: `// eslint-disable-next-line import/order -- cross-worktree symlink confuses the resolver
const s = 22;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
    // "agent session" compound flags via 'session'.
    {
      code: `/* eslint-disable max-lines -- split deferred; the agent session hit its edit limit here */
const t = 23;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'session' } },
      ],
    },
    // "claude session" flags via the stronger 'claude' term.
    {
      code: `// eslint-disable-next-line import/order -- claude session lints from a different cwd
const u = 24;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'claude' } },
      ],
    },
    // Softened/indirect claude phrasing.
    {
      code: `/* eslint-disable import/no-extraneous-dependencies -- flagged only under the Claude lint pass, clean in CI */
const v = 25;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'claude' } },
      ],
    },
    // Real live-tree phrasing: worktree vs primary-repo lint cwd.
    {
      code: `/* eslint-disable import/order -- functions/src resolves differently across worktree vs primary-repo lint cwd, oscillating its position; freeze the order */
const w = 26;`,
      errors: [
        { messageId: 'harnessCoupled', data: { matchedTerm: 'worktree' } },
      ],
    },
  ],
});
