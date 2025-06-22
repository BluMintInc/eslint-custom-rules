import { ruleTesterTs } from '../utils/ruleTester';
import { fastDeepEqualOverMicrodiff } from '../rules/fast-deep-equal-over-microdiff';

ruleTesterTs.run('fast-deep-equal-over-microdiff', fastDeepEqualOverMicrodiff, {
  valid: [
    // Using fast-deep-equal correctly
    {
      code: `import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using fast-deep-equal/es6 correctly
    {
      code: `import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for actual diff analysis (not just equality)
    {
      code: `import { diff } from 'microdiff';

function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}`,
    },
    // Using microdiff to analyze specific changes
    {
      code: `import { diff } from 'microdiff';

function applyPartialUpdates(oldSettings, newSettings) {
  const changes = diff(oldSettings, newSettings);
  const needsRefresh = changes.some(change =>
    change.path.includes('critical_setting')
  );
  return needsRefresh;
}`,
    },
    // Using microdiff to detect specific types of changes
    {
      code: `import { diff } from 'microdiff';

function detectItemChanges(oldItems, newItems) {
  const changes = diff(oldItems, newItems);
  const addedItems = changes.filter(change => change.type === 'CREATE');
  const removedItems = changes.filter(change => change.type === 'REMOVE');
  const updatedItems = changes.filter(change => change.type === 'UPDATE');
  return { addedItems, removedItems, updatedItems };
}`,
    },
    // Using microdiff to check if changes exist (not equality)
    {
      code: `import { diff } from 'microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Variable assignment but using the diff content (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function applyChanges(before, after) {
  const changes = diff(before, after);
  for (const change of changes) {
    if (change.type === 'CREATE') {
      handleCreate(change);
    }
  }
}`,
    },
    // Variable assignment but checking length > 0 (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function hasChanges(obj1, obj2) {
  const differences = diff(obj1, obj2);
  return differences.length > 0;
}`,
    },
    // Variable assignment but using other properties (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function analyzeChanges(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return changes.filter(change => change.path.includes('important'));
}`,
    },
    // Edge case: Multiple microdiff calls in same function but only one used for equality
    {
      code: `import { diff } from 'microdiff';

function complexAnalysis(obj1, obj2, obj3, obj4) {
  const changes1 = diff(obj1, obj2);
  const changes2 = diff(obj3, obj4);

  // This should not be flagged - using actual diff content
  for (const change of changes1) {
    if (change.type === 'CREATE') {
      handleCreate(change);
    }
  }

  // This should not be flagged - checking for existence of changes
  return changes2.length > 0;
}`,
    },
    // Edge case: Using microdiff result in complex expressions (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function analyzeChanges(before, after) {
  const changes = diff(before, after);
  const hasChanges = changes.length > 0;
  const criticalChanges = changes.filter(c => c.path.includes('critical'));
  return { hasChanges, criticalChanges };
}`,
    },
    // Edge case: Microdiff in try-catch (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function safeCompare(obj1, obj2) {
  try {
    const changes = diff(obj1, obj2);
    return changes.map(change => change.path);
  } catch (error) {
    return [];
  }
}`,
    },
    // Edge case: Microdiff with destructuring (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function analyzeFirst(obj1, obj2) {
  const [firstChange, ...otherChanges] = diff(obj1, obj2);
  return firstChange ? firstChange.type : null;
}`,
    },
    // Edge case: Microdiff in array methods (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function batchCompare(objects) {
  return objects.map(obj => diff(obj.before, obj.after))
                .filter(changes => changes.some(c => c.type === 'CREATE'));
}`,
    },
    // Edge case: Complex nested usage (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function complexNested(data) {
  const results = data.map(item => {
    const changes = diff(item.old, item.new);
    return {
      hasChanges: changes.length > 0,
      changeTypes: changes.map(c => c.type),
      item
    };
  });
  return results;
}`,
    },
    // Edge case: Using microdiff with async/await (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

async function asyncCompare(obj1, obj2) {
  const changes = diff(obj1, obj2);
  for (const change of changes) {
    await processChange(change);
  }
}`,
    },
    // Edge case: Microdiff in generator function (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function* generateChanges(obj1, obj2) {
  const changes = diff(obj1, obj2);
  for (const change of changes) {
    yield change;
  }
}`,
    },
    // Edge case: Microdiff with optional chaining (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function safeAnalyze(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return changes?.filter?.(c => c.type === 'UPDATE') || [];
}`,
    },
    // Edge case: Microdiff in class method (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

