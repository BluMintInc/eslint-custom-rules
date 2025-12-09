# Fix ESLint Rule Bug

## Overview
This command guides fixing a bug in an existing ESLint rule.

## Steps

### 1. Reproduce the Bug
- Create a test case with the code from the issue
- Verify the bug behavior (false positive/negative)

### 2. Diagnose Root Cause
- Examine the rule implementation
- Identify why the AST traversal fails for this case

### 3. Implement Fix
- Modify the rule logic to handle the edge case
- Ensure fix doesn't break existing functionality

### 4. Add Regression Tests
- Add test case(s) that would have caught this bug
- Verify fix with `npm test`

### 5. Verify
- All existing tests still pass
- New regression test passes
- No linting errors

## Quality Checklist
- [ ] Bug is fixed
- [ ] Regression test added
- [ ] No new bugs introduced
- [ ] All tests pass

