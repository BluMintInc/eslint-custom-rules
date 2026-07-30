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
    // Using fast-deep-equal (should not be flagged as it's an allowed alternative)
    {
      code: `import isEqual from 'fast-deep-equal';

function isTournamentEqual(beforeTournament, tournament) {
  return isEqual(beforeTournament, tournament);
}`,
    },
    // Using fast-deep-equal/es6 (should not be flagged as it's an allowed alternative)
    {
      code: `import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
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
    // Using Lodash difference functions. `_.differenceWith` returns the
    // elements of `original` with no comparator-equal match in `updated`, while
    // microdiff's `diff` returns a structural change list, so the report stands
    // without a fix.
    {
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(original, updated, _.isEqual);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // Two-argument `_.difference` is no more convertible than the comparator
      // form: it still yields a subset of `original`, not a change list.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // `_.differenceBy`'s iteratee has no counterpart in microdiff's signature.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceBy(original, updated, 'id');
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // An existing microdiff import does not make the lodash call convertible:
      // the two functions compute different things, so the report stands alone.
      code: `import { diff } from 'microdiff';
import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(original, updated, _.isEqual);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // Declining leaves the comments inside the lodash call untouched.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(
    original, // the baseline
    updated,
    _.isEqual,
  );
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A competing import alongside a lodash call: the import rewrite still
      // lands, and the lodash call is left for the author.
      code: `import { diff as deepDiff } from 'deep-diff';
import _ from 'lodash';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diff } from 'microdiff';
import _ from 'lodash';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
    },
    // These test cases for fast-deep-equal have been removed since fast-deep-equal is now allowed
    // as a valid alternative to microdiff
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
    {
      // A pre-existing `diff` binding makes the import unsafe to insert, so the
      // violation is reported without an autofix.
      code: `
const diff = undefined as unknown as never;
import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}
`,
      output: `
const diff = undefined as unknown as never;
import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}
`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // A `diff` bound inside the function would capture the rewritten call
      // without any compile error, so neither the call nor the import it needs
      // is rewritten.
      code: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  const diff = fastDiff;
  return fastDiff(prev, next);
}`,
      output: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  const diff = fastDiff;
  return fastDiff(prev, next);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // A parameter named `diff` shadows the import the rewritten body needs.
      code: `function hasConfigChanged(diff, newConfig) {
  return JSON.stringify(diff) !== JSON.stringify(newConfig);
}`,
      output: `function hasConfigChanged(diff, newConfig) {
  return JSON.stringify(diff) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // The microdiff import trailing the competing one is still found, so the
      // competing import is dropped rather than replaced by a duplicate.
      code: `import { diff as deepDiff } from 'deep-diff';
import { diff } from 'microdiff';

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
      output: `
import { diff } from 'microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // microdiff's default export binds `diff` just as its named export does,
      // so the existing import carries the rewritten call.
      code: `import diff from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

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
      output: `import diff from 'microdiff';


function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // A namespace import of microdiff binds no `diff`, so the rewrite adds
      // the specifier the call needs instead of leaving it unresolved.
      code: `import * as microdiff from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

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
      output: `import * as microdiff from 'microdiff';
import { diff } from 'microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // The competing import is itself the only thing binding `diff`, and the
      // fix retires it, so the name is free for the microdiff import.
      code: `import { diff } from 'diff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
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
    {
      // fast-deep-equal is an allowed alternative, so its import survives the
      // fix and keeps the name `diff` occupied.
      code: `import diff from 'fast-deep-equal';
import { detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      output: `import diff from 'fast-deep-equal';
import { detailedDiff } from 'deep-object-diff';

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
    },
    {
      // The rewritten JSON.stringify comparison would read the file's own
      // `diff`.
      code: `const diff = 1;

function isSameConfig(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      output: `const diff = 1;

function isSameConfig(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // A call matched by name alone is renamed to `diff`, which the file's own
      // binding would capture.
      code: `const diff = 1;

function run(objA, objB) {
  return fastDiff(objA, objB);
}`,
      output: `const diff = 1;

function run(objA, objB) {
  return fastDiff(objA, objB);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // A local `diff` binding changes nothing about the lodash path: it is
      // report-only regardless of what the surrounding scope binds.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  const diff = 1;
  return _.differenceWith(original, updated, _.isEqual);
}`,
      output: null,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
  ],
});
