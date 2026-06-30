---
name: implement-rule
description: "Use when implementing a new ESLint rule from a GitHub issue."
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---

# Implement ESLint Rule

## Overview

This agent guides the implementation of a new custom ESLint rule for BluMint. When the GitHub issue carries the `rule-request` label, build prompts from the issue body and include the `rule-request` flag so expanded test prompts are generated.

## Using Issue Context

- **If the issue includes ready-to-paste `RuleTester` cases**, drop them in verbatim as the acceptance tests the rule must satisfy, then expand around them.
- Parse the issue body for example violations and add them as invalid test cases.
- Pull out edge cases and turn them into separate valid/invalid tests.
- Capture any described expected auto-fix behavior and add autofix tests with expected output.
- When the `rule-request` label is present, include the `rule-request` flag to trigger expanded test generation.

## Available Utilities

Before implementing, familiarize yourself with the available utilities:

| Utility | Location | Purpose |
|---------|----------|---------|
| `createRule` | `src/utils/createRule.ts` | Rule creation with TypeScript support |
| `ruleTesterTs` | `src/utils/ruleTester.ts` | Testing TypeScript rules (default) |
| `ruleTesterJsx` | `src/utils/ruleTester.ts` | Testing JSX/React rules |
| `ruleTesterJson` | `src/utils/ruleTester.ts` | Testing JSON file rules |
| `ASTHelpers` | `src/utils/ASTHelpers.ts` | Common AST operations |

## Steps

### 1. Analyze the Specification

- Read the issue description carefully
- Identify the pattern to detect (what AST nodes to visit)
- Understand edge cases mentioned in the issue
- Determine if the rule needs a fixer (auto-fix capability)

### 2. Create Rule Implementation

Create `src/rules/<rule-name>.ts` (kebab-case filename):

```typescript
import { createRule } from '../utils/createRule';

type MessageIds = 'yourMessageId';

export const yourRuleName = createRule<[], MessageIds>({
  name: 'your-rule-name',
  meta: {
    type: 'suggestion', // 'problem' | 'suggestion' | 'layout'
    docs: {
      description: 'Clear description of what the rule enforces',
      recommended: 'error',
    },
    fixable: 'code', // 'code' | 'whitespace' | null
    schema: [],
    messages: {
      yourMessageId: 'Your error message here',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // AST visitor methods
    };
  },
});
```

**Type-aware rules (important constraint):** The shared `ruleTester` instances in `src/utils/ruleTester.ts` set **no** `parserOptions.project`, so full type information is **not** available during tests. If your rule reaches for type info (`getParserServices`, `getTypeChecker`, `esTreeNodeToTSNodeMap`), it must **guard for missing parser services and degrade to syntactic detection** — mirror `src/rules/no-entire-object-hook-deps.ts`, which checks `parserServices?.esTreeNodeToTSNodeMap && typeof parserServices.program.getTypeChecker === 'function'` before touching the checker. Write your tests against the syntactic paths that work without a program. If the rule **fundamentally cannot decide** without resolved types, do not ship a version that only "passes" because the checker is absent — comment on the issue explaining the limitation and defer for human input rather than merging a rule whose core logic is untested.

### 3. Create Tests

Create `src/tests/<rule-name>.test.ts`:

**IMPORTANT**: Expect to write **20+ tests per rule** covering:

- Valid cases (code that should NOT trigger the rule)
- Invalid cases (code that SHOULD trigger with expected errors)
- Edge cases (unusual patterns, nested structures, whitespace)

Choose the appropriate ruleTester:

- `ruleTesterTs` for TypeScript rules (most common)
- `ruleTesterJsx` for React/JSX rules
- `ruleTesterJson` for JSON file rules (e.g., package.json)

```typescript
import { ruleTesterTs } from '../utils/ruleTester';
import { yourRuleName } from '../rules/your-rule-name';

ruleTesterTs.run('your-rule-name', yourRuleName, {
  valid: [
    // 10+ valid cases - code that should NOT trigger
    `const validCode = 'example';`,
  ],
  invalid: [
    // 10+ invalid cases - code that SHOULD trigger
    {
      code: `const invalidCode = 'example';`,
      errors: [{ messageId: 'yourMessageId' }],
    },
  ],
});
```

### 4. Create Documentation

Create `docs/rules/<rule-name>.md`:

- Rule description and rationale
- Options (if any)
- Examples of correct code
- Examples of incorrect code
- When to disable the rule

### 5. Update `src/index.ts`

The rule must be registered in **three places**:

```typescript
// 1. Import statement (at top of file)
import { yourRuleName } from './rules/your-rule-name';

// 2. In configs.recommended.rules object
configs: {
  recommended: {
    rules: {
      '@blumintinc/blumint/your-rule-name': 'error',
    }
  }
}

// 3. In rules object
rules: {
  'your-rule-name': yourRuleName,
}
```

**Note**: Convert kebab-case filename to camelCase for the import variable.

### 6. Update README

Add the rule to the rules table in `README.md`

### 7. Verify

- Run `npx jest src/tests/<rule-name>.test.ts` - the new rule's tests must pass. Scope jest to your rule's test file rather than running the whole suite (it is slow and memory-heavy); the full suite runs in CI and the stop hook runs `--findRelatedTests` on your changed files automatically.
- Lint **only the files you created/changed**: `npx eslint --fix src/rules/<rule-name>.ts src/index.ts` (plus any other files you touched). Do **NOT** run `npm run lint:fix` — it is repo-wide (`eslint ./src/**/* --fix`) and auto-reformats unrelated files with pre-existing debt, polluting your branch with changes that don't belong to this rule (and breaking the maintainer's one-rule-per-commit scope).
- Run `npm run build` - build must succeed
- Run `npm run docs` - regenerates `README.md`'s rule table and the generated markers in `docs/rules/<rule-name>.md` from your rule's metadata (your hand-written doc body is preserved). Run it after the rule is registered in `src/index.ts` so the generator sees it.

## Quality Checklist

- [ ] Rule correctly identifies violations
- [ ] No false positives (valid code incorrectly flagged)
- [ ] No false negatives (invalid code not flagged)
- [ ] Auto-fix works correctly (if implemented)
- [ ] Documentation is clear and accurate
- [ ] **20+ tests** covering edge cases
- [ ] Tests include both valid and invalid cases
