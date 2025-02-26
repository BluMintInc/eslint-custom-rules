import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMicrodiff } from '../rules/enforce-microdiff';

ruleTesterTs.run('enforce-microdiff', enforceMicrodiff, {
  valid: [
    // Using microdiff correctly
    {
      code: `import { diff } from 'microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Getting specific changes with microdiff
    {
      code: `import { diff } from 'microdiff';

function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}`,
    },
    // Array comparison with microdiff
    {
      code: `import { diff } from 'microdiff';

function arrayHasChanged(oldItems, newItems) {
  return diff(oldItems, newItems).length > 0;
}`,
    },
    // Using diff results for specific updates
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
    // Handling arrays of objects with microdiff
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
    // Simple equality checks (should not be flagged)
    {
      code: `function checkSimpleEquality(user, otherUser) {
  if (user.id === otherUser.id) {
    return true;
  }
  if (count === previousCount) {
    return true;
  }
  if (status !== 'active') {
    return true;
  }
  return false;
}`,
    },
    // React dependency arrays (should not be flagged)
    {
      code: `import React from 'react';
import { useEffect } from 'react';

function MyComponent(props) {
  const { user, count } = props;
  useEffect(() => {
    // Do something
  }, [user.id, count]);

  return React.createElement('div');
}`,
    },
    // Simple optimization checks (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function compareWithOptimization(oldItems, newItems) {
  if (oldItems.length !== newItems.length) {
    return true;
  }
  return diff(oldItems, newItems).length > 0;
}`,
    },
    // Specific field comparison (should not be flagged)
    {
      code: `function checkSpecificField(user, previousUser) {
  if (user.lastLogin !== previousUser.lastLogin) {
    return true;
  }
  return false;
}`,
    },
  ],
  invalid: [
    // Using deep-diff
    {
      code: `import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    // Using diff library
    {
      code: `import { diffArrays } from 'diff';

function compareArrays(oldArray, newArray) {
  return diffArrays(oldArray, newArray);
}`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
}`,
    },
    // Using deep-object-diff
    {
      code: `import { detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function compareObjects(oldObj, newObj) {
  return diff(oldObj, newObj);
}`,
    },
    // Using fast-diff
    {
      code: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiff',
        },
      ],
      output: `import { diff } from 'microdiff';

function findChanges(prev, next) {
  return diff(prev, next);
}`,
    },
    // Using Lodash difference functions
    {
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(original, updated, _.isEqual);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return diff(original, updated, _.isEqual);
}`,
    },
    // Using fast-deep-equal
    {
      code: `import fastDeepEqual from 'fast-deep-equal';

function hasStateChanged(prevState, nextState) {
  return !fastDeepEqual(prevState, nextState);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-deep-equal' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function hasStateChanged(prevState, nextState) {
  return !diff(prevState, nextState);
}`,
    },
    // Using fast-deep-equal with ES6 import
    {
      code: `import isEqual from 'fast-deep-equal/es6';

function configsAreEqual(oldConfig, newConfig) {
  return isEqual(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-deep-equal/es6' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function configsAreEqual(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    // Using fast-deep-equal in conditions
    {
      code: `import fastDeepEqual from 'fast-deep-equal';

function shouldUpdate(props, nextProps) {
  if (!fastDeepEqual(props.settings, nextProps.settings)) {
    return true;
  }
  return false;
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-deep-equal' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';

function shouldUpdate(props, nextProps) {
  if (!diff(props.settings, nextProps.settings)) {
    return true;
  }
  return false;
}`,
    },
    // Manual object comparison with JSON.stringify
    {
      code: `function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import { diff } from 'microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Custom deep comparison function
    {
      code: `function detectChanges(prev, next) {
  if (typeof prev !== typeof next) return true;
  if (Array.isArray(prev) !== Array.isArray(next)) return true;
  if (typeof prev === 'object') {
    return Object.keys(prev).some(key =>
      prev[key] !== next[key]
    );
  }
  return prev !== next;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Array comparison with loops
    {
      code: `function arrayHasChanged(oldItems, newItems) {
  if (oldItems.length !== newItems.length) return true;
  for (let i = 0; i < oldItems.length; i++) {
    if (oldItems[i].id !== newItems[i].id) return true;
  }
  return false;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Object.keys comparison
    {
      code: `function settingsChanged(oldSettings, newSettings) {
  const oldKeys = Object.keys(oldSettings);
  const newKeys = Object.keys(newSettings);
  if (oldKeys.length !== newKeys.length) return true;
  return oldKeys.some(key => oldSettings[key] !== newSettings[key]);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Nested object comparison
    {
      code: `function stateHasUpdated(prevState, nextState) {
  for (const key in prevState) {
    if (typeof prevState[key] === 'object') {
      if (JSON.stringify(prevState[key]) !== JSON.stringify(nextState[key])) {
        return true;
      }
    } else if (prevState[key] !== nextState[key]) {
      return true;
    }
  }
  return false;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Using microdiff with another diffing library
    {
      code: `import { diff } from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        {
          messageId: 'enforceMicrodiff',
        },
      ],
      output: `import { diff } from 'microdiff';


function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
  ],
});
