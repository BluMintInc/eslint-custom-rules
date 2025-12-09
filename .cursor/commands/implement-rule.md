# Implement ESLint Rule

## Overview
This command guides the implementation of a new custom ESLint rule for BluMint.

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
- Run `npm test` - all tests must pass
- Run `npm run lint:fix` - no linting errors
- Run `npm run build` - build must succeed

## Quality Checklist
- [ ] Rule correctly identifies violations
- [ ] No false positives (valid code incorrectly flagged)
- [ ] No false negatives (invalid code not flagged)
- [ ] Auto-fix works correctly (if implemented)
- [ ] Documentation is clear and accurate
- [ ] **20+ tests** covering edge cases
- [ ] Tests include both valid and invalid cases

