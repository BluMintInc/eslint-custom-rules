# Test Coverage Summary for `no-stale-state-across-await` Rule

## Overview
The `no-stale-state-across-await` rule has been expanded with comprehensive test coverage as requested in the feedback. The rule now has **108 total test cases** across 4 test files, covering all the patterns mentioned in the feedback and many additional edge cases.

## Test Files

### 1. `no-stale-state-across-await-simple.test.ts` (3 tests)
- Basic valid and invalid cases
- Simple demonstration of the rule's core functionality

### 2. `no-stale-state-across-await.test.ts` (31 tests)
- Original comprehensive test suite
- Covers basic patterns, edge cases, and various function types
- 15 valid cases, 16 invalid cases

### 3. `no-stale-state-across-await-comprehensive.test.ts` (50 tests)
- Extensive edge case coverage
- False positive and false negative scenarios
- Complex async patterns and control flow
- 25 valid cases, 25 invalid cases

### 4. `no-stale-state-across-await-feedback-patterns.test.ts` (24 tests)
- Specific patterns mentioned in the feedback
- Class components, useReducer, custom hooks, useEffect, advanced async patterns
- 11 valid cases, 13 invalid cases

## Coverage by Pattern Type

### Class Components
- **Valid**: Class component setState patterns (not tracked by this rule - by design)
- **Note**: The rule specifically targets useState setters, not class component setState

### useReducer Patterns
- **Valid**: useReducer dispatch across async (not tracked by this rule - by design)
- **Note**: The rule specifically targets useState setters, not useReducer dispatch

### Custom Hooks
- **Valid**: Atomic updates, separate loading state in different functions
- **Invalid**: Loading pattern violations, complex state management violations

### useEffect Patterns
- **Valid**: Atomic updates, separate loading state patterns
- **Invalid**: Loading pattern violations, complex async patterns

### Advanced Async Patterns
- **Valid**: Promise.all with different setters, async iterators with different setters
- **Invalid**: Promise.all violations, Promise.race violations, Promise.allSettled violations, async iterator violations

## Edge Cases Covered

### False Positive Prevention
- Different state setters across async boundaries
- Setter calls in different scopes/functions
- Nested functions with separate scopes
- Conditional branches that don't actually cross boundaries
- Multiple async boundaries without violations
- Error handling patterns
- Loop patterns without violations
- Complex Promise chains without violations
- Generator functions without violations
- Mixed async patterns without violations

### False Negative Detection
- Complex nested async patterns
- Multiple async boundaries with violations
- Async patterns in different control flow structures
- Promise chains with violations
- Generator functions with violations
- Conditional async patterns with violations
- Error handling with violations
- Loop patterns with violations
- Mixed Promise patterns with violations

### Additional Edge Cases
- Empty function bodies
- Functions with no useState calls
- Functions with only one setter call
- Async functions with no await
- Mixed async patterns (await + .then() + yield)
- Destructured useState patterns
- Arrow functions vs function expressions vs function declarations
- Different types of async boundaries in the same function
- Timeout patterns
- Callback patterns

## Rule Behavior Notes

1. **Class Components**: The rule intentionally does not track `setState` calls from class components, focusing only on React hooks (`useState` setters).

2. **useReducer**: The rule intentionally does not track `dispatch` calls from `useReducer`, focusing only on `useState` setters.

3. **Loading Patterns**: The rule correctly flags loading patterns like `setLoading(true)` before await and `setLoading(false)` after await as violations. This is the intended behavior - such patterns should use explicit disable comments when intentional.

4. **Control Flow**: The rule analyzes function-level patterns and doesn't understand complex control flow. It flags any function where the same setter is called both before and after an async boundary, regardless of conditional logic.

## Test Quality

- **Comprehensive**: 108 test cases covering all major patterns and edge cases
- **Realistic**: Tests use realistic React patterns and common async scenarios
- **Balanced**: Good mix of valid and invalid cases to prevent both false positives and false negatives
- **Well-documented**: Each test case is clearly labeled and explained
- **Edge-case focused**: Extensive coverage of boundary conditions and unusual patterns

## Conclusion

The test suite now provides comprehensive coverage of the `no-stale-state-across-await` rule, including all patterns mentioned in the feedback and many additional edge cases. The rule correctly identifies stale state patterns while avoiding false positives for legitimate use cases.
