import { ruleTesterTs } from '../utils/ruleTester';
import { fastDeepEqualOverMicrodiff } from '../rules/fast-deep-equal-over-microdiff';

const messageData = (diffName = 'diff', fastEqualName = 'isEqual') => ({
  diffName,
  fastEqualName,
});

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
    // Do not flag when variable is used beyond length equality (for-of)
    {
      code: `import diff from 'microdiff';

function processChanges(a, b) {
  const changes = diff(a, b);
  const isEqual = changes.length === 0;
  for (const change of changes) {
    if (change.type === 'CREATE') return false;
  }
  return isEqual;
}`,
    },
    // Do not flag when comparing to non-zero literal
    {
      code: `import diff from 'microdiff';

function hasOneChange(a, b) {
  const changes = diff(a, b);
  return changes.length === 1;
}`,
    },
    // Do not flag when variable is reassigned later
    {
      code: `import diff from 'microdiff';

function maybeEqual(a, b) {
  let changes = diff(a, b);
  changes = [];
  return changes.length === 0;
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
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
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('compareObjects'),
        },
      ],
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
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import { diff } from 'microdiff';
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}`,
    },
    // Default import of microdiff, direct inline equality
    {
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    // Variable assignment with arbitrary name, then equality check
    {
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    // Variable assignment with different name, used in if condition
    {
      code: `import diff from 'microdiff';

function doSomething(before, after) {
  const differences = diff(before, after);
  if (differences.length === 0) {
    return;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function doSomething(before, after) {
  if (isEqual(before, after)) {
    return;
  }
}`,
    },
    // Unary usage on variable: !changes.length
    {
      code: `import diff from 'microdiff';

function areSame(x, y) {
  const changes = diff(x, y);
  return !changes.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function areSame(x, y) {
  return isEqual(x, y);
}`,
    },
    // Symmetric literal comparison: 0 === diff(...).length
    {
      code: `import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function eq(a, b) {
  return isEqual(a, b);
}`,
    },
    // Multiple occurrences in the same file should add a single import
    {
      code: `import diff from 'microdiff';

function checkAll(prevData, newData, previousMetadataRef, newMetadata) {
  const changesData = diff({ ...prevData }, { ...newData });
  const isDataEqual = changesData.length === 0;

  const changesMetadata = diff(
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );
  const isMetadataEqual = changesMetadata.length === 0;

  return isDataEqual && isMetadataEqual;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function checkAll(prevData, newData, previousMetadataRef, newMetadata) {
  const isDataEqual = isEqual({ ...prevData }, { ...newData });

  const isMetadataEqual = isEqual(
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );

  return isDataEqual && isMetadataEqual;
}`,
    },
  ],
});
