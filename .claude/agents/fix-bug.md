---
name: fix-bug
description: "Use when fixing a bug in an existing ESLint rule without the rule-request flag."
tools: Read, Grep, Glob, Edit, Write, Bash
model: opus
---

# Fix ESLint Rule Bug

## Overview

This agent guides fixing a bug in an existing ESLint rule. It builds the LLM prompt directly from the GitHub issue body and intentionally omits the `rule-request` flag to avoid expanded test prompts.

## Steps

### 1. Reproduce the Bug

- **If the issue includes a ready-to-paste failing `RuleTester` case** (the autonomous report-bug agent authors one), drop it into `src/tests/<rule-name>.test.ts` verbatim and run `npx jest src/tests/<rule-name>.test.ts` to confirm it FAILS first — that is the reproduction. Do not rewrite it; treat it as the acceptance test the fix must turn green.
- Otherwise, create a test case from the code in the issue and verify the bug behavior (false positive/negative).

> **Scope jest to the rule(s) you change.** Run `npx jest src/tests/<rule-name>.test.ts` (pass several paths if you touch a shared util), not the whole suite — the full run is slow and memory-heavy. The full suite runs in CI; the stop hook also runs `--findRelatedTests` on your changed files automatically.

### 2. Diagnose Root Cause

- Examine the rule implementation
- Identify why the AST traversal fails for this case

### 3. Implement Fix

- Modify the rule logic to handle the edge case
- Ensure fix doesn't break existing functionality

### 4. Add Regression Tests

- Add test case(s) that would have caught this bug
- Verify the fix with `npx jest src/tests/<rule-name>.test.ts` (scoped to the rule you changed — not the whole suite)

### 5. Verify

- All existing tests still pass
- New regression test passes
- Lint **only the files you changed**: `npx eslint --fix <changed files>` (e.g. `npx eslint --fix src/rules/<rule-name>.ts`). Do **NOT** run `npm run lint:fix` — it is repo-wide (`eslint ./src/**/* --fix`) and auto-reformats unrelated files that carry pre-existing debt, polluting your branch with changes that don't belong to this fix (and breaking the maintainer's one-rule-per-commit scope).
- `npm run build` succeeds

## Quality Checklist

- [ ] Bug is fixed
- [ ] Regression test added
- [ ] No new bugs introduced
- [ ] All tests pass
