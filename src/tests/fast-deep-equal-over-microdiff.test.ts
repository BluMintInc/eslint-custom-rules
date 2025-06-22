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
  ],
});
