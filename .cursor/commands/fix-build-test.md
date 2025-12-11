# Fix Build & Test Workflow Failures

You are responsible for fixing all build and test failures. You must loop until all checks pass. Use this command when `.github/workflows/test-report.yml` fails.

## Objective

Fix all TypeScript compilation errors and Jest test failures until both `npm run build` and `npm test` exit successfully with code 0.

## Workflow

### 1. Diagnose the Failure

First, determine what failed by running both checks:

```bash
npm run build && npm test
```

If the workflow logs are available, review them to identify:
- **Build failures**: TypeScript compilation errors from `tsc`
- **Test failures**: Jest test failures from `npm run test:ci`

### 2. Fix Build Errors First

Build errors block test execution. Always fix these first.

**Run the build:**

```bash
npm run build
```

**If build fails:**
- Analyze each TypeScript error carefully
- Identify the root cause (type mismatches, missing imports, incorrect generics)
- Fix errors in priority order—errors that block other errors first
- Common fixes include:
  - Adding missing type annotations
  - Fixing incorrect type assertions
  - Correcting import/export statements
  - Adding missing properties to interfaces/types
  - Fixing generic type parameters
  - Correcting union/intersection types
- **Avoid masking errors with `any`** unless absolutely necessary
- Preserve existing functionality—minimal, targeted fixes only

**Re-run build after each fix batch:**

```bash
npm run build
```

Continue until `npm run build` exits with code 0.

### 3. Fix Test Failures

Once the build passes, address test failures.

**Run the test suite:**

```bash
npm test
```

**If tests fail:**
- Analyze each failing test carefully
- Determine whether the **test is wrong** or the **code has a bug**:
  - **Test is wrong**: Fix incorrect assertions, missing mocks, wrong test data, async/await issues, or test setup/teardown problems
  - **Code has a bug**: Fix the source code to make the test pass
- Prioritize tests that block other tests first

**For narrowing down failures, run a specific test:**

```bash
npx jest src/tests/<rule-name>.test.ts
```

**Common test fixes:**
- Correcting assertion expectations
- Adding missing mocks or stubs
- Fixing async/await handling
- Correcting test data to match expected behavior
- Fixing race conditions or timing issues

**Common code fixes (when tests correctly identify bugs):**
- Fixing logic errors in rule implementations
- Adding missing null/undefined checks
- Correcting AST traversal logic
- Fixing auto-fix implementations

**Re-run tests after each fix batch:**

```bash
npm test
```

Continue until `npm test` exits with code 0.

### 4. Verify Both Pass Together

After fixing all issues, confirm both commands succeed:

```bash
npm run build && npm test
```

Both must exit with code 0 before proceeding.

### 5. Finalize

- Remove any debug code or `console.log` statements added during debugging
- Keep temporary artifacts in `.cursor/tmp/` only (do not commit)
- Ensure changes are minimal and focused on the failures
- Summarize what was fixed and any remaining risks

## Quality Guidelines

### For Test Fixes

- Follow the **Arrange-Act-Assert** pattern
- Test behavior and public interfaces, not implementation details
- Keep assertions meaningful—avoid overly broad or trivial assertions
- Ensure tests are deterministic (no flaky tests)
- Verify errors are thrown for invalid inputs (`expect(...).toThrow()`)

### For Code Fixes

- Preserve intended functionality
- Follow existing code style and conventions
- Use TypeScript's type system to prevent future bugs
- Prefer fixing root causes over symptoms

### What NOT to Do

- Don't refactor unrelated code
- Don't add features beyond what's needed to fix failures
- Don't disable tests to make the suite pass
- Don't use `// @ts-ignore` or `as any` to mask type errors
- Don't skip or `.skip()` failing tests

## Testing Environment Reference

| Item | Value |
|------|-------|
| Framework | Jest with `ts-jest` |
| Test Location | `src/tests/*.test.ts` |
| Rule Tester | `ruleTesterTs`, `ruleTesterJsx`, `ruleTesterJson` from `src/utils/ruleTester.ts` |
| Coverage | Output to `coverage/` directory |

## Quality Checklist

Before completion, verify:

- [ ] `npm run build` exits with code 0
- [ ] `npm test` exits with code 0
- [ ] All tests pass (no skipped or failing tests)
- [ ] Fixes address root causes (not masked with `any` or disabled tests)
- [ ] Changes are minimal and scoped to the failures
- [ ] No debug code or temporary artifacts remain

## Completion Criteria

You are finished **only** when:
1. `npm run build` exits with code 0
2. `npm test` exits with code 0
3. All tests pass
4. No type errors or test failures are reported

**Do not stop until both the build and test suite pass completely.**