class DataAnalyzer {
  analyze(before, after) {
    const changes = diff(before, after);
    return changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {});
  }
}`,
    },
    // Edge case: Microdiff with template literals (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function createReport(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return \`Found \${changes.length} changes: \${changes.map(c => c.type).join(', ')}\`;
}`,
    },

    // Edge case: Complex nested object access (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function nestedAccess(data) {
  const changes = diff(data.before, data.after);
  return changes.filter(c => c.path.includes('nested')).map(c => c.value);
}`,
    },
    // Edge case: Microdiff in computed property (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function computedProperty(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return {
    [changes.length > 0 ? 'hasChanges' : 'noChanges']: true,
    details: changes
  };
}`,
    },
    // Edge case: Microdiff with method chaining (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function methodChaining(obj1, obj2) {
  return diff(obj1, obj2)
    .filter(change => change.type === 'UPDATE')
    .map(change => change.path)
    .join('.');
}`,
    },
    // Edge case: Microdiff in array destructuring (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function arrayDestructuring(obj1, obj2) {
  const [first, second, ...rest] = diff(obj1, obj2);
  return { first, second, rest };
}`,
    },
    // Edge case: Microdiff in object destructuring (should not be flagged when using content)
    {
      code: `import { diff } from 'microdiff';

function objectDestructuring(obj1, obj2) {
  const changes = diff(obj1, obj2);
  const { length, ...otherProps } = changes;
  return { length, otherProps };
}`,
    },
  ],
  invalid: [
    // Using microdiff for equality check with .length === 0
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for equality check with .length == 0
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for inequality check with .length !== 0
    {
      code: `import { diff } from 'microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for inequality check with .length != 0
    {
      code: `import { diff } from 'microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length != 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with !diff(...).length
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return !diff(obj1, obj2).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff in if statement condition
    {
      code: `import { diff } from 'microdiff';

function updateIfNeeded(obj1, obj2) {
  if (diff(obj1, obj2).length === 0) {
    return false;
  }
  return true;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}`,
    },
    // Using microdiff in if statement with !diff(...).length
    {
      code: `import { diff } from 'microdiff';

function updateIfNeeded(obj1, obj2) {
  if (!diff(obj1, obj2).length) {
    return false;
  }
  return true;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}`,
    },
    // Using microdiff with existing fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

function objectsAreTheSame(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}

function objectsAreTheSame(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with renamed import
    {
      code: `import { diff as compareObjects } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return compareObjects(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff as compareObjects } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with renamed fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}`,
    },
    // Variable assignment pattern - differences
    {
      code: `import { diff } from 'microdiff';

export const areHitsEqual = (hit1, hit2) => {
  const differences = diff(hit1, hit2);
  return differences.length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

export const areHitsEqual = (hit1, hit2) => {
  return isEqual(hit1, hit2);
};`,
    },
    // Variable assignment pattern - changes
    {
      code: `import { diff } from 'microdiff';

export const areObjectsEqual = (obj1, obj2) => {
  const changes = diff(obj1, obj2);
  return changes.length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

export const areObjectsEqual = (obj1, obj2) => {
  return isEqual(obj1, obj2);
};`,
    },
    // Variable assignment pattern - diffs
    {
      code: `import { diff } from 'microdiff';

function checkEquality(obj1, obj2) {
  const diffs = diff(obj1, obj2);
  return diffs.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function checkEquality(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Variable assignment with if statement
    {
      code: `import { diff } from 'microdiff';

function updateIfNeeded(beforePreview, afterPreview) {
  const changes = diff(beforePreview, afterPreview);
  if (changes.length === 0) {
    return;
  }
  doUpdate();
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function updateIfNeeded(beforePreview, afterPreview) {
  if (isEqual(beforePreview, afterPreview)) {
    return;
  }
  doUpdate();
}`,
    },
    // Variable assignment with inequality check
    {
      code: `import { diff } from 'microdiff';

function hasChanges(obj1, obj2) {
  const differences = diff(obj1, obj2);
  return differences.length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function hasChanges(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Variable assignment with unary negation
    {
      code: `import { diff } from 'microdiff';

function areEqual(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return !changes.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Variable assignment with existing fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  const differences = diff(obj1, obj2);
  return differences.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Variable assignment with renamed microdiff import
    {
      code: `import { diff as compareObjects } from 'microdiff';

function areEqual(obj1, obj2) {
  const changes = compareObjects(obj1, obj2);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff as compareObjects } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Variable assignment with TypeScript types
    {
      code: `import { diff } from 'microdiff';

export const areHitsEqual = (hit1: Hit, hit2: Hit) => {
  const differences = diff(hit1, hit2);
  return differences.length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

export const areHitsEqual = (hit1: Hit, hit2: Hit) => {
  return isEqual(hit1, hit2);
};`,
    },
    // Multiple variable declarations in same statement
    {
      code: `import { diff } from 'microdiff';

function checkMultiple(obj1, obj2, obj3, obj4) {
  const changes1 = diff(obj1, obj2), changes2 = diff(obj3, obj4);
  return changes1.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function checkMultiple(obj1, obj2, obj3, obj4) {
  const changes2 = diff(obj3, obj4);
  return isEqual(obj1, obj2);
}`,
    },
    // Default import pattern - variable assignment
    {
      code: `import diff from 'microdiff';

export const areHitsEqual = (hit1: Hit, hit2: Hit) => {
  const differences = diff(hit1, hit2);
  return differences.length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

export const areHitsEqual = (hit1: Hit, hit2: Hit) => {
  return isEqual(hit1, hit2);
};`,
    },
    // Default import pattern - if statement
    {
      code: `import diff from 'microdiff';

function updateIfNeeded(beforePreview, afterPreview) {
  const changes = diff(beforePreview, afterPreview);
  if (changes.length === 0) {
    return;
  }
  doUpdate();
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function updateIfNeeded(beforePreview, afterPreview) {
  if (isEqual(beforePreview, afterPreview)) {
    return;
  }
  doUpdate();
}`,
    },
    // Default import pattern - inequality check
    {
      code: `import diff from 'microdiff';

function hasChanges(obj1, obj2) {
  const differences = diff(obj1, obj2);
  return differences.length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function hasChanges(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Edge case: Complex boolean expressions with equality check
    {
      code: `import { diff } from 'microdiff';

function complexCondition(obj1, obj2, flag) {
  return flag && diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function complexCondition(obj1, obj2, flag) {
  return flag && isEqual(obj1, obj2);
}`,
    },
    // Edge case: Ternary operator with equality check
    {
      code: `import { diff } from 'microdiff';

function conditionalCheck(obj1, obj2, useStrict) {
  return useStrict ? diff(obj1, obj2).length === 0 : true;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function conditionalCheck(obj1, obj2, useStrict) {
  return useStrict ? isEqual(obj1, obj2) : true;
}`,
    },
    // Edge case: Logical OR with equality check (first occurrence)
    {
      code: `import { diff } from 'microdiff';

function fallbackCheck(obj1, obj2, obj3, obj4) {
  return diff(obj1, obj2).length === 0 || diff(obj3, obj4).length === 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual' },
        { messageId: 'useFastDeepEqual' }
      ],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function fallbackCheck(obj1, obj2, obj3, obj4) {
  return isEqual(obj1, obj2) || diff(obj3, obj4).length === 0;
}`,
    },
    // Edge case: Nested function with equality check
    {
      code: `import { diff } from 'microdiff';

function outer(obj1, obj2) {
  function inner() {
    return diff(obj1, obj2).length === 0;
  }
  return inner();
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function outer(obj1, obj2) {
  function inner() {
    return isEqual(obj1, obj2);
  }
  return inner();
}`,
    },
    // Edge case: Arrow function with equality check
    {
      code: `import { diff } from 'microdiff';

const isEqual = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const isEqual = (a, b) => isEqual(a, b);`,
    },
    // Edge case: Class method with equality check
    {
      code: `import { diff } from 'microdiff';

class Comparator {
  areEqual(obj1, obj2) {
    return diff(obj1, obj2).length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

class Comparator {
  areEqual(obj1, obj2) {
    return isEqual(obj1, obj2);
  }
}`,
    },
    // Edge case: Object method with equality check
    {
      code: `import { diff } from 'microdiff';

const utils = {
  compare(a, b) {
    return diff(a, b).length === 0;
  }
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const utils = {
  compare(a, b) {
    return isEqual(a, b);
  }
};`,
    },
    // Edge case: Async function with equality check
    {
      code: `import { diff } from 'microdiff';

async function asyncCompare(obj1, obj2) {
  const result = diff(obj1, obj2).length === 0;
  return result;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

async function asyncCompare(obj1, obj2) {
  const result = isEqual(obj1, obj2);
  return result;
}`,
    },
    // Edge case: Generator function with equality check
    {
      code: `import { diff } from 'microdiff';

function* checkEquality(pairs) {
  for (const [a, b] of pairs) {
    yield diff(a, b).length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function* checkEquality(pairs) {
  for (const [a, b] of pairs) {
    yield isEqual(a, b);
  }
}`,
    },
    // Edge case: Variable with very short name
    {
      code: `import { diff } from 'microdiff';

function test(a, b) {
  const d = diff(a, b);
  return d.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function test(a, b) {
  return isEqual(a, b);
}`,
    },
    // Edge case: Variable with very long name
    {
      code: `import { diff } from 'microdiff';

function test(obj1, obj2) {
  const veryLongVariableNameForDifferences = diff(obj1, obj2);
  return veryLongVariableNameForDifferences.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function test(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Variable with numbers and underscores
    {
      code: `import { diff } from 'microdiff';

function test(obj1, obj2) {
  const diff_result_123 = diff(obj1, obj2);
  return diff_result_123.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function test(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Multiple equality checks in same function (first occurrence)
    {
      code: `import { diff } from 'microdiff';

function multipleChecks(a, b, c, d) {
  const changes1 = diff(a, b);
  const changes2 = diff(c, d);

  if (changes1.length === 0) {
    return 'first equal';
  }

  if (changes2.length === 0) {
    return 'second equal';
  }

  return 'different';
}`,
      errors: [
        { messageId: 'useFastDeepEqual' },
        { messageId: 'useFastDeepEqual' }
      ],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function multipleChecks(a, b, c, d) {
  const changes2 = diff(c, d);

  if (isEqual(a, b)) {
    return 'first equal';
  }

  if (changes2.length === 0) {
    return 'second equal';
  }

  return 'different';
}`,
    },
    // Edge case: Equality check in while loop condition
    {
      code: `import { diff } from 'microdiff';

function waitForEquality(getObj1, getObj2) {
  while (diff(getObj1(), getObj2()).length !== 0) {
    // wait
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function waitForEquality(getObj1, getObj2) {
  while (!isEqual(getObj1(), getObj2())) {
    // wait
  }
}`,
    },
    // Edge case: Equality check in for loop condition
    {
      code: `import { diff } from 'microdiff';

function loopUntilEqual(items) {
  for (let i = 0; i < items.length && diff(items[i], items[0]).length !== 0; i++) {
    // process
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function loopUntilEqual(items) {
  for (let i = 0; i < items.length && !isEqual(items[i], items[0]); i++) {
    // process
  }
}`,
    },
    // Edge case: Equality check with complex arguments
    {
      code: `import { diff } from 'microdiff';

function complexArgs(data) {
  return diff(data.before.nested.value, data.after.nested.value).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function complexArgs(data) {
  return isEqual(data.before.nested.value, data.after.nested.value);
}`,
    },
    // Edge case: Equality check with function call arguments
    {
      code: `import { diff } from 'microdiff';

function withFunctionCalls(getData1, getData2) {
  return diff(getData1(), getData2()).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function withFunctionCalls(getData1, getData2) {
  return isEqual(getData1(), getData2());
}`,
    },
    // Edge case: Equality check with array access
    {
      code: `import { diff } from 'microdiff';

function arrayAccess(items, i, j) {
  return diff(items[i], items[j]).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function arrayAccess(items, i, j) {
  return isEqual(items[i], items[j]);
}`,
    },
    // Edge case: Variable assignment with let
    {
      code: `import { diff } from 'microdiff';

function testLet(obj1, obj2) {
  let changes = diff(obj1, obj2);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function testLet(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Variable assignment with var
    {
      code: `import { diff } from 'microdiff';

function testVar(obj1, obj2) {
  var changes = diff(obj1, obj2);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function testVar(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check in switch statement
    {
      code: `import { diff } from 'microdiff';

function switchTest(obj1, obj2, mode) {
  switch (mode) {
    case 'equal':
      return diff(obj1, obj2).length === 0;
    default:
      return false;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function switchTest(obj1, obj2, mode) {
  switch (mode) {
    case 'equal':
      return isEqual(obj1, obj2);
    default:
      return false;
  }
}`,
    },
    // Edge case: Equality check in try-catch
    {
      code: `import { diff } from 'microdiff';

function tryCatchTest(obj1, obj2) {
  try {
    return diff(obj1, obj2).length === 0;
  } catch (error) {
    return false;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function tryCatchTest(obj1, obj2) {
  try {
    return isEqual(obj1, obj2);
  } catch (error) {
    return false;
  }
}`,
    },
    // Edge case: Equality check with parentheses
    {
      code: `import { diff } from 'microdiff';

function withParens(obj1, obj2) {
  return (diff(obj1, obj2).length === 0);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function withParens(obj1, obj2) {
  return (isEqual(obj1, obj2));
}`,
    },
    // Edge case: Equality check with double negation
    {
      code: `import { diff } from 'microdiff';

function doubleNegation(obj1, obj2) {
  return !!diff(obj1, obj2).length === false;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function doubleNegation(obj1, obj2) {
  return !isEqual(obj1, obj2) === false;
}`,
    },
    // Edge case: Variable assignment in different scopes
    {
      code: `import { diff } from 'microdiff';

function scopeTest(obj1, obj2) {
  if (true) {
    const changes = diff(obj1, obj2);
    return changes.length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function scopeTest(obj1, obj2) {
  if (true) {
    return isEqual(obj1, obj2);
  }
}`,
    },
    // Edge case: Equality check with TypeScript generics
    {
      code: `import { diff } from 'microdiff';

function genericTest<T>(obj1: T, obj2: T): boolean {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function genericTest<T>(obj1: T, obj2: T): boolean {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check with optional parameters
    {
      code: `import { diff } from 'microdiff';

function optionalParams(obj1?: any, obj2?: any) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function optionalParams(obj1?: any, obj2?: any) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check with rest parameters
    {
      code: `import { diff } from 'microdiff';

function restParams(obj1, obj2, ...others) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function restParams(obj1, obj2, ...others) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check in array callback
    {
      code: `import { diff } from 'microdiff';

function arrayCallback(items) {
  return items.filter((item, index) =>
    index === 0 || diff(item, items[0]).length === 0
  );
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function arrayCallback(items) {
  return items.filter((item, index) =>
    index === 0 || isEqual(item, items[0])
  );
}`,
    },
    // Edge case: Equality check with destructured parameters
    {
      code: `import { diff } from 'microdiff';

function destructuredParams({ before, after }) {
  return diff(before, after).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function destructuredParams({ before, after }) {
  return isEqual(before, after);
}`,
    },
    // Edge case: Multiple variable declarations with mixed usage
    {
      code: `import { diff } from 'microdiff';

function mixedUsage(a, b, c, d) {
  const changes1 = diff(a, b), changes2 = diff(c, d), other = 'test';

  // This should be flagged
  if (changes1.length === 0) {
    return true;
  }

  // This should not be flagged - using actual content
  return changes2.map(change => change.type);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function mixedUsage(a, b, c, d) {
  const changes2 = diff(c, d), other = 'test';

  // This should be flagged
  if (isEqual(a, b)) {
    return true;
  }

  // This should not be flagged - using actual content
  return changes2.map(change => change.type);
}`,
    },
    // Edge case: Equality check in immediately invoked function expression (IIFE)
    {
      code: `import { diff } from 'microdiff';

const result = (function(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
})(data1, data2);`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const result = (function(obj1, obj2) {
  return isEqual(obj1, obj2);
})(data1, data2);`,
    },
    // Edge case: Equality check with comments between tokens
    {
      code: `import { diff } from 'microdiff';

function withComments(obj1, obj2) {
  return diff(obj1, obj2) /* comment */ .length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function withComments(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check with line breaks
    {
      code: `import { diff } from 'microdiff';

function withLineBreaks(obj1, obj2) {
  return diff(obj1, obj2)
    .length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function withLineBreaks(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Variable assignment with line breaks
    {
      code: `import { diff } from 'microdiff';

function variableWithLineBreaks(obj1, obj2) {
  const changes = diff(
    obj1,
    obj2
  );
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function variableWithLineBreaks(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check in conditional assignment
    {
      code: `import { diff } from 'microdiff';

function conditionalAssignment(obj1, obj2, flag) {
  const result = flag ? diff(obj1, obj2).length === 0 : false;
  return result;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function conditionalAssignment(obj1, obj2, flag) {
  const result = flag ? isEqual(obj1, obj2) : false;
  return result;
}`,
    },
    // Edge case: Equality check with nullish coalescing
    {
      code: `import { diff } from 'microdiff';

function nullishCoalescing(obj1, obj2) {
  return (diff(obj1, obj2).length === 0) ?? false;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function nullishCoalescing(obj1, obj2) {
  return (isEqual(obj1, obj2)) ?? false;
}`,
    },
    // Edge case: Equality check with optional chaining on arguments
    {
      code: `import { diff } from 'microdiff';

function optionalChaining(data) {
  return diff(data?.before, data?.after).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function optionalChaining(data) {
  return isEqual(data?.before, data?.after);
}`,
    },
    // Edge case: Variable assignment with complex variable name patterns
    {
      code: `import { diff } from 'microdiff';

function complexVariableNames(obj1, obj2) {
  const $changes = diff(obj1, obj2);
  return $changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function complexVariableNames(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Variable assignment with unicode characters
    {
      code: `import { diff } from 'microdiff';

function unicodeVariables(obj1, obj2) {
  const différences = diff(obj1, obj2);
  return différences.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function unicodeVariables(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check in conditional expression with complex nesting
    {
      code: `import { diff } from 'microdiff';

function nestedConditional(obj1, obj2, flag1, flag2) {
  return flag1 ? (flag2 ? diff(obj1, obj2).length === 0 : false) : true;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function nestedConditional(obj1, obj2, flag1, flag2) {
  return flag1 ? (flag2 ? isEqual(obj1, obj2) : false) : true;
}`,
    },
    // Edge case: Equality check in array method callback with complex logic
    {
      code: `import { diff } from 'microdiff';

function arrayMethodCallback(pairs) {
  return pairs.some(([a, b]) => diff(a, b).length === 0);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function arrayMethodCallback(pairs) {
  return pairs.some(([a, b]) => isEqual(a, b));
}`,
    },
    // Edge case: Equality check in reduce callback
    {
      code: `import { diff } from 'microdiff';

function reduceCallback(items, reference) {
  return items.reduce((acc, item) => {
    return acc && diff(item, reference).length === 0;
  }, true);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function reduceCallback(items, reference) {
  return items.reduce((acc, item) => {
    return acc && isEqual(item, reference);
  }, true);
}`,
    },
    // Edge case: Equality check with computed property access
    {
      code: `import { diff } from 'microdiff';

function computedAccess(obj1, obj2, key) {
  return diff(obj1[key], obj2[key]).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function computedAccess(obj1, obj2, key) {
  return isEqual(obj1[key], obj2[key]);
}`,
    },
    // Edge case: Equality check with this context
    {
      code: `import { diff } from 'microdiff';

class Comparator {
  compare(obj1, obj2) {
    return diff(this.normalize(obj1), this.normalize(obj2)).length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

class Comparator {
  compare(obj1, obj2) {
    return isEqual(this.normalize(obj1), this.normalize(obj2));
  }
}`,
    },
    // Edge case: Equality check in static method
    {
      code: `import { diff } from 'microdiff';

class Utils {
  static areEqual(obj1, obj2) {
    return diff(obj1, obj2).length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

class Utils {
  static areEqual(obj1, obj2) {
    return isEqual(obj1, obj2);
  }
}`,
    },
    // Edge case: Equality check in getter
    {
      code: `import { diff } from 'microdiff';

class DataComparator {
  get isEqual() {
    return diff(this.obj1, this.obj2).length === 0;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

class DataComparator {
  get isEqual() {
    return isEqual(this.obj1, this.obj2);
  }
}`,
    },
    // Edge case: Equality check in setter
    {
      code: `import { diff } from 'microdiff';

class DataComparator {
  set data(newData) {
    if (diff(this._data, newData).length === 0) {
      return;
    }
    this._data = newData;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

class DataComparator {
  set data(newData) {
    if (isEqual(this._data, newData)) {
      return;
    }
    this._data = newData;
  }
}`,
    },
    // Edge case: Equality check with default parameters
    {
      code: `import { diff } from 'microdiff';

function withDefaults(obj1, obj2 = {}) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function withDefaults(obj1, obj2 = {}) {
  return isEqual(obj1, obj2);
}`,
    },
    // Edge case: Equality check in arrow function with implicit return
    {
      code: `import { diff } from 'microdiff';

const isDataEqual = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const isDataEqual = (a, b) => isEqual(a, b);`,
    },
    // Edge case: Equality check in arrow function with block body
    {
      code: `import { diff } from 'microdiff';

const checkEquality = (a, b) => {
  return diff(a, b).length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const checkEquality = (a, b) => {
  return isEqual(a, b);
};`,
    },
    // Edge case: Equality check with function expression
    {
      code: `import { diff } from 'microdiff';

const compare = function(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const compare = function(obj1, obj2) {
  return isEqual(obj1, obj2);
};`,
    },
    // Edge case: Equality check in named function expression
    {
      code: `import { diff } from 'microdiff';

const compare = function compareObjects(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
};`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

const compare = function compareObjects(obj1, obj2) {
  return isEqual(obj1, obj2);
};`,
    },
    // Edge case: Equality check with complex boolean logic
    {
      code: `import { diff } from 'microdiff';

function complexBoolean(obj1, obj2, obj3, obj4) {
  return (diff(obj1, obj2).length === 0) && (obj3 !== obj4);
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function complexBoolean(obj1, obj2, obj3, obj4) {
  return (isEqual(obj1, obj2)) && (obj3 !== obj4);
}`,
    },
    // Edge case: Equality check in do-while loop
    {
      code: `import { diff } from 'microdiff';

function doWhileLoop(getData1, getData2) {
  let result;
  do {
    result = getData1();
  } while (diff(result, getData2()).length !== 0);
  return result;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function doWhileLoop(getData1, getData2) {
  let result;
  do {
    result = getData1();
  } while (!isEqual(result, getData2()));
  return result;
}`,
    },
    // Edge case: Equality check with bitwise operators (unusual but possible)
    {
      code: `import { diff } from 'microdiff';

function bitwiseCheck(obj1, obj2, flag) {
  return (diff(obj1, obj2).length === 0) | flag;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

function bitwiseCheck(obj1, obj2, flag) {
  return (isEqual(obj1, obj2)) | flag;
}`,
    },
    // Edge case: Microdiff with spread operator in arguments (should be flagged but can't be fixed)
    {
      code: `import { diff } from 'microdiff';

function spreadArgs(obj1, obj2, ...extraArgs) {
  const changes = diff(obj1, obj2, ...extraArgs);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      // No output because the rule can't fix spread operators
    },
    // Edge case: Microdiff with wrong number of arguments (should be flagged but can't be fixed)
    {
      code: `import { diff } from 'microdiff';

function wrongArgs(obj1) {
  const changes = diff(obj1);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      // No output because the rule can't fix wrong number of arguments
    },
    // Edge case: Microdiff with three arguments (should be flagged but can't be fixed)
    {
      code: `import { diff } from 'microdiff';

function threeArgs(obj1, obj2, options) {
  const changes = diff(obj1, obj2, options);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      // No output because the rule can't fix three arguments
    },
  ],
});
